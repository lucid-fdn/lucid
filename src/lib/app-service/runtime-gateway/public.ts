import 'server-only'

import {
  PublicAppConfigSchema,
  PublicChatRequestSchema,
  PublicChatResponseSchema,
  PublicFeedbackRequestSchema,
  PublicLeadRequestSchema,
  PublicActionRequestSchema,
  VisitorSessionCreateRequestSchema,
  VisitorSessionSchema,
  type PublicChatResponse,
  type PublicAppConfig,
  type PublicLead,
  type PublicActionResult,
  type VisitorSession,
} from '@contracts/app-runtime'
import {
  AgentCommerceProviderIdSchema,
  CommerceRailSchema,
} from '@contracts/agent-commerce'
import type { ModelMessage } from 'ai'
import type { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase, ErrorService } from '@/lib/db/client'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { requireAgentCommerceMachinePayment } from '@/lib/agent-commerce/machine-middleware'
import { AppServiceError } from '../errors'
import { recordAppServiceEvent } from '../events'
import { validatePublicAppRuntimeToken } from '../public-tokens'
import { sanitizeGeneratedAppManifest } from '../manifest-sanitizer'
import {
  isPublicActionCommerceEnforced,
  publicActionCommerceConfigForAction,
  publicActionCommerceResourceId,
  publicActionCommerceResourceType,
  publicActionWorkflowFromManifest,
  publicCommerceConfigForManifest,
} from '../public-commerce-core'
import {
  manifestNumberLimit,
  originFromUrl,
  publicRuntimeRateLimitConfig,
  publicRuntimeRateLimitKey,
  publicRuntimeRequiresTurnstile,
  publicRuntimeDayRange,
  publicRuntimeEventType,
  publicRuntimeMonthRange,
  turnstileTokenFromPublicRuntimeInput,
  visitorSessionIdFromPublicRuntimeInput,
  type PublicRuntimeAccess,
  type PublicRuntimeAbuseScope,
} from '../public-runtime-core'
import { isGeneratedAppOriginAllowed } from '../cors'
import {
  APP_SERVICE_LEAD_DEFAULT_DESTINATION,
  appServiceVisitorSessionExpiresAt,
} from '../product-policy-core'
import {
  appServiceErrorContext,
  recordAppServiceMetric,
  withAppServiceSpan,
} from '../observability'
import {
  executePublicRuntimeAction,
  executePublicRuntimeChat,
} from '../runtime-executor'

interface AppDeploymentRow {
  id: string
  org_id: string
  project_id: string
  generation_run_id: string | null
  slug: string
  name: string
  status: string
  visibility: string
  frontend_manifest: Record<string, unknown> | null
  public_url: string | null
  preview_url: string | null
  assistant_ids?: string[] | null
}

export interface PublicAppRuntimeContext {
  app: AppDeploymentRow
  manifest: Record<string, unknown>
  capabilities: string[]
}

export interface PublicRuntimeGuardOptions {
  reserveAccounting?: boolean
}

function publicRuntimeTelemetryContext(
  operation: string,
  slug: string,
  access?: PublicRuntimeAccess,
  context?: PublicAppRuntimeContext,
) {
  return {
    stage: 'runtime.public' as const,
    operation,
    orgId: context?.app.org_id,
    projectId: context?.app.project_id,
    appDeploymentId: context?.app.id,
    generationRunId: context?.app.generation_run_id,
    appRuntimeApiVersion: 'v1',
    slug,
    provider: access?.kind,
  }
}

export function statusForPublicConfig(status: string): PublicAppConfig['status'] {
  if (status === 'active') return 'active'
  if (status === 'paused') return 'paused'
  if (status === 'draft' || status === 'preview') return 'setup_required'
  return 'maintenance'
}

function capabilitiesFromManifest(manifest: Record<string, unknown> | null, row: AppDeploymentRow) {
  const capabilities = manifest?.capabilities
  if (Array.isArray(capabilities) && capabilities.every((item) => typeof item === 'string')) {
    return capabilities
  }

  return row.assistant_ids?.length ? ['status', 'chat'] : ['status']
}

