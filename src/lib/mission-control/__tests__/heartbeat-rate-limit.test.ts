/**
 * Tests for the shared rate limiter used by heartbeat and claim-inbound endpoints.
 */
import { describe, it, expect } from 'vitest'
import { createRateLimiter } from '@/lib/utils/rate-limiter'

describe('heartbeat rate limiting (via shared rate limiter)', () => {
  it('allows first call', () => {
    const limiter = createRateLimiter({ maxPerWindow: 10 })
    expect(limiter.check('rt-new')).toBe(true)
  })

  it('allows up to maxPerWindow calls', () => {
    const limiter = createRateLimiter({ maxPerWindow: 10 })
    for (let i = 0; i < 10; i++) {
      expect(limiter.check('rt-burst')).toBe(true)
    }
  })

  it('rejects the call exceeding maxPerWindow', () => {
    const limiter = createRateLimiter({ maxPerWindow: 10 })
    for (let i = 0; i < 10; i++) {
      limiter.check('rt-overflow')
    }
    expect(limiter.check('rt-overflow')).toBe(false)
  })

  it('tracks keys independently', () => {
    const limiter = createRateLimiter({ maxPerWindow: 10 })
    for (let i = 0; i < 10; i++) {
      limiter.check('rt-a')
    }
    expect(limiter.check('rt-a')).toBe(false)
    expect(limiter.check('rt-b')).toBe(true)
  })

  it('resets after window expires', () => {
    const limiter = createRateLimiter({ maxPerWindow: 10, windowMs: 1 })
    for (let i = 0; i < 10; i++) {
      limiter.check('rt-fast')
    }
    // Window is 1ms, should expire immediately
    // Small sleep to ensure window passes
    const start = Date.now()
    while (Date.now() - start < 5) { /* spin */ }
    expect(limiter.check('rt-fast')).toBe(true)
  })

  it('enforces hard cap by evicting oldest entry', () => {
    const limiter = createRateLimiter({ maxPerWindow: 10, maxTracked: 3 })
    limiter.check('rt-1')
    limiter.check('rt-2')
    limiter.check('rt-3')
    // Adding rt-4 should evict rt-1 (oldest, but still active)
    // This triggers the hard cap path
    limiter.check('rt-4')
    // rt-4 should work (it was just added)
    expect(limiter.check('rt-4')).toBe(true)
  })
})
