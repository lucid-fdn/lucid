/**
 * Credential Core — Fetch with Retry
 *
 * Exponential backoff retry for transient HTTP errors (429, 5xx).
 * Mirrors the pattern from src/lib/oauth/nango-fetch.ts.
 *
 * Shared across Nango, Database, and Gateway adapters.
 */

const DEFAULT_BASE_DELAY_MS = 1_000
const BACKOFF_MULTIPLIER = 2

export interface RetryFetchOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  /** Timeout per attempt in ms (default: 30000). */
  timeoutMs?: number
  /** Max retry attempts on transient errors (default: 3). */
  maxRetries?: number
  /** Label for log messages. */
  label?: string
}

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}

/**
 * Fetch with exponential backoff retry on 429/5xx.
 * Non-retryable errors (4xx except 429) return immediately.
 */
export async function fetchWithRetry(
  url: string,
  opts: RetryFetchOptions = {},
): Promise<Response> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 30_000,
    maxRetries = 3,
    label = 'fetch',
  } = opts

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })

      // Success or non-retryable error → return immediately
      if (response.ok || !isRetryable(response.status) || attempt === maxRetries) {
        return response
      }

      // Retryable → backoff
      const retryAfter = response.headers.get('Retry-After')
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : DEFAULT_BASE_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1)

      console.warn(`[credential-core:${label}] ${response.status}, retry ${attempt}/${maxRetries} in ${delayMs}ms`)
      await new Promise((r) => setTimeout(r, delayMs))
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt === maxRetries) {
        throw lastError
      }

      const delayMs = DEFAULT_BASE_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1)
      console.warn(`[credential-core:${label}] ${lastError.message}, retry ${attempt}/${maxRetries} in ${delayMs}ms`)
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }

  throw lastError ?? new Error(`[credential-core:${label}] Unexpected retry exhaustion`)
}
