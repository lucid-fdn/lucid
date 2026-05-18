/**
 * Live Price Oracle — P0-12 (Hardened)
 *
 * Multi-source price feeds with dual-path caching:
 * - DISPLAY mode: 30s cache (for dashboards, previews)
 * - EXECUTION mode: 3s max staleness (for trade execution)
 *
 * Sources: CoinGecko (primary), Jupiter (Solana fallback), 1inch (EVM fallback).
 *
 * SECURITY: Execution-mode prices bypass cache and include staleness metadata.
 * This prevents stale-price arbitrage and ensures best-execution compliance.
 *
 * FUTURE: Migrate to CoinGecko MCP server (https://docs.coingecko.com/docs/mcp-server)
 * when it exits beta for centralized price management across all services.
 */

import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { ErrorService } from '@/lib/errors/error-service'

// ============================================================================
// Types
// ============================================================================

export interface TokenPrice {
  symbol: string
  chain: string
  priceUsd: number
  source: string
  fetchedAt: Date
}

export type PriceMode = 'display' | 'execution'

export interface PriceResult {
  price: number
  source: string
  fetchedAt: number // Unix ms
  staleMs: number // How old the price is in ms
  fromCache: boolean
}

// ============================================================================
// Configuration
// ============================================================================

/** Max price age for trade execution (3 seconds) */
const EXECUTION_STALENESS_THRESHOLD_MS = 3_000

/** Max price age for display/preview (30 seconds) */
const _DISPLAY_STALENESS_THRESHOLD_MS = 30_000

/** In-memory cache TTL for display mode */
const MEMORY_TTL_MS = 15_000

/** DB cache TTL for display mode */
const DB_TTL_MS = 30_000

// ============================================================================
// CoinGecko Token ID Map
// ============================================================================

const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum',
  SOL: 'solana',
  USDC: 'usd-coin',
  USDT: 'tether',
  BTC: 'bitcoin',
  WBTC: 'wrapped-bitcoin',
  WETH: 'weth',
  MATIC: 'matic-network',
  AVAX: 'avalanche-2',
  ARB: 'arbitrum',
  OP: 'optimism',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  DAI: 'dai',
}

// ============================================================================
// Supabase
// ============================================================================

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// ============================================================================
// In-Memory Cache (per-instance, fast path for DISPLAY mode only)
// ============================================================================

const memoryCache = new Map<string, { price: number; source: string; expiresAt: number; fetchedAt: number }>()

// ============================================================================
// Main API
// ============================================================================

/**
 * Get the USD price for a token.
 *
 * @param symbol - Token symbol (e.g., 'ETH', 'SOL')
 * @param chain - Chain identifier (e.g., 'ethereum', 'solana')
 * @param mode - 'display' (cached, for UI) or 'execution' (fresh, for trades)
 * @returns PriceResult with price, source, age, and cache metadata
 *
 * DISPLAY mode uses 3-tier caching:
 * 1. In-memory (15s TTL)
 * 2. DB price_cache table (30s TTL, shared across instances)
 * 3. External API fetch (CoinGecko → DEX fallback)
 *
 * EXECUTION mode ALWAYS fetches fresh prices:
 * - Bypasses all caches
 * - Returns staleness metadata
 * - Throws if price is older than 3 seconds
 */
export async function getTokenPrice(
  symbol: string,
  chain: string = 'ethereum',
  mode: PriceMode = 'display'
): Promise<PriceResult> {
  const key = `${chain}:${symbol.toUpperCase()}`

  // ─── EXECUTION MODE: Always fetch fresh ───
  if (mode === 'execution') {
    return fetchFreshPrice(symbol.toUpperCase(), chain)
  }

  // ─── DISPLAY MODE: Use tiered cache ───

  // 1. Memory cache
  const cached = memoryCache.get(key)
  if (cached && Date.now() < cached.expiresAt) {
    return {
      price: cached.price,
      source: cached.source,
      fetchedAt: cached.fetchedAt,
      staleMs: Date.now() - cached.fetchedAt,
      fromCache: true,
    }
  }

  // 2. DB cache
  try {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('price_cache')
      .select('price_usd, source, fetched_at, expires_at')
      .eq('token_symbol', symbol.toUpperCase())
      .eq('chain', chain)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (data?.price_usd) {
      const price = parseFloat(data.price_usd)
      const fetchedAt = new Date(data.fetched_at).getTime()
      const source = data.source || 'db-cache'
      memoryCache.set(key, { price, source, expiresAt: Date.now() + MEMORY_TTL_MS, fetchedAt })
      return {
        price,
        source,
        fetchedAt,
        staleMs: Date.now() - fetchedAt,
        fromCache: true,
      }
    }
  } catch {
    // DB miss, fetch externally
  }

  // 3. External fetch
  const result = await fetchFreshPrice(symbol.toUpperCase(), chain)

  // Store in both caches for display mode
  if (result.price > 0) {
    memoryCache.set(key, {
      price: result.price,
      source: result.source,
      expiresAt: Date.now() + MEMORY_TTL_MS,
      fetchedAt: result.fetchedAt,
    })
    await persistPrice(symbol.toUpperCase(), chain, result.price, result.source)
  }

  return result
}

