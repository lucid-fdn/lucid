/**
 * lucid_hedge — Read-only hedge analysis for Polymarket prediction markets.
 *
 * Analyzes known exposure and recommends hedge strategies without executing trades.
 * Uses open orders as a low-confidence proxy for positions (no persistent position
 * tracking until Phase 4).
 *
 * 3 actions: analyze_position, analyze_portfolio, suggest_hedge
 * Executor lane: 'read' (no wallet signing, no state mutation)
 * Never throws — returns structured error envelope on failure.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getMarket,
  getOrderbook,
  getOpenOrders,
} from '../services/index.js'
import type {
  PolymarketMarket,
  PolymarketPosition,
  ClobOpenOrder,
} from '../services/types.js'
import { getConfig } from '../../../config.js'
import { getPositions } from '../services/position-aggregator.js'

// ============================================================================
// Types
// ============================================================================

interface HedgeArgs {
  action: string
  conditionId?: string
  conditionIds?: string[]
  riskTolerance?: 'conservative' | 'moderate' | 'aggressive'
  maxHedgeCostUsd?: number
}

type Confidence = 'low' | 'medium' | 'high'
type PositionSource = 'open_orders_proxy' | 'known_condition_ids' | 'db_trade_log'
type HedgeRecommendation = 'full_hedge' | 'partial_hedge' | 'hold' | 'monitor_only'
type HedgeStrategy = 'buy_opposite' | 'split_and_sell' | 'partial_exit' | 'exit' | 'hold' | 'monitor_only'

interface SuccessEnvelope<T = unknown> {
  ok: true
  action: string
  confidence: Confidence
  positionSource: PositionSource
  warnings: string[]
  assumptions: string[]
  data: T
}

interface ErrorEnvelope {
  ok: false
  action: string
  error: {
    code: string
    message: string
    retryable: boolean
  }
  warnings: string[]
  assumptions: string[]
}

type ResponseEnvelope<T = unknown> = SuccessEnvelope<T> | ErrorEnvelope

/** Estimated exposure computed from open orders */
interface ExposureEstimate {
  outcome: string
  sizeEstimate: number
  avgPriceEstimate: number
  currentPrice: number
  unrealizedPnlEstimate: number
}

/** Parsed order detail for response output */
interface OrderDetail {
  side: string
  size: number
  sizeMatched: number
  price: number
}

/** Market summary included in responses */
interface MarketSummary {
  question: string
  endDate: string
  yesPrice: number
  noPrice: number
  spread: number
  active: boolean
}

/** Hedge analysis result from analyzePosition */
interface HedgeAnalysis {
  oppositePrice: number
  hedgeCostUsd: number
  breakEvenProbability: number
  spreadImpact: number
  recommendation: HedgeRecommendation
  reasoning: string
}

/** Data shape returned by analyze_position */
interface PositionAnalysisData {
  market: MarketSummary
  orders: OrderDetail[]
  estimatedExposure: ExposureEstimate | null
  hedgeAnalysis: HedgeAnalysis
}

/** Data shape returned by suggest_hedge */
interface SuggestHedgeData {
  market: MarketSummary
  estimatedExposure: ExposureEstimate | null
  hedgeOptions: HedgeOption[]
  recommendation: { bestStrategy: HedgeStrategy; reasoning: string }
}

/** A single hedge option */
interface HedgeOption {
  strategy: HedgeStrategy
  description: string
  costUsd: number
  suggestedAction: { action: string; conditionId: string; amount: string } | null
}

/** Internal struct: market + orders + precomputed exposure for portfolio analysis */
interface MarketEntry {
  conditionId: string
  market: PolymarketMarket
  orders: ClobOpenOrder[]
  exposure: ReturnType<typeof estimateExposureFromOrders>
}

// ============================================================================
// Envelope Builders
// ============================================================================

function wrapResponse<T>(
  action: string,
  data: T,
  opts: {
    confidence: Confidence
    positionSource: PositionSource
    warnings?: string[]
    assumptions?: string[]
  },
): SuccessEnvelope<T> {
  return {
    ok: true,
    action,
    confidence: opts.confidence,
    positionSource: opts.positionSource,
    warnings: opts.warnings ?? [],
    assumptions: opts.assumptions ?? [],
    data,
  }
}

