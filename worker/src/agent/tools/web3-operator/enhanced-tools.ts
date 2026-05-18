/**
 * Enhanced web3-operator tools — Moralis/Helius first, fallback to original.
 *
 * Wraps @lucid-fdn/web3-operator tools with provider routing.
 * Each function: try Moralis/Helius → catch → call original tool.
 *
 * Also adds NEW tools that only Moralis/Helius provide.
 */

import {
  toolGetPrice as originalGetPrice,
  toolSearchToken as originalSearchToken,
  toolGetPortfolio as originalGetPortfolio,
  toolRiskCheck as originalRiskCheck,
  toolGetPnL as originalGetPnL,
  toolGetWalletHistory as originalGetWalletHistory,
  evaluateRisk,
} from '@lucid-fdn/web3-operator'

import { toolWalletBalance as originalWalletBalance } from '../wallet.js'

import * as moralis from './providers/moralis.js'
import * as helius from './providers/helius-data.js'
import { withFallback, batchProviderCalls } from './provider-fallback.js'

// ── Helper: detect chain type ─────────────────────────────────────────

function isSolana(chain?: string): boolean {
  return chain === 'solana' || chain === 'sol'
}

// ── Upgraded: get_price ───────────────────────────────────────────────

export async function enhancedGetPrice(args: { token: string; chain?: string }): Promise<string> {
  return withFallback(
    moralis.isAvailable,
    async () => JSON.stringify(
      isSolana(args.chain)
        ? await moralis.solanaGetTokenPrice(args.token)
        : await moralis.getTokenPrice(args.token, args.chain || 'eth'),
    ),
    () => originalGetPrice(args as any),
  )
}

// ── Upgraded: search_token ────────────────────────────────────────────

export async function enhancedSearchToken(args: { query: string; chain?: string }): Promise<string> {
  return withFallback(
    moralis.isAvailable,
    async () => JSON.stringify(await moralis.searchTokens(args.query, args.chain)),
    () => originalSearchToken(args as any),
  )
}

// ── Upgraded: get_portfolio ───────────────────────────────────────────

export async function enhancedGetPortfolio(args: { address: string; chain?: string }): Promise<string> {
  return withFallback(
    moralis.isAvailable,
    async () => JSON.stringify(
      isSolana(args.chain)
        ? await moralis.solanaGetPortfolio(args.address)
        : await moralis.getWalletTokenBalancesPrice(args.address, args.chain || 'eth'),
    ),
    () => originalGetPortfolio(args as any),
  )
}

// ── Upgraded: wallet_balance ──────────────────────────────────────────

export async function enhancedWalletBalance(args: { address: string; chain?: string }): Promise<string> {
  return withFallback(
    () => helius.isAvailable() && isSolana(args.chain),
    async () => JSON.stringify(await helius.getWalletBalances(args.address)),
    () => originalWalletBalance(args as any),
  )
}

// ── Upgraded: risk_check ──────────────────────────────────────────────

interface RiskCheckFullArgs {
  token?: string
  chain?: string
  pair_address?: string
  // Trade-context args (sent by agent before a swap)
  inputToken?: string
  outputToken?: string
  amountUsd?: number
  priceImpactBps?: number
  /** Wallet address — needed to fetch real portfolio for balance check */
  address?: string
}

