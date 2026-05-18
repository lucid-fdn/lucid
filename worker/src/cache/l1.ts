/**
 * Two-Tier Cache (L1 In-Process + L2 Redis)
 *
 * L1: LRU in-process cache for hot data (zero latency)
 * L2: Upstash Redis for shared cache across worker replicas
 *
 * Reads: L1 → L2 → DB (populate both on miss)
 * Writes/Invalidations: delete from both L1 + L2
 */

// @ts-ignore Module resolution differs between local and Docker
import { LRUCache } from 'lru-cache'
import { Redis } from '@upstash/redis'
import { getRedisRestEnv } from '../redis/env.js'

// ---------------------------------------------------------------------------
// L2 Redis client (optional — gracefully degrades to L1-only)
// ---------------------------------------------------------------------------

let redis: Redis | null = null

const redisEnv = getRedisRestEnv()

if (redisEnv) {
  redis = new Redis(redisEnv)
}

const L2_PREFIX = 'worker:'

// ---------------------------------------------------------------------------
// L1 Cache instances (separate caches for different TTL/size needs)
// ---------------------------------------------------------------------------

/** Assistant config cache (TTL: 2 min, max 500 entries) */
export const assistantCache = new LRUCache<string, any>({
  max: 500,
  ttl: 2 * 60 * 1000, // 2 minutes
})

/** Channel config cache (TTL: 2 min, max 500 entries) */
export const channelCache = new LRUCache<string, any>({
  max: 500,
  ttl: 2 * 60 * 1000,
})

/** Conversation lookup cache (TTL: 30s, max 1000 entries) */
export const conversationCache = new LRUCache<string, any>({
  max: 1000,
  ttl: 30 * 1000, // 30 seconds
})

/** Memory retrieval cache (TTL: 10s, max 200 entries) */
export const memoryCache = new LRUCache<string, any>({
  max: 200,
  ttl: 10 * 1000, // 10 seconds — short because memories change often
})

// Map cache instances to their Redis TTL (in seconds)
const cacheTTLs = new Map<LRUCache<string, any>, number>([
  [assistantCache, 120],
  [channelCache, 120],
  [conversationCache, 30],
  [memoryCache, 10],
])

// ---------------------------------------------------------------------------
// Two-tier cache-aside pattern
// ---------------------------------------------------------------------------

/**
 * Get from L1 → L2 → fetcher (cache-aside with two tiers).
 * On L1 miss + L2 hit, backfills L1. On full miss, populates both.
 */
export async function cacheAside<T>(
  cache: LRUCache<string, any>,
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  // L1 check
  const l1 = cache.get(key)
  if (l1 !== undefined) return l1

  // L2 check
  if (redis) {
    try {
      const l2 = await redis.get<T>(`${L2_PREFIX}${key}`)
      if (l2 !== null && l2 !== undefined) {
        cache.set(key, l2) // backfill L1
        return l2
      }
    } catch {
      // Redis unavailable — fall through to fetcher
    }
  }

  // Full miss — fetch from source
  const fresh = await fetcher()
  cache.set(key, fresh)

  // Populate L2
  if (redis) {
    const ttl = cacheTTLs.get(cache) || 120
    redis.set(`${L2_PREFIX}${key}`, JSON.stringify(fresh), { ex: ttl }).catch(() => {})
  }

  return fresh
}

// ---------------------------------------------------------------------------
// Invalidation
// ---------------------------------------------------------------------------

/** Invalidate a specific cache entry from both L1 and L2. */
export function invalidate(cache: LRUCache<string, any>, key: string): void {
  cache.delete(key)
  if (redis) {
    redis.del(`${L2_PREFIX}${key}`).catch(() => {})
  }
}

/** Clear all caches (L1 only — L2 entries expire via TTL). */
export function clearAllCaches(): void {
  assistantCache.clear()
  channelCache.clear()
  conversationCache.clear()
  memoryCache.clear()
}

/** Check if L2 Redis is connected. */
export function isL2Available(): boolean {
  return redis !== null
}
