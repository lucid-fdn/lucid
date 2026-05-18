import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock server-only before any imports
vi.mock('server-only', () => ({}))

// Mock @solana/web3.js
vi.mock('@solana/web3.js', () => {
  const mockKeypair = {
    publicKey: { toBase58: () => 'MockAuthority11111111111111111111111111111111' },
    secretKey: new Uint8Array(64),
  }
  return {
    Connection: vi.fn().mockImplementation(() => ({
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: 'mock-blockhash',
        lastValidBlockHeight: 100,
      }),
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    })),
    Keypair: {
      fromSecretKey: vi.fn().mockReturnValue(mockKeypair),
    },
    PublicKey: vi.fn().mockImplementation((addr: string) => ({
      toBase58: () => addr,
    })),
  }
})

// Mock bs58
vi.mock('bs58', () => ({
  default: { decode: vi.fn().mockReturnValue(new Uint8Array(64)) },
  decode: vi.fn().mockReturnValue(new Uint8Array(64)),
}))

// Mock Umi
vi.mock('@metaplex-foundation/umi-bundle-defaults', () => ({
  createUmi: vi.fn().mockReturnValue({
    use: vi.fn().mockReturnThis(),
    identity: null,
    payer: null,
  }),
}))

vi.mock('@metaplex-foundation/umi', () => ({
  createSignerFromKeypair: vi.fn().mockReturnValue({ publicKey: 'mock-signer' }),
}))

vi.mock('@metaplex-foundation/umi-web3js-adapters', () => ({
  fromWeb3JsKeypair: vi.fn().mockReturnValue({ publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) }),
}))

describe('SolanaService', () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

  beforeEach(() => {
    vi.resetModules()
    // Set authority key for tests
    process.env.LAUNCH_AUTHORITY_KEY = 'mockBase58Key123'
  })

  afterEach(() => {
    delete process.env.LAUNCH_AUTHORITY_KEY
    delete process.env.EPOCH_AUTHORITY_KEY
  })

  afterAll(() => {
    consoleWarnSpy.mockRestore()
  })

  it('isConfigured returns true when authority key is set', async () => {
    const { isConfigured, _resetForTesting } = await import('../solana-service')
    _resetForTesting()
    expect(isConfigured()).toBe(true)
  })

  it('isConfigured returns false when no authority key', async () => {
    delete process.env.LAUNCH_AUTHORITY_KEY
    delete process.env.EPOCH_AUTHORITY_KEY
    const { isConfigured, _resetForTesting } = await import('../solana-service')
    _resetForTesting()
    expect(isConfigured()).toBe(false)
  })

  it('getAuthorityAddress returns base58 address', async () => {
    const { getAuthorityAddress, _resetForTesting } = await import('../solana-service')
    _resetForTesting()
    const addr = getAuthorityAddress()
    expect(addr).toBeTruthy()
    expect(typeof addr).toBe('string')
  })

  it('usdcToLamports converts correctly', async () => {
    const { usdcToLamports } = await import('../solana-service')
    expect(usdcToLamports(1)).toBe(1_000_000)
    expect(usdcToLamports(0.5)).toBe(500_000)
    expect(usdcToLamports(150.123456)).toBe(150_123_456)
    expect(usdcToLamports(0.000001)).toBe(1)
    expect(usdcToLamports(0)).toBe(0)
  })

  it('withRetry succeeds on first attempt', async () => {
    const { withRetry } = await import('../solana-service')
    const fn = vi.fn().mockResolvedValue('success')
    const result = await withRetry(fn)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('withRetry retries on retryable errors', async () => {
    const { withRetry } = await import('../solana-service')
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('HTTP 429 Too Many Requests'))
      .mockResolvedValue('recovered')

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50 })
    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('withRetry does not retry non-retryable errors', async () => {
    const { withRetry } = await import('../solana-service')
    const fn = vi.fn().mockRejectedValue(new Error('Invalid account data'))

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50 }),
    ).rejects.toThrow('Invalid account data')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('withRetry throws after max attempts exhausted', async () => {
    const { withRetry } = await import('../solana-service')
    const fn = vi.fn().mockRejectedValue(new Error('503 Service Unavailable'))

    await expect(
      withRetry(fn, { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 50 }),
    ).rejects.toThrow('503 Service Unavailable')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
