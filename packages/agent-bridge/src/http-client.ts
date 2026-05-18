/**
 * Agent Bridge — REST Client
 *
 * Authenticated HTTP client for the Lucid control plane REST API.
 * All requests include Bearer auth + 30s timeout.
 *
 * Error classification:
 *   - 4xx (except 429) → permanent (BridgeError, isTransient=false)
 *   - 429, 5xx, network errors → transient (BridgeError, isTransient=true)
 *
 * Retry-After header is respected on 429 responses.
 * Callers (heartbeat, event reporter) use the offline buffer for transient failures;
 * the client itself does not retry — backoff lives at the polling layer.
 */

import type { BridgeLogger } from './types.js'

// =============================================================================
// Error Types
// =============================================================================

export class BridgeError extends Error {
  readonly name = 'BridgeError'

  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly status: number,
    public readonly body: string,
    public readonly retryAfterMs?: number,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }

  /** Transient errors should be buffered/retried. Permanent errors should be logged and dropped. */
  get isTransient(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500
  }
}

// =============================================================================
// REST Client
// =============================================================================

const REQUEST_TIMEOUT_MS = 30_000

export class RestClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly logger: BridgeLogger,
  ) {}

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const retryAfter = parseRetryAfter(res.headers.get('Retry-After'))
        throw new BridgeError(
          `POST ${path} failed: ${res.status} ${text}`,
          path, res.status, text, retryAfter,
        )
      }

      const contentType = res.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        return (await res.json()) as T
      }
      return undefined as T
    } catch (err) {
      if (err instanceof BridgeError) throw err

      // Network error (ECONNREFUSED, timeout, DNS failure) → transient, status 0
      const message = err instanceof Error ? err.message : String(err)
      throw new BridgeError(
        `POST ${path} network error: ${message}`,
        path, 0, '', undefined, { cause: err },
      )
    }
  }

  async get<T = unknown>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const retryAfter = parseRetryAfter(res.headers.get('Retry-After'))
        throw new BridgeError(
          `GET ${path} failed: ${res.status} ${text}`,
          path, res.status, text, retryAfter,
        )
      }

      return (await res.json()) as T
    } catch (err) {
      if (err instanceof BridgeError) throw err
      const message = err instanceof Error ? err.message : String(err)
      throw new BridgeError(
        `GET ${path} network error: ${message}`,
        path, 0, '', undefined, { cause: err },
      )
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Parse Retry-After header → milliseconds, or undefined if absent/invalid. */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = parseInt(header, 10)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined
}
