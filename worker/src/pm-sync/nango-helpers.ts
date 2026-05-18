/**
 * PM Sync — Shared Nango Helpers.
 *
 * Common patterns extracted from individual adapter implementations:
 *   - `requireNangoClient()` — get-or-throw Nango client
 *   - `handleNangoError()` — classify Nango SDK errors into typed PM errors
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.2
 */

import type { Nango } from '@nangohq/node'
import { getNangoClient } from '../agent/oauth-tools/nango-client.js'
import { PmSyncAuthError, PmSyncError, PmSyncRateLimitError } from './errors.js'
import type { PmProvider } from './types.js'

/**
 * Returns the Nango singleton or throws `PmSyncAuthError`.
 * Every adapter needs this — extracted to avoid 4× duplication.
 */
export function requireNangoClient(provider: PmProvider): Nango {
  const nango = getNangoClient()
  if (!nango) {
    throw new PmSyncAuthError('Nango client not configured', { provider })
  }
  return nango
}

/**
 * Classify an unknown error from a Nango proxy call into a typed PM error.
 *
 * Checks for:
 *   - Already-typed `PmSyncError` — rethrown as-is
 *   - 401/403 → `PmSyncAuthError`
 *   - 429 → `PmSyncRateLimitError`
 *   - Everything else → `PmSyncError` (retryable)
 */
export function handleNangoError(
  err: unknown,
  provider: PmProvider,
  context: string,
): never {
  if (err instanceof PmSyncError) throw err

  const anyErr = err as { status?: number; response?: { status?: number } }
  const status = anyErr.status ?? anyErr.response?.status

  if (status === 401 || status === 403) {
    throw new PmSyncAuthError(`${context}: auth rejected`, { provider, cause: err })
  }
  if (status === 429) {
    throw new PmSyncRateLimitError(`${context}: rate limited`, { provider, cause: err })
  }
  throw new PmSyncError(
    `${context}: ${(err as Error).message}`,
    { provider, retryable: true, cause: err },
  )
}
