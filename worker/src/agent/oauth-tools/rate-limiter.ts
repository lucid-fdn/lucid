/**
 * OAuth Tool Rate Limiter
 *
 * Distributed rate limiting via Redis (Upstash).
 * Falls back to in-memory counters if Redis is unavailable.
 *
 * Key format: oauth:rl:{runId}:{provider}
 * TTL: 30 min (auto-cleanup, covers max reasonable run duration)
 */

import { Redis } from '@upstash/redis'
import { getRedisRestEnv } from '../../redis/env.js'

// ---------------------------------------------------------------------------
// Redis client (optional — degrades to in-memory)
// ---------------------------------------------------------------------------

let redis: Redis | null = null

const redisEnv = getRedisRestEnv()

if (redisEnv) {
  redis = new Redis(redisEnv)
}

const KEY_PREFIX = 'oauth:rl:'
const KEY_TTL_SECONDS = 30 * 60 // 30 minutes

// ---------------------------------------------------------------------------
// In-memory fallback (single-instance only)
// ---------------------------------------------------------------------------

const localCounters = new Map<string, number>()
const LOCAL_MAX_ENTRIES = 10_000 // safety cap — prevents unbounded growth on Redis failure

function localKey(runId: string, provider: string): string {
  return `${runId}:${provider}`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the current call count for a provider within a run.
 * Redis-backed if available, in-memory fallback otherwise.
 */
export async function getCallCount(runId: string, provider: string): Promise<number> {
  if (redis) {
    try {
      const count = await redis.get<number>(`${KEY_PREFIX}${runId}:${provider}`)
      return count ?? 0
    } catch {
      // Redis unavailable — fall through to local
    }
  }
  return localCounters.get(localKey(runId, provider)) ?? 0
}

/**
 * Increment the call count. Returns the new count.
 * Atomic in Redis (INCR). Sets TTL on first increment.
 */
export async function incrementCallCount(runId: string, provider: string): Promise<number> {
  if (redis) {
    try {
      const key = `${KEY_PREFIX}${runId}:${provider}`
      const count = await redis.incr(key)
      // Set TTL only on first increment (count === 1)
      if (count === 1) {
        await redis.expire(key, KEY_TTL_SECONDS)
      }
      // Also update local for consistency within this process
      localCounters.set(localKey(runId, provider), count)
      return count
    } catch {
      // Redis unavailable — fall through to local
    }
  }

  const key = localKey(runId, provider)
  const count = (localCounters.get(key) ?? 0) + 1
  if (localCounters.size < LOCAL_MAX_ENTRIES) {
    localCounters.set(key, count)
  }
  return count
}

/**
 * Clean up counters for a finished run.
 * Redis entries auto-expire via TTL; this cleans local state.
 * Call in finally block.
 */
export async function cleanupRunCounters(runId: string): Promise<void> {
  // Clean local entries for this run
  for (const key of localCounters.keys()) {
    if (key.startsWith(`${runId}:`)) {
      localCounters.delete(key)
    }
  }

  // Redis entries expire automatically via TTL — no explicit cleanup needed
}

/** Check if distributed rate limiting is active (Redis connected). */
export function isDistributed(): boolean {
  return redis !== null
}