function publicEndpointsForApp(slug: string, capabilities: string[]) {
  const base = `/api/app-runtime/v1/public/apps/${slug}`
  const endpoints: Record<string, string> = {
    config: `${base}/config`,
    discovery: `${base}/discovery`,
    sessions: `${base}/sessions`,
    status: `${base}/status`,
  }

  if (capabilities.includes('chat')) endpoints.chat = `${base}/chat`
  if (capabilities.includes('lead')) endpoints.lead = `${base}/lead`
  if (capabilities.includes('feedback')) endpoints.feedback = `${base}/feedback`
  if (capabilities.includes('uploads')) endpoints.uploads = `${base}/uploads`
  if (capabilities.includes('public_actions')) endpoints.actions = `${base}/actions/{action}`

  return endpoints
}

export async function getPublicDeploymentBySlug(slug: string): Promise<AppDeploymentRow> {
  const { data, error } = await supabase
    .from('app_deployments')
    .select('id, org_id, project_id, generation_run_id, slug, name, status, visibility, frontend_manifest, public_url, preview_url, assistant_ids')
    .eq('slug', slug)
    .in('visibility', ['unlisted', 'public'])
    .neq('status', 'archived')
    .maybeSingle()

  if (error) throw error
  if (!data) {
    throw new AppServiceError('not_found', 'Generated app was not found.', 404)
  }

  return data as AppDeploymentRow
}

async function assertOriginAllowed(app: AppDeploymentRow, access?: PublicRuntimeAccess): Promise<void> {
  const origin = access?.origin
  if (!origin || origin === originFromUrl(access?.requestUrl)) return

  const appOrigins = [
    originFromUrl(app.public_url),
    originFromUrl(app.preview_url),
  ].filter(Boolean)

  if (appOrigins.includes(origin)) return
  if (await isGeneratedAppOriginAllowed(app.id, origin)) return

  await recordPublicRuntimeGuardEvent({
    app,
    access,
    eventType: 'public_origin_denied',
    message: 'Public generated app origin denied by runtime CORS policy.',
    payload: {
      denied_origin: origin,
      app_public_origin: originFromUrl(app.public_url),
      app_preview_origin: originFromUrl(app.preview_url),
    },
  })
  throw new AppServiceError('origin_not_allowed', 'Generated app origin is not allowed.', 403)
}

interface PublicUsageBucketResult {
  allowed: boolean
  current_value: number | string | null
  limit_value: number | string | null
}

async function incrementPublicUsageBucket(params: {
  context: PublicAppRuntimeContext
  bucketKind: 'day' | 'month'
  metric: 'public_requests' | 'public_chat_cost_cents' | 'public_chat_completions'
  bucketStart: string
  increment: number
  limit: number | null
}): Promise<PublicUsageBucketResult> {
  const { context, bucketKind, metric, bucketStart, increment, limit } = params
  const { data, error } = await supabase.rpc('increment_app_public_usage_bucket', {
    p_app_deployment_id: context.app.id,
    p_org_id: context.app.org_id,
    p_project_id: context.app.project_id,
    p_bucket_kind: bucketKind,
    p_metric: metric,
    p_bucket_start: bucketStart,
    p_increment: increment,
    p_limit: limit,
  })
  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') {
    throw new Error('Public usage bucket RPC returned no row')
  }

  return row as PublicUsageBucketResult
}

function numberFromRpc(value: number | string | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

async function recordPublicRuntimeGuardEvent(params: {
  app: AppDeploymentRow
  access?: PublicRuntimeAccess
  eventType: string
  message: string
  severity?: 'warning' | 'error'
  payload?: Record<string, unknown>
}) {
  await recordAppServiceEvent({
    appDeploymentId: params.app.id,
    generationRunId: params.app.generation_run_id,
    eventType: params.eventType,
    severity: params.severity ?? 'warning',
    message: params.message,
    payload: {
      kind: params.access?.kind ?? null,
      origin: params.access?.origin ?? null,
      request_origin: originFromUrl(params.access?.requestUrl),
      ...params.payload,
    },
  })
}

async function assertScopedPublicRateLimit(params: {
  context: PublicAppRuntimeContext
  access: PublicRuntimeAccess
  scope: PublicRuntimeAbuseScope
  identifier: string | null
}) {
  if (!params.identifier) return

  const config = publicRuntimeRateLimitConfig(params.context.manifest, params.scope)
  const result = await checkRateLimit(
    publicRuntimeRateLimitKey({
      appDeploymentId: params.context.app.id,
      kind: params.access.kind,
      scope: params.scope,
      identifier: params.identifier,
    }),
    config,
  )

  if (result.success) return

  await recordPublicRuntimeGuardEvent({
    app: params.context.app,
    access: params.access,
    eventType: 'public_request_rate_limited',
    message: 'Public generated app request denied by runtime abuse throttle.',
    payload: {
      metric: 'public_runtime_requests',
      scope: params.scope,
      limit_value: result.limit,
      remaining: result.remaining,
      reset_at: new Date(result.resetAt).toISOString(),
    },
  })
  throw new AppServiceError('rate_limited', 'This generated app is receiving too much public traffic. Try again shortly.', 429, {
    retryable: true,
  })
}

async function verifyPublicTurnstileToken(token: string, secret: string): Promise<boolean> {
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret,
      response: token,
    }),
  })

  if (!response.ok) return false
  const result = await response.json().catch(() => null)
  return Boolean(result && typeof result === 'object' && (result as { success?: unknown }).success === true)
}

