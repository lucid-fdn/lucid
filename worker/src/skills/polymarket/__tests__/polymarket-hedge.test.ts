/**
 * Unit tests — lucid_hedge tool logic.
 *
 * Mocks the polymarket service layer (getMarket, getOrderbook, getOpenOrders)
 * to test all 3 actions, validation, error handling, and computation correctness.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PolymarketMarket, ClobOrderbook, ClobOpenOrder } from '../services/types.js'

// Mock service layer
vi.mock('../services/index.js', () => ({
  getMarket: vi.fn(),
  getOrderbook: vi.fn(),
  getOpenOrders: vi.fn(),
}))

import { getMarket, getOrderbook, getOpenOrders } from '../services/index.js'
import { toolLucidHedge, computeHerfindahl, computeQuestionSimilarity, computeBreakEven } from '../tools/hedge.js'

const mockGetMarket = vi.mocked(getMarket)
const mockGetOrderbook = vi.mocked(getOrderbook)
const mockGetOpenOrders = vi.mocked(getOpenOrders)

// ── Fixtures ──

const MARKET_A: PolymarketMarket = {
  condition_id: '0xaaa',
  question_id: 'q1',
  question: 'Will BTC reach $100k by end of 2026?',
  description: 'Bitcoin price target',
  tokens: [
    { token_id: 'yes-a', outcome: 'Yes', price: 0.65, winner: false },
    { token_id: 'no-a', outcome: 'No', price: 0.35, winner: false },
  ],
  end_date_iso: '2026-12-31T00:00:00Z',
  active: true,
  closed: false,
  archived: false,
  accepting_orders: true,
  minimum_order_size: '1',
  minimum_tick_size: '0.01',
  neg_risk: false,
}

const MARKET_B: PolymarketMarket = {
  condition_id: '0xbbb',
  question_id: 'q2',
  question: 'Will ETH reach $10k by end of 2026?',
  description: 'Ethereum price target',
  tokens: [
    { token_id: 'yes-b', outcome: 'Yes', price: 0.40, winner: false },
    { token_id: 'no-b', outcome: 'No', price: 0.60, winner: false },
  ],
  end_date_iso: '2026-12-31T00:00:00Z',
  active: true,
  closed: false,
  archived: false,
  accepting_orders: true,
  minimum_order_size: '1',
  minimum_tick_size: '0.01',
  neg_risk: false,
}

const ORDERBOOK_A: ClobOrderbook = {
  market: '0xaaa',
  asset_id: 'yes-a',
  timestamp: '2026-03-25T00:00:00Z',
  bids: [{ price: '0.64', size: '100' }, { price: '0.63', size: '200' }],
  asks: [{ price: '0.66', size: '100' }, { price: '0.67', size: '200' }],
  hash: 'abc123',
}

const OPEN_ORDERS: ClobOpenOrder[] = [
  {
    id: 'order-1',
    status: 'live',
    market: '0xaaa',
    asset_id: 'yes-a',
    side: 'BUY',
    original_size: '50',
    size_matched: '30',
    price: '0.62',
    created_at: '2026-03-24T00:00:00Z',
    expiration: '2026-04-24T00:00:00Z',
    order_type: 'GTC',
  },
]

const ASSISTANT_ID = 'test-assistant-id'

function parse(result: string) {
  return JSON.parse(result) as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================================
// analyze_position
// ============================================================================

describe('analyze_position', () => {
  it('returns market data and exposure for valid conditionId', async () => {
    mockGetMarket.mockResolvedValue(MARKET_A)
    mockGetOrderbook.mockResolvedValue(ORDERBOOK_A)
    mockGetOpenOrders.mockResolvedValue(OPEN_ORDERS)

    const result = parse(await toolLucidHedge(
      { action: 'analyze_position', conditionId: '0xaaa' },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(true)
    expect(result.action).toBe('analyze_position')
    expect(result.confidence).toBe('medium') // has orderbook
    expect(result.positionSource).toBe('open_orders_proxy')
    expect((result.data as Record<string, unknown>).market).toBeDefined()
    expect((result.data as Record<string, unknown>).estimatedExposure).toBeDefined()
    expect((result.data as Record<string, unknown>).hedgeAnalysis).toBeDefined()
  })

  it('returns structured error when conditionId missing', async () => {
    const result = parse(await toolLucidHedge(
      { action: 'analyze_position' },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(false)
    expect((result.error as Record<string, unknown>).code).toBe('MISSING_CONDITION_ID')
    expect((result.error as Record<string, unknown>).retryable).toBe(false)
  })

  it('returns error when market not found', async () => {
    mockGetMarket.mockResolvedValue(null)

    const result = parse(await toolLucidHedge(
      { action: 'analyze_position', conditionId: '0xnotfound' },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(false)
    expect((result.error as Record<string, unknown>).code).toBe('MARKET_NOT_FOUND')
    expect((result.error as Record<string, unknown>).retryable).toBe(false)
  })

  it('degrades gracefully when orderbook unavailable', async () => {
    mockGetMarket.mockResolvedValue(MARKET_A)
    mockGetOrderbook.mockRejectedValue(new Error('timeout'))
    mockGetOpenOrders.mockResolvedValue(OPEN_ORDERS)

    const result = parse(await toolLucidHedge(
      { action: 'analyze_position', conditionId: '0xaaa' },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(true)
    expect(result.confidence).toBe('low') // no orderbook
    expect((result.warnings as string[]).some(w => w.includes('Orderbook unavailable'))).toBe(true)
  })

  it('returns low confidence when no open orders found', async () => {
    mockGetMarket.mockResolvedValue(MARKET_A)
    mockGetOrderbook.mockResolvedValue(ORDERBOOK_A)
    mockGetOpenOrders.mockResolvedValue([])

    const result = parse(await toolLucidHedge(
      { action: 'analyze_position', conditionId: '0xaaa' },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(true)
    const data = result.data as Record<string, unknown>
    expect(data.estimatedExposure).toBeNull()
    const hedge = data.hedgeAnalysis as Record<string, unknown>
    expect(hedge.recommendation).toBe('monitor_only')
  })
})

// ============================================================================
// analyze_portfolio
// ============================================================================

describe('analyze_portfolio', () => {
  it('returns portfolio metrics for valid conditionIds', async () => {
    mockGetMarket
      .mockResolvedValueOnce(MARKET_A)
      .mockResolvedValueOnce(MARKET_B)
    mockGetOrderbook.mockResolvedValue(ORDERBOOK_A)
    mockGetOpenOrders.mockResolvedValue(OPEN_ORDERS)

    const result = parse(await toolLucidHedge(
      { action: 'analyze_portfolio', conditionIds: ['0xaaa', '0xbbb'] },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(true)
    expect(result.action).toBe('analyze_portfolio')
    const data = result.data as Record<string, unknown>
    expect(data.positions).toBeDefined()
    expect(data.riskMetrics).toBeDefined()
    expect(data.relatedness).toBeDefined()
    expect(data.recommendations).toBeDefined()
  })

  it('returns error when conditionIds missing', async () => {
    const result = parse(await toolLucidHedge(
      { action: 'analyze_portfolio' },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(false)
    expect((result.error as Record<string, unknown>).code).toBe('MISSING_CONDITION_IDS')
  })

  it('returns error when conditionIds is empty array', async () => {
    const result = parse(await toolLucidHedge(
      { action: 'analyze_portfolio', conditionIds: [] },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(false)
    expect((result.error as Record<string, unknown>).code).toBe('MISSING_CONDITION_IDS')
  })

  it('handles partial market data failure', async () => {
    mockGetMarket
      .mockResolvedValueOnce(MARKET_A)
      .mockRejectedValueOnce(new Error('timeout'))
    mockGetOrderbook.mockResolvedValue(null)
    mockGetOpenOrders.mockResolvedValue(OPEN_ORDERS)

    const result = parse(await toolLucidHedge(
      { action: 'analyze_portfolio', conditionIds: ['0xaaa', '0xbbb'] },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(true)
    const data = result.data as Record<string, unknown>
    expect((data.positions as unknown[]).length).toBe(1)
    expect((result.warnings as string[]).some(w => w.includes('Failed to fetch market 0xbbb'))).toBe(true)
  })

  it('returns NO_VALID_MARKETS when all markets fail', async () => {
    mockGetMarket.mockResolvedValue(null)
    mockGetOpenOrders.mockResolvedValue([])

    const result = parse(await toolLucidHedge(
      { action: 'analyze_portfolio', conditionIds: ['0xfoo', '0xbar'] },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(false)
    expect((result.error as Record<string, unknown>).code).toBe('NO_VALID_MARKETS')
  })
})

// ============================================================================
// suggest_hedge
// ============================================================================

describe('suggest_hedge', () => {
  it('returns hedge options for valid conditionId', async () => {
    mockGetMarket.mockResolvedValue(MARKET_A)
    mockGetOrderbook.mockResolvedValue(ORDERBOOK_A)
    mockGetOpenOrders.mockResolvedValue(OPEN_ORDERS)

    const result = parse(await toolLucidHedge(
      { action: 'suggest_hedge', conditionId: '0xaaa' },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(true)
    expect(result.action).toBe('suggest_hedge')
    const data = result.data as Record<string, unknown>
    expect(data.hedgeOptions).toBeDefined()
    const options = data.hedgeOptions as { strategy: string }[]
    const strategies = options.map(o => o.strategy)
    expect(strategies).toContain('hold')
  })

  it('returns structured error when conditionId missing', async () => {
    const result = parse(await toolLucidHedge(
      { action: 'suggest_hedge' },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(false)
    expect((result.error as Record<string, unknown>).code).toBe('MISSING_CONDITION_ID')
  })

  it('includes hold when hedge is uneconomic', async () => {
    // Market where hedging is expensive (narrow spread, low exposure)
    const thinMarket: PolymarketMarket = {
      ...MARKET_A,
      tokens: [
        { token_id: 'yes-a', outcome: 'Yes', price: 0.95, winner: false },
        { token_id: 'no-a', outcome: 'No', price: 0.05, winner: false },
      ],
    }
    mockGetMarket.mockResolvedValue(thinMarket)
    mockGetOrderbook.mockResolvedValue(null)
    mockGetOpenOrders.mockResolvedValue(OPEN_ORDERS)

    const result = parse(await toolLucidHedge(
      { action: 'suggest_hedge', conditionId: '0xaaa' },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(true)
    const data = result.data as Record<string, unknown>
    const options = data.hedgeOptions as { strategy: string }[]
    expect(options.some(o => o.strategy === 'hold')).toBe(true)
  })

  it('includes monitor_only when no exposure detected', async () => {
    mockGetMarket.mockResolvedValue(MARKET_A)
    mockGetOrderbook.mockResolvedValue(ORDERBOOK_A)
    mockGetOpenOrders.mockResolvedValue([])

    const result = parse(await toolLucidHedge(
      { action: 'suggest_hedge', conditionId: '0xaaa' },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(true)
    const data = result.data as Record<string, unknown>
    const options = data.hedgeOptions as { strategy: string }[]
    expect(options.some(o => o.strategy === 'monitor_only')).toBe(true)
  })

  it('respects maxHedgeCostUsd filter', async () => {
    mockGetMarket.mockResolvedValue(MARKET_A)
    mockGetOrderbook.mockResolvedValue(ORDERBOOK_A)
    mockGetOpenOrders.mockResolvedValue(OPEN_ORDERS)

    const result = parse(await toolLucidHedge(
      { action: 'suggest_hedge', conditionId: '0xaaa', maxHedgeCostUsd: 0.01 },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(true)
    const data = result.data as Record<string, unknown>
    const options = data.hedgeOptions as { strategy: string }[]
    // buy_opposite should be excluded if cost exceeds budget
    // hold should still be present
    expect(options.some(o => o.strategy === 'hold')).toBe(true)
  })
})

// ============================================================================
// Computation helpers
// ============================================================================

describe('computeHerfindahl', () => {
  it('returns 1 for single position', () => {
    expect(computeHerfindahl([100])).toBe(1)
  })

  it('returns 0.5 for two equal positions', () => {
    expect(computeHerfindahl([50, 50])).toBe(0.5)
  })

  it('returns 0 for empty array', () => {
    expect(computeHerfindahl([])).toBe(0)
  })

  it('returns higher value for concentrated portfolio', () => {
    const concentrated = computeHerfindahl([90, 10])
    const diversified = computeHerfindahl([25, 25, 25, 25])
    expect(concentrated).toBeGreaterThan(diversified)
  })
})

describe('computeQuestionSimilarity', () => {
  it('returns 1 for identical questions', () => {
    expect(computeQuestionSimilarity('Will BTC hit 100k?', 'Will BTC hit 100k?')).toBe(1)
  })

  it('returns 0 for completely different questions', () => {
    expect(computeQuestionSimilarity('Will the sun rise?', 'How many cats exist?')).toBe(0)
  })

  it('returns partial score for overlapping questions', () => {
    const score = computeQuestionSimilarity(
      'Will BTC reach $100k by end of 2026?',
      'Will ETH reach $10k by end of 2026?',
    )
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('handles empty strings', () => {
    expect(computeQuestionSimilarity('', '')).toBe(0)
  })
})

describe('computeBreakEven', () => {
  it('returns cost ratio for valid inputs', () => {
    expect(computeBreakEven(35, 100)).toBe(0.35)
  })

  it('returns 1 for zero hedge size', () => {
    expect(computeBreakEven(35, 0)).toBe(1)
  })
})

// ============================================================================
// Never-throw guarantee
// ============================================================================

describe('never-throw guarantee', () => {
  it('returns error envelope on internal throw', async () => {
    mockGetMarket.mockImplementation(() => {
      throw new Error('Unexpected DB crash')
    })

    const result = parse(await toolLucidHedge(
      { action: 'analyze_position', conditionId: '0xaaa' },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(false)
    expect((result.error as Record<string, unknown>).code).toBe('MARKET_FETCH_FAILED')
  })

  it('returns error envelope when action is missing', async () => {
    const result = parse(await toolLucidHedge({}, ASSISTANT_ID))

    expect(result.ok).toBe(false)
    expect((result.error as Record<string, unknown>).code).toBe('MISSING_ACTION')
  })

  it('returns error for unknown action', async () => {
    const result = parse(await toolLucidHedge(
      { action: 'nonexistent_action' },
      ASSISTANT_ID,
    ))

    expect(result.ok).toBe(false)
    expect((result.error as Record<string, unknown>).code).toBe('UNKNOWN_ACTION')
  })
})

// ============================================================================
// Envelope structure
// ============================================================================

describe('envelope structure', () => {
  it('success envelope has all required fields', async () => {
    mockGetMarket.mockResolvedValue(MARKET_A)
    mockGetOrderbook.mockResolvedValue(ORDERBOOK_A)
    mockGetOpenOrders.mockResolvedValue(OPEN_ORDERS)

    const result = parse(await toolLucidHedge(
      { action: 'analyze_position', conditionId: '0xaaa' },
      ASSISTANT_ID,
    ))

    expect(result).toHaveProperty('ok')
    expect(result).toHaveProperty('action')
    expect(result).toHaveProperty('confidence')
    expect(result).toHaveProperty('positionSource')
    expect(result).toHaveProperty('warnings')
    expect(result).toHaveProperty('assumptions')
    expect(result).toHaveProperty('data')
  })

  it('error envelope has all required fields', async () => {
    const result = parse(await toolLucidHedge(
      { action: 'analyze_position' },
      ASSISTANT_ID,
    ))

    expect(result).toHaveProperty('ok')
    expect(result).toHaveProperty('action')
    expect(result).toHaveProperty('error')
    expect(result).toHaveProperty('warnings')
    expect(result).toHaveProperty('assumptions')
    const error = result.error as Record<string, unknown>
    expect(error).toHaveProperty('code')
    expect(error).toHaveProperty('message')
    expect(error).toHaveProperty('retryable')
  })
})
