/**
 * Usage Tracking
 *
 * Fire-and-forget usage metering for API routes.
 * Follows the Vercel/Stripe pattern: check limit before processing,
 * increment after success, never block the response.
 *
 * Usage:
 *   // In any API route where orgId is known:
 *   await trackApiCall(orgId)          // check + increment api_calls_monthly
 *   await trackAiQuery(orgId)          // check + increment ai_queries_monthly
 *   trackStorageDelta(orgId, deltaGB)  // fire-and-forget storage_gb update
 */

import 'server-only'
import { incrementUsage, checkLimit } from '@/lib/plans'
import { ErrorService } from '@/lib/errors/error-service'

// ============================================================================
// Core Tracking Functions
// ============================================================================

/**
 * Track an API call for the org.
 * Checks limit first, throws if exceeded.
 */
export async function trackApiCall(orgId: string): Promise<void> {
  const allowed = await checkLimit(orgId, 'api_calls_monthly')
  if (!allowed) {
    throw new UsageLimitError('api_calls_monthly')
  }
  // Fire-and-forget increment — don't block the response
  incrementUsage(orgId, 'api_calls_monthly', 1).catch(captureIncrementError)
}

/**
 * Track an AI query for the org.
 * Checks limit first, throws if exceeded.
 */
export async function trackAiQuery(orgId: string): Promise<void> {
  const allowed = await checkLimit(orgId, 'ai_queries_monthly')
  if (!allowed) {
    throw new UsageLimitError('ai_queries_monthly')
  }
  incrementUsage(orgId, 'ai_queries_monthly', 1).catch(captureIncrementError)
}

/**
 * Track storage change (fire-and-forget, no limit check).
 * Call with positive delta on upload, negative on delete.
 * Storage limits are enforced at upload time via checkStorageLimit().
 */
export function trackStorageDelta(orgId: string, deltaGB: number): void {
  incrementUsage(orgId, 'storage_gb', deltaGB).catch(captureIncrementError)
}

/**
 * Check if storage upload is within limits.
 * Call before accepting a file upload.
 */
export async function checkStorageLimit(orgId: string): Promise<boolean> {
  return checkLimit(orgId, 'storage_gb')
}

// ============================================================================
// Error Handling
// ============================================================================

export class UsageLimitError extends Error {
  public readonly metric: string
  public readonly statusCode = 429

  constructor(metric: string) {
    super(`Usage limit exceeded: ${metric}. Upgrade your plan.`)
    this.name = 'UsageLimitError'
    this.metric = metric
  }
}

/**
 * Check if an error is a UsageLimitError (for use in catch blocks)
 */
export function isUsageLimitError(error: unknown): error is UsageLimitError {
  return error instanceof UsageLimitError
}

function captureIncrementError(error: unknown): void {
  ErrorService.captureException(error, {
    severity: 'warning',
    context: { operation: 'usage_increment' },
    tags: { layer: 'usage' },
  })
}
