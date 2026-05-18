import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const mockReceipts = {
  get: vi.fn(),
  verify: vi.fn(),
  getProof: vi.fn(),
  getMmrRoot: vi.fn(),
}

const mockEpochs = {
  getCurrent: vi.fn(),
  getStats: vi.fn(),
}

let sdkConfigured = true

vi.mock('../sdk', () => ({
  lucidSDK: {
    receipts: mockReceipts,
    epochs: mockEpochs,
  },
  isSDKConfigured: () => sdkConfigured,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
  },
}))

const {
  getReceipt,
  verifyReceipt,
  getReceiptProof,
  getCurrentEpoch,
  getEpochStats,
  getMmrRoot,
} = await import('../receipts')

const { ErrorService } = await import('@/lib/errors/error-service')

beforeEach(() => {
  vi.clearAllMocks()
  sdkConfigured = true
})

describe('getReceipt', () => {
  it('returns receipt on success', async () => {
    const receipt = { runId: 'run-1', tokensIn: 100, tokensOut: 50 }
    mockReceipts.get.mockResolvedValue({ receipt })

    const result = await getReceipt('run-1')
    expect(result).toEqual(receipt)
    expect(mockReceipts.get).toHaveBeenCalledWith({ receiptId: 'run-1' })
  })

  it('returns null when SDK not configured', async () => {
    sdkConfigured = false
    const result = await getReceipt('run-1')
    expect(result).toBeNull()
    expect(mockReceipts.get).not.toHaveBeenCalled()
  })

  it('returns null and captures error on failure', async () => {
    mockReceipts.get.mockRejectedValue(new Error('Not found'))

    const result = await getReceipt('run-1')
    expect(result).toBeNull()
    expect(ErrorService.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        severity: 'warning',
        context: { runId: 'run-1' },
        tags: { layer: 'ai', domain: 'receipts' },
      }),
    )
  })
})

describe('verifyReceipt', () => {
  it('returns verification result', async () => {
    const verification = { valid: true, hashValid: true, signatureValid: true }
    mockReceipts.verify.mockResolvedValue(verification)

    const result = await verifyReceipt('run-1')
    expect(result).toEqual(verification)
    expect(mockReceipts.verify).toHaveBeenCalledWith({ receiptId: 'run-1' })
  })

  it('returns null when SDK not configured', async () => {
    sdkConfigured = false
    const result = await verifyReceipt('run-1')
    expect(result).toBeNull()
  })

  it('returns null on error', async () => {
    mockReceipts.verify.mockRejectedValue(new Error('Verify failed'))

    const result = await verifyReceipt('run-1')
    expect(result).toBeNull()
    expect(ErrorService.captureException).toHaveBeenCalled()
  })
})

describe('getReceiptProof', () => {
  it('returns proof on success', async () => {
    const proof = { runId: 'run-1', receiptHash: 'abc', leafIndex: 42, proof: ['h1', 'h2'], root: 'root' }
    mockReceipts.getProof.mockResolvedValue({ proof })

    const result = await getReceiptProof('run-1')
    expect(result).toEqual(proof)
  })

  it('returns null when SDK not configured', async () => {
    sdkConfigured = false
    const result = await getReceiptProof('run-1')
    expect(result).toBeNull()
  })

  it('returns null on error', async () => {
    mockReceipts.getProof.mockRejectedValue(new Error('Proof failed'))

    const result = await getReceiptProof('run-1')
    expect(result).toBeNull()
    expect(ErrorService.captureException).toHaveBeenCalled()
  })
})

describe('getCurrentEpoch', () => {
  it('returns current epoch', async () => {
    const epoch = { epochId: 'e-1', mmrRoot: 'root-hash', leafCount: 100, status: 'open' }
    mockEpochs.getCurrent.mockResolvedValue({ epoch })

    const result = await getCurrentEpoch()
    expect(result).toEqual(epoch)
  })

  it('returns null when SDK not configured', async () => {
    sdkConfigured = false
    const result = await getCurrentEpoch()
    expect(result).toBeNull()
  })

  it('returns null on error', async () => {
    mockEpochs.getCurrent.mockRejectedValue(new Error('Epoch fetch failed'))

    const result = await getCurrentEpoch()
    expect(result).toBeNull()
    expect(ErrorService.captureException).toHaveBeenCalled()
  })
})

describe('getEpochStats', () => {
  it('returns stats', async () => {
    const stats = { success: true, stats: { totalEpochs: 10, totalReceipts: 500 } }
    mockEpochs.getStats.mockResolvedValue(stats)

    const result = await getEpochStats()
    expect(result).toEqual(stats)
  })

  it('returns null when SDK not configured', async () => {
    sdkConfigured = false
    const result = await getEpochStats()
    expect(result).toBeNull()
  })
})

describe('getMmrRoot', () => {
  it('returns root string', async () => {
    mockReceipts.getMmrRoot.mockResolvedValue({ root: 'abc123' })

    const result = await getMmrRoot()
    expect(result).toBe('abc123')
  })

  it('returns null when SDK not configured', async () => {
    sdkConfigured = false
    const result = await getMmrRoot()
    expect(result).toBeNull()
  })

  it('returns null on error', async () => {
    mockReceipts.getMmrRoot.mockRejectedValue(new Error('MMR failed'))

    const result = await getMmrRoot()
    expect(result).toBeNull()
    expect(ErrorService.captureException).toHaveBeenCalled()
  })
})
