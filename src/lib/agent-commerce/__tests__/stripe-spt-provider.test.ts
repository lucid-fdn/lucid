import { describe, expect, it, vi } from 'vitest'
import {
  StripeSharedPaymentTokensProvider,
  createStripeSharedPaymentTokensProviderFromEnv,
} from '../providers/stripe-spt'

vi.mock('server-only', () => ({}))

describe('Stripe Shared Payment Tokens provider', () => {
  it('creates a PaymentIntent through fetch with scoped Agent Commerce metadata', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body as URLSearchParams
      expect(body.get('amount')).toBe('2500')
      expect(body.get('currency')).toBe('usd')
      expect(body.get('confirm')).toBe('true')
      expect(body.get('payment_method_data[shared_payment_granted_token]')).toBe('spt_grant_123')
      expect(body.get('metadata[org_id]')).toBe('00000000-0000-4000-8000-000000000001')
      expect(body.get('metadata[seller_grant_id]')).toBe('00000000-0000-4000-8000-000000000002')
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer sk_test_123',
        'stripe-version': '2026-02-25.clover',
      })
      return new Response(JSON.stringify({ id: 'pi_123', status: 'succeeded' }), { status: 200 })
    })

    const provider = new StripeSharedPaymentTokensProvider({
      secretKey: 'sk_test_123',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    const result = await provider.acceptGrant({
      id: '00000000-0000-4000-8000-000000000002',
      org_id: '00000000-0000-4000-8000-000000000001',
      provider: 'stripe_shared_payment_tokens',
      rail: 'stripe_shared_payment_token',
      grant_id: 'spt_grant_123',
      status: 'received',
      resource_type: 'plan',
      resource_id: 'pro',
      amount: { amount: 2500, currency: 'usd' },
      metadata: { source: 'test' },
    }, { requestId: 'req_123' })

    expect(result).toEqual({ payment_id: 'pi_123', status: 'completed' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('builds from an environment-backed secret ref when enabled', () => {
    const provider = createStripeSharedPaymentTokensProviderFromEnv({
      AGENT_COMMERCE_STRIPE_SPT_ENABLED: 'true',
      AGENT_COMMERCE_STRIPE_SECRET_REF: 'env:STRIPE_SECRET_KEY',
      STRIPE_SECRET_KEY: 'sk_test_from_ref',
    })

    expect(provider).toBeInstanceOf(StripeSharedPaymentTokensProvider)
  })
})
