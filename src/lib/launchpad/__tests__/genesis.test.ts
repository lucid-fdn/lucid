import { describe, it, expect, vi } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock solana-service
vi.mock('../solana-service', () => ({
  getUmi: vi.fn().mockReturnValue({}),
  genesisConfig: { baseUrl: 'https://api.metaplex.com' },
  withRetry: vi.fn((fn: () => any) => fn()),
  confirmTransaction: vi.fn().mockResolvedValue(undefined),
  isConfigured: vi.fn().mockReturnValue(true),
}))

// Mock genesis SDK
vi.mock('@metaplex-foundation/genesis', () => ({
  createLaunch: vi.fn().mockResolvedValue({ transactions: [] }),
  registerLaunch: vi.fn().mockResolvedValue({ registered: true }),
  createAndRegisterLaunch: vi.fn().mockResolvedValue({
    mint: 'TokenMint1111111111111111111111111111111111',
    txId: 'txSig123',
  }),
}))

describe('genesis', () => {
  describe('buildCreateLaunchInput', () => {
    it('builds correct input from Lucid config', async () => {
      const { buildCreateLaunchInput } = await import('../genesis')

      const input = buildCreateLaunchInput({
        creatorWallet: 'CreatorWallet1111111111111111111111111111111',
        token: {
          name: 'Test Agent',
          symbol: 'TEST',
          image: 'https://gateway.irys.xyz/test',
          description: 'A test agent',
        },
        launchpool: {
          tokenAllocation: 500_000_000,
          depositStartTime: new Date('2026-04-01'),
          raiseGoal: 10,
          raydiumLiquidityBps: 5000,
          fundsRecipient: 'CreatorWallet1111111111111111111111111111111',
        },
      })

      expect(input.wallet).toBe('CreatorWallet1111111111111111111111111111111')
      expect(input.launchType).toBe('project')
      expect(input.token.name).toBe('Test Agent')
      expect(input.token.symbol).toBe('TEST')
      expect(input.quoteMint).toBe('SOL')
      expect(input.launch.launchpool.tokenAllocation).toBe(500_000_000)
      expect(input.launch.launchpool.raydiumLiquidityBps).toBe(5000)
    })

    it('handles optional fields', async () => {
      const { buildCreateLaunchInput } = await import('../genesis')

      const input = buildCreateLaunchInput({
        creatorWallet: 'Wallet111111111111111111111111111111111111111',
        token: { name: 'Minimal', symbol: 'MIN', image: 'https://irys.xyz/img' },
        launchpool: {
          tokenAllocation: 500_000_000,
          depositStartTime: new Date(),
          raiseGoal: 5,
          raydiumLiquidityBps: 3000,
          fundsRecipient: 'Wallet111111111111111111111111111111111111111',
        },
        network: 'solana-devnet',
      })

      expect(input.token.description).toBeUndefined()
      expect(input.network).toBe('solana-devnet')
      expect(input.launch.lockedAllocations).toBeUndefined()
    })
  })

  describe('extractTokenMint', () => {
    it('extracts mint from string field', async () => {
      const { extractTokenMint } = await import('../genesis')
      const result = { mint: 'TokenMint123' } as any
      expect(extractTokenMint(result)).toBe('TokenMint123')
    })

    it('extracts mint from PublicKey-like object', async () => {
      const { extractTokenMint } = await import('../genesis')
      const result = { mint: { toString: () => 'PublicKeyMint456' } } as any
      expect(extractTokenMint(result)).toBe('PublicKeyMint456')
    })

    it('falls back to tokenMint field', async () => {
      const { extractTokenMint } = await import('../genesis')
      const result = { tokenMint: 'AlternateMint789' } as any
      expect(extractTokenMint(result)).toBe('AlternateMint789')
    })

    it('returns null when no mint found', async () => {
      const { extractTokenMint } = await import('../genesis')
      const result = { other: 'data' } as any
      expect(extractTokenMint(result)).toBeNull()
    })
  })
})
