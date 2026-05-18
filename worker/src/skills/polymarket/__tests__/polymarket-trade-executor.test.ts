/**
 * Trade executor tests — orchestration logic with mocked CLOB + CTF.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the clob-client and ctf-executor before importing trade-executor
vi.mock('../services/clob-client.js', () => ({
  getMarket: vi.fn(),
  getOrderbook: vi.fn(),
  placeOrder: vi.fn(),
  getNegRisk: vi.fn().mockResolvedValue(false),
  getFeeRateBps: vi.fn().mockResolvedValue(0),
}))

vi.mock('../services/ctf-executor.js', () => ({
  ensureUsdcApproval: vi.fn(),
  ensureCtfApproval: vi.fn(),
  splitPosition: vi.fn(),
}))

import { executePolymarketTrade, splitAndSell } from '../services/trade-executor.js'
import { getMarket, getOrderbook, placeOrder } from '../services/clob-client.js'
import { ensureUsdcApproval, ensureCtfApproval, splitPosition } from '../services/ctf-executor.js'
import type { PolymarketMarket } from '../services/types.js'

const mockGetMarket = vi.mocked(getMarket)
const mockGetOrderbook = vi.mocked(getOrderbook)
const mockPlaceOrder = vi.mocked(placeOrder)
const mockEnsureUsdcApproval = vi.mocked(ensureUsdcApproval)
const mockEnsureCtfApproval = vi.mocked(ensureCtfApproval)
const mockSplitPosition = vi.mocked(splitPosition)

const MOCK_MARKET: PolymarketMarket = {
  condition_id: '0xabc123',
  question_id: '0xdef456',
  tokens: [
    { token_id: 'token-yes-123', outcome: 'Yes', price: 0.65, winner: false },
    { token_id: 'token-no-456', outcome: 'No', price: 0.35, winner: false },
  ],
  question: 'Will it rain tomorrow?',
  description: 'Resolves YES if it rains',
  end_date_iso: '2026-12-31T00:00:00Z',
  active: true,
  closed: false,
  archived: false,
  accepting_orders: true,
  minimum_order_size: '1',
  minimum_tick_size: '0.01',
  neg_risk: false,
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ============================================================================
// executePolymarketTrade
// ============================================================================

describe('executePolymarketTrade', () => {
  it('returns error when market not found', async () => {
    mockGetMarket.mockResolvedValue(null)
    const result = await executePolymarketTrade('ast-1', {
      conditionId: '0xabc',
      action: 'buy_yes',
      amount: '10',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Market not found')
  })

  it('returns error when market not accepting orders', async () => {
    mockGetMarket.mockResolvedValue({ ...MOCK_MARKET, accepting_orders: false })
    const result = await executePolymarketTrade('ast-1', {
      conditionId: '0xabc',
      action: 'buy_yes',
      amount: '10',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('not accepting orders')
  })

  it('returns error for invalid price (>= 1)', async () => {
    mockGetMarket.mockResolvedValue(MOCK_MARKET)
    const result = await executePolymarketTrade('ast-1', {
      conditionId: '0xabc',
      action: 'buy_yes',
      amount: '10',
      limitPrice: 1.5,
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('between 0 and 1')
  })

  it('returns error for price <= 0', async () => {
    mockGetMarket.mockResolvedValue(MOCK_MARKET)
    const result = await executePolymarketTrade('ast-1', {
      conditionId: '0xabc',
      action: 'buy_yes',
      amount: '10',
      limitPrice: -0.5,
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('between 0 and 1')
  })

  it('returns error for amount below minimum', async () => {
    mockGetMarket.mockResolvedValue(MOCK_MARKET)
    const result = await executePolymarketTrade('ast-1', {
      conditionId: '0xabc',
      action: 'buy_yes',
      amount: '0.5',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('below minimum')
  })

  it('returns error for invalid amount', async () => {
    mockGetMarket.mockResolvedValue(MOCK_MARKET)
    const result = await executePolymarketTrade('ast-1', {
      conditionId: '0xabc',
      action: 'buy_yes',
      amount: 'not-a-number',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid amount')
  })

  it('places BUY GTC order for buy_yes with limit price', async () => {
    mockGetMarket.mockResolvedValue(MOCK_MARKET)
    mockPlaceOrder.mockResolvedValue({ success: true, orderID: 'order-123' })

    const result = await executePolymarketTrade('ast-1', {
      conditionId: '0xabc',
      action: 'buy_yes',
      amount: '50',
      limitPrice: 0.60,
    })

    expect(result.success).toBe(true)
    expect(result.orderId).toBe('order-123')
    expect(result.effectivePrice).toBe(0.60)
    expect(mockPlaceOrder).toHaveBeenCalledWith('ast-1', expect.objectContaining({
      tokenId: 'token-yes-123',
      side: 'BUY',
      price: 0.60,
      size: 50,
      orderType: 'GTC',
      negRisk: false,
    }))
  })

  it('places BUY FOK order for buy_yes without limit price (orderbook price)', async () => {
    mockGetMarket.mockResolvedValue(MOCK_MARKET)
    mockGetOrderbook.mockResolvedValue({
      market: '0xabc',
      asset_id: 'token-yes-123',
      timestamp: '2026-01-01',
      bids: [{ price: '0.63', size: '100' }],
      asks: [{ price: '0.67', size: '50' }],
      hash: 'abc',
    })
    mockPlaceOrder.mockResolvedValue({ success: true, orderID: 'order-456' })

    const result = await executePolymarketTrade('ast-1', {
      conditionId: '0xabc',
      action: 'buy_yes',
      amount: '10',
    })

    expect(result.success).toBe(true)
    expect(mockPlaceOrder).toHaveBeenCalledWith('ast-1', expect.objectContaining({
      orderType: 'FOK',
      price: 0.67, // best ask from orderbook (not stale Gamma price 0.65)
    }))
  })

  it('falls back to Gamma price when orderbook empty', async () => {
    mockGetMarket.mockResolvedValue(MOCK_MARKET)
    mockGetOrderbook.mockResolvedValue(null)
    mockPlaceOrder.mockResolvedValue({ success: true, orderID: 'order-fallback' })

    const result = await executePolymarketTrade('ast-1', {
      conditionId: '0xabc',
      action: 'buy_yes',
      amount: '10',
    })

    expect(result.success).toBe(true)
    expect(mockPlaceOrder).toHaveBeenCalledWith('ast-1', expect.objectContaining({
      orderType: 'FOK',
      price: 0.65, // fallback to Gamma token.price
    }))
  })

  it('places SELL order for sell_no', async () => {
    mockGetMarket.mockResolvedValue(MOCK_MARKET)
    mockGetOrderbook.mockResolvedValue({
      market: '0xabc',
      asset_id: 'token-no-456',
      timestamp: '2026-01-01',
      bids: [{ price: '0.34', size: '100' }],
      asks: [{ price: '0.36', size: '50' }],
      hash: 'abc',
    })
    mockPlaceOrder.mockResolvedValue({ success: true, orderID: 'order-789' })

    const result = await executePolymarketTrade('ast-1', {
      conditionId: '0xabc',
      action: 'sell_no',
      amount: '25',
      limitPrice: 0.40,
    })

    expect(result.success).toBe(true)
    expect(mockPlaceOrder).toHaveBeenCalledWith('ast-1', expect.objectContaining({
      tokenId: 'token-no-456',
      side: 'SELL',
      price: 0.40,
    }))
  })

  it('returns error when CLOB order fails', async () => {
    mockGetMarket.mockResolvedValue(MOCK_MARKET)
    mockGetOrderbook.mockResolvedValue({
      market: '0xabc',
      asset_id: 'token-yes-123',
      timestamp: '2026-01-01',
      bids: [{ price: '0.63', size: '100' }],
      asks: [{ price: '0.67', size: '50' }],
      hash: 'abc',
    })
    mockPlaceOrder.mockResolvedValue({ success: false, error: 'Insufficient funds' })

    const result = await executePolymarketTrade('ast-1', {
      conditionId: '0xabc',
      action: 'buy_yes',
      amount: '10',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Insufficient funds')
  })
})

// ============================================================================
// splitAndSell
// ============================================================================

describe('splitAndSell', () => {
  it('fails if market not found', async () => {
    mockGetMarket.mockResolvedValue(null)

    const result = await splitAndSell('ast-1', {
      conditionId: '0xabc',
      usdcAmount: '100',
      keepOutcome: 'yes',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Market not found')
  })

  it('fails if USDC approval fails', async () => {
    mockGetMarket.mockResolvedValue(MOCK_MARKET)
    mockEnsureUsdcApproval.mockResolvedValue({ success: false, error: 'No wallet' })

    const result = await splitAndSell('ast-1', {
      conditionId: '0xabc',
      usdcAmount: '100',
      keepOutcome: 'yes',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('USDC approval failed')
  })

  it('fails if CTF approval fails', async () => {
    mockGetMarket.mockResolvedValue(MOCK_MARKET)
    mockEnsureUsdcApproval.mockResolvedValue({ success: true, txHash: '0x1' })
    mockEnsureCtfApproval.mockResolvedValue({ success: false, error: 'Denied' })

    const result = await splitAndSell('ast-1', {
      conditionId: '0xabc',
      usdcAmount: '100',
      keepOutcome: 'yes',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('CTF approval failed')
  })

  it('fails if split fails', async () => {
    mockGetMarket.mockResolvedValue(MOCK_MARKET)
    mockEnsureUsdcApproval.mockResolvedValue({ success: true, txHash: '0x1' })
    mockEnsureCtfApproval.mockResolvedValue({ success: true, txHash: '0x2' })
    mockSplitPosition.mockResolvedValue({ success: false, error: 'Reverted' })

    const result = await splitAndSell('ast-1', {
      conditionId: '0xabc',
      usdcAmount: '100',
      keepOutcome: 'yes',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Split failed')
  })

  it('full success: approves, splits, sells NO when keeping YES', async () => {
    mockGetMarket.mockResolvedValue(MOCK_MARKET)
    mockEnsureUsdcApproval.mockResolvedValue({ success: true, txHash: '0x1' })
    mockEnsureCtfApproval.mockResolvedValue({ success: true, txHash: '0x2' })
    mockSplitPosition.mockResolvedValue({ success: true, txHash: '0xsplit' })
    mockGetOrderbook.mockResolvedValue({
      market: '0xabc', asset_id: 'token-no-456', timestamp: '2026-01-01',
      bids: [{ price: '0.34', size: '100' }], asks: [{ price: '0.36', size: '50' }], hash: 'abc',
    })
    mockPlaceOrder.mockResolvedValue({ success: true, orderID: 'order-sell-no' })

    const result = await splitAndSell('ast-1', {
      conditionId: '0xabc',
      usdcAmount: '100',
      keepOutcome: 'yes',
    })

    expect(result.success).toBe(true)
    expect(result.action).toBe('buy_yes')
    expect(result.txHash).toBe('0xsplit')
    expect(result.orderId).toBe('order-sell-no')

    // Should sell NO tokens (the unwanted side)
    expect(mockPlaceOrder).toHaveBeenCalledWith('ast-1', expect.objectContaining({
      tokenId: 'token-no-456',
      side: 'SELL',
    }))
  })

  it('sells YES when keeping NO', async () => {
    mockGetMarket.mockResolvedValue(MOCK_MARKET)
    mockEnsureUsdcApproval.mockResolvedValue({ success: true, txHash: '0x1' })
    mockEnsureCtfApproval.mockResolvedValue({ success: true, txHash: '0x2' })
    mockSplitPosition.mockResolvedValue({ success: true, txHash: '0xsplit' })
    mockGetOrderbook.mockResolvedValue({
      market: '0xabc', asset_id: 'token-yes-123', timestamp: '2026-01-01',
      bids: [{ price: '0.63', size: '100' }], asks: [{ price: '0.67', size: '50' }], hash: 'abc',
    })
    mockPlaceOrder.mockResolvedValue({ success: true, orderID: 'order-sell-yes' })

    const result = await splitAndSell('ast-1', {
      conditionId: '0xabc',
      usdcAmount: '50',
      keepOutcome: 'no',
    })

    expect(result.success).toBe(true)
    expect(result.action).toBe('buy_no')

    // Should sell YES tokens
    expect(mockPlaceOrder).toHaveBeenCalledWith('ast-1', expect.objectContaining({
      tokenId: 'token-yes-123',
      side: 'SELL',
    }))
  })
})
