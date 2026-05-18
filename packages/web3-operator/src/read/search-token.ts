/**
 * search_token — Find tokens by name, symbol, or address.
 *
 * Sources:
 *   Solana → Jupiter Token Search API (verified + all tokens)
 *   EVM    → DexScreener token search
 *
 * Includes safety check via Jupiter Shield when available.
 */

import type { TokenInfo, TokenSafety } from '@lucid-fdn/web3-types'
import { rateLimitedFetch } from '../shared/rate-limit.js'
import { TtlCache } from '../shared/cache.js'
import { jupiter, providerUrl, getFallbackChain } from '../shared/providers.js'
import { getConfig } from '../config.js'

export interface SearchTokenArgs {
  /** Search query — token name, symbol, or address */
  query: string
  /** Chain to search on. Omit to search all chains. */
  chain?: string
  /** Max results to return (default: 5) */
  limit?: number
}

export async function toolSearchToken(args: SearchTokenArgs): Promise<string> {
  const limit = args.limit || 5

  // Check tool cache first
  const cacheKey = `${args.query}:${args.chain || 'all'}`
  const cached = getConfig().toolCache.get('search_token', cacheKey)
  if (cached) return cached

  const results: TokenInfo[] = []

  // Provider selection driven by FALLBACK_CHAINS.search in shared/providers.ts
  const searchFetchers: Record<string, () => Promise<TokenInfo[]>> = {
    jupiter:     () => searchJupiter(args.query, limit),
    dexscreener: () => searchDexScreener(args.query, args.chain, limit),
  }

  // Determine which providers to query (parallel for search, not sequential)
  const chain = args.chain || 'solana' // default chain for provider selection
  const providers = args.chain
    ? getFallbackChain('search', args.chain)
    : [...new Set([...getFallbackChain('search', 'solana'), ...getFallbackChain('search', '_default')])]

  const tasks = providers
    .map(id => searchFetchers[id])
    .filter(Boolean)
    .map(fn => fn().then(tokens => results.push(...tokens)).catch(() => {}))

  await Promise.all(tasks)

  if (results.length === 0) {
    return JSON.stringify({
      results: [],
      message: `No tokens found for "${args.query}"${args.chain ? ` on ${args.chain}` : ''}`,
    })
  }

  // Dedupe by address+chain, take top N
  const seen = new Set<string>()
  const deduped = results.filter(t => {
    const key = `${t.chain}:${t.address}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, limit)

  const result = JSON.stringify({
    results: deduped.map(t => ({
      name: t.name,
      symbol: t.symbol,
      address: t.address,
      chain: t.chain,
      decimals: t.decimals,
      logoUri: t.logoUri,
      safety: t.safety,
    })),
    count: deduped.length,
  })

  // Cache successful results (don't cache empty results)
  if (deduped.length > 0) {
    getConfig().toolCache.set('search_token', cacheKey, result)
  }

  return result
}

// ── Jupiter Token Search ─────────────────────────────────────────────
async function searchJupiter(query: string, limit: number): Promise<TokenInfo[]> {
  const jup = jupiter()
  try {
    const res = await rateLimitedFetch(
      providerUrl('jupiter', `/tokens/v2/search?query=${encodeURIComponent(query)}&limit=${limit}`),
      { signal: AbortSignal.timeout(5000), headers: jup.headers },
    )
    if (!res.ok) return []

    const tokens = await res.json() as Array<{
      address: string
      name: string
      symbol: string
      decimals: number
      logoURI?: string
      tags?: string[]
      daily_volume?: number
      freeze_authority?: string | null
      mint_authority?: string | null
    }>

    return tokens.map(t => ({
      symbol: t.symbol,
      name: t.name,
      address: t.address,
      chain: 'solana' as const,
      decimals: t.decimals,
      logoUri: t.logoURI,
      safety: deriveJupiterSafety(t),
    }))
  } catch {
    return []
  }
}

// ── DexScreener Token Search ─────────────────────────────────────────
async function searchDexScreener(
  query: string,
  chain: string | undefined,
  limit: number,
): Promise<TokenInfo[]> {
  try {
    const res = await rateLimitedFetch(
      providerUrl('dexscreener', `/latest/dex/search?q=${encodeURIComponent(query)}`),
      { signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return []

    const data = await res.json() as {
      pairs?: Array<{
        chainId: string
        baseToken: {
          address: string
          name: string
          symbol: string
        }
        liquidity?: { usd?: number }
        volume?: { h24?: number }
      }>
    }

    if (!data.pairs?.length) return []

    const chainFilter = chain ? dexScreenerChainId(chain) : null
    const filtered = chainFilter
      ? data.pairs.filter(p => p.chainId === chainFilter)
      : data.pairs

    // Dedupe by token address, pick highest liquidity
    const byAddr = new Map<string, (typeof filtered)[0]>()
    for (const pair of filtered) {
      const key = `${pair.chainId}:${pair.baseToken.address}`
      const existing = byAddr.get(key)
      if (!existing || (pair.liquidity?.usd || 0) > (existing.liquidity?.usd || 0)) {
        byAddr.set(key, pair)
      }
    }

    return Array.from(byAddr.values())
      .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))
      .slice(0, limit)
      .map(pair => ({
        symbol: pair.baseToken.symbol,
        name: pair.baseToken.name,
        address: pair.baseToken.address,
        chain: fromDexScreenerChainId(pair.chainId),
        decimals: 18, // DexScreener doesn't return decimals, default to 18 for EVM
        safety: deriveDexScreenerSafety(pair),
      }))
  } catch {
    return []
  }
}

// ── Jupiter Shield (Token Safety) ────────────────────────────────────

const safetyCache = new TtlCache<TokenSafety>(3600_000, 200) // 1 hour TTL, 200 max

export async function checkTokenSafety(tokenAddress: string): Promise<TokenSafety> {
  const cached = safetyCache.get(tokenAddress)
  if (cached) return cached

  try {
    const jup = jupiter()
    const res = await rateLimitedFetch(
      providerUrl('jupiter', `/tokens/v2/search?query=${tokenAddress}&limit=1`),
      { signal: AbortSignal.timeout(5000), headers: jup.headers },
    )
    if (!res.ok) return { risk: 'unknown', flags: [], warnings: ['Could not verify token'] }

    const tokens = await res.json() as Array<{
      tags?: string[]
      freeze_authority?: string | null
      mint_authority?: string | null
    }>

    if (!tokens.length) {
      return { risk: 'warning', flags: ['not_found'], warnings: ['Token not found in Jupiter registry'] }
    }

    const result = deriveJupiterSafety(tokens[0])
    safetyCache.set(tokenAddress, result)
    return result
  } catch {
    return { risk: 'unknown', flags: [], warnings: ['Safety check failed'] }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function deriveJupiterSafety(token: {
  tags?: string[]
  freeze_authority?: string | null
  mint_authority?: string | null
}): TokenSafety {
  const warnings: string[] = []
  const flags: string[] = []

  if (token.freeze_authority) {
    warnings.push('Freeze authority enabled — issuer can freeze your tokens')
    flags.push('freeze_authority')
  }
  if (token.mint_authority) {
    warnings.push('Mint authority enabled — supply can be inflated')
    flags.push('mint_authority')
  }
  if (token.tags?.includes('pump')) {
    warnings.push('Launched via Pump.fun — higher risk token')
    flags.push('pump_launch')
  }

  const isVerified = token.tags?.includes('verified') || token.tags?.includes('strict')
  if (isVerified) flags.push('verified')

  let risk: TokenSafety['risk'] = 'unknown'
  if (isVerified && warnings.length === 0) risk = 'safe'
  else if (warnings.length >= 2) risk = 'danger'
  else if (warnings.length === 1) risk = 'warning'

  return { risk, flags, warnings }
}

function deriveDexScreenerSafety(pair: {
  liquidity?: { usd?: number }
  volume?: { h24?: number }
}): TokenSafety {
  const warnings: string[] = []
  const flags: string[] = []

  const liq = pair.liquidity?.usd || 0
  if (liq < 10_000) {
    warnings.push(`Very low liquidity ($${liq.toFixed(0)}) — high slippage risk`)
    flags.push('low_liquidity')
  } else if (liq < 50_000) {
    warnings.push(`Low liquidity ($${liq.toFixed(0)})`)
    flags.push('moderate_liquidity')
  }

  const vol = pair.volume?.h24 || 0
  if (vol < 1_000) {
    warnings.push('Very low 24h volume — may be hard to exit')
    flags.push('low_volume')
  }

  let risk: TokenSafety['risk'] = 'unknown'
  if (liq >= 100_000 && vol >= 50_000) risk = 'safe'
  else if (warnings.length >= 2) risk = 'danger'
  else if (warnings.length === 1) risk = 'warning'

  return { risk, flags, warnings }
}

function dexScreenerChainId(chain: string): string {
  const map: Record<string, string> = {
    ethereum: 'ethereum',
    base: 'base',
    polygon: 'polygon',
    arbitrum: 'arbitrum',
    solana: 'solana',
  }
  return map[chain] || chain
}

function fromDexScreenerChainId(chainId: string): TokenInfo['chain'] {
  const map: Record<string, TokenInfo['chain']> = {
    ethereum: 'ethereum',
    base: 'base',
    polygon: 'polygon',
    arbitrum: 'arbitrum',
    solana: 'solana',
  }
  return map[chainId] || 'ethereum'
}