function wrapError(
  action: string,
  code: string,
  message: string,
  retryable = false,
): ErrorEnvelope {
  return {
    ok: false,
    action,
    error: { code, message, retryable },
    warnings: [],
    assumptions: [],
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Herfindahl-Hirschman Index for concentration (0-1, higher = more concentrated) */
export function computeHerfindahl(exposures: number[]): number {
  const total = exposures.reduce((s, e) => s + e, 0)
  if (total === 0) return 0
  return exposures.reduce((sum, e) => sum + (e / total) ** 2, 0)
}

/** Jaccard similarity on normalized question text tokens */
export function computeQuestionSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2),
    )
  const setA = normalize(a)
  const setB = normalize(b)
  if (setA.size === 0 && setB.size === 0) return 0
  let intersection = 0
  for (const w of setA) {
    if (setB.has(w)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** Break-even probability: cost / (payout if correct) */
export function computeBreakEven(hedgeCost: number, hedgeSize: number): number {
  if (hedgeSize <= 0) return 1
  return hedgeCost / hedgeSize
}

function estimateExposureFromOrders(orders: ClobOpenOrder[], market: PolymarketMarket) {
  if (orders.length === 0) return null

  const yesToken = market.tokens.find(t => t.outcome === 'Yes')
  const noToken = market.tokens.find(t => t.outcome === 'No')
  const yesTokenId = yesToken?.token_id
  const noTokenId = noToken?.token_id

  let yesExposure = 0
  let noExposure = 0
  const orderDetails: OrderDetail[] = []

  for (const order of orders) {
    const size = parseFloat(order.original_size)
    const matched = parseFloat(order.size_matched)
    const price = parseFloat(order.price)
    orderDetails.push({ side: order.side, size, sizeMatched: matched, price })

    // Estimate based on matched portion (prefer matched, fall back to full size)
    const effectiveSize = matched > 0 ? matched : size
    if (order.asset_id === yesTokenId) {
      if (order.side === 'BUY') yesExposure += effectiveSize * price
      else noExposure += effectiveSize * price
    } else if (order.asset_id === noTokenId) {
      if (order.side === 'BUY') noExposure += effectiveSize * price
      else yesExposure += effectiveSize * price
    }
  }

  const dominant = yesExposure >= noExposure ? 'Yes' : 'No'
  const dominantExposure = Math.max(yesExposure, noExposure)

  // Volume-weighted average price
  let totalWeightedPrice = 0
  let totalSize = 0
  for (const order of orders) {
    const s = parseFloat(order.original_size)
    totalWeightedPrice += parseFloat(order.price) * s
    totalSize += s
  }
  const avgPrice = totalSize > 0 ? totalWeightedPrice / totalSize : 0
  const currentPrice = dominant === 'Yes' ? (yesToken?.price ?? 0) : (noToken?.price ?? 0)

  return {
    outcome: dominant,
    sizeEstimate: dominantExposure,
    avgPriceEstimate: Math.round(avgPrice * 100) / 100,
    currentPrice,
    unrealizedPnlEstimate:
      Math.round((dominantExposure * (currentPrice - avgPrice)) * 100) / 100,
    orders: orderDetails,
  }
}

function computeRecommendation(
  exposure: number,
  hedgeCost: number,
  spread: number,
  riskTolerance: string,
): HedgeRecommendation {
  const hedgeCostRatio = exposure > 0 ? hedgeCost / exposure : 1

  if (hedgeCostRatio > 0.5) return 'monitor_only'
  if (spread > 0.1) return 'monitor_only'

  if (riskTolerance === 'conservative') {
    return hedgeCostRatio < 0.2 ? 'full_hedge' : 'partial_hedge'
  }
  if (riskTolerance === 'aggressive') {
    return hedgeCostRatio < 0.1 ? 'partial_hedge' : 'hold'
  }
  // moderate
  return hedgeCostRatio < 0.15 ? 'partial_hedge' : 'hold'
}

/** Round to N decimal places */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

// ============================================================================
// Actions
// ============================================================================

async function analyzePosition(
  conditionId: string,
  assistantId: string,
  riskTolerance = 'moderate',
  supabase?: SupabaseClient,
): Promise<ResponseEnvelope<PositionAnalysisData>> {
  const warnings: string[] = []
  const assumptions: string[] = []

  // Try DB-backed position data first (Phase 4)
  let dbPosition: PolymarketPosition | null = null
  if (supabase && getConfig().FEATURE_POLYMARKET_POSITIONS) {
    try {
      const positions = await getPositions(supabase, assistantId)
      dbPosition = positions.find(p => p.conditionId === conditionId) ?? null
    } catch {
      warnings.push('Failed to fetch DB positions — falling back to open orders proxy')
    }
  }

  if (!dbPosition) {
    warnings.push('Open orders may not reflect fully filled positions')
    assumptions.push('Position size estimated from matched order volume')
  }

  let market: PolymarketMarket | null
  try {
    market = await getMarket(conditionId)
  } catch {
    return wrapError('analyze_position', 'MARKET_FETCH_FAILED', `Failed to fetch market ${conditionId}`, true)
  }
  if (!market) {
    return wrapError('analyze_position', 'MARKET_NOT_FOUND', `Condition ID ${conditionId} not found`, false)
  }

  const yesToken = market.tokens.find(t => t.outcome === 'Yes')
  const noToken = market.tokens.find(t => t.outcome === 'No')
  const yesPrice = yesToken?.price ?? 0
  const noPrice = noToken?.price ?? 0
  const spread = Math.abs(yesPrice - (1 - noPrice))

  // Fetch orders and orderbook concurrently (independent calls)
  const [ordersResult, orderbookResult] = await Promise.allSettled([
    getOpenOrders(assistantId, conditionId),
    yesToken ? getOrderbook(yesToken.token_id, assistantId) : Promise.resolve(null),
  ])

  let orders: ClobOpenOrder[]
  if (ordersResult.status === 'fulfilled') {
    orders = ordersResult.value
  } else {
    orders = []
    warnings.push('Failed to fetch open orders — analysis based on market data only')
  }

  let confidence: Confidence = 'low'
  let bookSpread = spread
  if (orderbookResult.status === 'fulfilled' && orderbookResult.value) {
    confidence = 'medium'
    const ob = orderbookResult.value
    if (ob.asks[0] && ob.bids[0]) {
      bookSpread = parseFloat(ob.asks[0].price) - parseFloat(ob.bids[0].price)
    }
  } else if (orderbookResult.status === 'rejected') {
    warnings.push('Orderbook unavailable — spread and hedge cost may be imprecise')
  }

  // Use DB position if available, otherwise fall back to open orders proxy
  let exposureData: ExposureEstimate | null = null
  let orderDetails: OrderDetail[] = []
  let positionSource: PositionSource = 'open_orders_proxy'

  if (dbPosition) {
    const size = parseFloat(dbPosition.size)
    exposureData = {
      outcome: dbPosition.outcome,
      sizeEstimate: size,
      avgPriceEstimate: dbPosition.avgPrice,
      currentPrice: dbPosition.currentPrice,
      unrealizedPnlEstimate: dbPosition.pnlUsd,
    }
    confidence = 'high'
    positionSource = 'db_trade_log'
    assumptions.push('Position data from persistent trade log, verified against on-chain balances')
  } else {
    const exposure = estimateExposureFromOrders(orders, market)
    if (exposure) {
      exposureData = {
        outcome: exposure.outcome,
        sizeEstimate: exposure.sizeEstimate,
        avgPriceEstimate: exposure.avgPriceEstimate,
        currentPrice: exposure.currentPrice,
        unrealizedPnlEstimate: exposure.unrealizedPnlEstimate,
      }
      orderDetails = exposure.orders
    }
  }

  const oppositePrice = exposureData?.outcome === 'Yes' ? noPrice : yesPrice
  const hedgeCostUsd = exposureData ? exposureData.sizeEstimate * oppositePrice : 0
  const breakEvenProbability = exposureData
    ? computeBreakEven(hedgeCostUsd, exposureData.sizeEstimate)
    : 0

  const recommendation = exposureData
    ? computeRecommendation(exposureData.sizeEstimate, hedgeCostUsd, bookSpread, riskTolerance)
    : 'monitor_only'

  return wrapResponse<PositionAnalysisData>('analyze_position', {
    market: {
      question: market.question,
      endDate: market.end_date_iso,
      yesPrice,
      noPrice,
      spread: round(spread, 4),
      active: market.active,
    },
    orders: orderDetails,
    estimatedExposure: exposureData,
    hedgeAnalysis: {
      oppositePrice,
      hedgeCostUsd: round(hedgeCostUsd, 2),
      breakEvenProbability: round(breakEvenProbability, 2),
      spreadImpact: round(bookSpread, 4),
      recommendation,
      reasoning: exposureData
        ? `${positionSource === 'db_trade_log' ? 'Tracked' : 'Estimated'} ${exposureData.outcome} exposure of $${exposureData.sizeEstimate.toFixed(2)}. Hedge cost $${hedgeCostUsd.toFixed(2)} (${(hedgeCostUsd / Math.max(exposureData.sizeEstimate, 0.01) * 100).toFixed(0)}% of exposure).`
        : 'No open orders found for this market. Position may be fully filled or not yet taken.',
    },
  }, {
    confidence,
    positionSource,
    warnings,
    assumptions,
  })
}

async function analyzePortfolio(
  conditionIds: string[],
  assistantId: string,
  _riskTolerance = 'moderate',
  _supabase?: SupabaseClient,
): Promise<ResponseEnvelope> {
  const warnings: string[] = ['Open orders may not reflect fully filled positions']
  const assumptions: string[] = [
    'Position sizes estimated from matched order volume',
    'Relatedness based on question text similarity (Jaccard), not statistical correlation',
  ]

  // Fetch all markets in parallel
  const marketResults = await Promise.allSettled(
    conditionIds.map(async (cid): Promise<MarketEntry | null> => {
      let market: PolymarketMarket | null
      try {
        market = await getMarket(cid)
      } catch {
        warnings.push(`Failed to fetch market ${cid} — excluded from analysis`)
        return null
      }
      if (!market) {
        warnings.push(`Market ${cid} not found — excluded from analysis`)
        return null
      }

      let orders: ClobOpenOrder[]
      try {
        orders = await getOpenOrders(assistantId, cid)
      } catch {
        orders = []
        warnings.push(`Failed to fetch orders for ${cid}`)
      }

      const exposure = estimateExposureFromOrders(orders, market)
      return { conditionId: cid, market, orders, exposure }
    }),
  )

  // Collect successful entries
  const entries: MarketEntry[] = []
  for (const result of marketResults) {
    if (result.status === 'fulfilled' && result.value) {
      entries.push(result.value)
    }
  }

  if (entries.length === 0) {
    return wrapError('analyze_portfolio', 'NO_VALID_MARKETS', 'No valid markets found for the given condition IDs', false)
  }

  // Check orderbook for any entry (confidence boost) — parallel
  let hasOrderbook = false
  const obResults = await Promise.allSettled(
    entries.map(e => {
      const yesToken = e.market.tokens.find(t => t.outcome === 'Yes')
      return yesToken ? getOrderbook(yesToken.token_id, assistantId) : Promise.resolve(null)
    }),
  )
  for (const r of obResults) {
    if (r.status === 'fulfilled' && r.value) { hasOrderbook = true; break }
  }

  // Build positions from precomputed exposures (no redundant recomputation)
  const positions = entries.map(e => ({
    conditionId: e.conditionId,
    question: e.market.question,
    estimatedExposureUsd: e.exposure?.sizeEstimate ?? 0,
    pnlEstimate: e.exposure?.unrealizedPnlEstimate ?? 0,
  }))

  const exposures = positions.map(p => p.estimatedExposureUsd)
  const totalExposure = exposures.reduce((s, e) => s + e, 0)
  const maxExposure = Math.max(...exposures)
  const concentrationIndex = computeHerfindahl(exposures)
  const maxSingleExposurePct =
    totalExposure > 0 ? Math.round((maxExposure / totalExposure) * 100) : 0

  // Directional bias from precomputed exposures
  let yesCount = 0
  let noCount = 0
  for (const e of entries) {
    if (e.exposure?.outcome === 'Yes') yesCount++
    else if (e.exposure?.outcome === 'No') noCount++
  }
  const directionalBias =
    yesCount > noCount * 1.5
      ? 'yes_heavy'
      : noCount > yesCount * 1.5
        ? 'no_heavy'
        : 'balanced'

  // Relatedness (O(n^2) pairwise — bounded by small portfolio sizes in practice)
  const relatedness: {
    marketA: string
    marketB: string
    score: number
    method: string
    note: string
  }[] = []
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const score = computeQuestionSimilarity(
        entries[i].market.question,
        entries[j].market.question,
      )
      if (score > 0.2) {
        relatedness.push({
          marketA: entries[i].conditionId,
          marketB: entries[j].conditionId,
          score: round(score, 2),
          method: 'jaccard_question_text',
          note: 'Both questions share common terms',
        })
      }
    }
  }

  // Recommendations
  const recommendations: {
    conditionId: string
    action: string
    reasoning: string
    priority: string
  }[] = []
  for (const pos of positions) {
    if (totalExposure > 0 && pos.estimatedExposureUsd / totalExposure > 0.5) {
      recommendations.push({
        conditionId: pos.conditionId,
        action: 'partial_hedge',
        reasoning: `Position represents ${Math.round((pos.estimatedExposureUsd / totalExposure) * 100)}% of total exposure — consider diversifying`,
        priority: 'high',
      })
    } else if (pos.pnlEstimate < -pos.estimatedExposureUsd * 0.3) {
      recommendations.push({
        conditionId: pos.conditionId,
        action: 'exit',
        reasoning: 'Estimated unrealized loss exceeds 30% of exposure',
        priority: 'medium',
      })
    }
  }

  return wrapResponse('analyze_portfolio', {
    positions,
    riskMetrics: {
      totalEstimatedExposureUsd: round(totalExposure, 2),
      positionCount: positions.length,
      concentrationIndex: round(concentrationIndex, 2),
      maxSingleExposurePct,
      worstCaseLossUsd: round(totalExposure, 2),
      directionalBias,
    },
    relatedness,
    recommendations,
  }, {
    confidence: hasOrderbook ? 'medium' as Confidence : 'low' as Confidence,
    positionSource: 'open_orders_proxy',
    warnings,
    assumptions,
  })
}

