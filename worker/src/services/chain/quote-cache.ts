/**
 * Shared Quote Cache — P1-27
 *
 * Caches DEX quotes to avoid redundant API calls when agent fetches a quote
 * then immediately executes. Uses in-memory LRU with TTL.
 * Can be upgraded to Redis for multi-instance deployments.
 */

// ============================================================================
// Types
// ============================================================================

export interface CachedQuote {
  /** Unique quote ID */
  id: string
  /** Chain identifier */
  chain: string
  /** DEX source (jupiter, 1inch) */
  source: string
  /** Input token address */
  inputToken: string
  /** Output token address */
  outputToken: string
  /** Input amount (raw) */
  inputAmount: string
  /** Output amount (raw) */
  outputAmount: string
  /** Price impact percentage */
  priceImpact?: number
  /** Route data (opaque, passed to swap execution) */
  routeData: unknown
  /** Timestamp when quote was fetched */
  fetchedAt: number
  /** Quote expiry (ms from fetchedAt) */
  expiresAt: number
  /** USD value of input */
  inputUsdValue?: number
  /** USD value of output */
  outputUsdValue?: number
}

interface CacheEntry {
  quote: CachedQuote
  insertedAt: number
}

// ============================================================================
// LRU Cache with TTL
// ============================================================================

const DEFAULT_TTL_MS = 30_000 // 30 seconds — DEX quotes expire fast
const MAX_CACHE_SIZE = 200

class QuoteCache {
  private cache = new Map<string, CacheEntry>()
  private readonly ttlMs: number
  private readonly maxSize: number

  constructor(ttlMs: number = DEFAULT_TTL_MS, maxSize: number = MAX_CACHE_SIZE) {
    this.ttlMs = ttlMs
    this.maxSize = maxSize
  }

  /**
   * Generate a cache key from quote parameters
   */
  private makeKey(chain: string, source: string, inputToken: string, outputToken: string, inputAmount: string): string {
    return `${chain}:${source}:${inputToken.toLowerCase()}:${outputToken.toLowerCase()}:${inputAmount}`
  }

  /**
   * Store a quote in the cache
   */
  set(quote: CachedQuote): void {
    const key = this.makeKey(quote.chain, quote.source, quote.inputToken, quote.outputToken, quote.inputAmount)

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) this.cache.delete(oldestKey)
    }

    this.cache.set(key, {
      quote,
      insertedAt: Date.now(),
    })
  }

  /**
   * Get a cached quote if still valid
   */
  get(chain: string, source: string, inputToken: string, outputToken: string, inputAmount: string): CachedQuote | null {
    const key = this.makeKey(chain, source, inputToken, outputToken, inputAmount)
    const entry = this.cache.get(key)

    if (!entry) return null

    // Check TTL
    if (Date.now() - entry.insertedAt > this.ttlMs) {
      this.cache.delete(key)
      return null
    }

    // Check quote's own expiry
    if (Date.now() > entry.quote.expiresAt) {
      this.cache.delete(key)
      return null
    }

    // Move to end (LRU)
    this.cache.delete(key)
    this.cache.set(key, entry)

    return entry.quote
  }

  /**
   * Get a quote by its ID
   */
  getById(id: string): CachedQuote | null {
    for (const [key, entry] of this.cache) {
      if (entry.quote.id === id) {
        // Check TTL
        if (Date.now() - entry.insertedAt > this.ttlMs || Date.now() > entry.quote.expiresAt) {
          this.cache.delete(key)
          return null
        }
        return entry.quote
      }
    }
    return null
  }

  /**
   * Invalidate a specific quote
   */
  invalidate(chain: string, source: string, inputToken: string, outputToken: string, inputAmount: string): void {
    const key = this.makeKey(chain, source, inputToken, outputToken, inputAmount)
    this.cache.delete(key)
  }

  /**
   * Invalidate by quote ID
   */
  invalidateById(id: string): void {
    for (const [key, entry] of this.cache) {
      if (entry.quote.id === id) {
        this.cache.delete(key)
        return
      }
    }
  }

  /**
   * Clear all cached quotes
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get cache stats
   */
  stats(): { size: number; maxSize: number; ttlMs: number } {
    // Clean expired entries
    const now = Date.now()
    for (const [key, entry] of this.cache) {
      if (now - entry.insertedAt > this.ttlMs || now > entry.quote.expiresAt) {
        this.cache.delete(key)
      }
    }
    return { size: this.cache.size, maxSize: this.maxSize, ttlMs: this.ttlMs }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const quoteCache = new QuoteCache()

/**
 * Generate a unique quote ID
 */
export function generateQuoteId(): string {
  return `q-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`
}