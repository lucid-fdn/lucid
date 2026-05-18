/**
 * Trade Logger — Fire-and-forget event-sourced trade logging.
 *
 * Inserts into polymarket_trade_log after every successful trade.
 * Never throws — catches all errors and logs warnings.
 *
 * Dedup strategy:
 * - Non-null order_id: DB partial unique index (idx_ptl_order_dedup) rejects duplicates.
 *   We catch the 23505 constraint violation silently.
 * - Null order_id (e.g. split_and_sell with txHash only): No dedup — duplicates are
 *   benign since the position aggregator sums amounts and the cron verifies on-chain.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface TradeLogEntry {
  agentId: string
  orgId: string
  conditionId: string
  tokenId: string
  outcome: string
  action: string
  side: 'BUY' | 'SELL'
  amount: string
  price?: number
  orderId?: string
  txHash?: string
}

/**
 * Log a trade to the event-sourced trade log.
 * Fire-and-forget — never throws.
 */
export async function logPolymarketTrade(
  supabase: SupabaseClient,
  entry: TradeLogEntry,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('polymarket_trade_log')
      .insert({
        agent_id: entry.agentId,
        org_id: entry.orgId,
        condition_id: entry.conditionId,
        token_id: entry.tokenId,
        outcome: entry.outcome,
        action: entry.action,
        side: entry.side,
        amount: entry.amount,
        price: entry.price ?? null,
        order_id: entry.orderId ?? null,
        tx_hash: entry.txHash ?? null,
      })

    if (error) {
      // 23505 = unique_violation — expected for duplicate order_id (idempotent retry)
      if (error.code === '23505') return
      console.warn(`[polymarket-positions] Trade log insert failed: ${error.message}`)
    }
  } catch (err) {
    console.warn(`[polymarket-positions] Trade log error: ${err instanceof Error ? err.message : String(err)}`)
  }
}
