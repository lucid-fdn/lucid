import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerProvider,
  getProvider,
  hasProvider,
  resetRegistry,
  listProviders,
} from '@/lib/payments/provider-registry'
import type { PaymentProvider, CheckoutParams, CheckoutResult } from '@/lib/payments/types'

function mockProvider(id: 'stripe' | 'nowpayments'): PaymentProvider {
  return {
    id,
    createCheckout: async (_params: CheckoutParams): Promise<CheckoutResult> => ({
      url: 'https://example.com',
      sessionId: 'test-session',
      provider: id,
    }),
  }
}

describe('provider-registry', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('registers and retrieves a provider', () => {
    registerProvider(mockProvider('stripe'))
    expect(hasProvider('stripe')).toBe(true)
    expect(getProvider('stripe').id).toBe('stripe')
  })

  it('throws for unknown provider', () => {
    expect(() => getProvider('unknown')).toThrow('Unknown payment provider: unknown')
  })

  it('lists registered providers', () => {
    registerProvider(mockProvider('stripe'))
    registerProvider(mockProvider('nowpayments'))
    expect(listProviders()).toEqual(['stripe', 'nowpayments'])
  })

  it('resets registry', () => {
    registerProvider(mockProvider('stripe'))
    resetRegistry()
    expect(hasProvider('stripe')).toBe(false)
  })
})
