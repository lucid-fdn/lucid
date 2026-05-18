import { describe, expect, it } from 'vitest'
import {
  AGENT_COMMERCE_METADATA_MAX_BYTES,
  AGENT_COMMERCE_METADATA_MAX_DEPTH,
  AGENT_COMMERCE_METADATA_MAX_KEYS,
  AgentCommerceIntentSchema,
  AgentCommerceSellerEntitlementSchema,
} from '@contracts/agent-commerce'

const baseIntent = {
  org_id: '00000000-0000-4000-8000-000000000001',
  actor_user_id: '00000000-0000-4000-8000-000000000002',
  merchant: { name: 'Lucid', domain: 'lucid.example' },
  amount: { amount: 100, currency: 'USD' },
  purpose: 'Test spend',
  idempotency_key: 'idem_12345678',
}

describe('Agent Commerce contracts', () => {
  it('normalizes money currency while preserving provider-neutral metadata', () => {
    const parsed = AgentCommerceIntentSchema.parse({
      ...baseIntent,
      metadata: { source: 'test' },
    })

    expect(parsed.amount.currency).toBe('usd')
    expect(parsed.metadata).toEqual({ source: 'test' })
  })

  it('rejects metadata that exceeds the byte limit', () => {
    const parsed = AgentCommerceIntentSchema.safeParse({
      ...baseIntent,
      metadata: { value: 'x'.repeat(AGENT_COMMERCE_METADATA_MAX_BYTES + 1) },
    })

    expect(parsed.success).toBe(false)
  })

  it('rejects metadata that exceeds the depth limit', () => {
    let metadata: Record<string, unknown> = { leaf: true }
    for (let index = 0; index < AGENT_COMMERCE_METADATA_MAX_DEPTH + 1; index += 1) {
      metadata = { nested: metadata }
    }

    const parsed = AgentCommerceIntentSchema.safeParse({
      ...baseIntent,
      metadata,
    })

    expect(parsed.success).toBe(false)
  })

  it('rejects metadata that exceeds the key count limit', () => {
    const metadata = Object.fromEntries(
      Array.from({ length: AGENT_COMMERCE_METADATA_MAX_KEYS + 1 }).map((_, index) => [`key_${index}`, index]),
    )

    const parsed = AgentCommerceIntentSchema.safeParse({
      ...baseIntent,
      metadata,
    })

    expect(parsed.success).toBe(false)
  })

  it('models seller entitlements independently from provider payments', () => {
    const parsed = AgentCommerceSellerEntitlementSchema.parse({
      id: '00000000-0000-4000-8000-000000000010',
      org_id: '00000000-0000-4000-8000-000000000001',
      seller_grant_id: '00000000-0000-4000-8000-000000000011',
      provider: 'stripe_shared_payment_tokens',
      resource_type: 'plan',
      resource_id: 'pro',
      status: 'active',
      target_type: 'subscription',
      target_id: '00000000-0000-4000-8000-000000000012',
      effective_at: '2026-05-01T00:00:00.000Z',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      metadata: { provider_payment_id: 'pi_test' },
    })

    expect(parsed.contract_version).toBe('2026-05-01')
    expect(parsed.target_type).toBe('subscription')
    expect(parsed.metadata.provider_payment_id).toBe('pi_test')
  })
})
