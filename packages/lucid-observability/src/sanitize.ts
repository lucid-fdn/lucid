/**
 * @lucid/observability — Error Sanitization
 *
 * Sanitize errors before they hit ANY telemetry pipeline:
 * OTel spans, Sentry, structured logs.
 *
 * WHY: Some Error subclasses carry raw HTTP response bodies in
 * error.cause, error.response, error.data — and loggers/Sentry
 * serialize those automatically, leaking PII or prompt text.
 */

/**
 * Strip dangerous properties from an error before telemetry.
 *
 * Removes: response, data, body, cause, config
 * (all known carriers of raw HTTP response bodies)
 *
 * Usage:
 * ```ts
 * span.recordException(sanitizeErrorForTelemetry(err))
 * ```
 */
export function sanitizeErrorForTelemetry(err: unknown): Error {
  if (!(err instanceof Error)) return new Error(String(err))

  const dangerousProps = ['response', 'data', 'body', 'cause', 'config'] as const
  for (const prop of dangerousProps) {
    if (prop in err) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (err as any)[prop]
      } catch {
        // Non-configurable property — wrap in a new error instead
        const safe = new Error(err.message)
        safe.name = err.name
        safe.stack = err.stack
        return safe
      }
    }
  }
  return err
}

/**
 * Extract a safe error classification for span attributes.
 * Returns ONLY: status code, timeout, network_error, or generic class.
 * NEVER returns raw error messages (may contain response bodies).
 *
 * Usage:
 * ```ts
 * span.setAttribute(ATTR_KEYS.LLM_ERROR_TYPE, classifyError(err))
 * ```
 */
export function classifyError(err: unknown): string {
  if (!(err instanceof Error)) return 'unknown_error'

  const msg = err.message

  // HTTP status codes
  const statusMatch = msg.match(/\((\d{3})\)/)
  if (statusMatch) return `status_${statusMatch[1]}`

  // Timeout
  if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('AbortError')) {
    return 'timeout'
  }

  // Network errors
  if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('fetch failed')) {
    return 'network_error'
  }

  // Rate limit
  if (msg.includes('429') || msg.includes('rate limit')) {
    return 'rate_limited'
  }

  // Auth
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized')) {
    return 'auth_error'
  }

  return 'provider_error'
}