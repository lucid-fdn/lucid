import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateAgentCommerceInternalAuthHeaders } from '@/lib/agent-commerce/internal-auth'
import { POST } from '../route'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  assertAgentCommerceEnabled: vi.fn(),
  createAgentCommerceSpendRequest: vi.fn(),
  enforceAgentCommerceRateLimits: vi.fn(),
}))

vi.mock('@/lib/agent-commerce/feature-gates', () => ({
  assertAgentCommerceEnabled: mocks.assertAgentCommerceEnabled,
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

const ORG_ID = '00000000-0000-4000-8000-000000000001'
const ASSISTANT_ID = '00000000-0000-4000-8000-000000000020'
const SECRET = 'agent-commerce-internal-test-secret'

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
      amount: 1900,
      currency: 'USD',
    },
    purpose: 'Runtime-requested usage purchase.',
    idempotency_key: 'idem-internal-body',
    metadata: {},
  }
}

function signedRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const serialized = JSON.stringify(body)
  return new NextRequest('https://lucid.example.com/api/internal/agent-commerce/spend-requests', {
    method: 'POST',
    headers: {
      ...generateAgentCommerceInternalAuthHeaders(serialized, SECRET),
      'idempotency-key': 'idem-internal-header',
      ...headers,
    },
    body: serialized,
  })
}

function unsignedRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest('https://lucid.example.com/api/internal/agent-commerce/spend-requests', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'req-internal-missing',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('Agent Commerce internal spend request route', () => {
  const previousAgentSecret = process.env.AGENT_COMMERCE_INTERNAL_SECRET
  const previousInternalSecret = process.env.INTERNAL_SERVICE_SECRET

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AGENT_COMMERCE_INTERNAL_SECRET = SECRET
    delete process.env.INTERNAL_SERVICE_SECRET
    mocks.enforceAgentCommerceRateLimits.mockResolvedValue(undefined)
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

  afterEach(() => {
    if (previousAgentSecret === undefined) {
      delete process.env.AGENT_COMMERCE_INTERNAL_SECRET
    } else {
      process.env.AGENT_COMMERCE_INTERNAL_SECRET = previousAgentSecret
    }
    if (previousInternalSecret === undefined) {
      delete process.env.INTERNAL_SERVICE_SECRET
    } else {
      process.env.INTERNAL_SERVICE_SECRET = previousInternalSecret
    }
  })

  it('requires HMAC internal auth headers before parsing runtime intents', async () => {
    const response = await POST(unsignedRequest(validIntent()))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('unauthorized')
    expect(mocks.enforceAgentCommerceRateLimits).not.toHaveBeenCalled()
    expect(mocks.createAgentCommerceSpendRequest).not.toHaveBeenCalled()
  })

  it('rejects invalid HMAC signatures', async () => {
    const response = await POST(signedRequest(validIntent(), { 'x-signature': 'deadbeef' }))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('unauthorized')
    expect(mocks.enforceAgentCommerceRateLimits).not.toHaveBeenCalled()
    expect(mocks.createAgentCommerceSpendRequest).not.toHaveBeenCalled()
  })

  it('validates signed runtime payloads before rate limits or provider side effects', async () => {
    const response = await POST(signedRequest({ org_id: ORG_ID }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('validation_failed')
    expect(mocks.enforceAgentCommerceRateLimits).not.toHaveBeenCalled()
    expect(mocks.createAgentCommerceSpendRequest).not.toHaveBeenCalled()
  })

  it('accepts valid signed runtime intents and preserves runtime actor provenance', async () => {
    const response = await POST(signedRequest(validIntent()))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.spend_request.status).toBe('requires_approval')
    expect(mocks.enforceAgentCommerceRateLimits).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ bucket: 'agent-commerce:internal:spend-request' }),
      expect.objectContaining({ bucket: 'agent-commerce:internal:spend-merchant' }),
      expect.objectContaining({ bucket: 'agent-commerce:internal:spend-currency' }),
    ]))
    expect(mocks.createAgentCommerceSpendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        assistant_id: ASSISTANT_ID,
        idempotency_key: 'idem-internal-header',
        org_id: ORG_ID,
        amount: expect.objectContaining({ currency: 'usd' }),
      }),
      expect.objectContaining({
        type: 'runtime',
        id: ASSISTANT_ID,
      }),
    )
  })
})
