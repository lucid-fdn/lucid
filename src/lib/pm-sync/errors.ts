/**
 * PM Sync Errors — Typed error hierarchy.
 *
 * Every adapter throws one of these when something goes wrong. The dispatcher
 * and sync worker branch on `instanceof` to decide retry strategy:
 *   - PmSyncAuthError       → mark config needs reconnect, stop retrying
 *   - PmSyncRateLimitError  → respect retryAfterMs, requeue
 *   - PmSyncMappingError    → permanent, DLQ
 *   - PmSyncError (base)    → transient unless retryable=false
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.2
 */

import type { PmProvider } from '@contracts/pm-adapter'

/**
 * Base error for all PM sync failures. `retryable` defaults to true so
 * unexpected errors surface as transient unless an adapter explicitly
 * marks them permanent.
 */
export class PmSyncError extends Error {
  readonly provider: PmProvider | null
  readonly retryable: boolean
  readonly cause?: unknown

  constructor(
    message: string,
    options: {
      provider?: PmProvider | null
      retryable?: boolean
      cause?: unknown
    } = {},
  ) {
    super(message)
    this.name = 'PmSyncError'
    this.provider = options.provider ?? null
    this.retryable = options.retryable ?? true
    this.cause = options.cause
  }
}

/**
 * Thrown when a work item cannot be mapped to a provider payload (e.g.,
 * missing required Linear team id in org config). Permanent by default —
 * the sync worker should dead-letter instead of retrying.
 */
export class PmSyncMappingError extends PmSyncError {
  constructor(
    message: string,
    options: { provider?: PmProvider | null; cause?: unknown } = {},
  ) {
    super(message, { ...options, retryable: false })
    this.name = 'PmSyncMappingError'
  }
}

/**
 * Thrown when Nango auth fails (401/403 from provider, revoked token,
 * expired refresh token). Non-retryable — operator must reconnect.
 */
export class PmSyncAuthError extends PmSyncError {
  constructor(
    message: string,
    options: { provider?: PmProvider | null; cause?: unknown } = {},
  ) {
    super(message, { ...options, retryable: false })
    this.name = 'PmSyncAuthError'
  }
}

/**
 * Thrown on 429 or provider-signalled throttling. Carries `retryAfterMs`
 * so the caller can reschedule instead of burning the budget.
 */
export class PmSyncRateLimitError extends PmSyncError {
  readonly retryAfterMs: number

  constructor(
    message: string,
    options: {
      provider?: PmProvider | null
      retryAfterMs?: number
      cause?: unknown
    } = {},
  ) {
    super(message, { ...options, retryable: true })
    this.name = 'PmSyncRateLimitError'
    this.retryAfterMs = options.retryAfterMs ?? 30_000
  }
}
