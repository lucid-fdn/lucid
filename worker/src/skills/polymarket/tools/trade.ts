/**
 * polymarket_trade — Elevated Polymarket prediction market trading.
 *
 * Implementation: services/polymarket/ → CLOB API + CTF on-chain (Polygon)
 * Stays built-in permanently (requires Privy agent wallet signing for:
 *   1. EIP-712 CLOB API authentication
 *   2. On-chain CTF split/merge transactions
 * )
 */

import type { ToolContext } from '../../../agent/tools/types.js'
import {
  executePolymarketTrade,
  splitAndSell,
  searchMarkets,
  getMarket,
  getOrderbook,
  getOpenOrders,
  cancelOrder,
  cancelOrders,
  cancelAll,
  redeemPositions,
} from '../services/index.js'
import type { PolymarketTradeAction } from '../services/types.js'
import { getConfig } from '../../../config.js'
import { logPolymarketTrade } from '../services/trade-logger.js'
import { getPositions } from '../services/position-aggregator.js'

/** Safely check feature flag without throwing in test environments */
function isPositionTrackingEnabled(): boolean {
  try {
    return getConfig().FEATURE_POLYMARKET_POSITIONS
  } catch {
    return false
  }
}

// ============================================================================
// Tool Implementation
// ============================================================================

interface PolymarketTradeArgs {
  action: string
  conditionId?: string
  question?: string
  amount?: string
  limitPrice?: number
  orderId?: string
  orderIds?: string[]
}

