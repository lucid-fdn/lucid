/**
 * Centralized tool result cache for read-only agent tools.
 *
 * Caches successful results from read-only tools (wallet_balance, get_price,
 * search_token, get_portfolio) to avoid redundant RPC calls within short windows.
 *
 * Rules:
 *   - Never cache errors or partial results
 *   - Never cache write tools (dex_swap, wallet_transfer, etc.)
 *   - Short TTLs (15-60s) to keep data fresh
 *   - Max 100 entries per tool (LRU eviction)
 *   - Kill switch via FEATURE_TOOL_CACHE=false
 */

import { TtlCache } from './ttl-cache.js'

interface ToolCacheConfig {
  ttlMs: number
  keyPrefix: string
  maxSize: number
}

const TOOL_CACHE_CONFIGS: Record<string, ToolCacheConfig> = {
  wallet_balance: { ttlMs: 30_000, keyPrefix: 'bal', maxSize: 100 },
  get_price:      { ttlMs: 15_000, keyPrefix: 'price', maxSize: 100 },
  search_token:   { ttlMs: 60_000, keyPrefix: 'search', maxSize: 100 },
  get_portfolio:  { ttlMs: 30_000, keyPrefix: 'port', maxSize: 100 },
  wallet_history: { ttlMs: 60_000, keyPrefix: 'hist', maxSize: 50 },
}

interface CacheStats {
  hits: number
  misses: number
}

class ToolResultCache {
  private caches = new Map<string, TtlCache<string>>()
  private stats = new Map<string, CacheStats>()
  private disabled = false

  constructor() {
    for (const [tool, cfg] of Object.entries(TOOL_CACHE_CONFIGS)) {
      this.caches.set(tool, new TtlCache<string>(cfg.ttlMs, cfg.maxSize))
      this.stats.set(tool, { hits: 0, misses: 0 })
    }
  }

  get(tool: string, key: string): string | undefined {
    if (this.disabled) return undefined
    const cache = this.caches.get(tool)
    if (!cache) return undefined

    const result = cache.get(key)
    const s = this.stats.get(tool)!
    if (result !== null) {
      s.hits++
      console.log(`[tool-cache] HIT ${tool}:${key} (hits=${s.hits})`)
      return result
    }
    s.misses++
    return undefined
  }

  set(tool: string, key: string, value: string): void {
    if (this.disabled) return
    const cache = this.caches.get(tool)
    if (!cache) return
    cache.set(key, value)
  }

  getStats(): { tool: string; hits: number; misses: number; size: number }[] {
    const result: { tool: string; hits: number; misses: number; size: number }[] = []
    for (const [tool, s] of this.stats) {
      const cache = this.caches.get(tool)
      result.push({ tool, hits: s.hits, misses: s.misses, size: cache?.size ?? 0 })
    }
    return result
  }

  /** Get hit counts per tool (for metrics logging) */
  getHitCounts(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const [tool, s] of this.stats) {
      if (s.hits > 0) counts[tool] = s.hits
    }
    return counts
  }

  clear(tool?: string): void {
    if (tool) {
      this.caches.get(tool)?.get // no clear method on TtlCache, recreate
      const cfg = TOOL_CACHE_CONFIGS[tool]
      if (cfg) {
        this.caches.set(tool, new TtlCache<string>(cfg.ttlMs, cfg.maxSize))
        this.stats.set(tool, { hits: 0, misses: 0 })
      }
    } else {
      for (const [t, cfg] of Object.entries(TOOL_CACHE_CONFIGS)) {
        this.caches.set(t, new TtlCache<string>(cfg.ttlMs, cfg.maxSize))
        this.stats.set(t, { hits: 0, misses: 0 })
      }
    }
  }

  disable(): void {
    this.disabled = true
  }

  enable(): void {
    this.disabled = false
  }
}

export const toolCache = new ToolResultCache()

// Initialize based on feature flag (checked at import time and on first use)
if (process.env.FEATURE_TOOL_CACHE === 'false') {
  toolCache.disable()
}