async function suggestHedge(
  conditionId: string,
  assistantId: string,
  riskTolerance = 'moderate',
  maxHedgeCostUsd?: number,
  supabase?: SupabaseClient,
): Promise<ResponseEnvelope<SuggestHedgeData>> {
  // Call analyzePosition internally — single source of truth
  const analysisResult = await analyzePosition(conditionId, assistantId, riskTolerance, supabase)
  if (!analysisResult.ok) return analysisResult

  const { data, confidence, positionSource, warnings: analysisWarnings, assumptions } = analysisResult

  const hedgeOptions: HedgeOption[] = []
  const hedgeCost = data.hedgeAnalysis.hedgeCostUsd
  const exposure = data.estimatedExposure
  const hasExposure = exposure != null && exposure.sizeEstimate > 0

  if (hasExposure) {
    const oppositeAction = exposure.outcome === 'Yes' ? 'buy_no' : 'buy_yes'
    const sellAction = exposure.outcome === 'Yes' ? 'sell_yes' : 'sell_no'

    // buy_opposite — full offset hedge
    if (!maxHedgeCostUsd || hedgeCost <= maxHedgeCostUsd) {
      hedgeOptions.push({
        strategy: 'buy_opposite',
        description: `Buy ${exposure.outcome === 'Yes' ? 'NO' : 'YES'} tokens to offset ${exposure.outcome} exposure`,
        costUsd: hedgeCost,
        suggestedAction: {
          action: oppositeAction,
          conditionId,
          amount: hedgeCost.toFixed(2),
        },
      })
    }

    // split_and_sell — split USDC into both outcomes, sell unwanted side
    const splitCost = exposure.sizeEstimate * 0.5
    if (!maxHedgeCostUsd || splitCost <= maxHedgeCostUsd) {
      hedgeOptions.push({
        strategy: 'split_and_sell',
        description: `Split USDC into YES+NO tokens, sell ${exposure.outcome === 'Yes' ? 'NO' : 'YES'} side to lock in guaranteed value`,
        costUsd: splitCost,
        suggestedAction: {
          action: 'split_and_sell',
          conditionId,
          amount: splitCost.toFixed(2),
        },
      })
    }

    // partial_exit — sell 50% of position
    hedgeOptions.push({
      strategy: 'partial_exit',
      description: `Sell 50% of ${exposure.outcome} position to reduce exposure`,
      costUsd: 0,
      suggestedAction: {
        action: sellAction,
        conditionId,
        amount: (exposure.sizeEstimate * 0.5).toFixed(2),
      },
    })

    // exit — full position close
    hedgeOptions.push({
      strategy: 'exit',
      description: `Fully exit ${exposure.outcome} position`,
      costUsd: 0,
      suggestedAction: {
        action: sellAction,
        conditionId,
        amount: exposure.sizeEstimate.toFixed(2),
      },
    })
  }

  // hold — always an option
  const holdReason = hasExposure
    ? hedgeCost > exposure.sizeEstimate * 0.3
      ? `Hedging cost ($${hedgeCost.toFixed(2)}) exceeds 30% of exposure. Risk reduction benefit is limited.`
      : `Current position has acceptable risk given ${riskTolerance} tolerance.`
    : 'No significant exposure detected.'
  hedgeOptions.push({
    strategy: 'hold',
    description: holdReason,
    costUsd: 0,
    suggestedAction: null,
  })

  // monitor_only — when data is insufficient or market inactive
  if (!hasExposure || !data.market.active) {
    hedgeOptions.push({
      strategy: 'monitor_only',
      description: !data.market.active
        ? 'Market is inactive — monitor for resolution.'
        : 'Insufficient data to recommend a hedge. Monitor position.',
      costUsd: 0,
      suggestedAction: null,
    })
  }

  // Determine best strategy by mapping recommendation to available options
  const rec = data.hedgeAnalysis.recommendation
  const strategyMap: Record<HedgeRecommendation, HedgeStrategy> = {
    full_hedge: 'buy_opposite',
    partial_hedge: 'partial_exit',
    hold: 'hold',
    monitor_only: 'monitor_only',
  }
  const preferred = strategyMap[rec]
  const bestStrategy = hedgeOptions.some(h => h.strategy === preferred) ? preferred : 'hold'
  const bestOption = hedgeOptions.find(h => h.strategy === bestStrategy)

  const reasoning = hasExposure
    ? `Estimated ${exposure.outcome} exposure of $${exposure.sizeEstimate.toFixed(2)} at avg ${exposure.avgPriceEstimate} (current ${exposure.currentPrice}). ${bestOption?.description ?? ''}`
    : 'No significant open order exposure detected. Position may be fully filled or not yet taken.'

  return wrapResponse<SuggestHedgeData>('suggest_hedge', {
    market: data.market,
    estimatedExposure: data.estimatedExposure,
    hedgeOptions,
    recommendation: { bestStrategy, reasoning },
  }, {
    confidence,
    positionSource,
    warnings: [
      ...analysisWarnings,
      'Hedge suggestions are informational — review before executing',
    ],
    assumptions,
  })
}

