import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyStripeAgentCommerceProviderEvent } from '../service'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  appendAgentCommerceEvent: vi.fn(),
  assertAgentCommerceAssistantScope: vi.fn(),
  assertAgentCommerceEnabled: vi.fn(),
  claimAgentCommerceIdempotencyKey: vi.fn(),
  claimMachinePaymentProof: vi.fn(),
  completeAgentCommerceIdempotencyKey: vi.fn(),
  completeAgentSpendRequestWithLedger: vi.fn(),
  createAgentCommerceCredential: vi.fn(),
  createAgentSpendRequest: vi.fn(),
  createMachinePaymentChallenge: vi.fn(),
  createSellerPaymentGrant: vi.fn(),
  fulfillSellerPaymentGrantEntitlement: vi.fn(),
  getAgentSpendRequest: vi.fn(),
  getSellerPaymentGrant: vi.fn(),
  getSellerPaymentGrantByProviderGrantId: vi.fn(),
  getSellerPaymentGrantByProviderPaymentId: vi.fn(),
  listAgentCommerceConnections: vi.fn(),
  releaseAgentSpendBudget: vi.fn(),
  reserveAgentSpendBudget: vi.fn(),
  revokeSellerPaymentGrantEntitlement: vi.fn(),
  transitionAgentSpendRequest: vi.fn(),
  transitionSellerPaymentGrant: vi.fn(),
  upsertAgentCommerceConnection: vi.fn(),
}))

vi.mock('../feature-gates', () => ({
  assertAgentCommerceEnabled: mocks.assertAgentCommerceEnabled,
  isAgentCommerceEnabled: vi.fn(() => true),
  isAgentCommerceKillSwitchActive: vi.fn(() => false),
  isAgentCommerceSellerEnabled: vi.fn(() => true),
  isAgentCommerceWalletsEnabled: vi.fn(() => true),
}))

vi.mock('@/lib/db/agent-commerce', () => ({
  appendAgentCommerceEvent: mocks.appendAgentCommerceEvent,
  assertAgentCommerceAssistantScope: mocks.assertAgentCommerceAssistantScope,
  claimAgentCommerceIdempotencyKey: mocks.claimAgentCommerceIdempotencyKey,
  claimMachinePaymentProof: mocks.claimMachinePaymentProof,
  completeAgentCommerceIdempotencyKey: mocks.completeAgentCommerceIdempotencyKey,
  completeAgentSpendRequestWithLedger: mocks.completeAgentSpendRequestWithLedger,
  createAgentCommerceCredential: mocks.createAgentCommerceCredential,
  createAgentSpendRequest: mocks.createAgentSpendRequest,
  createMachinePaymentChallenge: mocks.createMachinePaymentChallenge,
  createSellerPaymentGrant: mocks.createSellerPaymentGrant,
  fulfillSellerPaymentGrantEntitlement: mocks.fulfillSellerPaymentGrantEntitlement,
  getAgentSpendRequest: mocks.getAgentSpendRequest,
  getSellerPaymentGrant: mocks.getSellerPaymentGrant,
  getSellerPaymentGrantByProviderGrantId: mocks.getSellerPaymentGrantByProviderGrantId,
  getSellerPaymentGrantByProviderPaymentId: mocks.getSellerPaymentGrantByProviderPaymentId,
  listAgentCommerceConnections: mocks.listAgentCommerceConnections,
  releaseAgentSpendBudget: mocks.releaseAgentSpendBudget,
  reserveAgentSpendBudget: mocks.reserveAgentSpendBudget,
  revokeSellerPaymentGrantEntitlement: mocks.revokeSellerPaymentGrantEntitlement,
  transitionAgentSpendRequest: mocks.transitionAgentSpendRequest,
  transitionSellerPaymentGrant: mocks.transitionSellerPaymentGrant,
  upsertAgentCommerceConnection: mocks.upsertAgentCommerceConnection,
}))

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
    status: 'credential_issued',
    merchant: { name: 'Acme Shop', domain: 'shop.example' },
    amount: { amount: 4900, currency: 'usd' },
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
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    metadata: {},
    ...overrides,
  }
}

function requestedSessionEvent(type = 'requested_session.completed') {
  return {
    id: 'evt_acs_requested_session_completed',
    type,
    livemode: false,
    data: {
      object: {
        id: 'acs_rs_123',
        status: 'completed',
        metadata: {
          org_id: ORG_ID,
          agent_spend_request_id: SPEND_REQUEST_ID,
        },
        shared_payment_token: {
          id: 'spt_123',
        },
      },
    },
  }
}

function issuedTokenEvent(type = 'shared_payment.issued_token.deactivated') {
  return {
    id: 'evt_spt_deactivated',
    type,
    livemode: false,
    data: {
      object: {
        id: 'spt_123',
        object: 'shared_payment.issued_token',
        status: 'deactivated',
        metadata: {
          org_id: ORG_ID,
          agent_spend_request_id: SPEND_REQUEST_ID,
        },
      },
    },
  }
}

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000050',
    contract_version: '2026-05-01',
    schema_version: 1,
    org_id: ORG_ID,
    provider: 'stripe_link_agents',
    provider_account_id: 'acct_seller_123',
    provider_connection_id: 'oca_123',
    status: 'active',
    capabilities: ['wallet_oauth', 'spend_request', 'one_time_card', 'shared_payment_token'],
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    metadata: {},
    ...overrides,
  }
}

