/**
 * Tests — Trade Logger (fire-and-forget trade log insertion)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logPolymarketTrade, type TradeLogEntry } from '../services/trade-logger.js'

function createMockSupabase(insertError: { message: string; code?: string } | null = null) {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: insertError }),
    }),
  } as unknown as Parameters<typeof logPolymarketTrade>[0]
}

const ENTRY: TradeLogEntry = {
  agentId: 'agent-1',
  orgId: 'org-1',
  conditionId: '0xaaa',
  tokenId: 'token-yes',
  outcome: 'Yes',
  action: 'buy_yes',
  side: 'BUY',
  amount: '50',
  price: 0.65,
  orderId: 'order-123',
  txHash: '0xtx',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('logPolymarketTrade', () => {
  it('inserts trade into polymarket_trade_log', async () => {
    const supabase = createMockSupabase()
    await logPolymarketTrade(supabase, ENTRY)

    expect(supabase.from).toHaveBeenCalledWith('polymarket_trade_log')
  })

  it('uses insert for trade logging', async () => {
    const supabase = createMockSupabase()
    await logPolymarketTrade(supabase, ENTRY)

    const insertCall = (supabase.from as ReturnType<typeof vi.fn>)
      .mock.results[0].value.insert
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: 'agent-1',
        condition_id: '0xaaa',
        side: 'BUY',
        order_id: 'order-123',
      }),
    )
  })

  it('silently ignores duplicate order_id (23505 unique_violation)', async () => {
    const supabase = createMockSupabase({ message: 'duplicate key', code: '23505' })
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(logPolymarketTrade(supabase, ENTRY)).resolves.toBeUndefined()
    // Should NOT warn for expected dedup
    expect(consoleSpy).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('never throws on insert error', async () => {
    const supabase = createMockSupabase({ message: 'constraint violation' })
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(logPolymarketTrade(supabase, ENTRY)).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('constraint violation'))

    consoleSpy.mockRestore()
  })

  it('never throws on unexpected error', async () => {
    const supabase = {
      from: vi.fn().mockImplementation(() => { throw new Error('DB crash') }),
    } as unknown as Parameters<typeof logPolymarketTrade>[0]

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(logPolymarketTrade(supabase, ENTRY)).resolves.toBeUndefined()
    consoleSpy.mockRestore()
  })
})
