/**
 * Polymarket Trade Executor — Orchestrates CLOB orders + CTF operations.
 *
 * Strategy (from PolyClaw):
 *   buy_yes/buy_no  → Place GTC limit order on CLOB (or FOK at market)
 *   sell_yes/sell_no → Place sell order on CLOB
 *
 * The CLOB handles matching internally. For large positions that need
 * split/merge, the CTF executor handles on-chain operations.
 *
 * Fixes vs v1:
 *   - FOK uses orderbook best price, not stale Gamma price
 *   - Neg-risk markets routed to correct exchange/adapter
 *   - Fee rate + tick size resolved from CLOB API
 *   - Orders are properly EIP-712 signed
 */

import { placeOrder, getMarket, getOrderbook, getFeeRateBps, getNegRisk } from './clob-client.js'
import { splitPosition, ensureUsdcApproval, ensureCtfApproval } from './ctf-executor.js'
import { PolymarketValidationError } from './errors.js'
import { POLYMARKET_CONTRACTS } from './constants.js'
import type {
  PolymarketTradeParams,
  PolymarketTradeResult,
  ClobOrderSide,
  ClobOrderType,
} from './types.js'

// ============================================================================
// Trade Execution
// ============================================================================

/**
 * Execute a Polymarket trade. Routes through CLOB for standard orders.
 *
 * @param assistantId — Agent wallet identifier (Privy signing)
 * @param params — Trade parameters (conditionId, action, amount, limitPrice)
 */
export async function executePolymarketTrade(
  assistantId: string,
  params: PolymarketTradeParams,
): Promise<PolymarketTradeResult> {
  const { conditionId, action, amount, limitPrice } = params

  // 1. Fetch market data to get token IDs
  const market = await getMarket(conditionId)
  if (!market) {
    return { success: false, action, conditionId, amount, error: 'Market not found for this conditionId. Use the "search" action first to find the correct conditionId.' }
  }

  if (!market.accepting_orders) {
    return { success: false, action, conditionId, amount, error: 'Market is not accepting orders' }
  }

  // 2. Resolve token ID based on action
  const isYes = action === 'buy_yes' || action === 'sell_yes'
  const token = market.tokens.find(t => t.outcome === (isYes ? 'Yes' : 'No'))
  if (!token) {
    return { success: false, action, conditionId, amount, error: `${isYes ? 'Yes' : 'No'} token not found` }
  }

  // 3. Determine order side and type
  const isBuy = action === 'buy_yes' || action === 'buy_no'
  const side: ClobOrderSide = isBuy ? 'BUY' : 'SELL'
  const orderType: ClobOrderType = limitPrice ? 'GTC' : 'FOK'

  // 4. Resolve price — for FOK, use orderbook best price (not stale Gamma price)
  let price: number
  if (limitPrice) {
    price = limitPrice
  } else {
    // Fetch orderbook for accurate FOK pricing
    const book = await getOrderbook(token.token_id)
    if (isBuy && book?.asks?.[0]) {
      price = parseFloat(book.asks[0].price)
    } else if (!isBuy && book?.bids?.[0]) {
      price = parseFloat(book.bids[0].price)
    } else {
      // Fallback to Gamma price only if orderbook is empty
      price = token.price
    }
  }

  // Validate price — Polymarket binary markets use (0, 1) exclusive range.
  if (price <= 0 || price >= 1) {
    return { success: false, action, conditionId, amount, error: `Price must be between 0 and 1 (exclusive), got ${price}` }
  }

  // 5. Validate minimum order size
  const minSize = parseFloat(market.minimum_order_size)
  const orderSize = parseFloat(amount)
  if (isNaN(orderSize) || orderSize <= 0) {
    return { success: false, action, conditionId, amount, error: `Invalid amount: ${amount}` }
  }
  if (orderSize < minSize) {
    return { success: false, action, conditionId, amount, error: `Order size ${amount} below minimum ${market.minimum_order_size}` }
  }

  // 6. Resolve neg-risk flag and fee rate
  const negRisk = market.neg_risk ?? await getNegRisk(token.token_id)
  const feeRateBps = await getFeeRateBps()

  // 7. Place order via CLOB (with proper EIP-712 signing)
  const orderResult = await placeOrder(assistantId, {
    tokenId: token.token_id,
    side,
    price,
    size: orderSize,
    orderType,
    negRisk,
    feeRateBps,
  })

  if (!orderResult.success) {
    return {
      success: false,
      action,
      conditionId,
      amount,
      error: orderResult.error ?? 'CLOB order failed',
    }
  }

  return {
    success: true,
    action,
    conditionId,
    amount,
    orderId: orderResult.orderID,
    effectivePrice: price,
  }
}

// ============================================================================
// Split & Sell Strategy (Advanced)
// ============================================================================

/**
 * Split USDC into YES+NO tokens, then sell the unwanted side.
 * Used when CLOB liquidity is thin or for guaranteed execution.
 *
 * Now correctly routes neg-risk markets to the right exchange/adapter.
 */
export async function splitAndSell(
  assistantId: string,
  params: {
    conditionId: string
    usdcAmount: string
    keepOutcome: 'yes' | 'no'
  },
): Promise<PolymarketTradeResult> {
  const { conditionId, usdcAmount, keepOutcome } = params
  const action = keepOutcome === 'yes' ? 'buy_yes' : 'buy_no'

  // 1. Fetch market to check neg-risk
  const market = await getMarket(conditionId)
  if (!market) {
    return { success: false, action, conditionId, amount: usdcAmount, error: 'Market not found' }
  }

  const negRisk = market.neg_risk

  // 2. Ensure USDC.e approval — route to correct contract for neg-risk
  const usdcSpender = negRisk
    ? POLYMARKET_CONTRACTS.NEG_RISK_ADAPTER
    : POLYMARKET_CONTRACTS.CTF
  const approval = await ensureUsdcApproval(assistantId, usdcSpender)
  if (!approval.success) {
    return { success: false, action, conditionId, amount: usdcAmount, error: `USDC approval failed: ${approval.error}` }
  }

  // 3. Ensure CTF approval for the correct exchange
  const ctfOperator = negRisk
    ? POLYMARKET_CONTRACTS.NEG_RISK_CTF_EXCHANGE
    : POLYMARKET_CONTRACTS.CTF_EXCHANGE
  const ctfApproval = await ensureCtfApproval(assistantId, ctfOperator)
  if (!ctfApproval.success) {
    return { success: false, action, conditionId, amount: usdcAmount, error: `CTF approval failed: ${ctfApproval.error}` }
  }

  // 4. Split USDC → YES + NO
  const splitResult = await splitPosition(assistantId, { conditionId, amount: usdcAmount })
  if (!splitResult.success) {
    return { success: false, action, conditionId, amount: usdcAmount, error: `Split failed: ${splitResult.error}`, txHash: splitResult.txHash }
  }

  // 5. Sell the unwanted side via CLOB
  const sellAction = keepOutcome === 'yes' ? 'sell_no' : 'sell_yes'
  const sellResult = await executePolymarketTrade(assistantId, {
    conditionId,
    action: sellAction as 'sell_yes' | 'sell_no',
    amount: usdcAmount,
  })

  return {
    success: sellResult.success,
    action,
    conditionId,
    amount: usdcAmount,
    orderId: sellResult.orderId,
    txHash: splitResult.txHash,
    effectivePrice: sellResult.effectivePrice,
    error: sellResult.error,
  }
}
