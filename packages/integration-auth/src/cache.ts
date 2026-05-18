/**
 * Credential Core — In-Memory TTL Cache with Request Coalescing
 *
 * Caches resolved credentials to avoid hitting Nango/DB on every tool call.
 * Short TTL (default 5 min) balances freshness vs latency.
 *
 * Request coalescing: if multiple concurrent calls request the same credential,
 * only one resolver runs — others await the same Promise. Prevents thundering herd
 * at scale (100+ concurrent agent runs hitting the same integration).
 *
 * Not shared across processes — each worker instance has its own cache.
 */

import type { CacheConfig, CredentialAdapter, TokenResult } from './types.js'

interface CacheEntry {
  result: TokenResult
  expiresAt: number
}

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutes
const DEFAULT_MAX_ENTRIES = 200

export class CredentialCache {
  private readonly store = new Map<string, CacheEntry>()
  private readonly inflight = new Map<string, Promise<TokenResult | null>>()
  private readonly ttlMs: number
  private readonly maxEntries: number

  constructor(config?: CacheConfig) {
    this.ttlMs = config?.ttlMs ?? DEFAULT_TTL_MS
    this.maxEntries = config?.maxEntries ?? DEFAULT_MAX_ENTRIES
  }

  private key(authProvider: string, connectionId: string): string {
    return `${authProvider}:${connectionId}`
  }

  get(authProvider: string, connectionId: string): TokenResult | null {
    const k = this.key(authProvider, connectionId)
    const entry = this.store.get(k)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.store.delete(k)
      return null
    }

    // Move to end of Map iteration order (LRU: most recently accessed = last evicted)
    this.store.delete(k)
    this.store.set(k, entry)

    return entry.result
  }

  set(authProvider: string, connectionId: string, result: TokenResult): void {
    // LRU eviction: delete oldest entry if at capacity
    if (this.store.size >= this.maxEntries) {
      const firstKey = this.store.keys().next().value
      if (firstKey !== undefined) {
        this.store.delete(firstKey)
      }
    }

    // If the token has a known expiry, cache until min(ttl, token expiry)
    let effectiveTtl = this.ttlMs
    if (result.expiresAt) {
      const tokenTtl = new Date(result.expiresAt).getTime() - Date.now()
      if (tokenTtl > 0) {
        effectiveTtl = Math.min(effectiveTtl, tokenTtl)
      }
    }

    this.store.set(this.key(authProvider, connectionId), {
      result,
      expiresAt: Date.now() + effectiveTtl,
    })
  }

  /**
   * Get-or-resolve with request coalescing.
   * If the credential is cached, returns immediately.
   * If not, calls the adapter — but only once per key even under concurrent pressure.
   */
  async getOrResolve(
    authProvider: string,
    connectionId: string,
    adapter: CredentialAdapter,
  ): Promise<TokenResult | null> {
    // 1. Check cache
    const cached = this.get(authProvider, connectionId)
    if (cached) return cached

    const k = this.key(authProvider, connectionId)

    // 2. Check if there's already an in-flight request for this key
    const existing = this.inflight.get(k)
    if (existing) return existing

    // 3. Start a new resolution and coalesce concurrent callers
    const promise = adapter.resolve(authProvider, connectionId).then((result) => {
      this.inflight.delete(k)
      if (result) this.set(authProvider, connectionId, result)
      return result
    }).catch((err) => {
      this.inflight.delete(k)
      throw err
    })

    this.inflight.set(k, promise)
    return promise
  }

  invalidate(authProvider: string, connectionId: string): void {
    const k = this.key(authProvider, connectionId)
    this.store.delete(k)
    this.inflight.delete(k)
  }

  clear(): void {
    this.store.clear()
    this.inflight.clear()
  }

  get size(): number {
    return this.store.size
  }

  /** Number of in-flight resolution requests (for diagnostics). */
  get pendingCount(): number {
    return this.inflight.size
  }
}