async function enforcePublicTurnstileIfRequired(params: {
  context: PublicAppRuntimeContext
  access: PublicRuntimeAccess
  rawInput?: unknown
}) {
  if (!publicRuntimeRequiresTurnstile(params.access.kind)) return

  const secret = process.env.APP_SERVICE_TURNSTILE_SECRET_KEY?.trim()
  if (!secret) {
    await recordPublicRuntimeGuardEvent({
      app: params.context.app,
      access: params.access,
      eventType: 'public_turnstile_failed',
      message: 'Public generated app Turnstile verification is required but not configured.',
      severity: 'error',
      payload: { reason: 'missing_secret' },
    })
    throw new AppServiceError('setup_required', 'Public abuse protection is not configured for this generated app.', 503, {
      retryable: true,
    })
  }

  const token = params.access.turnstileToken ?? turnstileTokenFromPublicRuntimeInput(params.rawInput)
  if (!token) {
    await recordPublicRuntimeGuardEvent({
      app: params.context.app,
      access: params.access,
      eventType: 'public_turnstile_failed',
      message: 'Public generated app request denied because Turnstile verification was missing.',
      payload: { reason: 'missing_token' },
    })
    throw new AppServiceError('forbidden', 'Human verification is required for this generated app.', 403)
  }

  if (!(await verifyPublicTurnstileToken(token, secret))) {
    await recordPublicRuntimeGuardEvent({
      app: params.context.app,
      access: params.access,
      eventType: 'public_turnstile_failed',
      message: 'Public generated app request denied by Turnstile verification.',
      payload: { reason: 'invalid_token' },
    })
    throw new AppServiceError('forbidden', 'Human verification failed for this generated app.', 403)
  }
}

async function enforcePublicRuntimeAbuseControls(
  context: PublicAppRuntimeContext,
  access?: PublicRuntimeAccess,
  rawInput?: unknown,
): Promise<void> {
  if (!access?.countRequest || access.kind === 'preflight') return

  await enforcePublicTurnstileIfRequired({ context, access, rawInput })
  await assertScopedPublicRateLimit({
    context,
    access,
    scope: 'app',
    identifier: context.app.id,
  })
  await assertScopedPublicRateLimit({
    context,
    access,
    scope: 'org',
    identifier: context.app.org_id,
  })
  await assertScopedPublicRateLimit({
    context,
    access,
    scope: 'ip',
    identifier: access.requestIdentifier,
  })
  await assertScopedPublicRateLimit({
    context,
    access,
    scope: 'session',
    identifier: visitorSessionIdFromPublicRuntimeInput(rawInput),
  })
}

async function reservePublicRuntimeAccounting(
  context: PublicAppRuntimeContext,
  access?: PublicRuntimeAccess,
): Promise<void> {
  if (!access?.countRequest || access.kind === 'preflight') return

  const dailyLimit = manifestNumberLimit(context.manifest, 'public_requests_per_day')
  const dailyRange = publicRuntimeDayRange()
  const dailyReservation = await incrementPublicUsageBucket({
    context,
    bucketKind: 'day',
    metric: 'public_requests',
    bucketStart: dailyRange.start,
    increment: 1,
    limit: dailyLimit === null ? null : Math.floor(dailyLimit),
  })
  if (!dailyReservation.allowed) {
    await recordPublicRuntimeGuardEvent({
      app: context.app,
      access,
      eventType: 'public_request_rate_limited',
      message: 'Public generated app request denied by daily request cap.',
      payload: {
        metric: 'public_requests',
        bucket_kind: 'day',
        bucket_start: dailyRange.start,
        current_value: numberFromRpc(dailyReservation.current_value),
        limit_value: numberFromRpc(dailyReservation.limit_value),
      },
    })
    throw new AppServiceError('rate_limited', 'This generated app reached its daily public request limit.', 429, {
      retryable: true,
    })
  }

  const monthlyCostCents = manifestNumberLimit(context.manifest, 'monthly_cost_cents')
  if (access.kind === 'chat') {
    const range = publicRuntimeMonthRange()
    const costReservation = await incrementPublicUsageBucket({
      context,
      bucketKind: 'month',
      metric: 'public_chat_cost_cents',
      bucketStart: range.start,
      increment: 1,
      limit: monthlyCostCents === null ? null : Math.floor(monthlyCostCents),
    })
    if (!costReservation.allowed) {
      await recordPublicRuntimeGuardEvent({
        app: context.app,
        access,
        eventType: 'public_chat_cost_cap_reached',
        message: 'Public generated app chat denied by monthly cost cap.',
        payload: {
          metric: 'public_chat_cost_cents',
          bucket_kind: 'month',
          bucket_start: range.start,
          current_value: numberFromRpc(costReservation.current_value),
          limit_value: numberFromRpc(costReservation.limit_value),
        },
      })
      throw new AppServiceError('cost_cap_reached', 'This generated app reached its monthly public chat cost ceiling.', 402)
    }
  }
}

