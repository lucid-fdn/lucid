/**
 * Tests — Balance Reader (on-chain CTF ERC-1155 balance reads)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock RPC fallback
vi.mock('../../../services/chain/rpc-fallback.js', () => ({
  evmRpcCall: vi.fn(),
}))

import { evmRpcCall } from '../../../services/chain/rpc-fallback.js'
import { readCtfBalance } from '../services/balance-reader.js'

const mockEvmRpcCall = vi.mocked(evmRpcCall)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readCtfBalance', () => {
  const WALLET = '0x1234567890abcdef1234567890abcdef12345678'
  const TOKEN_ID = '123456789'

  it('returns balance from hex RPC result', async () => {
    // 1000000 = 0xF4240 (1 token with 6 decimals)
    mockEvmRpcCall.mockResolvedValue('0x00000000000000000000000000000000000000000000000000000000000f4240')

    const balance = await readCtfBalance(WALLET, TOKEN_ID)
    expect(balance).toBe('1000000')
    expect(mockEvmRpcCall).toHaveBeenCalledWith('137', expect.objectContaining({
      method: 'eth_call',
    }))
  })

  it('returns 0 for zero balance', async () => {
    mockEvmRpcCall.mockResolvedValue('0x0')
    const balance = await readCtfBalance(WALLET, TOKEN_ID)
    expect(balance).toBe('0')
  })

  it('returns 0 for empty hex', async () => {
    mockEvmRpcCall.mockResolvedValue('0x')
    const balance = await readCtfBalance(WALLET, TOKEN_ID)
    expect(balance).toBe('0')
  })

  it('calls CTF contract with correct method', async () => {
    mockEvmRpcCall.mockResolvedValue('0x0')
    await readCtfBalance(WALLET, TOKEN_ID)

    const call = mockEvmRpcCall.mock.calls[0]
    expect(call[0]).toBe('137') // Polygon chain ID
    expect(call[1].method).toBe('eth_call')
    const params = call[1].params as Array<{ to: string; data: string }>
    expect(params[0].to).toBe('0x4D97DCd97eC945f40cF65F87097ACe5EA0476045') // CTF contract
  })

  it('propagates RPC errors', async () => {
    mockEvmRpcCall.mockRejectedValue(new Error('RPC failed'))
    await expect(readCtfBalance(WALLET, TOKEN_ID)).rejects.toThrow('RPC failed')
  })
})
