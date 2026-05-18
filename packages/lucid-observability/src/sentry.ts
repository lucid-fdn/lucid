/**
 * @lucid/observability — Sentry Cross-Linking
 *
 * Helpers for linking Sentry errors to OTel traces and vice versa.
 *
 * Architecture:
 *   - OTel = tracing backbone (distributed traces, spans, performance)
 *   - Sentry = error truth (stack traces, alerting, release tracking)
 *   - They cross-link via trace_id + runId
 *
 * Sentry projects (one per deployable surface):
 *   - lucid-web     (Next.js — Vercel)
 *   - lucid-worker   (Railway)
 *   - lucid-l2       (Railway/standalone)
 *   - lucid-core     (if separate)
 *
 * All under the same Sentry org, same release/version tagging strategy.
 */

import { getActiveTraceId, getActiveSpanId } from './propagation.js'

/**
 * Sentry project slugs — must match Sentry dashboard config.
 */
export const SENTRY_PROJECTS = {
  LUCID_WEB: 'lucid-web',
  LUCID_WORKER: 'lucid-worker',
  LUCID_L2: 'lucid-l2',
  LUCID_CORE: 'lucid-core',
  TRUSTGATE: 'lucid-trustgate',
  MCPGATE: 'lucid-mcpgate',
} as const

/**
 * Build Sentry scope context that links to the current OTel trace.
 *
 * Usage in Sentry.init beforeSend or setContext:
 * ```ts
 * Sentry.setContext('otel', buildSentryOtelContext(runId))
 * ```
 *
 * This makes it possible to jump from a Sentry error → OTel trace view.
 */
export function buildSentryOtelContext(runId?: string): Record<string, string> {
  const ctx: Record<string, string> = {}

  const traceId = getActiveTraceId()
  const spanId = getActiveSpanId()

  if (traceId) ctx.trace_id = traceId
  if (spanId) ctx.span_id = spanId
  if (runId) ctx.run_id = runId

  return ctx
}

/**
 * Build Sentry tags for consistent filtering.
 * These tags should be set on every Sentry event.
 *
 * Usage:
 * ```ts
 * Sentry.init({
 *   beforeSend(event) {
 *     event.tags = { ...event.tags, ...buildSentryTags('lucid-worker', 'production') }
 *     return event
 *   }
 * })
 * ```
 */
export function buildSentryTags(
  serviceName: string,
  environment: string,
  extra?: Record<string, string>
): Record<string, string> {
  return {
    service: serviceName,
    environment,
    ...extra,
  }
}

/* ─── Strict Cross-Linking Contract ───────────────────── */

/**
 * STRICT CONTRACT: Sentry ↔ OTel cross-linking fields.
 *
 * Every Sentry project MUST set these exact tags and contexts
 * so that filtering works identically across all projects.
 *
 * ## Sentry Tags (top-level, filterable):
 *  - `trace_id`     — OTel trace ID (32-char hex)
 *  - `run_id`       — Lucid run ID (UUID, idempotency key)
 *  - `service`      — Canonical service name (lucid-worker, lucid-l2, etc.)
 *  - `environment`  — LUCID_ENV value (production, staging, development)
 *
 * ## Sentry Contexts (structured, visible in event detail):
 *  - `otel.trace_id`    — OTel trace ID
 *  - `otel.span_id`     — OTel span ID (16-char hex)
 *  - `otel.run_id`      — Lucid run ID
 *  - `lucid.service`    — Canonical service name
 *  - `lucid.environment` — LUCID_ENV value
 */

/**
 * Sentry event enrichment function.
 * Attach OTel trace context + runId to every Sentry event.
 * Implements the strict cross-linking contract above.
 *
 * Usage in Sentry.init:
 * ```ts
 * import { enrichSentryEvent } from '@lucid/observability/sentry'
 *
 * Sentry.init({
 *   beforeSend(event, hint) {
 *     return enrichSentryEvent(event, {
 *       runId: currentRunId,
 *       serviceName: SERVICE_NAMES.LUCID_WORKER,
 *       environment: getLucidEnv(),
 *     })
 *   }
 * })
 * ```
 */
export function enrichSentryEvent(
  event: { contexts?: Record<string, unknown>; tags?: Record<string, string> },
  opts?: { runId?: string; serviceName?: string; environment?: string }
): typeof event {
  const traceId = getActiveTraceId()
  const spanId = getActiveSpanId()

  // ── Tags (top-level, filterable in Sentry search) ──
  event.tags = event.tags || {}
  if (traceId) event.tags.trace_id = traceId
  if (opts?.runId) event.tags.run_id = opts.runId
  if (opts?.serviceName) event.tags.service = opts.serviceName
  if (opts?.environment) event.tags.environment = opts.environment

  // ── Contexts (structured, visible in event detail) ──
  event.contexts = event.contexts || {}

  // otel context: trace correlation
  const otelCtx: Record<string, string> = {}
  if (traceId) otelCtx.trace_id = traceId
  if (spanId) otelCtx.span_id = spanId
  if (opts?.runId) otelCtx.run_id = opts.runId
  if (Object.keys(otelCtx).length > 0) {
    event.contexts.otel = otelCtx
  }

  // lucid context: service identification
  const lucidCtx: Record<string, string> = {}
  if (opts?.serviceName) lucidCtx.service = opts.serviceName
  if (opts?.environment) lucidCtx.environment = opts.environment
  if (Object.keys(lucidCtx).length > 0) {
    event.contexts.lucid = lucidCtx
  }

  return event
}

/**
 * PII scrubbing rules for Sentry.
 * Apply these in Sentry.init's beforeSend to strip sensitive data.
 *
 * Rules:
 *  - Strip request bodies (may contain user prompts)
 *  - Strip response bodies from breadcrumbs
 *  - Strip query strings that may contain tokens
 *  - Keep stack traces, error messages, tags
 */
export function applySentryPiiScrubbing(
  event: {
    request?: { data?: unknown; query_string?: unknown; cookies?: unknown }
    breadcrumbs?: { values?: Array<{ data?: Record<string, unknown> }> }
  }
): typeof event {
  // Strip request body (may contain prompts/user input)
  if (event.request) {
    delete event.request.data
    delete event.request.query_string
    delete event.request.cookies
  }

  // Strip breadcrumb response bodies
  if (event.breadcrumbs?.values) {
    for (const bc of event.breadcrumbs.values) {
      if (bc.data) {
        delete bc.data.response_body
        delete bc.data.request_body
        delete bc.data.body
      }
    }
  }

  return event
}