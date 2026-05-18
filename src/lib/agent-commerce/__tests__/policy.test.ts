import { describe, expect, it } from 'vitest'
import { evaluateAgentCommercePolicy, shouldRequireHumanApproval } from '../policy'

describe('agent commerce policy', () => {
  it('allows requests inside amount, currency, and merchant policy', () => {
    const decision = evaluateAgentCommercePolicy({
      amount: { amount: 3500, currency: 'USD' },
      merchant: { name: 'Powdur', url: 'https://shop.powdur.com/products/glow' },
      policy: {
        max_amount: { amount: 5000, currency: 'usd' },
        allowed_currencies: ['usd'],
        allowed_merchant_domains: ['powdur.com'],
        blocked_merchant_domains: [],
        requires_human_approval: true,
      },
    })

    expect(decision).toEqual({ allowed: true })
  })

  it('blocks spend above the policy amount', () => {
    const decision = evaluateAgentCommercePolicy({
      amount: { amount: 6500, currency: 'usd' },
      merchant: { name: 'Powdur', domain: 'powdur.com' },
      policy: {
        max_amount: { amount: 5000, currency: 'usd' },
        allowed_currencies: ['usd'],
        allowed_merchant_domains: ['powdur.com'],
        blocked_merchant_domains: [],
        requires_human_approval: true,
      },
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/exceeds/)
  })

  it('blocks explicitly denied merchant domains before allowlist success', () => {
    const decision = evaluateAgentCommercePolicy({
      amount: { amount: 1700, currency: 'usd' },
      merchant: { name: 'Cartsy', url: 'https://checkout.cartsy.test' },
      policy: {
        allowed_currencies: ['usd'],
        allowed_merchant_domains: ['cartsy.test'],
        blocked_merchant_domains: ['checkout.cartsy.test'],
        requires_human_approval: true,
      },
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/blocked/)
  })

  it('defaults to human approval', () => {
    expect(shouldRequireHumanApproval()).toBe(true)
    expect(shouldRequireHumanApproval({ requires_human_approval: false })).toBe(false)
  })
})
