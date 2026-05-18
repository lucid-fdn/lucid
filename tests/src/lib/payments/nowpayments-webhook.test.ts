import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

function sortObject(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj
  return Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortObject((obj as Record<string, unknown>)[key])
      return acc
    }, {} as Record<string, unknown>)
}

function createHmacSignature(body: Record<string, unknown>, secret: string): string {
  const sorted = JSON.stringify(sortObject(body))
  return crypto.createHmac('sha512', secret).update(sorted).digest('hex')
}

describe('NOWPayments HMAC verification', () => {
  const secret = 'test-ipn-secret'

  it('produces valid HMAC signature', () => {
    const body = { payment_id: '123', payment_status: 'finished', order_id: 'abc' }
    const sig = createHmacSignature(body, secret)
    expect(typeof sig).toBe('string')
    expect(sig.length).toBe(128)
  })

  it('signature changes with different body', () => {
    const body1 = { payment_id: '123', payment_status: 'finished' }
    const body2 = { payment_id: '456', payment_status: 'finished' }
    expect(createHmacSignature(body1, secret)).not.toBe(createHmacSignature(body2, secret))
  })

  it('signature changes with different secret', () => {
    const body = { payment_id: '123', payment_status: 'finished' }
    const sig1 = createHmacSignature(body, 'secret-a')
    const sig2 = createHmacSignature(body, 'secret-b')
    expect(sig1).not.toBe(sig2)
  })
})

// --- Integration tests for webhook handler logic ---
// These need extensive mocking since the route imports from @/lib/db

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db', () => ({
  createSubscription: vi.fn().mockResolvedValue({ id: 'sub-123' }),
  getActiveSubscriptionByOrgId: vi.fn().mockResolvedValue(null),
  cancelSubscription: vi.fn(),
  getPlanByName: vi.fn().mockResolvedValue({ id: 'plan-uuid', name: 'pro' }),
  createPayment: vi.fn(),
  getPaymentByProviderPaymentId: vi.fn().mockResolvedValue(null),
  isWebhookEventProcessed: vi.fn().mockResolvedValue(false),
  recordWebhookEvent: vi.fn(),
}))

vi.mock('@/lib/db/checkout-attempts', () => ({
  getCheckoutAttempt: vi.fn().mockResolvedValue({
    id: 'attempt-uuid-123',
    org_id: 'org-uuid',
    plan_name: 'pro',
    billing_period: 'yearly',
    amount_cents: 29000,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  }),
  updateCheckoutAttemptStatus: vi.fn(),
  claimCheckoutAttempt: vi.fn().mockResolvedValue({
    id: 'attempt-uuid-123',
    org_id: 'org-uuid',
    plan_name: 'pro',
    billing_period: 'yearly',
    amount_cents: 29000,
    status: 'completed',
  }),
}))

vi.mock('@/lib/control-plane/client', () => ({
  syncSubscription: vi.fn(),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

// Import AFTER mocks are set up
import { POST } from '@/app/api/webhooks/nowpayments/route'
import { NextRequest } from 'next/server'

function makeRequest(body: Record<string, unknown>, sig: string): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/nowpayments', {
    method: 'POST',
    headers: { 'x-nowpayments-sig': sig, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const secret = 'test-ipn-secret'

describe('NOWPayments webhook handler', () => {
  beforeEach(() => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', secret)
    vi.clearAllMocks()
  })

  it('creates subscription on finished status', async () => {
    const body = { payment_id: '999', payment_status: 'finished', order_id: 'attempt-uuid-123' }
    const sig = createHmacSignature(body, secret)
    const res = await POST(makeRequest(body, sig))
    const json = await res.json()
    expect(json.received).toBe(true)

    const { createSubscription } = await import('@/lib/db')
    expect(createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ org_id: 'org-uuid', status: 'active', billing_period: 'yearly' }),
    )
  })

  it('rejects duplicate via atomic claim guard', async () => {
    const { claimCheckoutAttempt } = await import('@/lib/db/checkout-attempts')
    ;(claimCheckoutAttempt as any).mockResolvedValueOnce(null)

    const body = { payment_id: '999', payment_status: 'finished', order_id: 'attempt-uuid-123' }
    const sig = createHmacSignature(body, secret)
    const res = await POST(makeRequest(body, sig))
    const json = await res.json()
    expect(json.duplicate).toBe(true)

    const { createSubscription } = await import('@/lib/db')
    expect(createSubscription).not.toHaveBeenCalled()
  })

  it('rejects request with invalid HMAC signature', async () => {
    const body = { payment_id: '999', payment_status: 'finished', order_id: 'attempt-uuid-123' }
    const res = await POST(makeRequest(body, 'bad-signature-value'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Signature mismatch')
  })

  it('returns expired for checkout attempt past expires_at', async () => {
    const { getCheckoutAttempt } = await import('@/lib/db/checkout-attempts')
    ;(getCheckoutAttempt as any).mockResolvedValueOnce({
      id: 'attempt-uuid-123',
      org_id: 'org-uuid',
      plan_name: 'pro',
      billing_period: 'yearly',
      amount_cents: 29000,
      expires_at: new Date(Date.now() - 3600000).toISOString(),
    })

    const body = { payment_id: '777', payment_status: 'waiting', order_id: 'attempt-uuid-123' }
    const sig = createHmacSignature(body, secret)
    const res = await POST(makeRequest(body, sig))
    const json = await res.json()
    expect(json.expired).toBe(true)

    const { updateCheckoutAttemptStatus } = await import('@/lib/db/checkout-attempts')
    expect(updateCheckoutAttemptStatus).toHaveBeenCalledWith('attempt-uuid-123', 'expired')
  })

  it('marks checkout attempt as partial for partially_paid', async () => {
    const body = { payment_id: '888', payment_status: 'partially_paid', order_id: 'attempt-uuid-123' }
    const sig = createHmacSignature(body, secret)
    const res = await POST(makeRequest(body, sig))
    const json = await res.json()
    expect(json.received).toBe(true)

    const { createPayment, createSubscription } = await import('@/lib/db')
    const { updateCheckoutAttemptStatus } = await import('@/lib/db/checkout-attempts')
    expect(createSubscription).not.toHaveBeenCalled()
    expect(createPayment).not.toHaveBeenCalled()
    expect(updateCheckoutAttemptStatus).toHaveBeenCalledWith('attempt-uuid-123', 'partial')
  })

  it('idempotency check uses (provider, payment_id, payment_status) — terminal event after partial is NOT deduped', async () => {
    // Simulate the prior `partially_paid` event already being recorded.
    // The dedupe must be keyed by status as well as paymentId, otherwise the
    // subsequent `finished` event will be silently dropped and the subscription
    // never activates.
    const { isWebhookEventProcessed } = await import('@/lib/db')
    ;(isWebhookEventProcessed as any).mockImplementation(
      (_provider: string, _eventId: string, eventType: string) =>
        Promise.resolve(eventType === 'partially_paid'),
    )

    const body = { payment_id: '999', payment_status: 'finished', order_id: 'attempt-uuid-123' }
    const sig = createHmacSignature(body, secret)
    const res = await POST(makeRequest(body, sig))
    const json = await res.json()

    // Terminal event passes through dedupe and creates the subscription.
    expect(json.received).toBe(true)
    expect(json.duplicate).toBeUndefined()
    expect(isWebhookEventProcessed).toHaveBeenCalledWith('nowpayments', '999', 'finished')

    const { createSubscription } = await import('@/lib/db')
    expect(createSubscription).toHaveBeenCalled()
  })
})
