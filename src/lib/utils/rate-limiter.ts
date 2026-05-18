/**
 * In-memory sliding-window rate limiter.
 *
 * Tracks call counts per key within a 1-minute window.
 * Used by heartbeat and claim-inbound endpoints.
 *
 * Bounded: evicts stale entries when the map reaches maxTracked.
 * Hard cap: forcibly evicts oldest entry if all are still active.
 */

export interface RateLimiterOptions {
  /** Max calls per window per key */
  maxPerWindow: number
  /** Window duration in ms (default: 60_000) */
  windowMs?: number
  /** Max keys to track before eviction (default: 500) */
  maxTracked?: number
}

export interface RateLimiter {
  /** Returns true if the call is allowed, false if rate-limited */
  check(key: string): boolean
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const {
    maxPerWindow,
    windowMs = 60_000,
    maxTracked = 500,
  } = options

  const counts = new Map<string, { count: number; resetAt: number }>()

  return {
    check(key: string): boolean {
      const now = Date.now()
      const entry = counts.get(key)

      if (!entry || entry.resetAt < now) {
        // Evict stale entries when at capacity
        if (counts.size >= maxTracked) {
          let evicted = 0
          for (const [id, e] of counts) {
            if (e.resetAt < now) {
              counts.delete(id)
              evicted++
            }
          }
          // Hard cap: if nothing was stale, evict the oldest entry
          if (evicted === 0 && counts.size >= maxTracked) {
            const firstKey = counts.keys().next().value
            if (firstKey !== undefined) counts.delete(firstKey)
          }
        }
        counts.set(key, { count: 1, resetAt: now + windowMs })
        return true
      }

      if (entry.count >= maxPerWindow) return false
      entry.count++
      return true
    },
  }
}
