import 'server-only'

import type { AppDeployment } from '@contracts/app-service'
import { getCurrentUsage, incrementUsage } from '@/lib/db'
import { supabase, ErrorService } from '@/lib/db/client'
import { getSubscription } from '@/lib/plans'
import { AppServiceError } from './errors'
import { recordAppServiceEvent } from './events'
import {
  appServiceErrorContext,
  recordAppServiceMetric,
  type AppServiceTelemetryContext,
} from './observability'
import {
  AppServiceBetaFeedbackInputSchema,
  APP_SERVICE_ANALYTICS_EVENTS,
  type AppServiceAnalyticsEventName,
  type AppServiceBetaFeedbackInput,
  type AppServiceBillingAction,
  type AppServiceBillingPlan,
  evaluateAppServiceEntitlement,
  getAppServiceBillingEntitlement,
  isOrgAllowedForAppServiceBeta,
  isOrgBypassedForAppServiceBilling,
  parseAppServiceBillingMode,
} from './launch-readiness-core'

function planFromSubscription(value: unknown): AppServiceBillingPlan {
  if (
    value
    && typeof value === 'object'
    && 'plan_name' in value
    && ((value as { plan_name?: unknown }).plan_name === 'pro'
      || (value as { plan_name?: unknown }).plan_name === 'business')
  ) {
    return (value as { plan_name: 'pro' | 'business' }).plan_name
  }

  return 'starter'
}

function defaultLaunchTelemetryContext(
  operation: string,
  orgId: string,
  userId?: string | null,
): AppServiceTelemetryContext {
  return {
    stage: 'generation',
    operation,
    orgId,
    operatorUserId: userId,
  }
}

export function recordAppServiceLaunchAnalyticsEvent(
  name: AppServiceAnalyticsEventName,
  context: AppServiceTelemetryContext,
  attributes: Record<string, unknown> = {},
): void {
  if (!APP_SERVICE_ANALYTICS_EVENTS.includes(name)) return
  recordAppServiceMetric(name, 1, context, attributes)
}

export async function assertAppServiceBetaOrgAccess(params: {
  orgId: string
  userId?: string | null
  context?: AppServiceTelemetryContext
}): Promise<void> {
  const context = params.context ?? defaultLaunchTelemetryContext('assertAppServiceBetaOrgAccess', params.orgId, params.userId)
  const allowed = isOrgAllowedForAppServiceBeta(params.orgId)

  recordAppServiceLaunchAnalyticsEvent(
    allowed ? 'app_service_beta_access_allowed' : 'app_service_beta_access_denied',
    context,
    { beta_mode: process.env.APP_SERVICE_BETA_ACCESS_MODE ?? 'off' },
  )

  if (!allowed) {
    throw new AppServiceError(
      'forbidden',
      'This organization is not enabled for the App Service Foundry beta.',
      403,
      { details: { org_id: params.orgId } },
    )
  }
}

async function countPublicGeneratedApps(orgId: string): Promise<number> {
  const { count, error } = await supabase
    .from('app_deployments')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('visibility', 'public')
    .neq('status', 'archived')

  if (error) throw error
  return count ?? 0
}

async function currentUsageForAction(orgId: string, action: AppServiceBillingAction, metric: string): Promise<number> {
  if (action === 'publish_public_app') {
    return countPublicGeneratedApps(orgId)
  }

  return getCurrentUsage(orgId, metric)
}

export async function assertAndMeterAppServiceEntitlement(params: {
  orgId: string
  userId?: string | null
  action: AppServiceBillingAction
  idempotencyKey: string
  context?: AppServiceTelemetryContext
}): Promise<void> {
  const mode = parseAppServiceBillingMode(process.env.APP_SERVICE_BILLING_MODE)
  if (mode === 'off') return

  const context = params.context ?? defaultLaunchTelemetryContext(
    'assertAndMeterAppServiceEntitlement',
    params.orgId,
    params.userId,
  )
  const billingBypassConfigured = Boolean(process.env.APP_SERVICE_BILLING_BYPASS_ORGS?.trim())

  if (isOrgBypassedForAppServiceBilling(params.orgId)) {
    recordAppServiceLaunchAnalyticsEvent('app_service_entitlement_allowed', context, {
      action: params.action,
      bypassed: true,
      billing_mode: mode,
      billing_bypass_configured: billingBypassConfigured,
    })
    return
  }

  try {
    const subscription = await getSubscription(params.orgId)
    const plan = planFromSubscription(subscription)
    const entitlement = getAppServiceBillingEntitlement(params.action)
    const decision = evaluateAppServiceEntitlement({
      action: params.action,
      plan,
      current: await currentUsageForAction(params.orgId, params.action, entitlement.metric),
    })

    recordAppServiceLaunchAnalyticsEvent(
      decision.allowed ? 'app_service_entitlement_allowed' : 'app_service_entitlement_denied',
      context,
      {
        action: decision.action,
        metric: decision.metric,
        kind: decision.kind,
        plan: decision.plan,
        current: decision.current,
        limit: decision.limit,
        billing_mode: mode,
      },
    )

    if (!decision.allowed && mode === 'enforce') {
      throw new AppServiceError(
        'forbidden',
        `${decision.label} are not available on the current App Service plan.`,
        402,
        {
          details: {
            action: decision.action,
            metric: decision.metric,
            current: decision.current,
            limit: decision.limit,
            plan: decision.plan,
          },
        },
      )
    }

    if (decision.kind === 'quota' && (decision.allowed || mode === 'meter')) {
      await incrementUsage(params.orgId, decision.metric, decision.increment, params.idempotencyKey)
    }
  } catch (error) {
    if (error instanceof AppServiceError) throw error
    ErrorService.captureException(error as Error, {
      severity: 'error',
      ...appServiceErrorContext('assertAndMeterAppServiceEntitlement', context, {
        action: params.action,
      }),
    })
    throw new AppServiceError('internal_error', 'Failed to evaluate App Service billing entitlement.', 500)
  }
}

export async function recordAppServiceBetaFeedback(params: {
  app: AppDeployment
  userId: string
  input: AppServiceBetaFeedbackInput | unknown
}) {
  const input = AppServiceBetaFeedbackInputSchema.parse(params.input)
  const event = await recordAppServiceEvent({
    appDeploymentId: params.app.id,
    generationRunId: params.app.generation_run_id,
    eventType: 'app_service_beta_feedback_submitted',
    severity: input.sentiment === 'blocked' ? 'warning' : 'info',
    message: input.message,
    payload: {
      category: input.category,
      sentiment: input.sentiment,
      source: input.source,
      has_email: Boolean(input.email),
      email: input.email ?? null,
      submitted_by: params.userId,
    },
  })

  recordAppServiceLaunchAnalyticsEvent('app_service_beta_feedback_submitted', {
    stage: 'runtime.operator',
    operation: 'recordAppServiceBetaFeedback',
    orgId: params.app.org_id,
    projectId: params.app.project_id,
    appDeploymentId: params.app.id,
    generationRunId: params.app.generation_run_id,
    operatorUserId: params.userId,
    slug: params.app.slug,
  }, {
    category: input.category,
    sentiment: input.sentiment,
    source: input.source,
  })

  return {
    feedback_id: event?.id ?? null,
    status: 'received' as const,
  }
}
