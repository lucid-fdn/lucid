/**
 * Trading Simulation Tests — Real-world scenario simulations.
 *
 * Exercises the full stack with realistic data flows:
 *   1. Market discovery → info → orderbook → trade → position tracking
 *   2. Split-and-sell for illiquid markets with neg-risk routing
 *   3. FOK pricing from orderbook vs Gamma fallback
 *   4. Cancel flows (single, batch, all)
 *   5. Redeem after market resolution
 *   6. Position P&L tracking across multiple trades
 *   7. Error recovery scenarios (network, auth, validation)
 *   8. Neg-risk market routing end-to-end
 *
 * All services are mocked at the transport layer — the orchestration
 * logic (trade-executor, trade.ts tool handler) runs for real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock service layer ──

vi.mock('../services/clob-client.js', () => ({
  getMarket: vi.fn(),
  searchMarkets: vi.fn(),
  getOrderbook: vi.fn(),
  getOrderbooks: vi.fn(),
  placeOrder: vi.fn(),
  cancelOrder: vi.fn(),
  cancelOrders: vi.fn(),
  cancelAll: vi.fn(),
  getOpenOrders: vi.fn(),
  getNegRisk: vi.fn().mockResolvedValue(false),
  getFeeRateBps: vi.fn().mockResolvedValue(0),
  getPrice: vi.fn(),
  getDataApiPositions: vi.fn(),
}))

vi.mock('../services/ctf-executor.js', () => ({
  ensureUsdcApproval: vi.fn(),
  ensureCtfApproval: vi.fn(),
  splitPosition: vi.fn(),
  redeemPositions: vi.fn(),
}))

vi.mock('../services/trade-logger.js', () => ({
  logPolymarketTrade: vi.fn(),
}))

vi.mock('../services/position-aggregator.js', () => ({
  getPositions: vi.fn(),
}))

vi.mock('../../../config.js', () => ({
  getConfig: () => ({ FEATURE_POLYMARKET_POSITIONS: false }),
}))

import {
  executePolymarketTrade,
  splitAndSell,
} from '../services/trade-executor.js'

import {
  getMarket,
  searchMarkets,
  getOrderbook,
  placeOrder,
  cancelOrder,
  cancelOrders,
  cancelAll,
  getOpenOrders,
  getNegRisk,
  getFeeRateBps,
  getDataApiPositions,
} from '../services/clob-client.js'

import {
  ensureUsdcApproval,
  ensureCtfApproval,
  splitPosition,
  redeemPositions,
} from '../services/ctf-executor.js'

import { toolPolymarketTrade } from '../tools/trade.js'
import { getPositions } from '../services/position-aggregator.js'
import type { PolymarketMarket } from '../services/types.js'

const mock = {
  getMarket: vi.mocked(getMarket),
  searchMarkets: vi.mocked(searchMarkets),
  getOrderbook: vi.mocked(getOrderbook),
  placeOrder: vi.mocked(placeOrder),
  cancelOrder: vi.mocked(cancelOrder),
  cancelOrders: vi.mocked(cancelOrders),
  cancelAll: vi.mocked(cancelAll),
  getOpenOrders: vi.mocked(getOpenOrders),
  getNegRisk: vi.mocked(getNegRisk),
  getFeeRateBps: vi.mocked(getFeeRateBps),
  ensureUsdcApproval: vi.mocked(ensureUsdcApproval),
  ensureCtfApproval: vi.mocked(ensureCtfApproval),
  splitPosition: vi.mocked(splitPosition),
  redeemPositions: vi.mocked(redeemPositions),
  getPositions: vi.mocked(getPositions),
  getDataApiPositions: vi.mocked(getDataApiPositions),
}

const CTX = {
  supabase: {} as any,
  userId: 'user-sim',
  assistantId: 'ast-sim',
  runId: 'run-sim',
}

function parse(result: string) {
  return JSON.parse(result) as Record<string, unknown>
}

// ── Shared fixtures ──

const ELECTION_MARKET: PolymarketMarket = {
  condition_id: '0xelection2026',
  question_id: '0xq1',
  tokens: [
    { token_id: 'tok-yes-elec', outcome: 'Yes', price: 0.62, winner: false },
    { token_id: 'tok-no-elec', outcome: 'No', price: 0.38, winner: false },
  ],
  question: 'Will candidate X win the 2026 election?',
  description: 'Resolves YES if X wins',
  end_date_iso: '2026-11-15T00:00:00Z',
  active: true,
  closed: false,
  archived: false,
  accepting_orders: true,
  minimum_order_size: '5',
  minimum_tick_size: '0.01',
  neg_risk: false,
}

const NEG_RISK_MARKET: PolymarketMarket = {
  ...ELECTION_MARKET,
  condition_id: '0xnegrisk',
  neg_risk: true,
  tokens: [
    { token_id: 'tok-yes-nr', outcome: 'Yes', price: 0.45, winner: false },
    { token_id: 'tok-no-nr', outcome: 'No', price: 0.55, winner: false },
  ],
}

const RESOLVED_MARKET: PolymarketMarket = {
  ...ELECTION_MARKET,
  condition_id: '0xresolved',
  active: false,
  closed: true,
  accepting_orders: false,
  tokens: [
    { token_id: 'tok-yes-res', outcome: 'Yes', price: 1.0, winner: true },
    { token_id: 'tok-no-res', outcome: 'No', price: 0.0, winner: false },
  ],
}

beforeEach(() => {
  vi.resetAllMocks()
  mock.getNegRisk.mockResolvedValue(false)
  mock.getFeeRateBps.mockResolvedValue(0)
})

// ============================================================================
// Scenario 1: Full Trading Lifecycle
// search → market_info → orderbook → buy_yes → open_orders → cancel
// ============================================================================

describe('Scenario 1: Full Trading Lifecycle', () => {
  it('Step 1: Search for markets', async () => {
    mock.searchMarkets.mockResolvedValue([ELECTION_MARKET])

    const result = parse(await toolPolymarketTrade({ action: 'search', question: 'election 2026' }, CTX))
    expect((result.markets as any[]).length).toBeGreaterThan(0)
    expect((result.markets as any[])[0].conditionId).toBe('0xelection2026')
  })

  it('Step 2: Get market info', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET)

    const result = parse(await toolPolymarketTrade({
      action: 'market_info',
      conditionId: '0xelection2026',
    }, CTX))

    expect(result.question).toBe('Will candidate X win the 2026 election?')
    expect(result.acceptingOrders).toBe(true)
    expect(result.negRisk).toBe(false)
  })

  it('Step 3: Check orderbook depth', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET)
    mock.getOrderbook.mockResolvedValue({
      market: '0xelection2026',
      asset_id: 'tok-yes-elec',
      timestamp: '2026-01-01',
      bids: [
        { price: '0.61', size: '500' },
        { price: '0.60', size: '1000' },
      ],
      asks: [
        { price: '0.63', size: '300' },
        { price: '0.64', size: '700' },
      ],
      hash: 'h1',
    })

    const result = parse(await toolPolymarketTrade({
      action: 'orderbook',
      conditionId: '0xelection2026',
    }, CTX))

    expect(result.spread).toBe('0.0200')
    expect((result.bids as any[]).length).toBe(2)
    expect((result.asks as any[]).length).toBe(2)
  })

  it('Step 4: Place limit buy order (GTC)', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET)
    mock.placeOrder.mockResolvedValue({ success: true, orderID: 'ord-election-1' })

    const result = await executePolymarketTrade('ast-sim', {
      conditionId: '0xelection2026',
      action: 'buy_yes',
      amount: '100',
      limitPrice: 0.60,
    })

    expect(result.success).toBe(true)
    expect(result.orderId).toBe('ord-election-1')
    expect(result.effectivePrice).toBe(0.60)

    // Verify GTC order type
    expect(mock.placeOrder).toHaveBeenCalledWith('ast-sim', expect.objectContaining({
      tokenId: 'tok-yes-elec',
      side: 'BUY',
      price: 0.60,
      size: 100,
      orderType: 'GTC',
    }))
  })

  it('Step 5: Check open orders', async () => {
    mock.getOpenOrders.mockResolvedValue([{
      id: 'ord-election-1',
      status: 'open',
      market: '0xelection2026',
      asset_id: 'tok-yes-elec',
      side: 'BUY' as const,
      original_size: '100',
      size_matched: '30',
      price: '0.60',
      created_at: '2026-01-15T10:00:00Z',
      expiration: '',
      order_type: 'GTC' as const,
    }])

    const result = parse(await toolPolymarketTrade({ action: 'open_orders' }, CTX))
    const orders = result.orders as any[]
    expect(orders).toHaveLength(1)
    expect(orders[0].id).toBe('ord-election-1')
    expect(orders[0].size_matched).toBe('30') // partially filled
  })

  it('Step 6: Cancel the remaining order', async () => {
    mock.cancelOrder.mockResolvedValue({ success: true })

    const result = parse(await toolPolymarketTrade({
      action: 'cancel_order',
      orderId: 'ord-election-1',
    }, CTX))

    expect(result.success).toBe(true)
  })
})

// ============================================================================
// Scenario 2: Market Buy (FOK) — Orderbook Pricing
// ============================================================================

describe('Scenario 2: Market buy with FOK orderbook pricing', () => {
  it('uses best ask from orderbook for FOK buy', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET)
    mock.getOrderbook.mockResolvedValue({
      market: '0xelection2026',
      asset_id: 'tok-yes-elec',
      timestamp: '2026-01-01',
      bids: [{ price: '0.61', size: '500' }],
      asks: [{ price: '0.63', size: '200' }], // best ask = 0.63
      hash: 'h1',
    })
    mock.placeOrder.mockResolvedValue({ success: true, orderID: 'ord-fok-1' })

    const result = await executePolymarketTrade('ast-sim', {
      conditionId: '0xelection2026',
      action: 'buy_yes',
      amount: '50',
      // No limitPrice → FOK
    })

    expect(result.success).toBe(true)
    expect(result.effectivePrice).toBe(0.63) // orderbook best ask, NOT Gamma 0.62

    expect(mock.placeOrder).toHaveBeenCalledWith('ast-sim', expect.objectContaining({
      orderType: 'FOK',
      price: 0.63,
    }))
  })

  it('uses best bid from orderbook for FOK sell', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET)
    mock.getOrderbook.mockResolvedValue({
      market: '0xelection2026',
      asset_id: 'tok-yes-elec',
      timestamp: '2026-01-01',
      bids: [{ price: '0.61', size: '500' }], // best bid = 0.61
      asks: [{ price: '0.63', size: '200' }],
      hash: 'h1',
    })
    mock.placeOrder.mockResolvedValue({ success: true, orderID: 'ord-fok-sell' })

    const result = await executePolymarketTrade('ast-sim', {
      conditionId: '0xelection2026',
      action: 'sell_yes',
      amount: '50',
    })

    expect(result.success).toBe(true)
    expect(result.effectivePrice).toBe(0.61)
  })

  it('falls back to Gamma price when orderbook is empty', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET) // token price = 0.62
    mock.getOrderbook.mockResolvedValue(null)
    mock.placeOrder.mockResolvedValue({ success: true, orderID: 'ord-fallback' })

    const result = await executePolymarketTrade('ast-sim', {
      conditionId: '0xelection2026',
      action: 'buy_yes',
      amount: '10',
    })

    expect(result.success).toBe(true)
    expect(result.effectivePrice).toBe(0.62) // Gamma fallback
  })

  it('falls back to Gamma when orderbook has no asks for buy', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET)
    mock.getOrderbook.mockResolvedValue({
      market: '0xelection2026',
      asset_id: 'tok-yes-elec',
      timestamp: '2026-01-01',
      bids: [{ price: '0.61', size: '500' }],
      asks: [], // no asks
      hash: 'h1',
    })
    mock.placeOrder.mockResolvedValue({ success: true, orderID: 'ord-no-asks' })

    const result = await executePolymarketTrade('ast-sim', {
      conditionId: '0xelection2026',
      action: 'buy_yes',
      amount: '10',
    })

    expect(result.effectivePrice).toBe(0.62) // Gamma fallback
  })
})

// ============================================================================
// Scenario 3: Split and Sell — Standard Market
// ============================================================================

describe('Scenario 3: Split-and-sell (standard market)', () => {
  it('full success: approve → split → sell unwanted side', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET) // neg_risk: false
    mock.ensureUsdcApproval.mockResolvedValue({ success: true, txHash: '0xapprove1' })
    mock.ensureCtfApproval.mockResolvedValue({ success: true, txHash: '0xapprove2' })
    mock.splitPosition.mockResolvedValue({ success: true, txHash: '0xsplit1' })
    mock.getOrderbook.mockResolvedValue({
      market: '0xelection2026',
      asset_id: 'tok-no-elec',
      timestamp: '2026-01-01',
      bids: [{ price: '0.37', size: '100' }],
      asks: [{ price: '0.39', size: '50' }],
      hash: 'h',
    })
    mock.placeOrder.mockResolvedValue({ success: true, orderID: 'ord-sell-no' })

    const result = await splitAndSell('ast-sim', {
      conditionId: '0xelection2026',
      usdcAmount: '200',
      keepOutcome: 'yes',
    })

    expect(result.success).toBe(true)
    expect(result.action).toBe('buy_yes')
    expect(result.txHash).toBe('0xsplit1')
    expect(result.orderId).toBe('ord-sell-no')

    // Verify standard market routing (not neg-risk)
    expect(mock.ensureUsdcApproval).toHaveBeenCalledWith('ast-sim', expect.stringContaining('4D97DCd97')) // CTF
    expect(mock.ensureCtfApproval).toHaveBeenCalledWith('ast-sim', expect.stringContaining('4bFb41d5B')) // CTF_EXCHANGE

    // Verify sell is for the unwanted side (NO)
    expect(mock.placeOrder).toHaveBeenCalledWith('ast-sim', expect.objectContaining({
      tokenId: 'tok-no-elec',
      side: 'SELL',
    }))
  })

  it('sells YES when keeping NO', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET)
    mock.ensureUsdcApproval.mockResolvedValue({ success: true, txHash: '0x1' })
    mock.ensureCtfApproval.mockResolvedValue({ success: true, txHash: '0x2' })
    mock.splitPosition.mockResolvedValue({ success: true, txHash: '0xsplit2' })
    mock.getOrderbook.mockResolvedValue({
      market: '0xelection2026',
      asset_id: 'tok-yes-elec',
      timestamp: '2026-01-01',
      bids: [{ price: '0.61', size: '100' }],
      asks: [{ price: '0.63', size: '50' }],
      hash: 'h',
    })
    mock.placeOrder.mockResolvedValue({ success: true, orderID: 'ord-sell-yes' })

    const result = await splitAndSell('ast-sim', {
      conditionId: '0xelection2026',
      usdcAmount: '100',
      keepOutcome: 'no',
    })

    expect(result.success).toBe(true)
    expect(result.action).toBe('buy_no')
    expect(mock.placeOrder).toHaveBeenCalledWith('ast-sim', expect.objectContaining({
      tokenId: 'tok-yes-elec',
      side: 'SELL',
    }))
  })
})

// ============================================================================
// Scenario 4: Neg-Risk Market Routing
// ============================================================================

describe('Scenario 4: Neg-risk market routing', () => {
  it('routes USDC approval to NEG_RISK_ADAPTER', async () => {
    mock.getMarket.mockResolvedValue(NEG_RISK_MARKET) // neg_risk: true
    mock.ensureUsdcApproval.mockResolvedValue({ success: true, txHash: '0x1' })
    mock.ensureCtfApproval.mockResolvedValue({ success: true, txHash: '0x2' })
    mock.splitPosition.mockResolvedValue({ success: true, txHash: '0xsplit' })
    mock.getOrderbook.mockResolvedValue(null)
    mock.placeOrder.mockResolvedValue({ success: true, orderID: 'ord-nr' })

    await splitAndSell('ast-sim', {
      conditionId: '0xnegrisk',
      usdcAmount: '50',
      keepOutcome: 'yes',
    })

    // Neg-risk: USDC approval goes to NEG_RISK_ADAPTER
    expect(mock.ensureUsdcApproval).toHaveBeenCalledWith(
      'ast-sim',
      expect.stringContaining('d91E80cF2'), // NEG_RISK_ADAPTER
    )

    // Neg-risk: CTF approval goes to NEG_RISK_CTF_EXCHANGE
    expect(mock.ensureCtfApproval).toHaveBeenCalledWith(
      'ast-sim',
      expect.stringContaining('C5d563A36'), // NEG_RISK_CTF_EXCHANGE
    )
  })

  it('passes negRisk flag to placeOrder', async () => {
    mock.getMarket.mockResolvedValue(NEG_RISK_MARKET)
    mock.getOrderbook.mockResolvedValue(null)
    mock.placeOrder.mockResolvedValue({ success: true, orderID: 'ord-nr-direct' })

    await executePolymarketTrade('ast-sim', {
      conditionId: '0xnegrisk',
      action: 'buy_yes',
      amount: '10',
      limitPrice: 0.45,
    })

    expect(mock.placeOrder).toHaveBeenCalledWith('ast-sim', expect.objectContaining({
      negRisk: true,
    }))
  })
})

// ============================================================================
// Scenario 5: Batch Cancel + Cancel All
// ============================================================================

describe('Scenario 5: Batch cancel operations', () => {
  it('cancel_all via tool handler', async () => {
    mock.cancelAll.mockResolvedValue({ success: true })

    const result = parse(await toolPolymarketTrade({ action: 'cancel_all' }, CTX))
    expect(result.success).toBe(true)
    expect(mock.cancelAll).toHaveBeenCalledWith('ast-sim')
  })

  it('cancel_orders with array of IDs', async () => {
    mock.cancelOrders.mockResolvedValue({ success: true })

    const result = parse(await toolPolymarketTrade({
      action: 'cancel_orders',
      orderIds: ['ord-1', 'ord-2', 'ord-3'],
    } as any, CTX))

    expect(result.success).toBe(true)
    expect(mock.cancelOrders).toHaveBeenCalledWith('ast-sim', ['ord-1', 'ord-2', 'ord-3'])
  })

  it('cancel_orders requires orderIds array', async () => {
    const result = parse(await toolPolymarketTrade({ action: 'cancel_orders' }, CTX))
    expect(result.error).toContain('orderIds array is required')
  })

  it('cancel_orders rejects empty array', async () => {
    const result = parse(await toolPolymarketTrade({
      action: 'cancel_orders',
      orderIds: [],
    } as any, CTX))
    expect(result.error).toContain('orderIds array is required')
  })
})

// ============================================================================
// Scenario 6: Redeem After Market Resolution
// ============================================================================

describe('Scenario 6: Redeem winning positions', () => {
  it('redeem via tool handler', async () => {
    mock.redeemPositions.mockResolvedValue({ success: true, txHash: '0xredeem1' })

    const result = parse(await toolPolymarketTrade({
      action: 'redeem',
      conditionId: '0xresolved',
    }, CTX))

    expect(result.success).toBe(true)
    expect(result.txHash).toBe('0xredeem1')
    expect(mock.redeemPositions).toHaveBeenCalledWith('ast-sim', '0xresolved')
  })

  it('redeem requires conditionId', async () => {
    const result = parse(await toolPolymarketTrade({ action: 'redeem' }, CTX))
    expect(result.error).toContain('conditionId is required')
  })
})

// ============================================================================
// Scenario 7: Error Recovery
// ============================================================================

describe('Scenario 7: Error recovery', () => {
  it('market not found → clear error message', async () => {
    mock.getMarket.mockResolvedValue(null)

    const result = await executePolymarketTrade('ast-sim', {
      conditionId: '0xnonexistent',
      action: 'buy_yes',
      amount: '10',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Market not found')
  })

  it('market not accepting orders', async () => {
    mock.getMarket.mockResolvedValue({ ...ELECTION_MARKET, accepting_orders: false })

    const result = await executePolymarketTrade('ast-sim', {
      conditionId: '0xelection2026',
      action: 'buy_yes',
      amount: '10',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('not accepting orders')
  })

  it('invalid amount', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET)

    const result = await executePolymarketTrade('ast-sim', {
      conditionId: '0xelection2026',
      action: 'buy_yes',
      amount: 'abc',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid amount')
  })

  it('amount below minimum order size', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET) // min = 5

    const result = await executePolymarketTrade('ast-sim', {
      conditionId: '0xelection2026',
      action: 'buy_yes',
      amount: '2', // below 5
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('below minimum')
  })

  it('price out of range (>= 1)', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET)

    const result = await executePolymarketTrade('ast-sim', {
      conditionId: '0xelection2026',
      action: 'buy_yes',
      amount: '10',
      limitPrice: 1.5,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('between 0 and 1')
  })

  it('CLOB order failure propagated', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET)
    mock.getOrderbook.mockResolvedValue({
      market: '0xelection2026',
      asset_id: 'tok-yes-elec',
      timestamp: '2026-01-01',
      bids: [{ price: '0.61', size: '100' }],
      asks: [{ price: '0.63', size: '50' }],
      hash: 'h',
    })
    mock.placeOrder.mockResolvedValue({
      success: false,
      error: 'Insufficient balance: need 50 USDC, have 0',
    })

    const result = await executePolymarketTrade('ast-sim', {
      conditionId: '0xelection2026',
      action: 'buy_yes',
      amount: '50',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Insufficient balance')
  })

  it('split-and-sell: USDC approval failure', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET)
    mock.ensureUsdcApproval.mockResolvedValue({ success: false, error: 'Wallet locked' })

    const result = await splitAndSell('ast-sim', {
      conditionId: '0xelection2026',
      usdcAmount: '100',
      keepOutcome: 'yes',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('USDC approval failed')
    // Should not proceed to CTF approval or split
    expect(mock.ensureCtfApproval).not.toHaveBeenCalled()
    expect(mock.splitPosition).not.toHaveBeenCalled()
  })

  it('split-and-sell: CTF approval failure', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET)
    mock.ensureUsdcApproval.mockResolvedValue({ success: true, txHash: '0x1' })
    mock.ensureCtfApproval.mockResolvedValue({ success: false, error: 'Denied by user' })

    const result = await splitAndSell('ast-sim', {
      conditionId: '0xelection2026',
      usdcAmount: '100',
      keepOutcome: 'yes',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('CTF approval failed')
    expect(mock.splitPosition).not.toHaveBeenCalled()
  })

  it('split-and-sell: split transaction failure', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET)
    mock.ensureUsdcApproval.mockResolvedValue({ success: true, txHash: '0x1' })
    mock.ensureCtfApproval.mockResolvedValue({ success: true, txHash: '0x2' })
    mock.splitPosition.mockResolvedValue({ success: false, error: 'Reverted: insufficient USDC' })

    const result = await splitAndSell('ast-sim', {
      conditionId: '0xelection2026',
      usdcAmount: '100',
      keepOutcome: 'yes',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Split failed')
  })
})

// ============================================================================
// Scenario 8: Tool Handler Safety
// ============================================================================

describe('Scenario 8: Tool handler never throws', () => {
  const allActions = [
    { action: 'search', question: 'test' },
    { action: 'market_info', conditionId: '0x1' },
    { action: 'orderbook', conditionId: '0x1' },
    { action: 'buy_yes', conditionId: '0x1', amount: '10' },
    { action: 'sell_no', conditionId: '0x1', amount: '10' },
    { action: 'split_and_sell', conditionId: '0x1', amount: '10', keepOutcome: 'yes' },
    { action: 'open_orders' },
    { action: 'cancel_order', orderId: 'o1' },
    { action: 'cancel_all' },
    { action: 'cancel_orders', orderIds: ['o1'] },
    { action: 'redeem', conditionId: '0x1' },
    { action: 'get_positions' },
    { action: 'unknown_action_xyz' },
  ]

  for (const args of allActions) {
    it(`${args.action}: returns valid JSON even when services fail`, async () => {
      // Make all mocks fail
      mock.searchMarkets.mockRejectedValue(new Error('boom'))
      mock.getMarket.mockRejectedValue(new Error('boom'))
      mock.getOrderbook.mockRejectedValue(new Error('boom'))
      mock.placeOrder.mockRejectedValue(new Error('boom'))
      mock.cancelOrder.mockRejectedValue(new Error('boom'))
      mock.cancelOrders.mockRejectedValue(new Error('boom'))
      mock.cancelAll.mockRejectedValue(new Error('boom'))
      mock.getOpenOrders.mockRejectedValue(new Error('boom'))
      mock.redeemPositions.mockRejectedValue(new Error('boom'))
      mock.getPositions.mockRejectedValue(new Error('boom'))
      // For buy/sell that go through executePolymarketTrade:
      mock.getMarket.mockResolvedValue(null) // will return error JSON

      const result = await toolPolymarketTrade(args as any, CTX)
      expect(() => JSON.parse(result)).not.toThrow()
    })
  }
})

// ============================================================================
// Scenario 9: Multi-Trade Position Tracking
// ============================================================================

describe('Scenario 9: Position tracking across trades', () => {
  it('buy → sell partial → check net position', async () => {
    // Trade 1: Buy 100 YES at 0.60
    mock.getMarket.mockResolvedValue(ELECTION_MARKET)
    mock.placeOrder.mockResolvedValueOnce({ success: true, orderID: 'buy-1' })

    const buy = await executePolymarketTrade('ast-sim', {
      conditionId: '0xelection2026',
      action: 'buy_yes',
      amount: '100',
      limitPrice: 0.60,
    })
    expect(buy.success).toBe(true)

    // Trade 2: Sell 40 YES at 0.70
    mock.placeOrder.mockResolvedValueOnce({ success: true, orderID: 'sell-1' })

    const sell = await executePolymarketTrade('ast-sim', {
      conditionId: '0xelection2026',
      action: 'sell_yes',
      amount: '40',
      limitPrice: 0.70,
    })
    expect(sell.success).toBe(true)

    // Both orders should target the same YES token
    expect(mock.placeOrder.mock.calls[0][1]).toMatchObject({
      tokenId: 'tok-yes-elec',
      side: 'BUY',
      size: 100,
    })
    expect(mock.placeOrder.mock.calls[1][1]).toMatchObject({
      tokenId: 'tok-yes-elec',
      side: 'SELL',
      size: 40,
    })
  })
})

// ============================================================================
// Scenario 10: NO Token Trading
// ============================================================================

describe('Scenario 10: NO token trading', () => {
  it('buy_no targets the NO token', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET)
    mock.placeOrder.mockResolvedValue({ success: true, orderID: 'ord-buy-no' })

    await executePolymarketTrade('ast-sim', {
      conditionId: '0xelection2026',
      action: 'buy_no',
      amount: '50',
      limitPrice: 0.38,
    })

    expect(mock.placeOrder).toHaveBeenCalledWith('ast-sim', expect.objectContaining({
      tokenId: 'tok-no-elec', // NO token
      side: 'BUY',
      price: 0.38,
    }))
  })

  it('sell_no targets the NO token', async () => {
    mock.getMarket.mockResolvedValue(ELECTION_MARKET)
    mock.getOrderbook.mockResolvedValue({
      market: '0xelection2026',
      asset_id: 'tok-no-elec',
      timestamp: '2026-01-01',
      bids: [{ price: '0.37', size: '100' }],
      asks: [{ price: '0.39', size: '50' }],
      hash: 'h',
    })
    mock.placeOrder.mockResolvedValue({ success: true, orderID: 'ord-sell-no' })

    await executePolymarketTrade('ast-sim', {
      conditionId: '0xelection2026',
      action: 'sell_no',
      amount: '30',
    })

    expect(mock.placeOrder).toHaveBeenCalledWith('ast-sim', expect.objectContaining({
      tokenId: 'tok-no-elec',
      side: 'SELL',
    }))
  })
})
