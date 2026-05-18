/**
 * Tests — Position Aggregator (net position computation + PnL)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PolymarketMarket } from '../services/types.js'

// Mock clob-client
vi.mock('../services/clob-client.js', () => ({
  getMarket: vi.fn(),
}))

import { getMarket } from '../services/clob-client.js'
import { getPositions } from '../services/position-aggregator.js'

const mockGetMarket = vi.mocked(getMarket)

const MARKET: PolymarketMarket = {
  condition_id: '0xaaa',
  question_id: 'q1',
  question: 'Will BTC reach $100k?',
  description: 'Bitcoin target',
  tokens: [
    { token_id: 'yes-a', outcome: 'Yes', price: 0.70, winner: false },
    { token_id: 'no-a', outcome: 'No', price: 0.30, winner: false },
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

function createMockSupabase(trades: unknown[] = [], snapshots: unknown[] = []) {
  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'polymarket_trade_log') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: trades, error: null }),
          }),
        }),
      }
    }
    if (table === 'polymarket_balance_snapshots') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: snapshots, error: null }),
          }),
        }),
      }
    }
    return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }
  })
  return { from: fromMock } as unknown as Parameters<typeof getPositions>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetMarket.mockResolvedValue(MARKET)
})

describe('getPositions', () => {
  it('returns empty array when no trades exist', async () => {
    const supabase = createMockSupabase([])
    const positions = await getPositions(supabase, 'agent-1')
    expect(positions).toEqual([])
  })

  it('computes net position from buy trades', async () => {
    const trades = [
      { condition_id: '0xaaa', token_id: 'yes-a', outcome: 'Yes', side: 'BUY', amount: '100', price: '0.60' },
      { condition_id: '0xaaa', token_id: 'yes-a', outcome: 'Yes', side: 'BUY', amount: '50', price: '0.65' },
    ]
    const supabase = createMockSupabase(trades)
    const positions = await getPositions(supabase, 'agent-1')

    expect(positions).toHaveLength(1)
    expect(positions[0].conditionId).toBe('0xaaa')
    expect(positions[0].outcome).toBe('Yes')
    expect(parseFloat(positions[0].size)).toBe(150)
    expect(positions[0].currentPrice).toBe(0.70)
  })

  it('computes net after buys and sells', async () => {
    const trades = [
      { condition_id: '0xaaa', token_id: 'yes-a', outcome: 'Yes', side: 'BUY', amount: '100', price: '0.60' },
      { condition_id: '0xaaa', token_id: 'yes-a', outcome: 'Yes', side: 'SELL', amount: '40', price: '0.70' },
    ]
    const supabase = createMockSupabase(trades)
    const positions = await getPositions(supabase, 'agent-1')

    expect(positions).toHaveLength(1)
    expect(parseFloat(positions[0].size)).toBe(60)
  })

  it('excludes fully closed positions', async () => {
    const trades = [
      { condition_id: '0xaaa', token_id: 'yes-a', outcome: 'Yes', side: 'BUY', amount: '100', price: '0.60' },
      { condition_id: '0xaaa', token_id: 'yes-a', outcome: 'Yes', side: 'SELL', amount: '100', price: '0.70' },
    ]
    const supabase = createMockSupabase(trades)
    const positions = await getPositions(supabase, 'agent-1')
    expect(positions).toHaveLength(0)
  })

  it('computes VWAP for avg price', async () => {
    const trades = [
      { condition_id: '0xaaa', token_id: 'yes-a', outcome: 'Yes', side: 'BUY', amount: '100', price: '0.50' },
      { condition_id: '0xaaa', token_id: 'yes-a', outcome: 'Yes', side: 'BUY', amount: '100', price: '0.70' },
    ]
    const supabase = createMockSupabase(trades)
    const positions = await getPositions(supabase, 'agent-1')

    expect(positions).toHaveLength(1)
    // VWAP = (100*0.50 + 100*0.70) / 200 = 0.60
    expect(positions[0].avgPrice).toBe(0.6)
  })

  it('computes PnL correctly', async () => {
    const trades = [
      { condition_id: '0xaaa', token_id: 'yes-a', outcome: 'Yes', side: 'BUY', amount: '100', price: '0.50' },
    ]
    const supabase = createMockSupabase(trades)
    const positions = await getPositions(supabase, 'agent-1')

    expect(positions).toHaveLength(1)
    // PnL = 100 * (0.70 - 0.50) = $20
    expect(positions[0].pnlUsd).toBe(20)
    // PnL% = (0.70 - 0.50) / 0.50 * 100 = 40%
    expect(positions[0].pnlPercent).toBe(40)
  })

  it('prefers on-chain snapshot when recent (< 10 min)', async () => {
    const trades = [
      { condition_id: '0xaaa', token_id: 'yes-a', outcome: 'Yes', side: 'BUY', amount: '100', price: '0.60' },
    ]
    const recentTime = new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 min ago
    const snapshots = [
      { token_id: 'yes-a', condition_id: '0xaaa', outcome: 'Yes', balance_tokens: 80, snapshot_at: recentTime },
    ]
    const supabase = createMockSupabase(trades, snapshots)
    const positions = await getPositions(supabase, 'agent-1')

    expect(positions).toHaveLength(1)
    // Should use snapshot balance (80) instead of trade log net (100)
    expect(parseFloat(positions[0].size)).toBe(80)
  })

  it('ignores stale snapshots (> 10 min old)', async () => {
    const trades = [
      { condition_id: '0xaaa', token_id: 'yes-a', outcome: 'Yes', side: 'BUY', amount: '100', price: '0.60' },
    ]
    const staleTime = new Date(Date.now() - 15 * 60 * 1000).toISOString() // 15 min ago
    const snapshots = [
      { token_id: 'yes-a', condition_id: '0xaaa', outcome: 'Yes', balance_tokens: 80, snapshot_at: staleTime },
    ]
    const supabase = createMockSupabase(trades, snapshots)
    const positions = await getPositions(supabase, 'agent-1')

    expect(positions).toHaveLength(1)
    // Should fall back to trade log net (100), not stale snapshot (80)
    expect(parseFloat(positions[0].size)).toBe(100)
  })

  it('handles multiple condition IDs', async () => {
    const trades = [
      { condition_id: '0xaaa', token_id: 'yes-a', outcome: 'Yes', side: 'BUY', amount: '50', price: '0.60' },
      { condition_id: '0xbbb', token_id: 'yes-b', outcome: 'Yes', side: 'BUY', amount: '30', price: '0.40' },
    ]
    const market2: PolymarketMarket = {
      ...MARKET,
      condition_id: '0xbbb',
      tokens: [
        { token_id: 'yes-b', outcome: 'Yes', price: 0.45, winner: false },
        { token_id: 'no-b', outcome: 'No', price: 0.55, winner: false },
      ],
    }
    mockGetMarket
      .mockResolvedValueOnce(MARKET)
      .mockResolvedValueOnce(market2)

    const supabase = createMockSupabase(trades)
    const positions = await getPositions(supabase, 'agent-1')
    expect(positions).toHaveLength(2)
  })

  it('handles market fetch failure gracefully', async () => {
    const trades = [
      { condition_id: '0xaaa', token_id: 'yes-a', outcome: 'Yes', side: 'BUY', amount: '50', price: '0.60' },
    ]
    mockGetMarket.mockRejectedValue(new Error('timeout'))
    const supabase = createMockSupabase(trades)
    const positions = await getPositions(supabase, 'agent-1')

    // Position still returned but with currentPrice=0
    expect(positions).toHaveLength(1)
    expect(positions[0].currentPrice).toBe(0)
  })

  it('returns empty on trade log query error', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getPositions>[0]

    const positions = await getPositions(supabase, 'agent-1')
    expect(positions).toEqual([])
  })
})