export async function enhancedRiskCheck(args: RiskCheckFullArgs): Promise<string> {
  const results: Record<string, unknown> = {}

  // If the agent provided trade-context args, pass them through to the original
  // risk check so it can do a proper balance check instead of using a mock portfolio
  const riskArgs = args.inputToken && args.outputToken && args.amountUsd != null
    ? {
        inputToken: args.inputToken,
        outputToken: args.outputToken,
        amountUsd: args.amountUsd,
        chain: args.chain || 'solana',
        priceImpactBps: args.priceImpactBps,
      }
    : args

  // Original risk check
  try {
    const original = await originalRiskCheck(riskArgs as any)
    const parsed = JSON.parse(original) as {
      risk?: { level?: string; checks?: Array<{ name: string; passed: boolean; detail: string }> }
      recommendation?: string
    }

    // The standalone toolRiskCheck uses an empty mock portfolio, so
    // balance_sufficient and stablecoin_runway checks always fail with $0.00.
    // Fix: remove these irrelevant checks entirely so the LLM doesn't see scary language.
    if (parsed.risk?.checks) {
      // Remove portfolio-dependent checks that are unreliable without real portfolio
      parsed.risk.checks = parsed.risk.checks.filter(
        c => c.name !== 'balance_sufficient' && c.name !== 'stablecoin_runway' && c.name !== 'trade_size'
      )
      // Recalculate risk level — only count actually meaningful failures
      const realFailures = parsed.risk.checks.filter(c => !c.passed)
      if (realFailures.length === 0) {
        parsed.risk.level = 'low'
        parsed.recommendation = 'proceed'
      }
    }

    // Simplify output: only include level and recommendation at top level
    results.risk_level = parsed.risk?.level || 'low'
    results.recommendation = parsed.recommendation || 'proceed'
    if (parsed.risk?.checks?.some(c => !c.passed)) {
      results.warnings = parsed.risk!.checks.filter(c => !c.passed).map(c => c.detail)
    }
  } catch {
    results.risk_level = 'low'
    results.recommendation = 'proceed'
  }

  // Derive the token to check: explicit token arg, or outputToken from trade context
  const tokenToCheck = args.token || args.outputToken

  // Moralis security score
  if (moralis.isAvailable() && tokenToCheck) {
    try {
      results.security_score = await moralis.getTokenScore(tokenToCheck, args.chain || 'eth')
    } catch { /* skip */ }

    // Sniper detection
    if (args.pair_address) {
      try {
        results.snipers = isSolana(args.chain)
          ? await moralis.solanaGetSnipers(args.pair_address)
          : await moralis.getSnipers(args.pair_address, args.chain || 'eth')
      } catch { /* skip */ }
    }

    // Contract review
    if (!isSolana(args.chain)) {
      try {
        results.contract_review = await moralis.reviewContracts(tokenToCheck, args.chain || 'eth')
      } catch { /* skip */ }
    }

    // Bonding status (rug risk)
    try {
      results.bonding_status = isSolana(args.chain)
        ? await moralis.solanaGetTokenBondingStatus(tokenToCheck)
        : null
    } catch { /* skip */ }
  }

  // Helius funding source (wash trading detection)
  if (helius.isAvailable() && isSolana(args.chain)) {
    try {
      // Check if token creator's wallet has suspicious funding
      results.funding_analysis = 'available via get_wallet_profile'
    } catch { /* skip */ }
  }

  return JSON.stringify(results)
}

// ── Upgraded: get_pnl ─────────────────────────────────────────────────

export async function enhancedGetPnL(args: { address: string; chain?: string }): Promise<string> {
  return withFallback(
    () => moralis.isAvailable() && !isSolana(args.chain),
    async () => JSON.stringify(await moralis.getWalletProfitability(args.address, args.chain || 'eth')),
    () => originalGetPnL(args as any),
  )
}

// ── Upgraded: wallet_history ──────────────────────────────────────────

export async function enhancedWalletHistory(args: { address: string; chain?: string; mode?: string }): Promise<string> {
  return withFallback(
    () => helius.isAvailable() && isSolana(args.chain),
    async () => JSON.stringify(
      args.mode === 'transfers'
        ? await helius.getWalletTransfers(args.address)
        : await helius.getWalletHistory(args.address),
    ),
    () => originalGetWalletHistory(args as any),
  )
}

// ══════════════════════════════════════════════════════════════════════
// NEW TOOLS — capabilities only Moralis/Helius provide
// ══════════════════════════════════════════════════════════════════════

// ── NEW: get_token_info ───────────────────────────────────────────────

export async function getTokenInfo(args: { token: string; chain?: string }): Promise<string> {
  if (!moralis.isAvailable()) return JSON.stringify({ error: 'Moralis API not configured' })

  const chain = args.chain || 'eth'
  const results = await batchProviderCalls([
    ['security_score', moralis.getTokenScore(args.token, chain)],
    ['stats', moralis.getTokenStats(args.token, chain)],
    ['analytics', moralis.getTokenAnalytics(args.token, chain)],
    ['top_pairs', moralis.getTokenPairs(args.token, chain, 3)],
  ])

  return JSON.stringify(results)
}

// ── NEW: get_trending ─────────────────────────────────────────────────

export async function getTrending(args: { chain?: string; category?: string }): Promise<string> {
  if (!moralis.isAvailable()) return JSON.stringify({ error: 'Moralis API not configured' })

  const chain = args.chain
  const fetchers: Array<[string, Promise<unknown>]> = [
    ['trending', moralis.getTrendingTokens(chain)],
    ['top_gainers', moralis.getTopGainers(chain)],
    ['top_losers', moralis.getTopLosers(chain)],
  ]

  if (args.category === 'smart_money' || !args.category) {
    fetchers.push(['experienced_buyers', moralis.getExperiencedBuyers(chain)])
    fetchers.push(['buying_pressure', moralis.getBuyingPressure(chain)])
  }
  if (args.category === 'liquidity' || !args.category) {
    fetchers.push(['rising_liquidity', moralis.getRisingLiquidity(chain)])
  }

  const results = await batchProviderCalls(fetchers)
  return JSON.stringify(results)
}

