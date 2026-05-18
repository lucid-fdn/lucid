import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '../route'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  appendAgentCommerceEvent: vi.fn(),
  applyStripeAgentCommerceProviderEvent: vi.fn(),
  decideStripeIssuingAuthorizationRequest: vi.fn(),
  extractWebhookOrgId: vi.fn(),
  guardAgentCommerceSurface: vi.fn(),
  normalizeAgentCommerceWebhookEntity: vi.fn(),
  verifyStripeAgentCommerceWebhook: vi.fn(),
}))

vi.mock('@/lib/agent-commerce/api', () => ({
  agentCommerceRequestId: (request: Request) => request.headers.get('x-request-id') ?? 'req-test',
  agentCommerceOk: (body: Record<string, unknown>, requestId: string, init: ResponseInit = {}) => (
    Response.json({ ...body, request_id: requestId }, {
      ...init,
      headers: { 'x-request-id': requestId, ...(init.headers ?? {}) },
    })
  ),
  agentCommerceErrorResponse: (error: unknown, requestId: string) => (
    Response.json({
      error: {
        code: error instanceof Error ? error.name : 'unknown',
        message: error instanceof Error ? error.message : 'Unknown error.',
      },
      request_id: requestId,
    }, { status: 500 })
  ),
  guardAgentCommerceSurface: mocks.guardAgentCommerceSurface,
}))

vi.mock('@/lib/agent-commerce/webhooks', () => ({
  extractWebhookOrgId: mocks.extractWebhookOrgId,
  normalizeAgentCommerceWebhookEntity: mocks.normalizeAgentCommerceWebhookEntity,
  verifyStripeAgentCommerceWebhook: mocks.verifyStripeAgentCommerceWebhook,
}))

vi.mock('@/lib/agent-commerce/service', () => ({
  applyStripeAgentCommerceProviderEvent: mocks.applyStripeAgentCommerceProviderEvent,
  decideStripeIssuingAuthorizationRequest: mocks.decideStripeIssuingAuthorizationRequest,
}))

vi.mock('@/lib/db/agent-commerce', () => ({
  appendAgentCommerceEvent: mocks.appendAgentCommerceEvent,
}))

const ORG_ID = '00000000-0000-4000-8000-000000000001'
const SPEND_REQUEST_ID = '00000000-0000-4000-8000-000000000010'

function request(event: Record<string, unknown>) {
  return new NextRequest('https://lucid.example.com/api/webhooks/stripe/agent-commerce', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': 't=123,v1=sig',
      'x-request-id': 'req-stripe-webhook',
    },
    body: JSON.stringify(event),
  })
}

describe('Stripe Agent Commerce webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.guardAgentCommerceSurface.mockReturnValue(null)
    mocks.extractWebhookOrgId.mockReturnValue(ORG_ID)
    mocks.normalizeAgentCommerceWebhookEntity.mockReturnValue({
      entity_type: 'spend_request',
      entity_id: SPEND_REQUEST_ID,
      matched: true,
    })
    mocks.appendAgentCommerceEvent.mockResolvedValue({
      org_id: ORG_ID,
      entity_type: 'spend_request',
      entity_id: SPEND_REQUEST_ID,
      event_type: 'stripe.issuing_authorization.created',
      actor_type: 'provider',
      payload: {},
    })
    mocks.applyStripeAgentCommerceProviderEvent.mockResolvedValue(null)
    mocks.decideStripeIssuingAuthorizationRequest.mockResolvedValue({
      approved: false,
      reason: 'risk_manual_review',
      provider: 'stripe_issuing',
      authorization_id: 'iauth_123',
      org_id: ORG_ID,
      spend_request_id: SPEND_REQUEST_ID,
      currency: 'usd',
      metadata: {
        lucid_decision: 'declined',
        lucid_reason: 'risk_manual_review',
        org_id: ORG_ID,
        agent_spend_request_id: SPEND_REQUEST_ID,
      },
    })
  })

  it('responds directly to Stripe Issuing real-time authorization requests', async () => {
    const response = await POST(request({
      id: 'evt_123',
      type: 'issuing_authorization.request',
      data: { object: { id: 'iauth_123' } },
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('stripe-version')).toBe('2026-02-25.clover')
    expect(body).toMatchObject({
      approved: false,
      metadata: {
        lucid_reason: 'risk_manual_review',
        agent_spend_request_id: SPEND_REQUEST_ID,
      },
    })
    expect(mocks.guardAgentCommerceSurface).not.toHaveBeenCalled()
    expect(mocks.applyStripeAgentCommerceProviderEvent).not.toHaveBeenCalled()
  })

  it('records non-real-time Stripe Issuing authorization events as wallet-provider events', async () => {
    const response = await POST(request({
      id: 'evt_456',
      type: 'issuing_authorization.created',
      data: {
        object: {
          id: 'iauth_456',
          metadata: { org_id: ORG_ID, agent_spend_request_id: SPEND_REQUEST_ID },
        },
      },
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.received).toBe(true)
    expect(mocks.guardAgentCommerceSurface).toHaveBeenCalledWith('wallets', expect.any(NextRequest))
    expect(mocks.appendAgentCommerceEvent).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'stripe_issuing',
      event_type: 'stripe.issuing_authorization.created',
    }))
    expect(mocks.applyStripeAgentCommerceProviderEvent).not.toHaveBeenCalled()
  })

  it('returns applied connection ids for Stripe OCA agreement webhooks', async () => {
    mocks.normalizeAgentCommerceWebhookEntity.mockReturnValue({
      entity_type: 'provider_health',
      entity_id: '00000000-0000-4000-8000-000000000090',
      matched: false,
    })
    mocks.applyStripeAgentCommerceProviderEvent.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000050',
      org_id: ORG_ID,
      provider: 'stripe_link_agents',
      provider_connection_id: 'oca_123',
      status: 'active',
    })

    const response = await POST(request({
      id: 'evt_oca_confirmed',
      type: 'v2.orchestrated_commerce.agreement.confirmed',
      data: {
        object: {
          id: 'oca_123',
          metadata: { org_id: ORG_ID },
        },
      },
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      received: true,
      applied_entity_id: '00000000-0000-4000-8000-000000000050',
      applied_connection_id: '00000000-0000-4000-8000-000000000050',
    })
    expect(body.applied_spend_request_id).toBeUndefined()
    expect(mocks.guardAgentCommerceSurface).toHaveBeenCalledWith('wallets', expect.any(NextRequest))
    expect(mocks.appendAgentCommerceEvent).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'stripe_link_agents',
      event_type: 'stripe.v2.orchestrated_commerce.agreement.confirmed',
    }))
  })
})