export async function toolPolymarketTrade(
  args: PolymarketTradeArgs,
  ctx: ToolContext,
): Promise<string> {
  const { action, conditionId, question, amount, limitPrice, orderId } = args

  try {
  switch (action) {
    case 'search': {
      if (!question) {
        return JSON.stringify({ error: 'question is required for search action' })
      }
      const markets = await searchMarkets(question, 5)
      return JSON.stringify({
        markets: markets.map(m => ({
          conditionId: m.condition_id,
          question: m.question,
          yesPrice: m.tokens.find(t => t.outcome === 'Yes')?.price,
          noPrice: m.tokens.find(t => t.outcome === 'No')?.price,
          active: m.active,
          negRisk: m.neg_risk,
          endDate: m.end_date_iso,
        })),
      })
    }

    case 'market_info': {
      if (!conditionId) {
        return JSON.stringify({ error: 'conditionId is required for market_info action' })
      }
      const market = await getMarket(conditionId)
      if (!market) {
        return JSON.stringify({ error: 'Market not found for this conditionId. Use the "search" action to find the correct conditionId.' })
      }
      return JSON.stringify({
        conditionId: market.condition_id,
        question: market.question,
        description: market.description,
        tokens: market.tokens,
        active: market.active,
        closed: market.closed,
        acceptingOrders: market.accepting_orders,
        minOrderSize: market.minimum_order_size,
        minTickSize: market.minimum_tick_size,
        negRisk: market.neg_risk,
        endDate: market.end_date_iso,
      })
    }

    case 'orderbook': {
      if (!conditionId) {
        return JSON.stringify({ error: 'conditionId is required for orderbook action' })
      }
      const market = await getMarket(conditionId)
      if (!market) {
        return JSON.stringify({ error: 'Market not found for this conditionId. Use the "search" action to find the correct conditionId.' })
      }
      const yesToken = market.tokens.find(t => t.outcome === 'Yes')
      if (!yesToken) {
        return JSON.stringify({ error: 'Yes token not found' })
      }
      const book = await getOrderbook(yesToken.token_id, ctx.assistantId)
      if (!book) {
        return JSON.stringify({ error: 'Failed to fetch orderbook' })
      }
      return JSON.stringify({
        bids: book.bids.slice(0, 10),
        asks: book.asks.slice(0, 10),
        spread: book.asks[0] && book.bids[0]
          ? (parseFloat(book.asks[0].price) - parseFloat(book.bids[0].price)).toFixed(4)
          : null,
      })
    }

    case 'buy_yes':
    case 'buy_no':
    case 'sell_yes':
    case 'sell_no': {
      if (!conditionId) {
        return JSON.stringify({ error: 'conditionId is required for trade actions' })
      }
      if (!amount) {
        return JSON.stringify({ error: 'amount is required for trade actions' })
      }
      const result = await executePolymarketTrade(ctx.assistantId, {
        conditionId,
        action: action as PolymarketTradeAction,
        amount,
        limitPrice,
      })
      // Fire-and-forget: log trade if position tracking enabled
      if (result.success && isPositionTrackingEnabled() && ctx.orgId) {
        const market = await getMarket(conditionId).catch(() => null)
        if (market) {
          const isYes = action === 'buy_yes' || action === 'sell_yes'
          const token = market.tokens.find(t => t.outcome === (isYes ? 'Yes' : 'No'))
          const isBuy = action === 'buy_yes' || action === 'buy_no'
          if (token) {
            logPolymarketTrade(ctx.supabase, {
              agentId: ctx.assistantId,
              orgId: ctx.orgId,
              conditionId,
              tokenId: token.token_id,
              outcome: token.outcome,
              action,
              side: isBuy ? 'BUY' : 'SELL',
              amount,
              price: result.effectivePrice,
              orderId: result.orderId,
              txHash: result.txHash,
            })
          }
        }
      }
      return JSON.stringify(result)
    }

    case 'split_and_sell': {
      if (!conditionId || !amount) {
        return JSON.stringify({ error: 'conditionId and amount required for split_and_sell' })
      }
      const keepOutcome = (args as unknown as Record<string, unknown>).keepOutcome as 'yes' | 'no' | undefined
      if (!keepOutcome || !['yes', 'no'].includes(keepOutcome)) {
        return JSON.stringify({ error: 'keepOutcome must be "yes" or "no"' })
      }
      const result = await splitAndSell(ctx.assistantId, {
        conditionId,
        usdcAmount: amount,
        keepOutcome,
      })
      // Fire-and-forget: log split_and_sell trade
      if (result.success && isPositionTrackingEnabled() && ctx.orgId) {
        const market = await getMarket(conditionId).catch(() => null)
        if (market) {
          const keptToken = market.tokens.find(t => t.outcome === (keepOutcome === 'yes' ? 'Yes' : 'No'))
          if (keptToken) {
            logPolymarketTrade(ctx.supabase, {
              agentId: ctx.assistantId,
              orgId: ctx.orgId,
              conditionId,
              tokenId: keptToken.token_id,
              outcome: keptToken.outcome,
              action: 'split_and_sell',
              side: 'BUY',
              amount,
              price: result.effectivePrice,
              orderId: result.orderId,
              txHash: result.txHash,
            })
          }
        }
      }
      return JSON.stringify(result)
    }

    case 'get_positions': {
      if (!isPositionTrackingEnabled()) {
        return JSON.stringify({ error: 'Position tracking not enabled' })
      }
      const positions = await getPositions(ctx.supabase, ctx.assistantId)
      return JSON.stringify({ positions })
    }

    case 'open_orders': {
      const orders = await getOpenOrders(ctx.assistantId, conditionId)
      return JSON.stringify({ orders })
    }

    case 'cancel_order': {
      if (!orderId) {
        return JSON.stringify({ error: 'orderId is required for cancel_order action' })
      }
      const result = await cancelOrder(ctx.assistantId, orderId)
      return JSON.stringify(result)
    }

    case 'redeem': {
      if (!conditionId) {
        return JSON.stringify({ error: 'conditionId is required for redeem action' })
      }
      const result = await redeemPositions(ctx.assistantId, conditionId)
      return JSON.stringify(result)
    }

    case 'cancel_all': {
      const result = await cancelAll(ctx.assistantId)
      return JSON.stringify(result)
    }

    case 'cancel_orders': {
      const ids = args.orderIds
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return JSON.stringify({ error: 'orderIds array is required for cancel_orders action' })
      }
      const result = await cancelOrders(ctx.assistantId, ids)
      return JSON.stringify(result)
    }

    default:
      return JSON.stringify({
        error: `Unknown action: ${action}. Available: search, market_info, orderbook, buy_yes, buy_no, sell_yes, sell_no, split_and_sell, open_orders, cancel_order, cancel_orders, cancel_all, redeem, get_positions`,
      })
  }
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
