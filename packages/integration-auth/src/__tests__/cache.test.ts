import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CredentialCache } from '../cache.js'
import type { CredentialAdapter, TokenResult } from '../types.js'

const token: TokenResult = {
  accessToken: 'xoxb-test-token',
  tokenType: 'bearer',
}

function mockAdapter(result: TokenResult | null, delayMs = 0): CredentialAdapter {
  return {
    name: 'mock',
    isAvailable: () => true,
    resolve: vi.fn().mockImplementation(async () => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
      return result
    }),
  }
}

describe('CredentialCache', () => {
  let cache: CredentialCache

  beforeEach(() => {
    cache = new CredentialCache({ ttlMs: 1000, maxEntries: 3 })
  })

  it('returns null for missing entries', () => {
    expect(cache.get('slack', 'conn-1')).toBeNull()
  })

  it('stores and retrieves entries', () => {
    cache.set('slack', 'conn-1', token)
    expect(cache.get('slack', 'conn-1')).toEqual(token)
  })

  it('expires entries after TTL', () => {
    vi.useFakeTimers()
    cache.set('slack', 'conn-1', token)
    expect(cache.get('slack', 'conn-1')).toEqual(token)

    vi.advanceTimersByTime(1001)
    expect(cache.get('slack', 'conn-1')).toBeNull()
    vi.useRealTimers()
  })

  it('evicts oldest entry when at capacity', () => {
    cache.set('a', '1', token)
    cache.set('b', '2', token)
    cache.set('c', '3', token)
    expect(cache.size).toBe(3)

    cache.set('d', '4', token)
    expect(cache.size).toBe(3)
    expect(cache.get('a', '1')).toBeNull() // evicted
    expect(cache.get('d', '4')).toEqual(token)
  })

  it('invalidates specific entries', () => {
    cache.set('slack', 'conn-1', token)
    cache.invalidate('slack', 'conn-1')
    expect(cache.get('slack', 'conn-1')).toBeNull()
  })

  it('clears all entries', () => {
    cache.set('a', '1', token)
    cache.set('b', '2', token)
    cache.clear()
    expect(cache.size).toBe(0)
  })

  it('respects token expiry over TTL', () => {
    vi.useFakeTimers()
    const shortLivedToken: TokenResult = {
      ...token,
      expiresAt: new Date(Date.now() + 500).toISOString(),
    }
    cache.set('slack', 'conn-1', shortLivedToken)

    vi.advanceTimersByTime(501)
    expect(cache.get('slack', 'conn-1')).toBeNull()
    vi.useRealTimers()
  })

  describe('getOrResolve (request coalescing)', () => {
    it('resolves and caches on miss', async () => {
      const adapter = mockAdapter(token)
      const result = await cache.getOrResolve('slack', 'conn-1', adapter)
      expect(result).toEqual(token)
      expect(adapter.resolve).toHaveBeenCalledOnce()
      // Now cached
      expect(cache.get('slack', 'conn-1')).toEqual(token)
    })

    it('returns cached value without calling adapter', async () => {
      cache.set('slack', 'conn-1', token)
      const adapter = mockAdapter(token)
      const result = await cache.getOrResolve('slack', 'conn-1', adapter)
      expect(result).toEqual(token)
      expect(adapter.resolve).not.toHaveBeenCalled()
    })

    it('coalesces concurrent requests (adapter called once)', async () => {
      const adapter = mockAdapter(token, 50)

      // Fire 5 concurrent requests
      const results = await Promise.all([
        cache.getOrResolve('slack', 'conn-1', adapter),
        cache.getOrResolve('slack', 'conn-1', adapter),
        cache.getOrResolve('slack', 'conn-1', adapter),
        cache.getOrResolve('slack', 'conn-1', adapter),
        cache.getOrResolve('slack', 'conn-1', adapter),
      ])

      // All get the same result
      for (const r of results) {
        expect(r).toEqual(token)
      }
      // But adapter was only called ONCE
      expect(adapter.resolve).toHaveBeenCalledOnce()
    })

    it('does not cache null results', async () => {
      const adapter = mockAdapter(null)
      const result = await cache.getOrResolve('slack', 'conn-1', adapter)
      expect(result).toBeNull()
      expect(cache.get('slack', 'conn-1')).toBeNull()
    })

    it('cleans up inflight on error', async () => {
      const adapter: CredentialAdapter = {
        name: 'failing',
        isAvailable: () => true,
        resolve: vi.fn().mockRejectedValue(new Error('boom')),
      }

      await expect(cache.getOrResolve('slack', 'conn-1', adapter)).rejects.toThrow('boom')
      expect(cache.pendingCount).toBe(0)
    })
  })
})