export async function getPublicAppRuntimeContext(
  slug: string,
  access?: PublicRuntimeAccess,
  options: PublicRuntimeGuardOptions = {},
): Promise<PublicAppRuntimeContext> {
  const app = await getPublicDeploymentBySlug(slug)
  await assertOriginAllowed(app, access)
  await validatePublicAppRuntimeToken({
    appDeploymentId: app.id,
    token: access?.token ?? null,
    kind: access?.kind ?? 'config',
  })
  const manifest = sanitizeGeneratedAppManifest(app.frontend_manifest ?? {}, {
    name: app.name,
    slug: app.slug,
  })
  const capabilities = capabilitiesFromManifest(manifest, app)
  const context = { app, manifest, capabilities }
  if (options.reserveAccounting) {
    await reservePublicRuntimeAccounting(context, access)
  }
  return context
}

export async function assertPublicRuntimeOriginAllowed(
  slug: string,
  access?: PublicRuntimeAccess,
): Promise<void> {
  await getPublicAppRuntimeContext(slug, access)
}

function assertCapability(context: PublicAppRuntimeContext, capability: string): void {
  if (!context.capabilities.includes(capability)) {
    throw new AppServiceError('setup_required', `Generated app does not expose ${capability}.`, 409)
  }
}

function assertActive(context: PublicAppRuntimeContext): void {
  if (context.app.status !== 'active') {
    throw new AppServiceError('app_paused', 'Generated app is not accepting public requests.', 409)
  }
}

function firstAssistantId(context: PublicAppRuntimeContext): string {
  const id = context.app.assistant_ids?.[0]
  if (!id) {
    throw new AppServiceError('setup_required', 'Generated app has no public assistant connected yet.', 409)
  }
  return id
}

function visitorSessionKey(value?: string): string {
  return value ? `visitor:${value}` : `visitor:${crypto.randomUUID()}`
}

function manifestLimits(context: PublicAppRuntimeContext): Record<string, unknown> {
  const limits = context.manifest.limits
  return limits && typeof limits === 'object' && !Array.isArray(limits)
    ? limits as Record<string, unknown>
    : {}
}

async function assertChatWithinLimits(
  context: PublicAppRuntimeContext,
  input: z.infer<typeof PublicChatRequestSchema>,
  access?: PublicRuntimeAccess,
): Promise<void> {
  const limits = manifestLimits(context)
  const chatTurnsPerSession = limits.chat_turns_per_session
  if (typeof chatTurnsPerSession === 'number') {
    const userTurns = input.messages.filter((message) => message.role === 'user').length
    if (userTurns > chatTurnsPerSession) {
      await recordPublicRuntimeGuardEvent({
        app: context.app,
        access,
        eventType: 'public_chat_turn_cap_reached',
        message: 'Public generated app chat denied by per-session turn limit.',
        payload: {
          user_turns: userTurns,
          limit_value: chatTurnsPerSession,
        },
      })
      throw new AppServiceError('cost_cap_reached', 'This generated app reached its chat turn limit for the session.', 402)
    }
  }
}

