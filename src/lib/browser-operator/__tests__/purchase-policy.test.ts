import { describe, expect, it } from 'vitest'
import { evaluateBrowserOperatorPurchasePolicy, hashBrowserOperatorCart } from '../purchase-policy'
import type {
  BrowserOperatorPurchaseCartItem,
  BrowserOperatorPurchasePolicy,
} from '@contracts/browser-operator'

const policy: BrowserOperatorPurchasePolicy = {
  id: '4d45f48a-68eb-4e39-8ffd-7a4cfc765bd3',
  contract_version: '2026-05-10',
  schema_version: 1,
  org_id: '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b',
  name: 'Weekly groceries',
  status: 'active',
  schedule: {},
  max_total: { amount: 15_000, currency: 'usd' },
  allowed_merchant_domains: ['instacart.com'],
  blocked_merchant_domains: [],
  allowed_categories: ['food', 'household'],
  blocked_categories: ['alcohol'],
  allow_substitutions: true,
  max_substitution_delta_percent: 15,
  requires_human_approval: false,
  auto_approve_inside_policy: true,
  created_at: '2026-05-10T00:00:00.000Z',
  updated_at: '2026-05-10T00:00:00.000Z',
  metadata: {},
}

const cart: BrowserOperatorPurchaseCartItem[] = [
  {
    name: 'Organic milk',
    quantity: 2,
    unit_price: 4.5,
    total_price: 9,
    currency: 'usd',
    category: 'food',
    policy_flags: [],
    metadata: {},
  },
  {
    name: 'Paper towels',
    quantity: 1,
    unit_price: 11,
    total_price: 11,
    currency: 'usd',
    category: 'household',
    policy_flags: [],
    metadata: {},
  },
]

describe('Browser Operator purchase policy', () => {
  it('auto-approves carts inside standing policy', () => {
    const decision = evaluateBrowserOperatorPurchasePolicy({
      policy,
      merchant: { name: 'Instacart', domain: 'www.instacart.com' },
      cartItems: cart,
      now: new Date('2026-05-10T00:00:00.000Z'),
    })

    expect(decision).toMatchObject({
      allowed: true,
      approvalState: 'not_required',
      reasonCodes: [],
      cartTotal: { amount: 2_000, currency: 'usd' },
    })
    expect(decision.cartHash).toMatch(/[0-9a-f]{64}/)
  })

  it('blocks when cart exceeds policy or category limits', () => {
    const decision = evaluateBrowserOperatorPurchasePolicy({
      policy,
      merchant: { name: 'Instacart', domain: 'instacart.com' },
      cartItems: [
        ...cart,
        {
          name: 'Wine',
          quantity: 1,
          total_price: 200,
          currency: 'usd',
          category: 'alcohol',
          policy_flags: [],
          metadata: {},
        },
      ],
    })

    expect(decision.allowed).toBe(false)
    expect(decision.approvalState).toBe('blocked')
    expect(decision.reasonCodes).toEqual(expect.arrayContaining([
      'category_blocked',
      'category_not_allowed',
      'max_total_exceeded',
    ]))
  })

  it('hashes equivalent carts deterministically regardless of item order', () => {
    expect(hashBrowserOperatorCart(cart)).toBe(hashBrowserOperatorCart([...cart].reverse()))
  })
})
