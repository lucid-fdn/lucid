import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decideStripeIssuingAuthorizationRequest,
} from '../service'
import {
  stripeIssuingAuthorizationWebhookBody,
} from '../providers/stripe-issuing'
import {
  appendAgentCommerceEvent,
  getAgentSpendRequest,
} from '@/lib/db/agent-commerce'

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
    provider: 'stripe_issuing',
    rail: 'stripe_issuing_card',
    org_id: ORG_ID,
    status: 'credential_issued',
    merchant: {
      name: 'Acme Cloud',
      domain: 'acme.example',
      country: 'US',
    },
    amount: {
      amount: 2500,
      currency: 'usd',
    },
    context: 'Buy approved compute credits.',
    policy: {
      allowed_currencies: ['usd'],
      allowed_merchant_domains: ['acme.example'],
      blocked_merchant_domains: [],
      allowed_providers: ['stripe_issuing'],
      allowed_rails: ['stripe_issuing_card'],
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

function issuingEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_issuing_authorization_request',
    type: 'issuing_authorization.request',
    livemode: false,
    data: {
      object: {
        id: 'iauth_123',
        pending_request: {
          amount: 2400,
          currency: 'usd',
          is_amount_controllable: true,
        },
        merchant_data: {
          name: 'Acme Cloud',
          country: 'US',
          category: 'computer_software',
        },
        card: {
          metadata: {
            org_id: ORG_ID,
            agent_spend_request_id: SPEND_REQUEST_ID,
            merchant_domain: 'acme.example',
          },
        },
        ...overrides,
      },
    },
  }
}

describe('Stripe Issuing authorization decisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAgentSpendRequest.mockResolvedValue(spendRequest())
    mocks.appendAgentCommerceEvent.mockResolvedValue({
      org_id: ORG_ID,
      entity_type: 'spend_request',
      entity_id: SPEND_REQUEST_ID,
      event_type: 'stripe_issuing.authorization.approved',
      actor_type: 'provider',
      payload: {},
    })
  })

  it('approves a real-time authorization tied to an approved Lucid spend request', async () => {
    const decision = await decideStripeIssuingAuthorizationRequest(issuingEvent(), {
      type: 'provider',
      requestId: 'req-issuing',
    })

    expect(decision.approved).toBe(true)
    expect(decision.reason).toBe('approved')
    expect(stripeIssuingAuthorizationWebhookBody(decision)).toMatchObject({
      approved: true,
      amount: 2400,
      metadata: expect.objectContaining({
        agent_spend_request_id: SPEND_REQUEST_ID,
        lucid_decision: 'approved',
      }),
    })
    expect(mocks.getAgentSpendRequest).toHaveBeenCalledWith(SPEND_REQUEST_ID, ORG_ID)
    expect(mocks.appendAgentCommerceEvent).toHaveBeenCalledWith(expect.objectContaining({
      org_id: ORG_ID,
      entity_type: 'spend_request',
      entity_id: SPEND_REQUEST_ID,
      event_type: 'stripe_issuing.authorization.approved',
      provider: 'stripe_issuing',
    }))
  })

  it('declines when the card authorization exceeds the approved spend amount', async () => {
    const decision = await decideStripeIssuingAuthorizationRequest(issuingEvent({
      pending_request: {
        amount: 2600,
        currency: 'usd',
        is_amount_controllable: true,
      },
    }))

    expect(decision.approved).toBe(false)
    expect(decision.reason).toBe('amount_exceeds_limit')
    expect(mocks.appendAgentCommerceEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'stripe_issuing.authorization.declined',
      payload: expect.objectContaining({
        reason: 'amount_exceeds_limit',
      }),
    }))
  })

  it('declines high-risk authorizations before card network approval', async () => {
    const decision = await decideStripeIssuingAuthorizationRequest(issuingEvent({
      metadata: {
        risk_score: '91',
      },
    }))

    expect(decision.approved).toBe(false)
    expect(decision.reason).toBe('risk_manual_review')
  })

  it('fails closed when authorization metadata cannot be tied to a spend request', async () => {
    const decision = await decideStripeIssuingAuthorizationRequest(issuingEvent({
      card: { metadata: {} },
    }))

    expect(decision.approved).toBe(false)
    expect(decision.reason).toBe('lookup_failed')
    expect(mocks.getAgentSpendRequest).not.toHaveBeenCalled()
  })
})