export async function getPublicAppConfig(slug: string, access?: PublicRuntimeAccess): Promise<PublicAppConfig> {
  return withAppServiceSpan('app_service.runtime.public.config', publicRuntimeTelemetryContext('getPublicAppConfig', slug, access), async () => {
    try {
      const context = await getPublicAppRuntimeContext(slug, access)
      const { app, manifest, capabilities } = context

      recordAppServiceMetric('public_runtime_config_read', 1, publicRuntimeTelemetryContext('getPublicAppConfig', slug, access, context))

      return PublicAppConfigSchema.parse({
        app_id: app.id,
        slug: app.slug,
        name: app.name,
        description: typeof manifest.description === 'string' ? manifest.description : null,
        status: statusForPublicConfig(app.status),
        visibility: app.visibility,
        capabilities,
        theme: typeof manifest.theme === 'object' && manifest.theme !== null ? manifest.theme : {},
        public_endpoints: publicEndpointsForApp(app.slug, capabilities),
        commerce: publicCommerceConfigForManifest(manifest),
        consent: typeof manifest.consent === 'object' && manifest.consent !== null ? manifest.consent : {},
      })
    } catch (error) {
      if (error instanceof AppServiceError) throw error
      ErrorService.captureException(error as Error, {
        severity: 'error',
        ...appServiceErrorContext('getPublicAppConfig', publicRuntimeTelemetryContext('getPublicAppConfig', slug, access)),
      })
      throw new AppServiceError('internal_error', 'Failed to read public app config.', 500)
    }
  })
}

export async function createVisitorSession(
  slug: string,
  rawInput: unknown,
  access?: PublicRuntimeAccess,
): Promise<VisitorSession> {
  return withAppServiceSpan('app_service.runtime.public.session.create', publicRuntimeTelemetryContext('createVisitorSession', slug, access), async () => {
    try {
      const input = VisitorSessionCreateRequestSchema.parse(rawInput)
      const context = await getPublicAppRuntimeContext(slug, access)
      assertActive(context)
      await enforcePublicRuntimeAbuseControls(context, access, rawInput)
      await reservePublicRuntimeAccounting(context, access)

      const externalSessionId = input.external_session_id ?? crypto.randomUUID()
      const expiresAt = appServiceVisitorSessionExpiresAt()

      const { data, error } = await supabase
        .from('app_visitor_sessions')
        .insert({
          app_deployment_id: context.app.id,
          external_session_id: externalSessionId,
          metadata: input.metadata,
          expires_at: expiresAt,
        })
        .select('id, external_session_id, expires_at')
        .single()

      if (error || !data) {
        throw error ?? new Error('Visitor session creation returned no row')
      }

      const session = VisitorSessionSchema.parse(data)
      await recordAppServiceEvent({
        appDeploymentId: context.app.id,
        generationRunId: context.app.generation_run_id,
        eventType: publicRuntimeEventType('session') ?? 'public_session_created',
        message: 'Public generated app visitor session created.',
        payload: {
          visitor_session_id: session.id,
          external_session_id: session.external_session_id,
        },
      })
      recordAppServiceMetric('public_runtime_session_created', 1, {
        ...publicRuntimeTelemetryContext('createVisitorSession', slug, access, context),
        visitorSessionId: session.id,
      })

      return session
    } catch (error) {
      if (error instanceof AppServiceError) throw error
      ErrorService.captureException(error as Error, {
        severity: 'error',
        ...appServiceErrorContext('createVisitorSession', publicRuntimeTelemetryContext('createVisitorSession', slug, access)),
      })
      throw new AppServiceError('internal_error', 'Failed to create visitor session.', 500)
    }
  })
}

export async function getPublicAppStatus(slug: string, access?: PublicRuntimeAccess) {
  return withAppServiceSpan('app_service.runtime.public.status', publicRuntimeTelemetryContext('getPublicAppStatus', slug, access), async () => {
    const context = await getPublicAppRuntimeContext(slug, access)
    const { app } = context
    recordAppServiceMetric('public_runtime_status_read', 1, publicRuntimeTelemetryContext('getPublicAppStatus', slug, access, context))
    return {
      app_id: app.id,
      slug: app.slug,
      status: statusForPublicConfig(app.status),
      public_url: app.public_url,
      preview_url: app.preview_url,
    }
  })
}

