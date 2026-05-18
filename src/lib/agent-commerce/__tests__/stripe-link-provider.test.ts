import { describe, expect, it, vi } from 'vitest'
import {
  StripeLinkAgentsProvider,
  createStripeLinkAgentsProviderFromEnv,
} from '../providers/stripe-link-agents'
import { DEFAULT_STRIPE_LINK_ISSUED_TOKEN_ENDPOINT } from '../providers/stripe-link'
import { resolveAgentCommerceSecretRef } from '../secrets'

vi.mock('server-only', () => ({}))

const ORG_ID = '00000000-0000-4000-8000-000000000001'
const SPEND_REQUEST_ID = '00000000-0000-4000-8000-000000000010'

function spendRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: SPEND_REQUEST_ID,
    contract_version: '2026-05-01',
    schema_version: 1,
    provider: 'stripe_link_agents',
    rail: 'stripe_shared_payment_token',
    org_id: ORG_ID,
    project_id: '00000000-0000-4000-8000-000000000020',
    assistant_id: '00000000-0000-4000-8000-000000000030',
    run_id: 'run_123',
    tool_call_id: 'tool_123',
    idempotency_key: 'idem_12345678',
    status: 'approved',
    merchant: {
      name: 'Acme Shop',
      domain: 'shop.example',
      country: 'US',
    },
    amount: {
      amount: 4900,
      currency: 'usd',
    },
    context: 'Buy approved equipment.',
    policy: {
      allowed_currencies: ['usd'],
      allowed_merchant_domains: ['shop.example'],
      blocked_merchant_domains: [],
      allowed_providers: ['stripe_link_agents'],
      allowed_rails: ['stripe_shared_payment_token'],
      requires_human_approval: true,
      allow_preview_providers: true,
      allow_free_on_provider_outage: false,
    },
    approval_required: true,
    approved_at: '2026-05-01T00:00:00.000Z',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    metadata: {
      resource: { type: 'physical_good', id: 'sku_123' },
      stripe_orchestrated_commerce_agreement_id: 'oca_123',
      stripe_payment_method_id: 'pm_123',
      stripe_return_url: 'https://lucid.test/agent-commerce/stripe/return',
      seller: {
        name: 'Acme',
        domain: 'shop.example',
        network_business_profile: 'nbp_123',
      },
    },
    ...overrides,
  }
}

describe('Stripe Link Agents provider', () => {
  it('creates a Stripe Shared Payment issued token and stores the token id as a secret ref', async () => {
    const env = {
      AGENT_COMMERCE_SECRET_ENCRYPTION_KEY: 'x'.repeat(32),
    }
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(_url).toBe(DEFAULT_STRIPE_LINK_ISSUED_TOKEN_ENDPOINT)
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer sk_test_link',
        'stripe-version': '2026-02-25.clover',
        'idempotency-key': `agent-commerce:spend-request:${SPEND_REQUEST_ID}`,
      })
      const body = init?.body as URLSearchParams
      expect(body.get('payment_method')).toBe('pm_123')
      expect(body.get('seller_details[network_business_profile]')).toBe('nbp_123')
      expect(body.get('usage_limits[currency]')).toBe('usd')
      expect(body.get('usage_limits[max_amount]')).toBe('4900')
      expect(body.get('return_url')).toBe('https://lucid.test/agent-commerce/stripe/return')
      return new Response(JSON.stringify({
        id: 'spt_123',
        object: 'shared_payment.issued_token',
        status: 'active',
        payment_method_details: {
          card: {
            brand: 'visa',
            last4: '4242',
          },
        },
      }), { status: 200 })
    })

    const provider = new StripeLinkAgentsProvider({
      secretKey: 'sk_test_link',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env,
    })

    const credential = await provider.issueCredential(spendRequest(), { requestId: 'req_link' })

    expect(credential).toMatchObject({
      kind: 'shared_payment_token',
      provider: 'stripe_link_agents',
      spend_request_id: SPEND_REQUEST_ID,
      org_id: ORG_ID,
      status: 'issued',
      display: {
        label: 'Stripe shared payment token',
        last4: '4242',
      },
      metadata: {
        provider_credential_id: 'spt_123',
        agent_commerce_provider: 'stripe_link_agents',
        agent_commerce_rail: 'stripe_shared_payment_token',
        payment_method_brand: 'visa',
        request_id: 'req_link',
      },
    })
    expect(credential.secret_ref).toMatch(/^agent-commerce-secret:v1:/)
    expect(resolveAgentCommerceSecretRef({
      secretRef: credential.secret_ref!,
      expectedKind: 'payment_credential',
      provider: 'stripe_link_agents',
      env,
    }).value).toBe('spt_123')
  })

  it('builds from environment only when Stripe Link Agents execution is explicitly enabled', () => {
    expect(createStripeLinkAgentsProviderFromEnv({
      STRIPE_SECRET_KEY: 'sk_test_link',
    })).toBeNull()

    const provider = createStripeLinkAgentsProviderFromEnv({
      AGENT_COMMERCE_STRIPE_LINK_AGENTS_ENABLED: 'true',
      AGENT_COMMERCE_STRIPE_LINK_SECRET_REF: 'env:STRIPE_SECRET_KEY',
      STRIPE_SECRET_KEY: 'sk_test_link',
      AGENT_COMMERCE_STRIPE_LINK_ISSUED_TOKEN_ENDPOINT: 'https://stripe.test/shared_payment/issued_tokens',
    })

    expect(provider).toBeInstanceOf(StripeLinkAgentsProvider)
    expect(provider?.manifest).toMatchObject({
      id: 'stripe_link_agents',
      availability: { mode: 'preview' },
    })
  })
})