/**
 * Get the USD price for a token in EXECUTION mode.
 * Convenience wrapper that always fetches fresh.
 * Throws PriceStalenessError if price cannot be obtained fresh enough.
 */
export async function getExecutionPrice(
  symbol: string,
  chain: string = 'ethereum'
): Promise<PriceResult> {
  const result = await getTokenPrice(symbol, chain, 'execution')

  if (result.staleMs > EXECUTION_STALENESS_THRESHOLD_MS) {
    throw new PriceStalenessError(
      `Price for ${symbol} on ${chain} is ${result.staleMs}ms old (max: ${EXECUTION_STALENESS_THRESHOLD_MS}ms)`,
      symbol,
      chain,
      result.staleMs
    )
  }

  if (result.price <= 0) {
    throw new PriceUnavailableError(
      `No price available for ${symbol} on ${chain}`,
      symbol,
      chain
    )
  }

  return result
}

/**
 * Validate slippage between quoted price and execution price.
 * Returns true if within tolerance, false if slippage exceeds max.
 */
export function validateSlippage(
  quotedPrice: number,
  executionPrice: number,
  maxSlippageBps: number = 100 // 1% default
): { valid: boolean; slippageBps: number; direction: 'favorable' | 'adverse' } {
  const diff = executionPrice - quotedPrice
  const slippageBps = Math.abs(diff / quotedPrice) * 10_000
  const direction = diff >= 0 ? 'favorable' : 'adverse'

  return {
    valid: slippageBps <= maxSlippageBps,
    slippageBps: Math.round(slippageBps),
    direction,
  }
}

/**
 * Get prices for multiple tokens at once (batch). Always DISPLAY mode.
 */
export async function getTokenPrices(
  tokens: Array<{ symbol: string; chain: string }>
): Promise<Map<string, PriceResult>> {
  const results = new Map<string, PriceResult>()
  const needsFetch: Array<{ symbol: string; chain: string }> = []

  for (const t of tokens) {
    const key = `${t.chain}:${t.symbol.toUpperCase()}`
    const cached = memoryCache.get(key)
    if (cached && Date.now() < cached.expiresAt) {
      results.set(key, {
        price: cached.price,
        source: cached.source,
        fetchedAt: cached.fetchedAt,
        staleMs: Date.now() - cached.fetchedAt,
        fromCache: true,
      })
    } else {
      needsFetch.push(t)
    }
  }

  if (needsFetch.length > 0) {
    const ids = needsFetch
      .map((t) => COINGECKO_IDS[t.symbol.toUpperCase()])
      .filter(Boolean)

    if (ids.length > 0) {
      try {
        const prices = await fetchCoinGeckoBatch(ids)
        const now = Date.now()
        for (const t of needsFetch) {
          const cgId = COINGECKO_IDS[t.symbol.toUpperCase()]
          if (cgId && prices[cgId]) {
            const price = prices[cgId]
            const key = `${t.chain}:${t.symbol.toUpperCase()}`
            const result: PriceResult = {
              price,
              source: 'coingecko',
              fetchedAt: now,
              staleMs: 0,
              fromCache: false,
            }
            results.set(key, result)
            memoryCache.set(key, { price, source: 'coingecko', expiresAt: now + MEMORY_TTL_MS, fetchedAt: now })
            await persistPrice(t.symbol.toUpperCase(), t.chain, price, 'coingecko')
          }
        }
      } catch {
        for (const t of needsFetch) {
          const result = await getTokenPrice(t.symbol, t.chain)
          results.set(`${t.chain}:${t.symbol.toUpperCase()}`, result)
        }
      }
    }
  }

  return results
}

// ============================================================================
// Fresh Price Fetch (bypasses all caches)
// ============================================================================

