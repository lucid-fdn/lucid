/**
 * Distributed rate limiter using Upstash Redis with in-memory fallback.
 * Uses sliding window algorithm via @upstash/ratelimit.
 */
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { createHash } from 'crypto'

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null

// In-memory fallback for local dev
const memoryStore = new Map<string, { count: number; resetAt: number }>()
const memoryPruneTimer = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetAt < now) memoryStore.delete(key)
  }
}, 5 * 60 * 1000)
memoryPruneTimer.unref?.()

// Cache Upstash Ratelimit instances by config key
const limiterCache = new Map<string, Ratelimit>()
function getLimiter(config: RateLimitConfig): Ratelimit {
  const key = `${config.maxRequests}:${config.windowMs}`
  let limiter = limiterCache.get(key)
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(config.maxRequests, `${config.windowMs} ms`),
      prefix: 'rl',
    })
    limiterCache.set(key, limiter)
  }
  return limiter
}

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  resetAt: number
}

/** Check rate limit. Uses Upstash Redis when available, in-memory otherwise. */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  if (
    process.env.DISABLE_RATE_LIMITS === 'true'
    || (process.env.NODE_ENV !== 'production' && process.env.DISABLE_RATE_LIMITS_IN_DEV === 'true')
  ) {
    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      resetAt: Date.now() + config.windowMs,
    }
  }

  if (redis) {
    try {
      const res = await getLimiter(config).limit(identifier)
      return { success: res.success, limit: res.limit, remaining: res.remaining, resetAt: res.reset }
    } catch {
      // Redis unreachable — fall through to in-memory
    }
  }
  // In-memory fallback
  const now = Date.now()
  let entry = memoryStore.get(identifier)
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + config.windowMs }
    memoryStore.set(identifier, entry)
  }
  if (entry.count >= config.maxRequests) {
    return { success: false, limit: config.maxRequests, remaining: 0, resetAt: entry.resetAt }
  }
  entry.count++
  return {
    success: true,
    limit: config.maxRequests,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  }
}

/** Preset rate limit configurations */
export const RateLimitPresets = {
  STRICT: { maxRequests: 5, windowMs: 60 * 1000 },
  STANDARD: { maxRequests: 10, windowMs: 60 * 1000 },
  RELAXED: { maxRequests: 20, windowMs: 60 * 1000 },
  LOGIN: { maxRequests: 5, windowMs: 5 * 60 * 1000 },
  REFRESH: { maxRequests: 30, windowMs: 60 * 1000 },
  AUTH_MINUTE: { maxRequests: 5, windowMs: 60 * 1000 },
  AUTH_HOUR: { maxRequests: 50, windowMs: 60 * 60 * 1000 },
} as const

/**
 * Derive a stable request identifier from headers.
 * Combines IP with a fingerprint hash of user-agent + accept headers.
 * Never returns 'unknown' -- always produces a deterministic hash.
 */
export function getRequestIdentifier(req: Request): string {
  const ip =
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    ''
  const fingerprint = createHash('sha256')
    .update(req.headers.get('user-agent') || '')
    .update(req.headers.get('accept-language') || '')
    .update(req.headers.get('accept-encoding') || '')
    .digest('hex')
    .slice(0, 16)
  return ip ? `${ip}:${fingerprint}` : fingerprint
}
