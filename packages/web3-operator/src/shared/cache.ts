/**
 * TTL cache — simple size-bounded cache with time-based expiry.
 *
 * Used by price cache, token safety cache, etc.
 * Single shared implementation instead of duplicated Map+timestamp patterns.
 */

export class TtlCache<V> {
  private readonly store = new Map<string, { data: V; ts: number }>()
  private readonly ttlMs: number
  private readonly maxSize: number

  constructor(ttlMs: number, maxSize = 500) {
    this.ttlMs = ttlMs
    this.maxSize = maxSize
  }

  get(key: string): V | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() - entry.ts > this.ttlMs) {
      this.store.delete(key)
      return null
    }
    return entry.data
  }

  set(key: string, data: V): void {
    this.store.set(key, { data, ts: Date.now() })
    if (this.store.size > this.maxSize) {
      this.evict()
    }
  }

  get size(): number {
    return this.store.size
  }

  private evict(): void {
    const now = Date.now()
    for (const [k, v] of this.store) {
      if (now - v.ts > this.ttlMs) this.store.delete(k)
    }
    // If still over limit after TTL eviction, drop oldest entries
    if (this.store.size > this.maxSize) {
      const toRemove = this.store.size - this.maxSize
      let removed = 0
      for (const k of this.store.keys()) {
        if (removed >= toRemove) break
        this.store.delete(k)
        removed++
      }
    }
  }
}
