/**
 * Position Aggregator — Computes net positions from trade log + on-chain snapshots.
 *
 * Algorithm:
 * 1. Query trade_log grouped by (condition_id, token_id, outcome) → net size + VWAP
 * 2. Query latest balance_snapshots per token — prefer on-chain if divergent
 * 3. Fetch current prices via getMarket (batched via Promise.allSettled)
 * 4. Compute PnL for each position with size > 0
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getMarket } from './clob-client.js'
import type { PolymarketPosition } from './types.js'

interface TradeLogAgg {
  condition_id: string
  token_id: string
  outcome: string
  total_buy_amount: number
  total_sell_amount: number
  total_buy_cost: number
  total_sell_cost: number
}

interface BalanceSnapshot {
  token_id: string
  condition_id: string
  outcome: string
  balance_tokens: number
  snapshot_at: string
}

/**
 * Get all open positions for an agent, enriched with current prices and PnL.
 */
export async function getPositions(
  supabase: SupabaseClient,
  agentId: string,
): Promise<PolymarketPosition[]> {
  // 1. Get aggregated trade log data
  const { data: trades, error: tradeError } = await supabase
    .from('polymarket_trade_log')
    .select('condition_id, token_id, outcome, side, amount, price')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: true })

  if (tradeError || !trades?.length) return []

  // Aggregate trades into net positions
  const aggs = new Map<string, TradeLogAgg>()
  for (const t of trades) {
    const key = `${t.condition_id}:${t.token_id}:${t.outcome}`
    if (!aggs.has(key)) {
      aggs.set(key, {
        condition_id: t.condition_id,
        token_id: t.token_id,
        outcome: t.outcome,
        total_buy_amount: 0,
        total_sell_amount: 0,
        total_buy_cost: 0,
        total_sell_cost: 0,
      })
    }
    const agg = aggs.get(key)!
    const amount = parseFloat(t.amount) || 0
    const price = parseFloat(t.price) || 0
    if (t.side === 'BUY') {
      agg.total_buy_amount += amount
      agg.total_buy_cost += amount * price
    } else {
      agg.total_sell_amount += amount
      agg.total_sell_cost += amount * price
    }
  }

  // 2. Get latest balance snapshots for on-chain verification
  const snapshotMap = new Map<string, BalanceSnapshot>()
  const { data: snapshots } = await supabase
    .from('polymarket_balance_snapshots')
    .select('token_id, condition_id, outcome, balance_tokens, snapshot_at')
    .eq('agent_id', agentId)
    .order('snapshot_at', { ascending: false })

  if (snapshots) {
    for (const s of snapshots) {
      // Keep only the latest snapshot per token
      if (!snapshotMap.has(s.token_id)) {
        snapshotMap.set(s.token_id, s)
      }
    }
  }

  // 3. Fetch current prices for all distinct condition IDs
  const conditionIds = [...new Set([...aggs.values()].map(a => a.condition_id))]
  const marketResults = await Promise.allSettled(
    conditionIds.map(cid => getMarket(cid)),
  )
  const markets = new Map<string, Awaited<ReturnType<typeof getMarket>>>()
  for (let i = 0; i < conditionIds.length; i++) {
    const r = marketResults[i]
    if (r.status === 'fulfilled' && r.value) {
      markets.set(conditionIds[i], r.value)
    }
  }

  // 4. Build positions
  const positions: PolymarketPosition[] = []
  for (const agg of aggs.values()) {
    const netSize = agg.total_buy_amount - agg.total_sell_amount
    if (netSize <= 0) continue

    // Prefer on-chain balance if available, recent (< 10 min), and non-negative
    const snapshot = snapshotMap.get(agg.token_id)
    const snapshotAge = snapshot
      ? Date.now() - new Date(snapshot.snapshot_at).getTime()
      : Infinity
    const MAX_SNAPSHOT_AGE_MS = 10 * 60 * 1000 // 10 minutes
    const effectiveSize = snapshot && snapshotAge < MAX_SNAPSHOT_AGE_MS
      ? snapshot.balance_tokens
      : netSize

    if (effectiveSize <= 0) continue

    const avgPrice = agg.total_buy_amount > 0
      ? agg.total_buy_cost / agg.total_buy_amount
      : 0

    const market = markets.get(agg.condition_id)
    const token = market?.tokens.find(t => t.outcome === agg.outcome)
    const currentPrice = token?.price ?? 0

    const pnlUsd = effectiveSize * (currentPrice - avgPrice)
    const pnlPercent = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0

    positions.push({
      conditionId: agg.condition_id,
      tokenId: agg.token_id,
      outcome: agg.outcome,
      size: effectiveSize.toFixed(2),
      avgPrice: Math.round(avgPrice * 1000000) / 1000000,
      currentPrice,
      pnlUsd: Math.round(pnlUsd * 100) / 100,
      pnlPercent: Math.round(pnlPercent * 100) / 100,
    })
  }

  return positions
}
