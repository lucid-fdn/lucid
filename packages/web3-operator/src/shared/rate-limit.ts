/**
 * Rate limiter — token bucket per API host.
 *
 * Prevents hammering free-tier APIs (Jupiter 60 req/min, DexScreener, 0x).
 * Lightweight, in-memory, per-process. No external deps.
 *
 * Rate limits are derived from the provider registry (shared/providers.ts).
 */

import { buildHostLimits } from './providers.js'

interface Bucket {
  tokens: number
  lastRefill: number
  maxTokens: number
  refillRate: number // tokens per second
}

const buckets = new Map<string, Bucket>()

// Derived from provider registry — single source of truth
const HOST_LIMITS: Record<string, { maxTokens: number; refillRate: number }> = buildHostLimits()

function getBucket(host: string): Bucket {
  let bucket = buckets.get(host)
  if (!bucket) {
    const limits = HOST_LIMITS[host] || { maxTokens: 30, refillRate: 0.5 }
    bucket = {
      tokens: limits.maxTokens,
      lastRefill: Date.now(),
      maxTokens: limits.maxTokens,
      refillRate: limits.refillRate,
    }
    buckets.set(host, bucket)
  }
  return bucket
}

function refill(bucket: Bucket): void {
  const now = Date.now()
  const elapsed = (now - bucket.lastRefill) / 1000
  bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + elapsed * bucket.refillRate)
  bucket.lastRefill = now
}

/**
 * Try to consume a token for the given API host.
 * Returns true if allowed, false if rate limited.
 */
export function tryConsume(host: string): boolean {
  const bucket = getBucket(host)
  refill(bucket)
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1
    return true
  }
  return false
}

/**
 * Rate-limited fetch wrapper. Throws if rate limit exceeded.
 * Use this for external API calls to stay within free tier limits.
 */
export interface RateLimitedFetchInit extends RequestInit {
  timeoutMs?: number
}

export async function rateLimitedFetch(
  url: string | URL,
  init?: RateLimitedFetchInit,
): Promise<Response> {
  const parsed = typeof url === 'string' ? new URL(url) : url
  const host = parsed.hostname

  if (!tryConsume(host)) {
    throw new RateLimitError(`Rate limit exceeded for ${host}. Try again shortly.`)
  }

  const { timeoutMs = 15_000, ...fetchInit } = init ?? {}
  const signal = fetchInit.signal ?? AbortSignal.timeout(timeoutMs)

  return fetch(url, {
    ...fetchInit,
    signal,
  })
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RateLimitError'
  }
}