export async function submitPublicLead(
  slug: string,
  rawInput: unknown,
  access?: PublicRuntimeAccess,
): Promise<PublicLead> {
  return withAppServiceSpan('app_service.runtime.public.lead.submit', publicRuntimeTelemetryContext('submitPublicLead', slug, access), async () => {
    const input = PublicLeadRequestSchema.parse(rawInput)
    const context = await getPublicAppRuntimeContext(slug, access)
    assertCapability(context, 'lead')
    assertActive(context)
    await enforcePublicRuntimeAbuseControls(context, access, rawInput)
    await reservePublicRuntimeAccounting(context, access)

    const id = crypto.randomUUID()
    await recordAppServiceEvent({
      appDeploymentId: context.app.id,
      generationRunId: context.app.generation_run_id,
      eventType: 'public_lead_submitted',
      message: 'Public generated app lead submitted.',
      payload: {
        lead_id: id,
        destination: APP_SERVICE_LEAD_DEFAULT_DESTINATION,
        visitor_session_id: input.visitor_session_id ?? null,
        has_email: Boolean(input.email),
        has_phone: Boolean(input.phone),
        field_keys: Object.keys(input.fields ?? {}),
      },
    })
    recordAppServiceMetric('public_runtime_lead_submitted', 1, {
      ...publicRuntimeTelemetryContext('submitPublicLead', slug, access, context),
      visitorSessionId: input.visitor_session_id,
    })

    return { id, status: 'received' }
  })
}

export async function submitPublicFeedback(slug: string, rawInput: unknown, access?: PublicRuntimeAccess) {
  return withAppServiceSpan('app_service.runtime.public.feedback.submit', publicRuntimeTelemetryContext('submitPublicFeedback', slug, access), async () => {
    const input = PublicFeedbackRequestSchema.parse(rawInput)
    const context = await getPublicAppRuntimeContext(slug, access)
    assertCapability(context, 'feedback')
    await enforcePublicRuntimeAbuseControls(context, access, rawInput)
    await reservePublicRuntimeAccounting(context, access)

    await recordAppServiceEvent({
      appDeploymentId: context.app.id,
      generationRunId: context.app.generation_run_id,
      eventType: input.report_type ? 'public_feedback_reported' : 'public_feedback_submitted',
      severity: input.report_type === 'unsafe' ? 'warning' : 'info',
      message: input.report_type ? 'Public generated app feedback report submitted.' : 'Public generated app feedback submitted.',
      payload: {
        visitor_session_id: input.visitor_session_id ?? null,
        agentops_trace_id: input.agentops_trace_id ?? null,
        rating: input.rating ?? null,
        report_type: input.report_type ?? null,
        has_comment: Boolean(input.comment),
      },
    })
    recordAppServiceMetric(input.report_type ? 'public_runtime_feedback_reported' : 'public_runtime_feedback_submitted', 1, {
      ...publicRuntimeTelemetryContext('submitPublicFeedback', slug, access, context),
      visitorSessionId: input.visitor_session_id,
      agentopsTraceId: input.agentops_trace_id,
    }, {
      report_type: input.report_type ?? null,
      rating: input.rating ?? null,
    })

    return { status: 'received' as const }
  })
}

type PublicActionCommerceExecution = NonNullable<PublicActionResult['commerce']>

interface PublicActionRunOptions {
  skipRuntimeGuards?: boolean
  commerce?: PublicActionCommerceExecution
  runtimeContext?: PublicAppRuntimeContext
}

export interface PublicActionCommerceGateResult {
  response: NextResponse | null
  runtimeGuardsReserved: boolean
  commerce?: PublicActionCommerceExecution
  runtimeContext?: PublicAppRuntimeContext
}

function assertPublicActionAllowed(
  context: PublicAppRuntimeContext,
  action: string,
): Record<string, unknown> {
  const workflow = publicActionWorkflowFromManifest(context.manifest, action)
  if (!workflow) {
    throw new AppServiceError('forbidden', 'Public action is not whitelisted for this generated app.', 403)
  }
  return workflow
}

function validatedProvider(provider: string | undefined) {
  if (!provider) return undefined
  const parsed = AgentCommerceProviderIdSchema.safeParse(provider)
  return parsed.success ? parsed.data : undefined
}

function validatedRail(rail: string | undefined) {
  if (!rail) return undefined
  const parsed = CommerceRailSchema.safeParse(rail)
  return parsed.success ? parsed.data : undefined
}

