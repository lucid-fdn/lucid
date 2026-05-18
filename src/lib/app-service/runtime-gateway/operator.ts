import 'server-only'

import {
  OperatorAbuseSummarySchema,
  OperatorSummarySchema,
  OperatorUsageSchema,
  type OperatorAbuseSummary,
  type OperatorSummary,
  type OperatorUsage,
} from '@contracts/app-runtime'
import { ErrorService } from '@/lib/db/client'
import { AppServiceError } from '../errors'
import { getAppDeployment } from '../deployments'
import { getAppServiceOperatorVisibility } from '../operator-visibility'
import {
  appServiceErrorContext,
  recordAppServiceMetric,
  withAppServiceSpan,
} from '../observability'

export interface AppOperatorAccess {
  userId: string
  orgId: string
}

export async function getOperatorSummary(
  appId: string,
  access: AppOperatorAccess,
): Promise<OperatorSummary> {
  return withAppServiceSpan('app_service.runtime.operator.summary', {
    stage: 'runtime.operator',
    operation: 'getOperatorSummary',
    orgId: access.orgId,
    appDeploymentId: appId,
    appRuntimeApiVersion: 'v1',
    operatorUserId: access.userId,
  }, async () => {
    try {
      const app = await getAppDeployment(appId)
      if (!app) {
        throw new AppServiceError('not_found', 'Generated app was not found.', 404)
      }

      if (app.org_id !== access.orgId) {
        throw new AppServiceError('forbidden', 'Generated app belongs to a different organization.', 403)
      }

      const visibility = await getAppServiceOperatorVisibility(app)
      const isHealthy = app.status === 'active' && visibility.launch_readiness.status === 'ready'
      const activeIncidents = visibility.abuse.blocked_public_runtime_24h
        + visibility.abuse.unsafe_feedback_24h.current_24h

      recordAppServiceMetric('operator_runtime_summary_read', 1, {
        stage: 'runtime.operator',
        operation: 'getOperatorSummary',
        orgId: app.org_id,
        projectId: app.project_id,
        appDeploymentId: app.id,
        generationRunId: app.generation_run_id,
        appRuntimeApiVersion: 'v1',
        operatorUserId: access.userId,
        slug: app.slug,
      })

      return OperatorSummarySchema.parse({
        app: {
          id: app.id,
          name: app.name,
          slug: app.slug,
          status: app.status,
          visibility: app.visibility,
        },
        setup: {
          complete: isHealthy,
          missing_integrations: [],
          required_actions: visibility.launch_readiness.blockers.map((item) => item.code),
        },
        metrics: {
          public_visits_24h: 0,
          conversations_24h: 0,
          leads_24h: 0,
          cost_today_usd: visibility.usage.monthly_chat_cost_cents.current / 100,
          public_requests_today: visibility.usage.daily_public_requests.current,
          public_request_limit: visibility.usage.daily_public_requests.limit,
          public_chat_cost_cents_month: visibility.usage.monthly_chat_cost_cents.current,
          public_chat_cost_limit_cents: visibility.usage.monthly_chat_cost_cents.limit,
          public_chat_completions_month: visibility.usage.monthly_chat_completions.current,
        },
        health: {
          status: visibility.health.has_failed_provider_step
            || visibility.abuse.status !== 'clear'
            ? 'degraded'
            : isHealthy ? 'healthy' : 'unknown',
          active_incidents: activeIncidents,
        },
        launch_readiness: visibility.launch_readiness,
        abuse: visibility.abuse,
      })
    } catch (error) {
      if (error instanceof AppServiceError) throw error
      ErrorService.captureException(error as Error, {
        severity: 'error',
        ...appServiceErrorContext('getOperatorSummary', {
          stage: 'runtime.operator',
          orgId: access.orgId,
          appDeploymentId: appId,
          appRuntimeApiVersion: 'v1',
          operatorUserId: access.userId,
        }),
      })
      throw new AppServiceError('internal_error', 'Failed to read operator summary.', 500)
    }
  })
}

export async function getOperatorUsage(
  appId: string,
  access: AppOperatorAccess,
): Promise<{
  usage: OperatorUsage
  abuse: OperatorAbuseSummary
  launch_readiness: OperatorSummary['launch_readiness']
}> {
  return withAppServiceSpan('app_service.runtime.operator.usage', {
    stage: 'runtime.operator',
    operation: 'getOperatorUsage',
    orgId: access.orgId,
    appDeploymentId: appId,
    appRuntimeApiVersion: 'v1',
    operatorUserId: access.userId,
  }, async () => {
    try {
      const app = await getAppDeployment(appId)
      if (!app) {
        throw new AppServiceError('not_found', 'Generated app was not found.', 404)
      }

      if (app.org_id !== access.orgId) {
        throw new AppServiceError('forbidden', 'Generated app belongs to a different organization.', 403)
      }

      const visibility = await getAppServiceOperatorVisibility(app)
      recordAppServiceMetric('operator_runtime_usage_read', 1, {
        stage: 'runtime.operator',
        operation: 'getOperatorUsage',
        orgId: app.org_id,
        projectId: app.project_id,
        appDeploymentId: app.id,
        generationRunId: app.generation_run_id,
        appRuntimeApiVersion: 'v1',
        operatorUserId: access.userId,
        slug: app.slug,
      })
      return {
        usage: OperatorUsageSchema.parse(visibility.usage),
        abuse: OperatorAbuseSummarySchema.parse(visibility.abuse),
        launch_readiness: visibility.launch_readiness,
      }
    } catch (error) {
      if (error instanceof AppServiceError) throw error
      ErrorService.captureException(error as Error, {
        severity: 'error',
        ...appServiceErrorContext('getOperatorUsage', {
          stage: 'runtime.operator',
          orgId: access.orgId,
          appDeploymentId: appId,
          appRuntimeApiVersion: 'v1',
          operatorUserId: access.userId,
        }),
      })
      throw new AppServiceError('internal_error', 'Failed to read operator usage.', 500)
    }
  })
}
