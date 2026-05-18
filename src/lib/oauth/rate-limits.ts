/**
 * OAuth-specific rate limit configurations.
 *
 * Uses the existing @upstash/ratelimit infrastructure from src/lib/auth/rate-limit.ts.
 * Presets are scoped per user (Privy DID) to prevent abuse without affecting other users.
 */

import type { RateLimitConfig } from '@/lib/auth/rate-limit'

export const OAuthRateLimits = {
  /** Session token creation — 10/min per user (interactive flow, don't over-restrict) */
  SESSION: { maxRequests: 10, windowMs: 60 * 1000 } satisfies RateLimitConfig,

  /** OAuth initiation — 10/min per user */
  INITIATE: { maxRequests: 10, windowMs: 60 * 1000 } satisfies RateLimitConfig,

  /** Disconnect — 10/min per user (shouldn't need more) */
  DISCONNECT: { maxRequests: 10, windowMs: 60 * 1000 } satisfies RateLimitConfig,

  /** Resource fetching — 30/min per user (browsing lists/channels/spreadsheets) */
  RESOURCES: { maxRequests: 30, windowMs: 60 * 1000 } satisfies RateLimitConfig,

  /** Connection list — 30/min per user */
  CONNECTIONS: { maxRequests: 30, windowMs: 60 * 1000 } satisfies RateLimitConfig,

  /** Stats — 20/min per user */
  STATS: { maxRequests: 20, windowMs: 60 * 1000 } satisfies RateLimitConfig,
} as const