function agreementEvent(type = 'v2.orchestrated_commerce.agreement.confirmed') {
  return {
    id: 'evt_oca_confirmed',
    type,
    livemode: false,
    data: {
      object: {
        id: 'oca_123',
        status: 'confirmed',
        seller: {
          id: 'acct_seller_123',
          name: 'Acme Seller',
          domain: 'shop.example',
        },
        metadata: {
          org_id: ORG_ID,
          user_id: '00000000-0000-4000-8000-000000000099',
        },
      },
    },
  }
}

describe('Stripe Link Agents provider events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAgentSpendRequest.mockResolvedValue(spendRequest())
    mocks.completeAgentSpendRequestWithLedger.mockResolvedValue(spendRequest({
      status: 'completed',
      provider_request_id: 'acs_rs_123',
      provider_credential_id: 'spt_123',
    }))
    mocks.upsertAgentCommerceConnection.mockResolvedValue(connection())
    mocks.appendAgentCommerceEvent.mockResolvedValue({})
  })

  it('upserts Stripe OCA agreement webhooks into durable Agent Commerce connections', async () => {
    const applied = await applyStripeAgentCommerceProviderEvent(agreementEvent(), {
      type: 'provider',
      requestId: 'req_webhook',
    })

    expect(applied).toMatchObject({
      id: '00000000-0000-4000-8000-000000000050',
      provider: 'stripe_link_agents',
      provider_connection_id: 'oca_123',
      status: 'active',
    })
    expect(mocks.upsertAgentCommerceConnection).toHaveBeenCalledWith(expect.objectContaining({
      org_id: ORG_ID,
      user_id: '00000000-0000-4000-8000-000000000099',
      provider: 'stripe_link_agents',
      provider_account_id: 'acct_seller_123',
      provider_connection_id: 'oca_123',
      status: 'active',
      capabilities: expect.arrayContaining(['agentic_checkout', 'shared_payment_token']),
      metadata: expect.objectContaining({
        stripe_event_id: 'evt_oca_confirmed',
        stripe_event_type: 'v2.orchestrated_commerce.agreement.confirmed',
        agreement_status: 'confirmed',
        seller_name: 'Acme Seller',
        seller_domain: 'shop.example',
      }),
    }))
    expect(mocks.appendAgentCommerceEvent).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'connection',
      event_type: 'connection.active',
      provider: 'stripe_link_agents',
    }))
  })

  it('maps completed RequestedSession-style events back to Lucid spend requests', async () => {
    const applied = await applyStripeAgentCommerceProviderEvent(requestedSessionEvent(), {
      type: 'provider',
      requestId: 'req_webhook',
    })

    expect(applied).toMatchObject({
      id: SPEND_REQUEST_ID,
      status: 'completed',
      provider_request_id: 'acs_rs_123',
      provider_credential_id: 'spt_123',
    })
    expect(mocks.assertAgentCommerceEnabled).toHaveBeenCalledWith('wallets')
    expect(mocks.completeAgentSpendRequestWithLedger).toHaveBeenCalledWith(expect.objectContaining({
      id: SPEND_REQUEST_ID,
      orgId: ORG_ID,
      providerRequestId: 'acs_rs_123',
      providerCredentialId: 'spt_123',
    }))
    expect(mocks.appendAgentCommerceEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'spend_request.completed',
      provider: 'stripe_link_agents',
    }))
  })

  it('fails a spend request when Stripe reports terminal failure', async () => {
    mocks.transitionAgentSpendRequest.mockResolvedValue(spendRequest({ status: 'failed' }))
    const event = requestedSessionEvent('requested_session.failed')
    ;(((event.data as Record<string, unknown>).object as Record<string, unknown>).status) = 'failed'

    const applied = await applyStripeAgentCommerceProviderEvent(event, {
      type: 'provider',
      requestId: 'req_webhook',
    })

    expect(applied).toMatchObject({ id: SPEND_REQUEST_ID, status: 'failed' })
    expect(mocks.transitionAgentSpendRequest).toHaveBeenCalledWith(expect.objectContaining({
      id: SPEND_REQUEST_ID,
      orgId: ORG_ID,
      status: 'failed',
      providerRequestId: 'acs_rs_123',
      providerCredentialId: 'spt_123',
    }))
  })

  it('maps shared payment issued-token deactivation webhooks back to Lucid spend requests', async () => {
    mocks.transitionAgentSpendRequest.mockResolvedValue(spendRequest({ status: 'failed' }))

    const applied = await applyStripeAgentCommerceProviderEvent(issuedTokenEvent(), {
      type: 'provider',
      requestId: 'req_webhook',
    })

    expect(applied).toMatchObject({ id: SPEND_REQUEST_ID, status: 'failed' })
    expect(mocks.transitionAgentSpendRequest).toHaveBeenCalledWith(expect.objectContaining({
      id: SPEND_REQUEST_ID,
      orgId: ORG_ID,
      status: 'failed',
      providerRequestId: 'spt_123',
      providerCredentialId: 'spt_123',
    }))
  })
})
