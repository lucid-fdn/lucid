import type { SupabaseClient } from '@supabase/supabase-js'

export const BROWSER_QA_USAGE_EVENT_TYPES = [
  'session_started',
  'navigation',
  'action',
  'snapshot',
  'screenshot',
  'artifact_written',
  'session_closed',
  'session_expired',
  'error',
] as const

export type BrowserQaUsageEventType = (typeof BROWSER_QA_USAGE_EVENT_TYPES)[number]

export type BrowserQaUsageEvent = {
  orgId?: string
  runId?: string
  sessionKey: string
  targetId?: string
  stepId?: string
  provider: string
  eventType: BrowserQaUsageEventType
  targetUrl?: string
  durationMs?: number
  bytes?: number
  requestCount?: number
  consoleErrorCount?: number
  pageErrorCount?: number
  metadata?: Record<string, unknown>
}

export interface BrowserQaUsageRecorder {
  record(event: BrowserQaUsageEvent): Promise<void>
}

export type BrowserQaQuotaLimits = {
  maxSessionsPerRun: number
  maxScreenshotsPerRun: number
}

export type BrowserQaQuotaContext = {
  orgId?: string
  runId?: string
}

export interface BrowserQaQuotaGuard {
  assertCanOpenSession(context: BrowserQaQuotaContext): Promise<void>
  assertCanCaptureScreenshot(context: BrowserQaQuotaContext): Promise<void>
}

export const noopBrowserQaUsageRecorder: BrowserQaUsageRecorder = {
  async record() {
    // Intentionally empty for tests and local gateways without DB credentials.
  },
}

export const noopBrowserQaQuotaGuard: BrowserQaQuotaGuard = {
  async assertCanOpenSession() {
    // Intentionally empty for tests and local gateways without DB credentials.
  },
  async assertCanCaptureScreenshot() {
    // Intentionally empty for tests and local gateways without DB credentials.
  },
}

export class SupabaseBrowserQaUsageRecorder implements BrowserQaUsageRecorder {
  constructor(private readonly supabase: SupabaseClient) {}

  async record(event: BrowserQaUsageEvent): Promise<void> {
    if (!isUuid(event.orgId) || !isUuid(event.runId)) return

    const { error } = await this.supabase
      .from('agent_ops_browser_qa_usage_events')
      .insert({
        org_id: event.orgId,
        ops_run_id: event.runId,
        session_key: event.sessionKey,
        target_id: event.targetId ?? null,
        step_id: event.stepId ?? null,
        provider: event.provider,
        event_type: event.eventType,
        target_url: event.targetUrl ?? null,
        duration_ms: normalizeNonNegativeInteger(event.durationMs),
        bytes: normalizeNonNegativeInteger(event.bytes),
        request_count: normalizeNonNegativeInteger(event.requestCount),
        console_error_count: normalizeNonNegativeInteger(event.consoleErrorCount),
        page_error_count: normalizeNonNegativeInteger(event.pageErrorCount),
        metadata: event.metadata ?? {},
      })

    if (error) throw error
  }
}

export class SupabaseBrowserQaQuotaGuard implements BrowserQaQuotaGuard {
  private readonly limitCache = new Map<string, { expiresAt: number; limits: BrowserQaQuotaLimits }>()

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly limits: BrowserQaQuotaLimits,
  ) {}

  async assertCanOpenSession(context: BrowserQaQuotaContext): Promise<void> {
    const limits = await this.resolveLimits(context.orgId)
    await this.assertEventCountUnderLimit(context, {
      eventType: 'session_started',
      limit: limits.maxSessionsPerRun,
      label: 'session',
    })
  }

  async assertCanCaptureScreenshot(context: BrowserQaQuotaContext): Promise<void> {
    const limits = await this.resolveLimits(context.orgId)
    await this.assertEventCountUnderLimit(context, {
      eventType: 'screenshot',
      limit: limits.maxScreenshotsPerRun,
      label: 'screenshot',
    })
  }

  private async resolveLimits(orgId: string | undefined): Promise<BrowserQaQuotaLimits> {
    if (!isUuid(orgId)) return this.limits

    const cached = this.limitCache.get(orgId)
    if (cached && cached.expiresAt > Date.now()) return cached.limits

    const limits = await this.loadPlanLimits(orgId).catch((error) => {
      console.warn('[browser-qa-gateway]', {
        event: 'quota_limit_resolution_failed',
        orgId,
        error: error instanceof Error ? error.message : String(error),
      })
      return this.limits
    })

    this.limitCache.set(orgId, {
      expiresAt: Date.now() + 5 * 60 * 1000,
      limits,
    })
    return limits
  }

  private async loadPlanLimits(orgId: string): Promise<BrowserQaQuotaLimits> {
    const { data, error } = await this.supabase
      .from('subscriptions')
      .select('plans(limits)')
      .eq('org_id', orgId)
      .in('status', ['active', 'trialing'])
      .order('current_period_end', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    const planLimits = extractPlanLimits(data)
    return {
      maxSessionsPerRun: normalizeLimit(
        planLimits.browser_qa_sessions_per_run,
        this.limits.maxSessionsPerRun,
      ),
      maxScreenshotsPerRun: normalizeLimit(
        planLimits.browser_qa_screenshots_per_run,
        this.limits.maxScreenshotsPerRun,
      ),
    }
  }

  private async assertEventCountUnderLimit(
    context: BrowserQaQuotaContext,
    input: {
      eventType: BrowserQaUsageEventType
      limit: number
      label: string
    },
  ): Promise<void> {
    if (input.limit <= 0 || !isUuid(context.orgId) || !isUuid(context.runId)) return

    const { count, error } = await this.supabase
      .from('agent_ops_browser_qa_usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', context.orgId)
      .eq('ops_run_id', context.runId)
      .eq('event_type', input.eventType)

    if (error) throw error
    if ((count ?? 0) >= input.limit) {
      throw new Error(`Browser QA ${input.label} quota exceeded for this run (max ${input.limit})`)
    }
  }
}

function extractPlanLimits(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {}
  const plan = (data as { plans?: unknown }).plans
  const normalizedPlan = Array.isArray(plan) ? plan[0] : plan
  if (!normalizedPlan || typeof normalizedPlan !== 'object') return {}
  const limits = (normalizedPlan as { limits?: unknown }).limits
  return limits && typeof limits === 'object' && !Array.isArray(limits)
    ? limits as Record<string, unknown>
    : {}
}

function normalizeLimit(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  if (value === -1) return 0
  return Math.max(0, Math.round(value))
}

function normalizeNonNegativeInteger(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.max(0, Math.round(value))
}

function isUuid(value: string | undefined): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
