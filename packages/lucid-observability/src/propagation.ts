/**
 * @lucid/observability — Trace Propagation Helpers
 *
 * W3C Trace Context (traceparent) propagation for INTERNAL HTTP calls only.
 *
 * When lucid-worker calls lucid-l2, lucid-core, or any internal service,
 * these helpers inject/extract the traceparent header so spans are linked
 * into a single distributed trace.
 *
 * ⚠️  EXTERNAL HOP POLICY:
 *   - INTERNAL services (worker → l2, worker → core): inject traceparent ✅
 *   - EXTERNAL providers (l2 → OpenAI/Anthropic/etc.): DO NOT inject traceparent ❌
 *     Sending traceparent to third-party vendors leaks a stable correlation ID
 *     outside your trust boundary. Instead, keep the llm.call span locally
 *     and record the external call timing without propagating trace headers.
 *
 * Standard: https://www.w3.org/TR/trace-context/
 *
 * traceparent format: {version}-{trace-id}-{parent-id}-{trace-flags}
 * Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 */

import { context, trace, propagation } from '@opentelemetry/api'

export type TraceHop = 'internal' | 'external'

export interface InjectTraceContextOptions {
  hop: TraceHop
}

export interface TracePropagationPolicy {
  /**
   * Explicit internal hosts/suffixes allowed for propagation.
   * Example: ['lucid-l2.internal', 'lucid-core.internal']
   */
  internalHosts?: string[]
  /**
   * Internal host suffixes allowed for propagation.
   * Examples: ['.lucid.internal', '.railway.internal']
   */
  internalHostSuffixes?: string[]
  /**
   * Allow localhost/loopback propagation for local development.
   * Default: true
   */
  allowLoopback?: boolean
}

/**
 * Inject trace context into outgoing HTTP headers.
 * Call this ONLY for INTERNAL service-to-service HTTP requests.
 *
 * ⚠️  DO NOT call this for external provider calls (OpenAI, Anthropic, etc.)
 * Sending traceparent to third-party vendors leaks correlation IDs outside
 * your trust boundary. For external calls, create a local span instead.
 *
 * Usage:
 * ```ts
 * // ✅ Internal call to lucid-l2:
 * const headers = { 'Content-Type': 'application/json' }
 * injectTraceContext(headers, { hop: 'internal' })
 * await fetch(lucidL2Url, { headers })
 *
 * // ❌ External call to OpenAI — DO NOT inject:
 * const extHeaders = { 'Content-Type': 'application/json', Authorization: '...' }
 * injectTraceContext(extHeaders, { hop: 'external' }) // no-op by design
 * await fetch(openaiUrl, { headers: extHeaders })
 * ```
 */
export function injectTraceContext(
  headers: Record<string, string>,
  options: InjectTraceContextOptions,
): Record<string, string> {
  if (options.hop !== 'internal') {
    return headers
  }

  propagation.inject(context.active(), headers)
  return headers
}

/**
 * Decide if trace context should be propagated to a target URL.
 *
 * Default behavior is deny-by-default for non-loopback hosts.
 * This prevents accidental propagation to external vendors.
 */
export function shouldPropagateTraceContext(
  target: string | URL,
  policy: TracePropagationPolicy = {}
): boolean {
  const allowLoopback = policy.allowLoopback ?? true
  const internalHosts = (policy.internalHosts ?? []).map(h => h.toLowerCase())
  const internalHostSuffixes = (policy.internalHostSuffixes ?? [])
    .map(s => s.toLowerCase().trim())
    .filter(Boolean)

  let hostname = ''
  try {
    hostname = (typeof target === 'string' ? new URL(target) : target).hostname.toLowerCase()
  } catch {
    return false
  }

  if (allowLoopback && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1')) {
    return true
  }

  if (internalHosts.length === 0) {
    // continue: suffix-based policy may still allow propagation
  } else if (internalHosts.some(host => hostname === host || hostname.endsWith(`.${host}`))) {
    return true
  }

  if (internalHostSuffixes.length > 0) {
    return internalHostSuffixes.some((suffix) => {
      const normalized = suffix.startsWith('.') ? suffix : `.${suffix}`
      const exact = suffix.startsWith('.') ? suffix.slice(1) : suffix
      return hostname === exact || hostname.endsWith(normalized)
    })
  }

  return false
}

/**
 * Convenience wrapper: derive hop from target + policy, then inject only if internal.
 *
 * Usage:
 * ```ts
 * const headers = { 'Content-Type': 'application/json' }
 * injectTraceContextForTarget(headers, url, {
 *   internalHosts: ['lucid-l2.internal', 'lucid-core.internal'],
 * })
 * ```
 */
export function injectTraceContextForTarget(
  headers: Record<string, string>,
  target: string | URL,
  policy: TracePropagationPolicy = {}
): Record<string, string> {
  const hop: TraceHop = shouldPropagateTraceContext(target, policy) ? 'internal' : 'external'
  return injectTraceContext(headers, { hop })
}

/**
 * Extract trace context from incoming HTTP headers.
 * Call this at the start of an HTTP handler to continue the trace.
 *
 * Usage:
 * ```ts
 * const ctx = extractTraceContext(req.headers)
 * const span = tracer.startSpan('handle.request', {}, ctx)
 * ```
 */
export function extractTraceContext(
  headers: Record<string, string | string[] | undefined>
): ReturnType<typeof propagation.extract> {
  // Normalize headers to Record<string, string> (take first value for arrays)
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      normalized[key] = value
    } else if (Array.isArray(value) && value.length > 0) {
      normalized[key] = value[0]
    }
  }
  return propagation.extract(context.active(), normalized)
}

/**
 * Get the current trace ID (32-char hex) for log correlation.
 * Returns empty string if no active trace.
 *
 * Usage:
 * ```ts
 * logger.info({ trace_id: getActiveTraceId(), run_id: runId }, 'Processing message')
 * ```
 */
export function getActiveTraceId(): string {
  const span = trace.getActiveSpan()
  if (!span) return ''
  return span.spanContext().traceId
}

/**
 * Get the current span ID (16-char hex) for log correlation.
 * Returns empty string if no active span.
 */
export function getActiveSpanId(): string {
  const span = trace.getActiveSpan()
  if (!span) return ''
  return span.spanContext().spanId
}

/**
 * Get correlation fields for structured logging.
 * Include these in every log line for trace ↔ log linking.
 *
 * These values are read from the ACTIVE OTel context at call time,
 * so they automatically stay correct across async boundaries.
 * Do NOT cache the return value — call this fresh for each log line.
 *
 * Usage:
 * ```ts
 * logger.info({ ...getCorrelationFields(), run_id: runId }, 'Step complete')
 * ```
 */
export function getCorrelationFields(): {
  trace_id: string
  span_id: string
} {
  return {
    trace_id: getActiveTraceId(),
    span_id: getActiveSpanId(),
  }
}
