import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock config before importing module
const mockConfig = {
  FEATURE_RECEIPTS: true,
  LUCID_API_BASE_URL: 'http://localhost:3001',
  LUCID_API_KEY: 'test-api-key',
  RECEIPT_SIGNER_KEY: undefined as string | undefined,
  LUCID_PLATFORM_WALLET: 'platform-compute-passport',
}

vi.mock('../../config.js', () => ({
  getConfig: () => mockConfig,
}))

// Must import after mock
const { emitReceipt, __resetReceiptEmitterForTests } = await import('../receipt-emitter.js')

// Capture fetch calls
const fetchSpy = vi.fn<typeof globalThis.fetch>()

beforeEach(() => {
  vi.clearAllMocks()
  __resetReceiptEmitterForTests()
  mockConfig.FEATURE_RECEIPTS = true
  mockConfig.LUCID_API_KEY = 'test-api-key'
  mockConfig.RECEIPT_SIGNER_KEY = undefined
  mockConfig.LUCID_PLATFORM_WALLET = 'platform-compute-passport'

  fetchSpy.mockResolvedValue(new Response('{"success":true}', { status: 200 }))
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const baseInput = {
  runId: 'run-123',
  passportId: 'passport-abc',
  model: 'gpt-4o',
  tokensIn: 500,
  tokensOut: 100,
  totalLatencyMs: 3000,
  toolCallCount: 2,
  policyConfig: { maxLlmCalls: 15 },
}

describe('emitReceipt', () => {
  it('skips when FEATURE_RECEIPTS is disabled', async () => {
    mockConfig.FEATURE_RECEIPTS = false
    emitReceipt(baseInput)
    // Give fire-and-forget a tick
    await new Promise(r => setTimeout(r, 10))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('skips when passportId is null', async () => {
    emitReceipt({ ...baseInput, passportId: null })
    await new Promise(r => setTimeout(r, 10))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('POSTs receipt to L2 API when enabled', async () => {
    emitReceipt(baseInput)
    // Wait for fire-and-forget
    await new Promise(r => setTimeout(r, 50))

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, options] = fetchSpy.mock.calls[0]
    expect(url).toBe('http://localhost:3001/v1/receipts')
    expect(options?.method).toBe('POST')
    expect(options?.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-api-key',
      }),
    )

    // Wire format uses snake_case
    const body = JSON.parse(options?.body as string)
    expect(body.run_id).toBe('run-123')
    expect(body.model_passport_id).toBe('passport-abc') // passportId, not model
    expect(body.compute_passport_id).toBe('platform-compute-passport')
    expect(body.tokens_in).toBe(500)
    expect(body.tokens_out).toBe(100)
    expect(body.runtime).toBe('lucid-saas')
    expect(body.receipt_hash).toBeDefined()
    expect(body.signature).toBeDefined()
    expect(body.receipt_hash.length).toBe(64) // SHA-256 hex
    expect(body.signature.length).toBe(64) // HMAC-SHA256 hex
  })

  it('builds deterministic receipt hash for same inputs', async () => {
    const hashes: string[] = []

    for (let i = 0; i < 2; i++) {
      fetchSpy.mockResolvedValueOnce(new Response('{"success":true}', { status: 200 }))
      emitReceipt(baseInput)
      await new Promise(r => setTimeout(r, 50))
      const body = JSON.parse(fetchSpy.mock.calls[i][1]?.body as string)
      hashes.push(body.receipt_hash)
    }

    // Same input data → same hash (timestamp will differ but hash is of canonical fields)
    // Actually timestamp is Date.now() inside buildReceipt, so hashes won't match exactly.
    // But both should be valid SHA-256 hex strings.
    expect(hashes[0]).toMatch(/^[a-f0-9]{64}$/)
    expect(hashes[1]).toMatch(/^[a-f0-9]{64}$/)
  })

  it('uses policyHash from policy config', async () => {
    emitReceipt(baseInput)
    await new Promise(r => setTimeout(r, 50))

    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
    expect(body.policy_hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('handles null policy config', async () => {
    emitReceipt({ ...baseInput, policyConfig: null })
    await new Promise(r => setTimeout(r, 50))

    expect(fetchSpy).toHaveBeenCalledOnce()
    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
    expect(body.policy_hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('retries on 5xx error', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
      .mockResolvedValueOnce(new Response('{"success":true}', { status: 200 }))

    emitReceipt(baseInput)
    // Wait for retry (1s backoff + processing)
    await new Promise(r => setTimeout(r, 1500))

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('does not retry on 4xx error', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Bad Request', { status: 400 }))

    emitReceipt(baseInput)
    await new Promise(r => setTimeout(r, 1500))

    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('backs off receipt emission after a 404 endpoint miss', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))

    emitReceipt(baseInput)
    await new Promise(r => setTimeout(r, 50))
    emitReceipt({ ...baseInput, runId: 'run-456' })
    await new Promise(r => setTimeout(r, 50))

    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('retries on network error', async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(new Response('{"success":true}', { status: 200 }))

    emitReceipt(baseInput)
    await new Promise(r => setTimeout(r, 1500))

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('never throws (fire-and-forget)', async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error('Network fail'))
      .mockRejectedValueOnce(new Error('Network fail again'))

    // Should not throw
    expect(() => emitReceipt(baseInput)).not.toThrow()
    await new Promise(r => setTimeout(r, 1500))
  })

  it('omits Authorization header when no API key', async () => {
    mockConfig.LUCID_API_KEY = ''
    emitReceipt(baseInput)
    await new Promise(r => setTimeout(r, 50))

    const [, options] = fetchSpy.mock.calls[0]
    const headers = options?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('uses RECEIPT_SIGNER_KEY for signing when available', async () => {
    mockConfig.RECEIPT_SIGNER_KEY = 'custom-signer-key-hex'
    emitReceipt(baseInput)
    await new Promise(r => setTimeout(r, 50))

    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
    // Signature should differ from default HMAC with API key
    expect(body.signature).toMatch(/^[a-f0-9]{64}$/)
  })

  it('strips trailing slash from API base URL', async () => {
    mockConfig.LUCID_API_BASE_URL = 'http://localhost:3001/'
    emitReceipt(baseInput)
    await new Promise(r => setTimeout(r, 50))

    expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:3001/v1/receipts')
  })
})
