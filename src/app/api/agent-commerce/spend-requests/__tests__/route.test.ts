import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '../route'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  assertAgentCommerceEnabled: vi.fn(),
  createAgentCommerceSpendRequest: vi.fn(),
  enforceAgentCommerceRateLimits: vi.fn(),
  getUserId: vi.fn(),
  listAgentSpendRequests: vi.fn(),
  requireAgentCommerceOrgMembership: vi.fn(),
}))

vi.mock('@/lib/agent-commerce/feature-gates', () => ({
  assertAgentCommerceEnabled: mocks.assertAgentCommerceEnabled,
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: mocks.getUserId,
}))

vi.mock('@/lib/agent-commerce/operator-auth', () => ({
  requireAgentCommerceOrgMembership: mocks.requireAgentCommerceOrgMembership,
}))

vi.mock('@/lib/agent-commerce/rate-limit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/agent-commerce/rate-limit')>(
    '@/lib/agent-commerce/rate-limit',
  )
  return {
    ...actual,
    enforceAgentCommerceRateLimits: mocks.enforceAgentCommerceRateLimits,
  }
})

vi.mock('@/lib/agent-commerce/service', () => ({
  createAgentCommerceSpendRequest: mocks.createAgentCommerceSpendRequest,
}))

vi.mock('@/lib/db/agent-commerce', () => ({
  listAgentSpendRequests: mocks.listAgentSpendRequests,
}))

const ORG_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000010'
const ASSISTANT_ID = '00000000-0000-4000-8000-000000000020'

function getRequest(search = `orgId=${ORG_ID}`) {
  return new NextRequest(`https://lucid.example.com/api/agent-commerce/spend-requests?${search}`, {
    method: 'GET',
    headers: { 'x-request-id': 'req-public-get' },
  })
}

function postRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest('https://lucid.example.com/api/agent-commerce/spend-requests', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cookie': 'csrf-token=csrf-public',
      'x-csrf-token': 'csrf-public',
      'x-request-id': 'req-public-post',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function validIntent() {
  return {
    org_id: ORG_ID,
    assistant_id: ASSISTANT_ID,
    merchant: {
      name: 'Acme Cloud',
      domain: 'acme.example',
      country: 'US',
    },
    amount: {
      amount: 2500,
      currency: 'USD',
    },
    purpose: 'Buy a usage credit for a generated app action.',
    idempotency_key: 'idem-public-body',
    metadata: {},
  }
}

describe('Agent Commerce public spend request route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue(USER_ID)
    mocks.requireAgentCommerceOrgMembership.mockResolvedValue({ role: 'admin' })
    mocks.enforceAgentCommerceRateLimits.mockResolvedValue(undefined)
    mocks.listAgentSpendRequests.mockResolvedValue([])
    mocks.createAgentCommerceSpendRequest.mockResolvedValue({
      spendRequest: {
        id: '00000000-0000-4000-8000-000000000030',
        org_id: ORG_ID,
        status: 'requires_approval',
        provider: 'manual',
        rail: 'manual_approval',
      },
      idempotent: false,
    })
  })

  it('requires an authenticated user before listing org spend requests', async () => {
    mocks.getUserId.mockResolvedValueOnce(null)

    const response = await GET(getRequest())
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('unauthorized')
    expect(mocks.requireAgentCommerceOrgMembership).not.toHaveBeenCalled()
    expect(mocks.listAgentSpendRequests).not.toHaveBeenCalled()
  })

  it('validates org-scoped list parameters before reading the ledger', async () => {
    const response = await GET(getRequest('orgId=not-a-uuid&limit=10'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('validation_failed')
    expect(mocks.requireAgentCommerceOrgMembership).not.toHaveBeenCalled()
    expect(mocks.listAgentSpendRequests).not.toHaveBeenCalled()
  })

  it('enforces org membership and creates a normalized spend request', async () => {
    const response = await POST(postRequest(validIntent(), { 'idempotency-key': 'idem-public-header' }))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.spend_request.status).toBe('requires_approval')
    expect(mocks.requireAgentCommerceOrgMembership).toHaveBeenCalledWith(USER_ID, ORG_ID)
    expect(mocks.enforceAgentCommerceRateLimits).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ bucket: 'agent-commerce:public:spend-request' }),
      expect.objectContaining({ bucket: 'agent-commerce:public:spend-merchant' }),
      expect.objectContaining({ bucket: 'agent-commerce:public:spend-currency' }),
    ]))
    expect(mocks.createAgentCommerceSpendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_user_id: USER_ID,
        idempotency_key: 'idem-public-header',
        org_id: ORG_ID,
        amount: expect.objectContaining({ currency: 'usd' }),
      }),
      expect.objectContaining({
        type: 'user',
        id: USER_ID,
        requestId: 'req-public-post',
      }),
    )
  })

  it('fails malformed mutation requests before rate limits or provider side effects', async () => {
    const response = await POST(postRequest({ org_id: ORG_ID }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('idempotency_required')
    expect(mocks.enforceAgentCommerceRateLimits).not.toHaveBeenCalled()
    expect(mocks.createAgentCommerceSpendRequest).not.toHaveBeenCalled()
  })
})
