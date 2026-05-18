/**
 * Fetch with timeout, retry, and structured errors for Polymarket APIs.
 */

import { PolymarketError, PolymarketApiError, PolymarketRateLimitError } from './errors.js'
import { API_TIMEOUT_MS, MAX_RETRIES, RETRY_BASE_DELAY_MS } from './constants.js'

/**
 * Fetch with AbortController timeout + exponential backoff retry for transient errors.
 * Retries on: 429, 500, 502, 503, 504, network errors.
 * Does NOT retry on: 4xx client errors (except 429).
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: { maxRetries?: number; timeoutMs?: number },
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? MAX_RETRIES
  const timeoutMs = options?.timeoutMs ?? API_TIMEOUT_MS
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      })

      clearTimeout(timer)

      if (response.ok) return response

      // Rate limit — extract retry-after if available
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after')
        const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined
        lastError = new PolymarketRateLimitError(
          `Rate limited on ${url}`,
          retryMs,
        )
        if (attempt < maxRetries) {
          const delay = retryMs ?? RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
          await sleep(delay)
          continue
        }
        throw lastError
      }

      // Server errors — retryable
      if (response.status >= 500) {
        const text = await response.text().catch(() => '')
        lastError = new PolymarketApiError(
          `${url} → ${response.status}: ${text.substring(0, 200)}`,
          response.status,
          url,
        )
        if (attempt < maxRetries) {
          await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt))
          continue
        }
        throw lastError
      }

      // Client errors (4xx except 429) — not retryable
      const text = await response.text().catch(() => '')
      throw new PolymarketApiError(
        `${url} → ${response.status}: ${text.substring(0, 200)}`,
        response.status,
        url,
      )
    } catch (error) {
      clearTimeout(timer)

      // Already a Polymarket error — only retry if marked retryable
      if (error instanceof PolymarketError) {
        if (!error.retryable || attempt >= maxRetries) throw error
        lastError = error
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt))
        continue
      }

      // Abort / network error — retryable
      const isAbort = error instanceof Error && error.name === 'AbortError'
      const msg = isAbort
        ? `Request to ${url} timed out after ${timeoutMs}ms`
        : `Network error on ${url}: ${error instanceof Error ? error.message : String(error)}`
      lastError = new PolymarketApiError(msg, 0, url)

      if (attempt < maxRetries) {
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt))
        continue
      }
      throw lastError
    }
  }

  throw lastError ?? new Error(`fetchWithRetry: exhausted retries for ${url}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
