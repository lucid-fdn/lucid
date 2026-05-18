import { describe, expect, it } from 'vitest'
import {
  isSellerCommerceProvider,
  isWalletCommerceProvider,
} from '../provider'
import { ManualAgentCommerceProvider } from '../providers/manual'

const orgId = '11111111-1111-4111-8111-111111111111'

describe('ManualAgentCommerceProvider', () => {
  it('supports both wallet spend requests and seller grants', () => {
    const provider = new ManualAgentCommerceProvider()

    expect(isWalletCommerceProvider(provider)).toBe(true)
    expect(isSellerCommerceProvider(provider)).toBe(true)
    expect(provider.manifest.roles).toEqual(expect.arrayContaining(['agent_platform', 'seller', 'machine_payment']))
  })

  it('requires approval by default for allowed spend requests', async () => {
    const provider = new ManualAgentCommerceProvider()

    const request = await provider.createSpendRequest({
      provider: 'manual',
      org_id: orgId,
      merchant: { name: 'Powdur', domain: 'powdur.com' },
      amount: { amount: 2500, currency: 'USD' },
      context: 'Buy supplies for a generated agent workflow.',
    })

    expect(request.status).toBe('requires_approval')
    expect(request.amount.currency).toBe('usd')
  })

  it('auto-approves only when policy allows autonomy', async () => {
    const provider = new ManualAgentCommerceProvider()

    const request = await provider.createSpendRequest({
      provider: 'manual',
      org_id: orgId,
      merchant: { name: 'Powdur', domain: 'powdur.com' },
      amount: { amount: 2500, currency: 'usd' },
      context: 'Buy supplies for a generated agent workflow.',
      policy: {
        allowed_currencies: ['usd'],
        allowed_merchant_domains: ['powdur.com'],
        blocked_merchant_domains: [],
        requires_human_approval: false,
        max_amount: { amount: 3000, currency: 'usd' },
      },
    })

    expect(request.status).toBe('approved')
  })

  it('declines spend requests blocked by policy', async () => {
    const provider = new ManualAgentCommerceProvider()

    const request = await provider.createSpendRequest({
      provider: 'manual',
      org_id: orgId,
      merchant: { name: 'Powdur', domain: 'powdur.com' },
      amount: { amount: 4000, currency: 'usd' },
      context: 'Buy supplies for a generated agent workflow.',
      policy: {
        allowed_currencies: ['usd'],
        allowed_merchant_domains: ['powdur.com'],
        blocked_merchant_domains: [],
        requires_human_approval: false,
        max_amount: { amount: 3000, currency: 'usd' },
      },
    })

    expect(request.status).toBe('declined')
    expect(request.metadata.policy_decision).toMatchObject({
      allowed: false,
    })
  })

  it('accepts manual seller grants', async () => {
    const provider = new ManualAgentCommerceProvider()

    const result = await provider.acceptGrant({
      provider: 'manual',
      org_id: orgId,
      grant_id: 'grant_manual_123',
      amount: { amount: 5000, currency: 'usd' },
    })

    expect(result.status).toBe('accepted')
    expect(result.payment_id).toMatch(/^manual_/)
  })
})