async function fetchFreshPrice(symbol: string, chain: string): Promise<PriceResult> {
  const startTime = Date.now()

  const cgPrice = await fetchCoinGeckoPrice(symbol)
  if (cgPrice > 0) {
    return {
      price: cgPrice,
      source: 'coingecko',
      fetchedAt: startTime,
      staleMs: Date.now() - startTime,
      fromCache: false,
    }
  }

  if (chain === 'solana') {
    const jupPrice = await fetchJupiterPrice(symbol)
    if (jupPrice > 0) {
      return {
        price: jupPrice,
        source: 'jupiter',
        fetchedAt: startTime,
        staleMs: Date.now() - startTime,
        fromCache: false,
      }
    }
  }

  // Stablecoin failsafe
  if (['USDC', 'USDT', 'DAI'].includes(symbol)) {
    return {
      price: 1.0,
      source: 'hardcoded-stablecoin',
      fetchedAt: startTime,
      staleMs: 0,
      fromCache: false,
    }
  }

  ErrorService.captureException(
    new Error(`No price found for ${symbol} on ${chain}`),
    {
      severity: 'warning',
      context: { operation: 'fetchFreshPrice', symbol, chain },
      tags: { layer: 'price-oracle' },
    }
  )

  return {
    price: 0,
    source: 'none',
    fetchedAt: startTime,
    staleMs: Date.now() - startTime,
    fromCache: false,
  }
}

// ============================================================================
// External Price Fetchers
// ============================================================================

async function fetchCoinGeckoPrice(symbol: string): Promise<number> {
  const cgId = COINGECKO_IDS[symbol]
  if (!cgId) return 0

  try {
    const apiKey = process.env.COINGECKO_API_KEY
    const baseUrl = apiKey
      ? 'https://pro-api.coingecko.com/api/v3'
      : 'https://api.coingecko.com/api/v3'

    const headers: Record<string, string> = {}
    if (apiKey) headers['x-cg-pro-api-key'] = apiKey

    const res = await fetch(
      `${baseUrl}/simple/price?ids=${cgId}&vs_currencies=usd`,
      { headers, signal: AbortSignal.timeout(5000) }
    )

    if (!res.ok) return 0
    const data = await res.json()
    return data[cgId]?.usd || 0
  } catch {
    return 0
  }
}

async function fetchCoinGeckoBatch(
  ids: string[]
): Promise<Record<string, number>> {
  try {
    const apiKey = process.env.COINGECKO_API_KEY
    const baseUrl = apiKey
      ? 'https://pro-api.coingecko.com/api/v3'
      : 'https://api.coingecko.com/api/v3'

    const headers: Record<string, string> = {}
    if (apiKey) headers['x-cg-pro-api-key'] = apiKey

    const res = await fetch(
      `${baseUrl}/simple/price?ids=${ids.join(',')}&vs_currencies=usd`,
      { headers, signal: AbortSignal.timeout(8000) }
    )

    if (!res.ok) return {}
    const data = await res.json()

    const result: Record<string, number> = {}
    for (const id of ids) {
      if (data[id]?.usd) result[id] = data[id].usd
    }
    return result
  } catch {
    return {}
  }
}

async function fetchJupiterPrice(symbol: string): Promise<number> {
  try {
    const headers: Record<string, string> = {}
    if (process.env.JUPITER_API_KEY) headers['x-api-key'] = process.env.JUPITER_API_KEY
    const res = await fetch(
      `https://api.jup.ag/price/v3?ids=${symbol}`,
      { signal: AbortSignal.timeout(5000), headers }
    )
    if (!res.ok) return 0
    const data = await res.json()
    return data[symbol]?.usdPrice ?? 0
  } catch {
    return 0
  }
}

// ============================================================================
// Persist to DB
// ============================================================================

async function persistPrice(
  symbol: string,
  chain: string,
  priceUsd: number,
  source: string
): Promise<void> {
  try {
    const supabase = getSupabase()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + DB_TTL_MS)

    await supabase.from('price_cache').upsert(
      {
        token_symbol: symbol,
        chain,
        price_usd: priceUsd,
        source,
        fetched_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'token_symbol,chain' }
    )
  } catch {
    // Non-critical
  }
}

// ============================================================================
// Custom Errors
// ============================================================================

export class PriceStalenessError extends Error {
  constructor(
    message: string,
    public symbol: string,
    public chain: string,
    public staleMs: number
  ) {
    super(message)
    this.name = 'PriceStalenessError'
  }
}

export class PriceUnavailableError extends Error {
  constructor(
    message: string,
    public symbol: string,
    public chain: string
  ) {
    super(message)
    this.name = 'PriceUnavailableError'
  }
}