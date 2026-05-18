/**
 * get_price — Fetch real-time token prices.
 *
 * Sources (by chain):
 *   Solana → Jupiter Price API v3 (free key from portal.jup.ag) → DexScreener fallback
 *   EVM    → 0x (if ZEROX_API_KEY set) → DexScreener fallback
 *
 * Falls back across sources if primary fails.
 * Requires: JUPITER_API_KEY env var for Jupiter (free tier = 60 req/min).
 */

import type { TokenPrice } from '@lucid-fdn/web3-types'
import {
  SOLANA_TOKEN_MAP,
  EVM_USDC,
  EVM_CHAIN_IDS,
  resolveTokenAddress,
  detectChain,
} from '../shared/token-constants.js'
import { rateLimitedFetch } from '../shared/rate-limit.js'
import { TtlCache } from '../shared/cache.js'
import { formatNumber, formatCompact } from '../shared/format.js'
import { jupiter, zerox, warnIfMissing, providerUrl, withFallback } from '../shared/providers.js'

// ── Price Cache ──────────────────────────────────────────────────────
const priceCache = new TtlCache<TokenPrice>(15_000, 500) // 15s TTL, 500 max

// ── Jupiter Price API v3 (Solana) ────────────────────────────────────
// Requires free API key from portal.jup.ag (60 req/min on free tier).
// Falls through to DexScreener when key not set.
async function fetchJupiterPrice(tokenAddress: string): Promise<TokenPrice | null> {
  const jup = jupiter()
  if (!jup.apiKey) {
    warnIfMissing('jupiter')
    return null
  }

  try {
    const res = await rateLimitedFetch(
      providerUrl('jupiter', `/price/v3?ids=${tokenAddress}`),
      {
        signal: AbortSignal.timeout(5000),
        headers: jup.headers,
      },
    )
    if (!res.ok) return null
    // v3 returns { [mintAddress]: { usdPrice, priceChange24h, liquidity, decimals } }
    const data = await res.json() as Record<string, {
      usdPrice?: number
      priceChange24h?: number
      liquidity?: number
      decimals?: number
    }>
    const entry = data[tokenAddress]
    if (!entry?.usdPrice) return null

    return {
      asset: { symbol: '', address: tokenAddress, chain: 'solana' },
      priceUsd: entry.usdPrice,
      change24h: entry.priceChange24h,
      source: 'jupiter',
      timestamp: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

// ── DexScreener (EVM + Solana fallback) ──────────────────────────────
async function fetchDexScreenerPrice(
  tokenAddress: string,
  chain: string,
): Promise<TokenPrice | null> {
  try {
    const res = await rateLimitedFetch(
      providerUrl('dexscreener', `/latest/dex/tokens/${tokenAddress}`),
      { signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return null
    const body = await res.json() as {
      pairs?: Array<{
        chainId: string
        baseToken: { address: string; symbol: string }
        priceUsd: string
        priceChange?: { h24?: number }
        volume?: { h24?: number }
        marketCap?: number
      }>
    }
    const pairs = body.pairs
    if (!pairs?.length) return null

    // Pick the pair with highest volume on the right chain
    const dexChainMap: Record<string, string> = {
      solana: 'solana',
      ethereum: 'ethereum',
      base: 'base',
      polygon: 'polygon',
      arbitrum: 'arbitrum',
    }
    const targetChainId = dexChainMap[chain] || chain
    const chainPairs = pairs.filter(p => p.chainId === targetChainId)
    const best = (chainPairs.length > 0 ? chainPairs : pairs)
      .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))[0]

    if (!best?.priceUsd) return null

    return {
      asset: {
        symbol: best.baseToken.symbol,
        address: tokenAddress,
        chain: chain as TokenPrice['asset']['chain'],
      },
      priceUsd: parseFloat(best.priceUsd),
      change24h: best.priceChange?.h24,
      volume24h: best.volume?.h24,
      marketCap: best.marketCap,
      source: 'dexscreener',
      timestamp: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

// ── 0x Price API (EVM, optional) ─────────────────────────────────────
// Uses 0x swap price endpoint to derive token price in USD.
// Requires ZEROX_API_KEY env var.

async function fetch0xPrice(tokenAddress: string, chain: string): Promise<TokenPrice | null> {
  const zx = zerox()
  if (!zx.available) {
    warnIfMissing('zerox')
    return null
  }

  const chainId = EVM_CHAIN_IDS[chain]
  const usdc = EVM_USDC[chain]
  if (!chainId || !usdc) return null

  // Don't price stablecoins via 0x — just return $1
  if (tokenAddress.toLowerCase() === usdc.toLowerCase()) {
    return {
      asset: { symbol: 'USDC', address: tokenAddress, chain: chain as TokenPrice['asset']['chain'] },
      priceUsd: 1,
      source: '0x',
      timestamp: new Date().toISOString(),
    }
  }

  try {
    // Sell 1 unit of the token for USDC to get its USD price
    const sellAmount = '1000000000000000000' // 1e18 (will be wrong for non-18-decimal tokens, but price ratio is correct)
    const params = new URLSearchParams({
      chainId: chainId.toString(),
      sellToken: tokenAddress,
      buyToken: usdc,
      sellAmount,
    })

    const res = await rateLimitedFetch(
      providerUrl('zerox', `/swap/allowance-holder/price?${params}`),
      {
        headers: zx.headers,
        signal: AbortSignal.timeout(5000),
      },
    )
    if (!res.ok) return null

    const data = await res.json() as { buyAmount?: string; price?: string }
    if (!data.price) return null

    // price = buyAmount / sellAmount. buyAmount is in USDC (6 decimals).
    // data.price is the exchange rate: how many buyTokens per 1 sellToken
    const priceUsd = parseFloat(data.price)
    if (!priceUsd || priceUsd <= 0) return null

    return {
      asset: { symbol: '', address: tokenAddress, chain: chain as TokenPrice['asset']['chain'] },
      priceUsd,
      source: '0x',
      timestamp: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

// ── Public API ───────────────────────────────────────────────────────

export interface GetPriceArgs {
  /** Token symbol (e.g. "SOL", "ETH") or on-chain address */
  token: string
  /** Chain to look up on. Default: auto-detect from address format */
  chain?: string
}

/**
 * Get real-time price for a token.
 *
 * Returns a human-readable string for the agent + structured data.
 */
export async function toolGetPrice(args: GetPriceArgs): Promise<string> {
  const chain = args.chain || detectChain(args.token)
  const address = resolveTokenAddress(args.token, chain)
  const cacheKey = `${chain}:${address}`

  // Check cache
  const cached = priceCache.get(cacheKey)
  if (cached) {
    return formatPriceResult(cached, args.token)
  }

  // Fallback order defined in shared/providers.ts FALLBACK_CHAINS.price
  const priceFetchers = {
    jupiter:     () => fetchJupiterPrice(
      // For EVM chains, Jupiter can price wrapped tokens via their Solana mint
      chain !== 'solana' ? (SOLANA_TOKEN_MAP[args.token.toUpperCase()] || address) : address,
    ),
    dexscreener: () => fetchDexScreenerPrice(address, chain),
    zerox:       () => fetch0xPrice(address, chain),
  }
  const price = await withFallback('price', chain, priceFetchers)

  if (!price) {
    return JSON.stringify({
      error: `Price not found for ${args.token} on ${chain}`,
      suggestion: 'Try providing the full token address instead of symbol',
    })
  }

  // Enrich symbol if we resolved from symbol
  if (!price.asset.symbol && args.token.length < 10) {
    price.asset.symbol = args.token.toUpperCase()
  }

  priceCache.set(cacheKey, price)
  return formatPriceResult(price, args.token)
}

/**
 * Get prices for multiple tokens in parallel.
 */
export async function getMultiplePrices(
  tokens: Array<{ token: string; chain?: string }>,
): Promise<Map<string, TokenPrice>> {
  const results = new Map<string, TokenPrice>()
  const tasks = tokens.map(async ({ token, chain }) => {
    const c = chain || detectChain(token)
    const address = resolveTokenAddress(token, c)
    const cacheKey = `${c}:${address}`

    const cached = priceCache.get(cacheKey)
    if (cached) {
      results.set(token, cached)
      return
    }

    const price = await withFallback('price', c, {
      jupiter:     () => fetchJupiterPrice(address),
      dexscreener: () => fetchDexScreenerPrice(address, c),
      zerox:       () => fetch0xPrice(address, c),
    })

    if (price) {
      if (!price.asset.symbol && token.length < 10) {
        price.asset.symbol = token.toUpperCase()
      }
      priceCache.set(cacheKey, price)
      results.set(token, price)
    }
  })

  await Promise.all(tasks)
  return results
}

// ── Batch Jupiter prices (efficient for multiple Solana tokens) ──────
export async function batchJupiterPrices(addresses: string[]): Promise<Map<string, number>> {
  const results = new Map<string, number>()
  if (addresses.length === 0) return results

  try {
    const jup = jupiter()
    if (!jup.apiKey) {
      // Fall back to DexScreener for individual prices
      const tasks = addresses.map(async (addr) => {
        const price = await fetchDexScreenerPrice(addr, 'solana')
        if (price) results.set(addr, price.priceUsd)
      })
      await Promise.all(tasks)
      return results
    }

    const ids = addresses.join(',')
    const res = await rateLimitedFetch(
      providerUrl('jupiter', `/price/v3?ids=${ids}`),
      {
        signal: AbortSignal.timeout(5000),
        headers: jup.headers,
      },
    )
    if (!res.ok) return results

    // v3: { [mintAddress]: { usdPrice } }
    const data = await res.json() as Record<string, { usdPrice?: number }>
    for (const [addr, entry] of Object.entries(data)) {
      if (entry?.usdPrice) {
        results.set(addr, entry.usdPrice)
      }
    }
  } catch {
    // Non-fatal
  }
  return results
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatPriceResult(price: TokenPrice, query: string): string {
  const symbol = price.asset.symbol || query
  const parts = [
    `${symbol}: $${formatNumber(price.priceUsd)}`,
  ]
  if (price.change24h !== undefined) {
    const sign = price.change24h >= 0 ? '+' : ''
    parts.push(`24h: ${sign}${price.change24h.toFixed(2)}%`)
  }
  if (price.volume24h) {
    parts.push(`Volume 24h: $${formatCompact(price.volume24h)}`)
  }
  if (price.marketCap) {
    parts.push(`Market Cap: $${formatCompact(price.marketCap)}`)
  }
  parts.push(`Source: ${price.source}`)

  return JSON.stringify({
    price: price.priceUsd,
    symbol,
    chain: price.asset.chain,
    change24h: price.change24h,
    volume24h: price.volume24h,
    marketCap: price.marketCap,
    source: price.source,
    formatted: parts.join(' | '),
  })
}
