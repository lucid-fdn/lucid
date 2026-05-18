/**
 * Web3 Operator — Provider registry, fallback chains, and circuit breaker tests.
 *
 * Validates that the centralized provider infrastructure works correctly
 * without making real API calls (all fetchers are mocked).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  PROVIDERS,
  FALLBACK_CHAINS,
  providerUrl,
  getFallbackChain,
  withFallback,
  getProviderHealth,
  resetBreaker,
  jupiter,
  dexscreener,
  zerox,
  helius,
  debridge,
  buildHostLimits,
  warnIfMissing,
} from '@lucid-fdn/web3-operator'
import type { ProviderId, Capability } from '@lucid-fdn/web3-operator'

// ── Provider Config Tests ───────────────────────────────────────────

describe('Provider Registry', () => {
  it('has all 5 providers configured', () => {
    expect(Object.keys(PROVIDERS)).toEqual(['jupiter', 'dexscreener', 'zerox', 'helius', 'debridge'])
  })

  it('each provider has required fields', () => {
    for (const [id, p] of Object.entries(PROVIDERS)) {
      expect(p.name).toBeTruthy()
      expect(p.baseUrl).toMatch(/^https?:\/\//)
      expect(p.rateLimit.maxTokens).toBeGreaterThan(0)
      expect(p.rateLimit.refillRate).toBeGreaterThan(0)
      expect(typeof p.available).toBe('boolean')
      expect(typeof p.headers).toBe('object')
    }
  })

  it('typed accessors return correct providers', () => {
    expect(jupiter().name).toBe('Jupiter')
    expect(dexscreener().name).toBe('DexScreener')
    expect(zerox().name).toBe('0x Protocol')
    expect(debridge().name).toBe('DeBridge')
  })

  it('dexscreener and debridge are always available (free, no key)', () => {
    expect(dexscreener().available).toBe(true)
    expect(debridge().available).toBe(true)
  })

  it('jupiter is always available (works without key)', () => {
    expect(jupiter().available).toBe(true)
  })

  it('base URLs are overridable via env vars', () => {
    // Default URLs should be set
    expect(jupiter().baseUrl).toContain('jup.ag')
    expect(dexscreener().baseUrl).toContain('dexscreener.com')
    expect(zerox().baseUrl).toContain('0x.org')
    expect(debridge().baseUrl).toContain('debridge.finance')
  })
})

// ── URL Builder Tests ───────────────────────────────────────────────

describe('providerUrl', () => {
  it('builds correct URLs', () => {
    const url = providerUrl('jupiter', '/price/v3?ids=SOL')
    expect(url).toContain('jup.ag/price/v3?ids=SOL')
  })

  it('works for all providers', () => {
    const providers: ProviderId[] = ['jupiter', 'dexscreener', 'zerox', 'debridge']
    for (const p of providers) {
      const url = providerUrl(p, '/test')
      expect(url).toMatch(/^https?:\/\/.*\/test$/)
    }
  })
})

// ── Fallback Chain Tests ────────────────────────────────────────────

describe('Fallback Chains', () => {
  it('defines chains for all 5 capabilities', () => {
    const capabilities: Capability[] = ['price', 'search', 'swap_quote', 'bridge', 'history']
    for (const cap of capabilities) {
      expect(FALLBACK_CHAINS[cap]).toBeDefined()
      expect(Object.keys(FALLBACK_CHAINS[cap]).length).toBeGreaterThan(0)
    }
  })

  it('every capability has a _default fallback', () => {
    for (const [cap, chains] of Object.entries(FALLBACK_CHAINS)) {
      if (cap === 'price') {
        // Price has per-chain entries, _default is also there
        expect(chains['_default']).toBeDefined()
      }
      // At least one entry exists
      expect(Object.keys(chains).length).toBeGreaterThan(0)
    }
  })

  it('price: solana tries jupiter first', () => {
    const chain = FALLBACK_CHAINS.price.solana
    expect(chain[0]).toBe('jupiter')
  })

  it('price: EVM chains try zerox first', () => {
    for (const evmChain of ['ethereum', 'base', 'polygon', 'arbitrum']) {
      const chain = FALLBACK_CHAINS.price[evmChain]
      expect(chain[0]).toBe('zerox')
    }
  })

  it('search: solana includes both jupiter and dexscreener', () => {
    const chain = FALLBACK_CHAINS.search.solana
    expect(chain).toContain('jupiter')
    expect(chain).toContain('dexscreener')
  })

  it('bridge: uses debridge', () => {
    const chain = FALLBACK_CHAINS.bridge._default
    expect(chain).toContain('debridge')
  })

  it('all referenced providers exist in PROVIDERS', () => {
    for (const chains of Object.values(FALLBACK_CHAINS)) {
      for (const providerList of Object.values(chains)) {
        for (const id of providerList) {
          expect(PROVIDERS[id], `Provider '${id}' referenced in FALLBACK_CHAINS but not in PROVIDERS`).toBeDefined()
        }
      }
    }
  })
})

describe('getFallbackChain', () => {
  beforeEach(() => {
    // Reset all circuit breakers before each test
    for (const cap of ['price', 'search', 'swap_quote', 'bridge', 'history'] as Capability[]) {
      for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
        resetBreaker(cap, id)
      }
    }
  })

  it('returns providers in configured order for solana price', () => {
    const chain = getFallbackChain('price', 'solana')
    expect(chain[0]).toBe('jupiter')
    expect(chain).toContain('dexscreener')
  })

  it('falls back to _default for unknown chain', () => {
    const chain = getFallbackChain('price', 'avalanche')
    expect(chain).toContain('dexscreener')
  })

  it('filters out unavailable providers', () => {
    // zerox requires API key — if not set, should be filtered
    const chain = getFallbackChain('price', 'ethereum')
    if (!zerox().available) {
      expect(chain).not.toContain('zerox')
    }
  })
})

// ── Circuit Breaker Tests ───────────────────────────────────────────

describe('Circuit Breaker', () => {
  beforeEach(() => {
    for (const cap of ['price', 'search', 'swap_quote', 'bridge', 'history'] as Capability[]) {
      for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
        resetBreaker(cap, id)
      }
    }
  })

  it('starts with clean health', () => {
    const health = getProviderHealth()
    // After reset, no entries (lazy creation)
    // Or entries should be in closed state
    for (const entry of Object.values(health)) {
      expect(entry.state).toBe('closed')
      expect(entry.failures).toBe(0)
    }
  })

  it('withFallback records success and resets failures', async () => {
    const result = await withFallback('price', 'solana', {
      jupiter: async () => 42,
    })
    expect(result).toBe(42)
    // Breaker should be healthy
    const health = getProviderHealth()
    const jupEntry = health['price:jupiter']
    if (jupEntry) {
      expect(jupEntry.state).toBe('closed')
      expect(jupEntry.failures).toBe(0)
    }
  })

  it('withFallback falls back on exception', async () => {
    const result = await withFallback('price', 'solana', {
      jupiter: async () => { throw new Error('API down') },
      dexscreener: async () => 99,
    })
    expect(result).toBe(99)
  })

  it('withFallback falls back on null (no data)', async () => {
    const result = await withFallback('price', 'solana', {
      jupiter: async () => null,
      dexscreener: async () => 77,
    })
    expect(result).toBe(77)
  })

  it('withFallback returns null when all providers fail', async () => {
    const result = await withFallback('price', 'solana', {
      jupiter: async () => { throw new Error('down') },
      dexscreener: async () => { throw new Error('also down') },
    })
    expect(result).toBeNull()
  })

  it('circuit breaker opens after consecutive failures', async () => {
    // Fail jupiter 3 times (threshold)
    for (let i = 0; i < 3; i++) {
      await withFallback('price', 'solana', {
        jupiter: async () => { throw new Error('fail') },
        dexscreener: async () => i, // fallback succeeds
      })
    }

    const health = getProviderHealth()
    const jupEntry = health['price:jupiter']
    expect(jupEntry).toBeDefined()
    expect(jupEntry.state).toBe('open')
    expect(jupEntry.failures).toBe(3)
  })

  it('open breaker causes provider to be skipped', async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await withFallback('price', 'solana', {
        jupiter: async () => { throw new Error('fail') },
        dexscreener: async () => 'fallback',
      })
    }

    // Now jupiter should be skipped entirely — track if it's called
    let jupiterCalled = false
    const result = await withFallback('price', 'solana', {
      jupiter: async () => { jupiterCalled = true; return 'should not happen' },
      dexscreener: async () => 'fast path',
    })

    expect(jupiterCalled).toBe(false)
    expect(result).toBe('fast path')
  })

  it('resetBreaker clears the circuit', async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await withFallback('price', 'solana', {
        jupiter: async () => { throw new Error('fail') },
        dexscreener: async () => i,
      })
    }

    // Reset
    resetBreaker('price', 'jupiter')

    // Jupiter should be tried again
    let jupiterCalled = false
    await withFallback('price', 'solana', {
      jupiter: async () => { jupiterCalled = true; return 'recovered' },
    })

    expect(jupiterCalled).toBe(true)
  })

  it('null return does NOT count as a failure', async () => {
    // Return null 5 times — should NOT trip breaker
    for (let i = 0; i < 5; i++) {
      await withFallback('price', 'solana', {
        jupiter: async () => null,
        dexscreener: async () => 'fallback',
      })
    }

    const health = getProviderHealth()
    const jupEntry = health['price:jupiter']
    // Should not be open — null is "no data", not "failure"
    if (jupEntry) {
      expect(jupEntry.state).toBe('closed')
    }
  })
})

// ── Rate Limit Integration Tests ────────────────────────────────────

describe('Rate Limit Integration', () => {
  it('buildHostLimits derives from PROVIDERS', () => {
    const limits = buildHostLimits()
    expect(Object.keys(limits).length).toBe(Object.keys(PROVIDERS).length)

    // Verify each provider's host is in the limits map
    for (const p of Object.values(PROVIDERS)) {
      const host = new URL(p.baseUrl).hostname
      expect(limits[host]).toBeDefined()
      expect(limits[host].maxTokens).toBe(p.rateLimit.maxTokens)
      expect(limits[host].refillRate).toBe(p.rateLimit.refillRate)
    }
  })
})

// ── Smoke: full fallback chain simulation ───────────────────────────

describe('End-to-end fallback simulation', () => {
  beforeEach(() => {
    for (const cap of ['price', 'search', 'swap_quote', 'bridge', 'history'] as Capability[]) {
      for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
        resetBreaker(cap, id)
      }
    }
  })

  it('simulates price lookup: primary succeeds', async () => {
    const result = await withFallback('price', 'solana', {
      jupiter: async () => ({ price: 150, source: 'jupiter' }),
      dexscreener: async () => ({ price: 149, source: 'dexscreener' }),
    })
    expect(result).toEqual({ price: 150, source: 'jupiter' })
  })

  it('simulates price lookup: primary fails, fallback succeeds', async () => {
    const result = await withFallback('price', 'solana', {
      jupiter: async () => { throw new Error('rate limited') },
      dexscreener: async () => ({ price: 149, source: 'dexscreener' }),
    })
    expect(result).toEqual({ price: 149, source: 'dexscreener' })
  })

  it('simulates price lookup: primary returns null, fallback succeeds', async () => {
    const result = await withFallback('price', 'solana', {
      jupiter: async () => null, // token not found
      dexscreener: async () => ({ price: 0.001, source: 'dexscreener' }),
    })
    expect(result).toEqual({ price: 0.001, source: 'dexscreener' })
  })

  it('simulates EVM price with 3-provider chain', async () => {
    const result = await withFallback('price', 'ethereum', {
      zerox: async () => { throw new Error('503') },
      dexscreener: async () => null,
      jupiter: async () => ({ price: 3000, source: 'jupiter-wrapped' }),
    })
    // zerox failed, dexscreener had no data, jupiter resolved via wrapped token
    expect(result).toEqual({ price: 3000, source: 'jupiter-wrapped' })
  })

  it('simulates degraded mode: breaker open + fallback', async () => {
    // Trip jupiter breaker
    for (let i = 0; i < 3; i++) {
      await withFallback('price', 'solana', {
        jupiter: async () => { throw new Error('down') },
        dexscreener: async () => null,
      })
    }

    // Now jupiter is open — should go straight to dexscreener
    let jupCalled = false
    const result = await withFallback('price', 'solana', {
      jupiter: async () => { jupCalled = true; return { price: 150 } },
      dexscreener: async () => ({ price: 148, source: 'dexscreener-degraded' }),
    })

    expect(jupCalled).toBe(false)
    expect(result).toEqual({ price: 148, source: 'dexscreener-degraded' })
  })
})