// ============================================================================
// Entry Point
// ============================================================================

export async function toolLucidHedge(
  args: unknown,
  assistantId: string,
  supabase?: SupabaseClient,
): Promise<string> {
  try {
    const { action, conditionId, conditionIds, riskTolerance, maxHedgeCostUsd } =
      (args ?? {}) as HedgeArgs

    if (!action) {
      return JSON.stringify(
        wrapError('unknown', 'MISSING_ACTION', 'action is required', false),
      )
    }

    const tolerance = riskTolerance ?? 'moderate'

    switch (action) {
      case 'analyze_position': {
        if (!conditionId) {
          return JSON.stringify(
            wrapError('analyze_position', 'MISSING_CONDITION_ID', 'conditionId is required for analyze_position', false),
          )
        }
        const result = await analyzePosition(conditionId, assistantId, tolerance, supabase)
        return JSON.stringify(result)
      }

      case 'analyze_portfolio': {
        if (!conditionIds || !Array.isArray(conditionIds) || conditionIds.length === 0) {
          return JSON.stringify(
            wrapError('analyze_portfolio', 'MISSING_CONDITION_IDS', 'conditionIds (non-empty array) is required for analyze_portfolio', false),
          )
        }
        const result = await analyzePortfolio(conditionIds, assistantId, tolerance, supabase)
        return JSON.stringify(result)
      }

      case 'suggest_hedge': {
        if (!conditionId) {
          return JSON.stringify(
            wrapError('suggest_hedge', 'MISSING_CONDITION_ID', 'conditionId is required for suggest_hedge', false),
          )
        }
        const result = await suggestHedge(conditionId, assistantId, tolerance, maxHedgeCostUsd, supabase)
        return JSON.stringify(result)
      }

      default:
        return JSON.stringify(
          wrapError(action, 'UNKNOWN_ACTION', `Unknown action: ${action}. Available: analyze_position, analyze_portfolio, suggest_hedge`, false),
        )
    }
  } catch (err) {
    // Never-throw guarantee
    const message = err instanceof Error ? err.message : String(err)
    return JSON.stringify(
      wrapError('unknown', 'INTERNAL_ERROR', `Unexpected error: ${message}`, true),
    )
  }
}
