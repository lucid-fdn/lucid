/**
 * Tests — Polymarket Balance Sync Cron
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('../../../config.js', () => ({
  getConfig: vi.fn().mockReturnValue({ FEATURE_POLYMARKET_POSITIONS: true }),
}))

vi.mock('../services/balance-reader.js', () => ({
  readCtfBalance: vi.fn(),
}))

import { getConfig } from '../../../config.js'
import { readCtfBalance } from '../services/balance-reader.js'
import { syncPolymarketBalances } from '../crons/balance-sync.js'

const mockGetConfig = vi.mocked(getConfig)
const mockReadCtfBalance = vi.mocked(readCtfBalance)

function createMockSupabase(
  trades: unknown[] = [],
  agents: unknown[] = [],
) {
  const insertMock = vi.fn().mockResolvedValue({ error: null })
  const deleteMock = vi.fn().mockReturnValue({
    lt: vi.fn().mockResolvedValue({ error: null }),
  })

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'polymarket_trade_log') {
        return {
          select: vi.fn().mockResolvedValue({ data: trades, error: null }),
        }
      }
      if (table === 'ai_assistants') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: agents, error: null }),
          }),
        }
      }
      if (table === 'polymarket_balance_snapshots') {
        return { insert: insertMock, delete: deleteMock }
      }
      return {}
    }),
    _insertMock: insertMock,
  } as unknown as Parameters<typeof syncPolymarketBalances>[0] & { _insertMock: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetConfig.mockReturnValue({ FEATURE_POLYMARKET_POSITIONS: true } as ReturnType<typeof getConfig>)
})

describe('syncPolymarketBalances', () => {
  it('bails when feature flag is off', async () => {
    mockGetConfig.mockReturnValue({ FEATURE_POLYMARKET_POSITIONS: false } as ReturnType<typeof getConfig>)
    const supabase = createMockSupabase()
    await syncPolymarketBalances(supabase)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('bails when no trades exist', async () => {
    const supabase = createMockSupabase([])
    await syncPolymarketBalances(supabase)
    expect(mockReadCtfBalance).not.toHaveBeenCalled()
  })

  it('reads on-chain balances for open positions', async () => {
    const trades = [
      { agent_id: 'agent-1', token_id: 'yes-a', condition_id: '0xaaa', outcome: 'Yes', side: 'BUY', amount: '100' },
    ]
    const agents = [
      { id: 'agent-1', agent_wallets: [{ chain_type: 'ethereum', address: '0xwallet', status: 'active' }] },
    ]
    mockReadCtfBalance.mockResolvedValue('50000000') // 50 tokens

    const supabase = createMockSupabase(trades, agents)
    await syncPolymarketBalances(supabase)

    expect(mockReadCtfBalance).toHaveBeenCalledWith('0xwallet', 'yes-a')
  })

  it('skips agents without EVM wallets', async () => {
    const trades = [
      { agent_id: 'agent-1', token_id: 'yes-a', condition_id: '0xaaa', outcome: 'Yes', side: 'BUY', amount: '100' },
    ]
    const agents = [
      { id: 'agent-1', agent_wallets: [{ chain_type: 'solana', address: 'soladdr', status: 'active' }] },
    ]
    const supabase = createMockSupabase(trades, agents)
    await syncPolymarketBalances(supabase)

    expect(mockReadCtfBalance).not.toHaveBeenCalled()
  })

  it('handles RPC errors gracefully', async () => {
    const trades = [
      { agent_id: 'agent-1', token_id: 'yes-a', condition_id: '0xaaa', outcome: 'Yes', side: 'BUY', amount: '100' },
    ]
    const agents = [
      { id: 'agent-1', agent_wallets: [{ chain_type: 'ethereum', address: '0xwallet', status: 'active' }] },
    ]
    mockReadCtfBalance.mockRejectedValue(new Error('RPC timeout'))

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const supabase = createMockSupabase(trades, agents)
    await syncPolymarketBalances(supabase)

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('RPC timeout'))
    consoleSpy.mockRestore()
  })
})