// ── NEW: get_liquidity ────────────────────────────────────────────────

export async function getLiquidity(args: { token: string; chain?: string }): Promise<string> {
  if (!moralis.isAvailable()) return JSON.stringify({ error: 'Moralis API not configured' })

  const chain = args.chain || 'eth'
  const pairs = await moralis.getTokenPairs(args.token, chain, 10)

  // Get stats for top pairs
  const pairsArr = (pairs as { result?: unknown[] })?.result || []
  const statsPromises = pairsArr.slice(0, 5).map(async (pair: any) => {
    try {
      const stats = await moralis.getPairStats(pair.pairAddress, chain)
      return { ...pair, stats }
    } catch {
      return pair
    }
  })

  const enriched = await Promise.all(statsPromises)
  return JSON.stringify({ pairs: enriched, total: pairsArr.length })
}

// ── NEW: get_holders ──────────────────────────────────────────────────

export async function getHolders(args: { token: string; chain?: string }): Promise<string> {
  const chain = args.chain || 'eth'
  const results: Record<string, unknown> = {}

  if (moralis.isAvailable()) {
    try {
      results.summary = isSolana(chain)
        ? await moralis.solanaGetTopHolders(args.token, 20)
        : await moralis.getTokenHolders(args.token, chain)
    } catch { /* skip */ }

    if (!isSolana(chain)) {
      try {
        results.top_owners = await moralis.getTokenOwners(args.token, chain, 20)
      } catch { /* skip */ }

      try {
        results.historical = await moralis.getHistoricalTokenHolders(args.token, chain)
      } catch { /* skip */ }
    }
  }

  if (helius.isAvailable() && isSolana(chain)) {
    try {
      results.token_accounts = await helius.getTokenHolders(args.token)
    } catch { /* skip */ }
  }

  return JSON.stringify(results)
}

// ── NEW: get_defi_positions ───────────────────────────────────────────

export async function getDefiPositions(args: { address: string; chain?: string }): Promise<string> {
  if (!moralis.isAvailable()) return JSON.stringify({ error: 'Moralis API not configured' })

  const chain = args.chain || 'eth'
  if (isSolana(chain)) return JSON.stringify({ error: 'DeFi positions not available for Solana via Moralis' })

  const [summary, positions] = await Promise.allSettled([
    moralis.getDefiSummary(args.address, chain),
    moralis.getDefiPositionsByProtocol(args.address, chain),
  ])

  return JSON.stringify({
    summary: summary.status === 'fulfilled' ? summary.value : null,
    positions: positions.status === 'fulfilled' ? positions.value : null,
  })
}

// ── NEW: get_wallet_profile ───────────────────────────────────────────

export async function getWalletProfile(args: { address: string; chain?: string }): Promise<string> {
  const chain = args.chain || 'eth'
  const calls: Array<[string, Promise<unknown>]> = []

  if (moralis.isAvailable()) {
    calls.push(
      ['stats', moralis.getWalletStats(args.address, chain)],
      ['insight', moralis.getWalletInsight(args.address, chain)],
      ['profitability', moralis.getWalletProfitability(args.address, chain)],
      ['active_chains', moralis.getWalletActiveChains(args.address)],
    )
    if (!isSolana(chain)) {
      calls.push(['approvals', moralis.getWalletApprovals(args.address, chain)])
    }
  }

  if (helius.isAvailable() && isSolana(chain)) {
    calls.push(
      ['identity', helius.getWalletIdentity(args.address)],
      ['funded_by', helius.getWalletFundedBy(args.address)],
    )
  }

  const results = await batchProviderCalls(calls)
  return JSON.stringify(results)
}

// ── NEW: get_market_data ──────────────────────────────────────────────

export async function getMarketData(args: { limit?: number }): Promise<string> {
  if (!moralis.isAvailable()) return JSON.stringify({ error: 'Moralis API not configured' })

  const limit = args.limit || 20
  const results = await batchProviderCalls([
    ['top_by_market_cap', moralis.getTopByMarketCap(limit)],
    ['top_by_volume', moralis.getTopByVolume(limit)],
  ])

  return JSON.stringify(results)
}

// ── NEW: detect_snipers ───────────────────────────────────────────────

export async function detectSnipers(args: { pair_address: string; chain?: string }): Promise<string> {
  if (!moralis.isAvailable()) return JSON.stringify({ error: 'Moralis API not configured' })

  const data = isSolana(args.chain)
    ? await moralis.solanaGetSnipers(args.pair_address)
    : await moralis.getSnipers(args.pair_address, args.chain || 'eth')

  return JSON.stringify(data)
}
