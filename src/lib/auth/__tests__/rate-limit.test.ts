import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock @upstash/ratelimit and @upstash/redis before importing the module
// We want the in-memory fallback path (no Redis), so we ensure the env vars
// are NOT set. The module reads them at import time.
const originalEnv = { ...process.env }

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: vi.fn(),
}))

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(),
}))

// Ensure no Redis env vars so the module uses in-memory fallback
beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
})

afterEach(() => {
  process.env = { ...originalEnv }
})

// We need to use dynamic import after mocks are set up, but since vitest
// hoists vi.mock calls, static imports work fine here.
import {
  checkRateLimit,
  getRequestIdentifier,
  RateLimitPresets,
  type RateLimitConfig,
} from '../rate-limit'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequestWithHeaders(headers: Record<string, string>): Request {
  return new Request('https://example.com', {
    headers: new Headers(headers),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('rate-limit module', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -----------------------------------------------------------------------
  // checkRateLimit (in-memory fallback)
  // -----------------------------------------------------------------------
  describe('checkRateLimit (in-memory fallback)', () => {
    const config: RateLimitConfig = { maxRequests: 3, windowMs: 10_000 }

    it('allows requests within the limit', async () => {
      const id = `test-allow-${Date.now()}-${Math.random()}`
      const result = await checkRateLimit(id, config)

      expect(result.success).toBe(true)
      expect(result.limit).toBe(3)
      expect(result.remaining).toBe(2) // 3 max - 1 used
    })

    it('tracks remaining count correctly', async () => {
      const id = `test-track-${Date.now()}-${Math.random()}`

      const r1 = await checkRateLimit(id, config)
      expect(r1.remaining).toBe(2)

      const r2 = await checkRateLimit(id, config)
      expect(r2.remaining).toBe(1)

      const r3 = await checkRateLimit(id, config)
      expect(r3.remaining).toBe(0)
    })

    it('blocks requests exceeding the limit', async () => {
      const id = `test-block-${Date.now()}-${Math.random()}`

      // Exhaust the limit
      for (let i = 0; i < config.maxRequests; i++) {
        const res = await checkRateLimit(id, config)
        expect(res.success).toBe(true)
      }

      // Next request should be blocked
      const blocked = await checkRateLimit(id, config)
      expect(blocked.success).toBe(false)
      expect(blocked.remaining).toBe(0)
      expect(blocked.limit).toBe(config.maxRequests)
    })

    it('resets after the window expires', async () => {
      const id = `test-reset-${Date.now()}-${Math.random()}`

      // Exhaust the limit
      for (let i = 0; i < config.maxRequests; i++) {
        await checkRateLimit(id, config)
      }

      // Should be blocked now
      const blocked = await checkRateLimit(id, config)
      expect(blocked.success).toBe(false)

      // Advance time past the window
      vi.advanceTimersByTime(config.windowMs + 1)

      // Should be allowed again
      const afterReset = await checkRateLimit(id, config)
      expect(afterReset.success).toBe(true)
      expect(afterReset.remaining).toBe(config.maxRequests - 1)
    })

    it('returns correct resetAt timestamp', async () => {
      const id = `test-resetat-${Date.now()}-${Math.random()}`
      const before = Date.now()
      const result = await checkRateLimit(id, config)
      const after = Date.now()

      // resetAt should be approximately now + windowMs
      expect(result.resetAt).toBeGreaterThanOrEqual(before + config.windowMs)
      expect(result.resetAt).toBeLessThanOrEqual(after + config.windowMs)
    })

    it('uses separate counters for different identifiers', async () => {
      const idA = `test-sep-a-${Date.now()}-${Math.random()}`
      const idB = `test-sep-b-${Date.now()}-${Math.random()}`

      // Exhaust limit for idA
      for (let i = 0; i < config.maxRequests; i++) {
        await checkRateLimit(idA, config)
      }

      // idA should be blocked
      const blockedA = await checkRateLimit(idA, config)
      expect(blockedA.success).toBe(false)

      // idB should still be allowed
      const allowedB = await checkRateLimit(idB, config)
      expect(allowedB.success).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // getRequestIdentifier
  // -----------------------------------------------------------------------
  describe('getRequestIdentifier', () => {
    it('returns a consistent identifier for the same request headers', () => {
      const headers = {
        'x-real-ip': '192.168.1.1',
        'user-agent': 'TestAgent/1.0',
        'accept-language': 'en-US',
        'accept-encoding': 'gzip',
      }
      const req1 = makeRequestWithHeaders(headers)
      const req2 = makeRequestWithHeaders(headers)

      const id1 = getRequestIdentifier(req1)
      const id2 = getRequestIdentifier(req2)

      expect(id1).toBe(id2)
    })

    it('returns different identifiers for different IPs', () => {
      const common = {
        'user-agent': 'TestAgent/1.0',
        'accept-language': 'en-US',
        'accept-encoding': 'gzip',
      }
      const req1 = makeRequestWithHeaders({ ...common, 'x-real-ip': '10.0.0.1' })
      const req2 = makeRequestWithHeaders({ ...common, 'x-real-ip': '10.0.0.2' })

      expect(getRequestIdentifier(req1)).not.toBe(getRequestIdentifier(req2))
    })

    it('includes IP prefix when x-real-ip is present', () => {
      const req = makeRequestWithHeaders({
        'x-real-ip': '1.2.3.4',
        'user-agent': 'Bot',
      })
      const id = getRequestIdentifier(req)
      expect(id).toMatch(/^1\.2\.3\.4:/)
    })

    it('uses x-forwarded-for when x-real-ip is absent', () => {
      const req = makeRequestWithHeaders({
        'x-forwarded-for': '5.6.7.8, 10.0.0.1',
        'user-agent': 'Bot',
      })
      const id = getRequestIdentifier(req)
      expect(id).toMatch(/^5\.6\.7\.8:/)
    })

    it('returns only fingerprint hash when no IP headers are present', () => {
      const req = makeRequestWithHeaders({
        'user-agent': 'Bot',
        'accept-language': 'en',
      })
      const id = getRequestIdentifier(req)
      // Should be a 16-char hex string (no colon, since no IP)
      expect(id).toMatch(/^[0-9a-f]{16}$/)
    })

    it('returns different identifiers for different user-agents (same IP)', () => {
      const req1 = makeRequestWithHeaders({
        'x-real-ip': '1.1.1.1',
        'user-agent': 'Chrome/100',
      })
      const req2 = makeRequestWithHeaders({
        'x-real-ip': '1.1.1.1',
        'user-agent': 'Firefox/99',
      })
      expect(getRequestIdentifier(req1)).not.toBe(getRequestIdentifier(req2))
    })

    it('handles completely empty headers gracefully', () => {
      const req = makeRequestWithHeaders({})
      const id = getRequestIdentifier(req)
      // Should still produce a deterministic hash (never returns empty string)
      expect(id).toBeTruthy()
      expect(id).toMatch(/^[0-9a-f]{16}$/)
    })
  })

  // -----------------------------------------------------------------------
  // RateLimitPresets
  // -----------------------------------------------------------------------
  describe('RateLimitPresets', () => {
    it('STRICT has 5 requests per 60s', () => {
      expect(RateLimitPresets.STRICT).toEqual({
        maxRequests: 5,
        windowMs: 60_000,
      })
    })

    it('STANDARD has 10 requests per 60s', () => {
      expect(RateLimitPresets.STANDARD).toEqual({
        maxRequests: 10,
        windowMs: 60_000,
      })
    })

    it('RELAXED has 20 requests per 60s', () => {
      expect(RateLimitPresets.RELAXED).toEqual({
        maxRequests: 20,
        windowMs: 60_000,
      })
    })

    it('LOGIN has 5 requests per 5 minutes', () => {
      expect(RateLimitPresets.LOGIN).toEqual({
        maxRequests: 5,
        windowMs: 5 * 60_000,
      })
    })

    it('REFRESH has 30 requests per 60s', () => {
      expect(RateLimitPresets.REFRESH).toEqual({
        maxRequests: 30,
        windowMs: 60_000,
      })
    })

    it('AUTH_MINUTE has 5 requests per 60s', () => {
      expect(RateLimitPresets.AUTH_MINUTE).toEqual({
        maxRequests: 5,
        windowMs: 60_000,
      })
    })

    it('AUTH_HOUR has 50 requests per hour', () => {
      expect(RateLimitPresets.AUTH_HOUR).toEqual({
        maxRequests: 50,
        windowMs: 60 * 60_000,
      })
    })

    it('all presets have positive maxRequests and windowMs', () => {
      for (const [name, preset] of Object.entries(RateLimitPresets)) {
        expect(preset.maxRequests, `${name}.maxRequests`).toBeGreaterThan(0)
        expect(preset.windowMs, `${name}.windowMs`).toBeGreaterThan(0)
      }
    })
  })
})