export async function requirePublicAppActionCommercePayment(
  slug: string,
  action: string,
  rawInput: unknown,
  access: PublicRuntimeAccess | undefined,
  request: NextRequest,
): Promise<PublicActionCommerceGateResult> {
  return withAppServiceSpan('app_service.runtime.public.action.commerce', publicRuntimeTelemetryContext('requirePublicAppActionCommercePayment', slug, access), async () => {
    const input = PublicActionRequestSchema.parse(rawInput)
    const context = await getPublicAppRuntimeContext(slug, access)
    assertCapability(context, 'public_actions')
    assertActive(context)
    assertPublicActionAllowed(context, action)

    const commerce = publicActionCommerceConfigForAction(context.manifest, action)
    if (!commerce) {
      return { response: null, runtimeGuardsReserved: false, runtimeContext: context }
    }

    const resourceType = publicActionCommerceResourceType(commerce)
    const resourceId = publicActionCommerceResourceId(context.app.id, action, commerce)
    const provider = validatedProvider(commerce.provider)
    const rail = validatedRail(commerce.rail)

    if (commerce.mode === 'shadow') {
      await recordAppServiceEvent({
        appDeploymentId: context.app.id,
        generationRunId: context.app.generation_run_id,
        eventType: 'public_action_commerce_shadowed',
        message: 'Public generated app action matched a shadow Commerce policy.',
        payload: {
          action,
          stackId: 'commerce',
          commerce_mode: commerce.mode,
          resource_type: resourceType,
          resource_id: resourceId,
          amount: commerce.amount ?? null,
          refund_policy: commerce.refund_policy,
        },
      })
      return {
        response: null,
        runtimeGuardsReserved: false,
        commerce: {
          required: false,
          status: 'shadow',
          provider,
          rail,
          resource_type: resourceType,
          resource_id: resourceId,
        },
        runtimeContext: context,
      }
    }

    if (!isPublicActionCommerceEnforced(commerce) || !commerce.amount) {
      throw new AppServiceError('setup_required', 'Paid public action commerce is missing an enforceable amount.', 409)
    }

    await enforcePublicRuntimeAbuseControls(context, access, rawInput)
    await reservePublicRuntimeAccounting(context, access)

    const gate = await requireAgentCommerceMachinePayment({
      request,
      orgId: context.app.org_id,
      resourceType,
      resourceId,
      amount: commerce.amount,
      provider,
      rail,
      challengeBody: {
        app_runtime_api_version: 'v1',
        stack_id: 'commerce',
        slug,
        action,
      },
      metadata: {
        app_deployment_id: context.app.id,
        project_id: context.app.project_id,
        generation_run_id: context.app.generation_run_id,
        visitor_session_id: input.visitor_session_id ?? null,
        idempotency_key: input.idempotency_key ?? null,
        action,
      },
    })

    if (!gate.ok) {
      await recordAppServiceEvent({
        appDeploymentId: context.app.id,
        generationRunId: context.app.generation_run_id,
        eventType: gate.response.status === 402 ? 'public_action_payment_required' : 'public_action_payment_denied',
        severity: gate.response.status === 402 ? 'info' : 'warning',
        message: gate.response.status === 402
          ? 'Public generated app action requires a machine payment proof.'
          : 'Public generated app action machine payment gate denied access.',
        payload: {
          action,
          stackId: 'commerce',
          commerce_mode: commerce.mode,
          resource_type: resourceType,
          resource_id: resourceId,
          provider: provider ?? null,
          rail: rail ?? null,
          amount: commerce.amount,
          status: gate.response.status,
        },
      })
      return { response: gate.response, runtimeGuardsReserved: true, runtimeContext: context }
    }

    await recordAppServiceEvent({
      appDeploymentId: context.app.id,
      generationRunId: context.app.generation_run_id,
      eventType: 'public_action_payment_claimed',
      message: 'Public generated app action machine payment proof was claimed.',
      payload: {
        action,
        stackId: 'commerce',
        commerce_mode: commerce.mode,
        resource_type: resourceType,
        resource_id: resourceId,
        provider: gate.claim.provider,
        rail: rail ?? null,
        amount: commerce.amount,
        challenge_id: gate.claim.challenge_id,
        proof_claim_id: gate.claim.id,
      },
    })

    return {
      response: null,
      runtimeGuardsReserved: true,
      commerce: {
        required: true,
        status: 'proof_claimed',
        provider: gate.claim.provider,
        rail,
        challenge_id: gate.claim.challenge_id,
        resource_type: resourceType,
        resource_id: resourceId,
      },
      runtimeContext: context,
    }
  })
}

