/**
 * E2E tool execution tests — calls toolPolymarketTrade directly with mocked services.
 *
 * Verifies:
 *   - All 10 actions produce valid JSON responses
 *   - Input validation (missing params → error JSON, not throw)
 *   - Correct service delegation (search → searchMarkets, buy_yes → executePolymarketTrade, etc.)
 *   - Unknown action → helpful error
 *   - Tool never throws (always returns JSON string)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the entire polymarket service barrel
vi.mock('../services/index.js', () => ({
  searchMarkets: vi.fn(),
  getMarket: vi.fn(),
  getOrderbook: vi.fn(),
  getOpenOrders: vi.fn(),
  cancelOrder: vi.fn(),
  cancelOrders: vi.fn(),
  cancelAll: vi.fn(),
  redeemPositions: vi.fn(),
  executePolymarketTrade: vi.fn(),
  splitAndSell: vi.fn(),
}))

import { toolPolymarketTrade } from '../tools/trade.js'
import {
  searchMarkets,
  getMarket,
  getOrderbook,
  getOpenOrders,
  cancelOrder,
  executePolymarketTrade,
  splitAndSell,
} from '../services/index.js'
import type { ToolContext } from '../tools/types.js'

const mockSearchMarkets = vi.mocked(searchMarkets)
const mockGetMarket = vi.mocked(getMarket)
const mockGetOrderbook = vi.mocked(getOrderbook)
const mockGetOpenOrders = vi.mocked(getOpenOrders)
const mockCancelOrder = vi.mocked(cancelOrder)
const mockExecuteTrade = vi.mocked(executePolymarketTrade)
const mockSplitAndSell = vi.mocked(splitAndSell)

const CTX: ToolContext = {
  supabase: {} as any,
  userId: 'user-123',
  assistantId: 'ast-456',
  runId: 'run-789',
}

function parse(result: string): Record<string, unknown> {
  return JSON.parse(result) as Record<string, unknown>
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ============================================================================
// search
// ============================================================================

describe('action: search', () => {
  it('returns markets from searchMarkets', async () => {
    mockSearchMarkets.mockResolvedValue([
      {
        condition_id: '0xabc',
        question_id: '0xdef',
        tokens: [
          { token_id: 't1', outcome: 'Yes', price: 0.7, winner: false },
          { token_id: 't2', outcome: 'No', price: 0.3, winner: false },
        ],
        question: 'Will it rain?',
        description: '',
        end_date_iso: '2026-12-31',
        active: true,
        closed: false,
        archived: false,
        accepting_orders: true,
        minimum_order_size: '1',
        minimum_tick_size: '0.01',
        neg_risk: false,
      },
    ])

    const result = parse(await toolPolymarketTrade({ action: 'search', question: 'rain' }, CTX))
    expect(result.markets).toHaveLength(1)
    const market = (result.markets as any[])[0]
    expect(market.conditionId).toBe('0xabc')
    expect(market.yesPrice).toBe(0.7)
    expect(market.noPrice).toBe(0.3)
    expect(mockSearchMarkets).toHaveBeenCalledWith('rain', 5)
  })

  it('returns error if question missing', async () => {
    const result = parse(await toolPolymarketTrade({ action: 'search' }, CTX))
    expect(result.error).toContain('question is required')
    expect(mockSearchMarkets).not.toHaveBeenCalled()
  })
})

// ============================================================================
// market_info
// ============================================================================

describe('action: market_info', () => {
  it('returns market details', async () => {
    mockGetMarket.mockResolvedValue({
      condition_id: '0xabc',
      question_id: '0xdef',
      tokens: [{ token_id: 't1', outcome: 'Yes', price: 0.65, winner: false }],
      question: 'Will it rain?',
      description: 'Resolves YES if rain',
      end_date_iso: '2026-12-31',
      active: true,
      closed: false,
      archived: false,
      accepting_orders: true,
      minimum_order_size: '5',
      minimum_tick_size: '0.01',
      neg_risk: false,
    })

    const result = parse(await toolPolymarketTrade({ action: 'market_info', conditionId: '0xabc' }, CTX))
    expect(result.question).toBe('Will it rain?')
    expect(result.acceptingOrders).toBe(true)
    expect(result.minOrderSize).toBe('5')
  })

  it('returns error if conditionId missing', async () => {
    const result = parse(await toolPolymarketTrade({ action: 'market_info' }, CTX))
    expect(result.error).toContain('conditionId is required')
  })

  it('returns error if market not found', async () => {
    mockGetMarket.mockResolvedValue(null)
    const result = parse(await toolPolymarketTrade({ action: 'market_info', conditionId: '0x999' }, CTX))
    expect(result.error).toContain('Market not found')
  })
})

// ============================================================================
// orderbook
// ============================================================================

describe('action: orderbook', () => {
  it('returns bids, asks, and spread', async () => {
    mockGetMarket.mockResolvedValue({
      condition_id: '0xabc',
      question_id: '0xdef',
      tokens: [
        { token_id: 'yes-tok', outcome: 'Yes', price: 0.65, winner: false },
        { token_id: 'no-tok', outcome: 'No', price: 0.35, winner: false },
      ],
      question: 'Q',
      description: '',
      end_date_iso: '',
      active: true,
      closed: false,
      archived: false,
      accepting_orders: true,
      minimum_order_size: '1',
      minimum_tick_size: '0.01',
      neg_risk: false,
    })
    mockGetOrderbook.mockResolvedValue({
      market: '0xabc',
      asset_id: 'yes-tok',
      timestamp: '2026-01-01',
      bids: [{ price: '0.64', size: '100' }],
      asks: [{ price: '0.66', size: '50' }],
      hash: 'h',
    })

    const result = parse(await toolPolymarketTrade({ action: 'orderbook', conditionId: '0xabc' }, CTX))
    expect(result.bids).toHaveLength(1)
    expect(result.asks).toHaveLength(1)
    expect(result.spread).toBe('0.0200')
    expect(mockGetOrderbook).toHaveBeenCalledWith('yes-tok', 'ast-456')
  })

  it('returns error if conditionId missing', async () => {
    const result = parse(await toolPolymarketTrade({ action: 'orderbook' }, CTX))
    expect(result.error).toContain('conditionId is required')
  })
})

// ============================================================================
// buy_yes / buy_no / sell_yes / sell_no
// ============================================================================

describe('trade actions', () => {
  const tradeActions = ['buy_yes', 'buy_no', 'sell_yes', 'sell_no'] as const

  for (const action of tradeActions) {
    it(`${action}: delegates to executePolymarketTrade`, async () => {
      mockExecuteTrade.mockResolvedValue({
        success: true,
        action,
        conditionId: '0xabc',
        amount: '50',
        orderId: 'ord-1',
        effectivePrice: 0.65,
      })

      const result = parse(await toolPolymarketTrade({
        action,
        conditionId: '0xabc',
        amount: '50',
        limitPrice: 0.65,
      }, CTX))

      expect(result.success).toBe(true)
      expect(result.orderId).toBe('ord-1')
      expect(mockExecuteTrade).toHaveBeenCalledWith('ast-456', {
        conditionId: '0xabc',
        action,
        amount: '50',
        limitPrice: 0.65,
      })
    })
  }

  it('returns error if conditionId missing', async () => {
    const result = parse(await toolPolymarketTrade({ action: 'buy_yes', amount: '10' }, CTX))
    expect(result.error).toContain('conditionId is required')
    expect(mockExecuteTrade).not.toHaveBeenCalled()
  })

  it('returns error if amount missing', async () => {
    const result = parse(await toolPolymarketTrade({ action: 'buy_yes', conditionId: '0xabc' }, CTX))
    expect(result.error).toContain('amount is required')
    expect(mockExecuteTrade).not.toHaveBeenCalled()
  })
})

// ============================================================================
// split_and_sell
// ============================================================================

describe('action: split_and_sell', () => {
  it('delegates to splitAndSell with correct params', async () => {
    mockSplitAndSell.mockResolvedValue({
      success: true,
      action: 'buy_yes',
      conditionId: '0xabc',
      amount: '100',
      txHash: '0xsplit',
      orderId: 'ord-sell',
    })

    const result = parse(await toolPolymarketTrade({
      action: 'split_and_sell',
      conditionId: '0xabc',
      amount: '100',
      keepOutcome: 'yes',
    } as any, CTX))

    expect(result.success).toBe(true)
    expect(result.txHash).toBe('0xsplit')
    expect(mockSplitAndSell).toHaveBeenCalledWith('ast-456', {
      conditionId: '0xabc',
      usdcAmount: '100',
      keepOutcome: 'yes',
    })
  })

  it('returns error if conditionId missing', async () => {
    const result = parse(await toolPolymarketTrade({ action: 'split_and_sell', amount: '100' }, CTX))
    expect(result.error).toContain('conditionId and amount required')
  })

  it('returns error if keepOutcome missing', async () => {
    const result = parse(await toolPolymarketTrade({
      action: 'split_and_sell',
      conditionId: '0xabc',
      amount: '100',
    }, CTX))
    expect(result.error).toContain('keepOutcome must be')
  })

  it('returns error if keepOutcome invalid', async () => {
    const result = parse(await toolPolymarketTrade({
      action: 'split_and_sell',
      conditionId: '0xabc',
      amount: '100',
      keepOutcome: 'maybe',
    } as any, CTX))
    expect(result.error).toContain('keepOutcome must be')
  })
})

// ============================================================================
// open_orders
// ============================================================================

describe('action: open_orders', () => {
  it('returns orders list', async () => {
    mockGetOpenOrders.mockResolvedValue([
      {
        id: 'ord-1',
        status: 'open',
        market: '0xabc',
        asset_id: 'tok-1',
        side: 'BUY' as const,
        original_size: '50',
        size_matched: '10',
        price: '0.65',
        created_at: '2026-01-01',
        expiration: '2026-12-31',
        order_type: 'GTC' as const,
      },
    ])

    const result = parse(await toolPolymarketTrade({ action: 'open_orders' }, CTX))
    expect(result.orders).toHaveLength(1)
    expect(mockGetOpenOrders).toHaveBeenCalledWith('ast-456', undefined)
  })

  it('passes conditionId as market filter', async () => {
    mockGetOpenOrders.mockResolvedValue([])
    await toolPolymarketTrade({ action: 'open_orders', conditionId: '0xabc' }, CTX)
    expect(mockGetOpenOrders).toHaveBeenCalledWith('ast-456', '0xabc')
  })
})

// ============================================================================
// cancel_order
// ============================================================================

describe('action: cancel_order', () => {
  it('delegates to cancelOrder', async () => {
    mockCancelOrder.mockResolvedValue({ success: true })
    const result = parse(await toolPolymarketTrade({ action: 'cancel_order', orderId: 'ord-1' }, CTX))
    expect(result.success).toBe(true)
    expect(mockCancelOrder).toHaveBeenCalledWith('ast-456', 'ord-1')
  })

  it('returns error if orderId missing', async () => {
    const result = parse(await toolPolymarketTrade({ action: 'cancel_order' }, CTX))
    expect(result.error).toContain('orderId is required')
    expect(mockCancelOrder).not.toHaveBeenCalled()
  })
})

// ============================================================================
// unknown action
// ============================================================================

describe('unknown action', () => {
  it('returns error with available actions list', async () => {
    const result = parse(await toolPolymarketTrade({ action: 'fly_to_moon' }, CTX))
    expect(result.error).toContain('Unknown action: fly_to_moon')
    expect(result.error).toContain('search')
    expect(result.error).toContain('buy_yes')
    expect(result.error).toContain('cancel_order')
  })
})

// ============================================================================
// safety: tool never throws
// ============================================================================

describe('safety', () => {
  it('all results are valid JSON strings', async () => {
    // Even when services throw, the tool should catch and return JSON
    mockSearchMarkets.mockResolvedValue([])
    mockGetOpenOrders.mockResolvedValue([])

    const actions = [
      { action: 'search', question: 'test' },
      { action: 'market_info' }, // missing conditionId → error JSON
      { action: 'buy_yes' }, // missing params → error JSON
      { action: 'open_orders' },
      { action: 'cancel_order' }, // missing orderId → error JSON
      { action: 'invalid' },
    ]

    for (const args of actions) {
      const result = await toolPolymarketTrade(args as any, CTX)
      expect(() => JSON.parse(result)).not.toThrow()
    }
  })
})
