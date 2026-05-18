import 'server-only'

import { createRateLimiter, type RateLimiter } from '@/lib/utils/rate-limiter'

export const RUNTIME_RATE_LIMIT_WINDOW_MS = 60_000
export const RUNTIME_RATE_LIMIT_RETRY_AFTER_MS = RUNTIME_RATE_LIMIT_WINDOW_MS
export const RUNTIME_RATE_LIMIT_MAX_TRACKED = 500

export const RUNTIME_HEARTBEAT_MAX_PER_WINDOW = 10
export const RUNTIME_CONFIG_MAX_PER_WINDOW = 10
// Direct DB relay claiming is the degradation path for runtimes that cannot
// claim through Pulse. Keep it intentionally conservative: empty long-polls
// used to hit Postgres every 250ms, which amplified idle runtimes into tens of
// thousands of RPC calls on small Supabase compute. Redis/Pulse is the low-latency
// path; this fallback should preserve compatibility without becoming a DB poller.
export const RUNTIME_LEGACY_CLAIM_MAX_PER_WINDOW = 4
export const RUNTIME_DB_CLAIM_POLL_INTERVAL_MS = 15_000

export const RUNTIME_STALE_AFTER_MS = 5 * 60 * 1000
export const RUNTIME_OFFLINE_AFTER_MS = 60 * 60 * 1000
export const RUNTIME_AUTO_REDEPLOY_RETRY_COOLDOWN_MS = 15 * 60 * 1000

export type RuntimePresenceStatus = 'connected' | 'stale' | 'offline'

export function createRuntimeHeartbeatLimiter(): RateLimiter {
  return createRateLimiter({
    maxPerWindow: RUNTIME_HEARTBEAT_MAX_PER_WINDOW,
    windowMs: RUNTIME_RATE_LIMIT_WINDOW_MS,
    maxTracked: RUNTIME_RATE_LIMIT_MAX_TRACKED,
  })
}

export function createRuntimeConfigLimiter(): RateLimiter {
  return createRateLimiter({
    maxPerWindow: RUNTIME_CONFIG_MAX_PER_WINDOW,
    windowMs: RUNTIME_RATE_LIMIT_WINDOW_MS,
    maxTracked: RUNTIME_RATE_LIMIT_MAX_TRACKED,
  })
}

export function getRuntimePresenceThresholds(now = Date.now()): {
  staleBefore: Date
  offlineBefore: Date
} {
  return {
    staleBefore: new Date(now - RUNTIME_STALE_AFTER_MS),
    offlineBefore: new Date(now - RUNTIME_OFFLINE_AFTER_MS),
  }
}

export function deriveRuntimePresenceStatus(
  lastSeenAt: string | Date | null | undefined,
  now = Date.now(),
): RuntimePresenceStatus {
  if (!lastSeenAt) return 'offline'

  const lastSeenMs =
    lastSeenAt instanceof Date ? lastSeenAt.getTime() : new Date(lastSeenAt).getTime()
  if (!Number.isFinite(lastSeenMs)) return 'offline'

  const ageMs = now - lastSeenMs
  if (ageMs >= RUNTIME_OFFLINE_AFTER_MS) return 'offline'
  if (ageMs >= RUNTIME_STALE_AFTER_MS) return 'stale'
  return 'connected'
}

export function isWithinRuntimeRetryCooldown(
  lastAttemptAt: string | Date | null | undefined,
  now = Date.now(),
): boolean {
  if (!lastAttemptAt) return false

  const attemptMs =
    lastAttemptAt instanceof Date ? lastAttemptAt.getTime() : new Date(lastAttemptAt).getTime()
  if (!Number.isFinite(attemptMs)) return false

  return now - attemptMs < RUNTIME_AUTO_REDEPLOY_RETRY_COOLDOWN_MS
}