export async function runPublicAppAction(
  slug: string,
  action: string,
  rawInput: unknown,
  access?: PublicRuntimeAccess,
  options: PublicActionRunOptions = {},
): Promise<PublicActionResult> {
  return withAppServiceSpan('app_service.runtime.public.action.run', publicRuntimeTelemetryContext('runPublicAppAction', slug, access), async () => {
    const input = PublicActionRequestSchema.parse(rawInput)
    const context = options.runtimeContext ?? await getPublicAppRuntimeContext(slug, access)
    assertCapability(context, 'public_actions')
    assertActive(context)
    assertPublicActionAllowed(context, action)

    if (!options.skipRuntimeGuards) {
      await enforcePublicRuntimeAbuseControls(context, access, rawInput)
      await reservePublicRuntimeAccounting(context, access)
    }

    await recordAppServiceEvent({
      appDeploymentId: context.app.id,
      generationRunId: context.app.generation_run_id,
      eventType: publicRuntimeEventType('action') ?? 'public_action_requested',
      message: 'Public generated app action requested.',
      payload: { action },
    })
    recordAppServiceMetric('public_runtime_action_requested', 1, publicRuntimeTelemetryContext('runPublicAppAction', slug, access, context), {
      action,
    })

    const execution = await executePublicRuntimeAction(context, {
      action,
      input: input.input,
      idempotencyKey: input.idempotency_key,
      visitorSessionId: input.visitor_session_id,
    })

    return {
      action,
      status: execution.status,
      ...(execution.runId ? { run_id: execution.runId } : {}),
      ...(execution.result !== undefined ? { result: execution.result } : {}),
      ...(options.commerce ? { commerce: options.commerce } : {}),
    }
  })
}

export async function respondToPublicAppChat(
  slug: string,
  rawInput: unknown,
  access?: PublicRuntimeAccess,
): Promise<PublicChatResponse> {
  return withAppServiceSpan('app_service.runtime.public.chat.respond', publicRuntimeTelemetryContext('respondToPublicAppChat', slug, access), async () => {
    try {
      const input = PublicChatRequestSchema.parse(rawInput)
      const context = await getPublicAppRuntimeContext(slug, access)
      assertCapability(context, 'chat')
      assertActive(context)
      await enforcePublicRuntimeAbuseControls(context, access, rawInput)
      await assertChatWithinLimits(context, input, access)

      const assistantId = firstAssistantId(context)

      await reservePublicRuntimeAccounting(context, access)

      const messages = input.messages.map((message): ModelMessage => ({
        role: message.role,
        content: message.content,
      }))
      const agentopsTraceId = crypto.randomUUID()
      const conversationId = crypto.randomUUID()
      const result = await withAppServiceSpan('app_service.agentops.public_chat.execute', {
        ...publicRuntimeTelemetryContext('respondToPublicAppChat.generate', slug, access, context),
        stage: 'agentops',
        visitorSessionId: input.visitor_session_id,
        agentopsTraceId,
      }, () => executePublicRuntimeChat(context, {
        assistantId,
        messages,
        visitorSessionId: input.visitor_session_id,
        agentopsTraceId,
      }), {
        assistant_id: assistantId,
        message_count: input.messages.length,
      })
      const text = result.text.trim()

      await recordAppServiceEvent({
        appDeploymentId: context.app.id,
        generationRunId: context.app.generation_run_id,
        eventType: 'public_chat_completed',
        message: 'Public generated app chat completed.',
        payload: {
          agentops_trace_id: agentopsTraceId,
          conversation_id: conversationId,
          visitor_session: visitorSessionKey(input.visitor_session_id),
          assistant_id: assistantId,
          message_count: input.messages.length,
          runtime_executor_model: result.model,
          estimated_cost_cents: result.estimatedCostCents,
        },
      })
      recordAppServiceMetric('public_runtime_chat_completed', 1, {
        ...publicRuntimeTelemetryContext('respondToPublicAppChat', slug, access, context),
        visitorSessionId: input.visitor_session_id,
        agentopsTraceId,
      }, {
        assistant_id: assistantId,
        message_count: input.messages.length,
        estimated_cost_cents: result.estimatedCostCents,
      })

      return PublicChatResponseSchema.parse({
        conversation_id: conversationId,
        agentops_trace_id: agentopsTraceId,
        status: 'completed',
        message: {
          role: 'assistant',
          content: text || 'I am ready, but I could not produce a response for that request.',
        },
      })
    } catch (error) {
      if (error instanceof AppServiceError || error instanceof z.ZodError) throw error
      ErrorService.captureException(error as Error, {
        severity: 'error',
        ...appServiceErrorContext('respondToPublicAppChat', publicRuntimeTelemetryContext('respondToPublicAppChat', slug, access)),
      })
      throw new AppServiceError('provider_unavailable', 'Public chat runtime is not available.', 503, { retryable: true })
    }
  })
}
