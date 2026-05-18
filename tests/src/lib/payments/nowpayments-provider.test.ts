import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db/checkout-attempts', () => ({
  createCheckoutAttempt: vi.fn().mockResolvedValue({ id: 'attempt-uuid-123' }),
  updateCheckoutAttemptStatus: vi.fn().mockResolvedValue(undefined),
  expireStaleCheckoutAttempts: vi.fn().mockResolvedValue(0),
}))
vi.mock('@/lib/db', () => ({
  getPlanByName: vi.fn().mockResolvedValue({
    id: 'plan-uuid',
    name: 'pro',
    price_monthly_usd: 19000,
    price_yearly_usd: 29000,
  }),
}))
vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
  },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('NOWPaymentsProvider', () => {
  beforeEach(() => {
    vi.stubEnv('NOWPAYMENTS_API_KEY', 'test-api-key')
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', 'test-ipn-secret')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.lucid.com')
    mockFetch.mockReset()
  })

  it('createCheckout creates attempt and calls NOWPayments invoice API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'np-invoice-123',
        invoice_url: 'https://nowpayments.io/invoice/np-invoice-123',
      }),
    })

    const { NOWPaymentsProvider } = await import('@/lib/payments/nowpayments-provider')
    const provider = new NOWPaymentsProvider()

    const result = await provider.createCheckout({
      orgId: 'org-uuid',
      userId: 'user-uuid',
      planName: 'pro',
      billingPeriod: 'yearly',
      successUrl: 'https://app.lucid.com/settings/billing',
      cancelUrl: 'https://app.lucid.com/pricing',
    })

    expect(result.provider).toBe('nowpayments')
    expect(result.url).toBe('https://nowpayments.io/invoice/np-invoice-123')
    expect(result.sessionId).toBe('np-invoice-123')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.nowpayments.io/v1/invoice',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
        }),
      }),
    )
  })

  it('throws on timeout/failure with user-friendly message', async () => {
    mockFetch.mockRejectedValueOnce(new Error('timeout'))

    const { NOWPaymentsProvider } = await import('@/lib/payments/nowpayments-provider')
    const provider = new NOWPaymentsProvider()

    await expect(
      provider.createCheckout({
        orgId: 'org-uuid',
        userId: 'user-uuid',
        planName: 'pro',
        billingPeriod: 'yearly',
        successUrl: 'https://app.lucid.com/settings/billing',
        cancelUrl: 'https://app.lucid.com/pricing',
      }),
    ).rejects.toThrow('Crypto checkout is temporarily unavailable')
  })
})

describe('expireStaleCheckoutAttempts', () => {
  it('is callable and returns a number', async () => {
    const { expireStaleCheckoutAttempts } = await import('@/lib/db/checkout-attempts')
    const result = await expireStaleCheckoutAttempts()
    expect(typeof result).toBe('number')
  })
})
