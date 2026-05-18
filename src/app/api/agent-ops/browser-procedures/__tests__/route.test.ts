import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  checkRateLimit: vi.fn(),
  isUserOrgMember: vi.fn(),
  listAgentOpsBrowserProcedures: vi.fn(),
  findMatchingAgentOpsBrowserProcedures: vi.fn(),
  createAgentOpsBrowserProcedure: vi.fn(),
  createAgentOpsBrowserProcedureVersion: vi.fn(),
  getAgentOpsBrowserProcedureDetail: vi.fn(),
  updateAgentOpsBrowserProcedureTrustState: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: mocks.getUserId,
}))

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  getRequestIdentifier: vi.fn(() => 'test-request'),
  RateLimitPresets: {
    RELAXED: { name: 'relaxed' },
    STANDARD: { name: 'standard' },
  },
}))

vi.mock('@/lib/auth/csrf', () => ({
  withCSRF: (handler: unknown) => handler,
}))

vi.mock('@/lib/db', () => ({
  createAgentOpsBrowserProcedure: mocks.createAgentOpsBrowserProcedure,
  createAgentOpsBrowserProcedureVersion: mocks.createAgentOpsBrowserProcedureVersion,
  findMatchingAgentOpsBrowserProcedures: mocks.findMatchingAgentOpsBrowserProcedures,
  getAgentOpsBrowserProcedureDetail: mocks.getAgentOpsBrowserProcedureDetail,
  isUserOrgMember: mocks.isUserOrgMember,
  listAgentOpsBrowserProcedures: mocks.listAgentOpsBrowserProcedures,
  updateAgentOpsBrowserProcedureTrustState: mocks.updateAgentOpsBrowserProcedureTrustState,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { GET, POST } from '../route'
import { PATCH } from '../[id]/route'

const orgId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const userId = '44444444-4444-4444-8444-444444444444'
const procedureId = '55555555-5555-4555-8555-555555555555'

function request(url: string, init?: RequestInit) {
  return new NextRequest(url, init)
}

describe('/api/agent-ops/browser-procedures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue(userId)
    mocks.checkRateLimit.mockResolvedValue({ success: true })
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.listAgentOpsBrowserProcedures.mockResolvedValue([])
    mocks.findMatchingAgentOpsBrowserProcedures.mockResolvedValue([])
    mocks.createAgentOpsBrowserProcedure.mockResolvedValue({
      id: procedureId,
      orgId,
      projectId,
      hostPattern: 'www.example.com',
      name: 'Check homepage',
      slug: 'check-homepage',
      description: 'Validate homepage.',
      intentTriggers: ['check homepage'],
      procedureType: 'qa',
      scope: 'project',
      trustState: 'draft',
      sourceRunId: null,
      createdByUserId: userId,
      createdByAgentId: null,
      metadata: {},
      createdAt: '2026-05-02T00:00:00.000Z',
      updatedAt: '2026-05-02T00:00:00.000Z',
    })
    mocks.createAgentOpsBrowserProcedureVersion.mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      procedureId,
      version: 1,
    })
    mocks.updateAgentOpsBrowserProcedureTrustState.mockResolvedValue({
      id: procedureId,
      trustState: 'active',
    })
  })

  it('lists deterministic matches when an intent is supplied', async () => {
    const response = await GET(request(
      `http://localhost:3000/api/agent-ops/browser-procedures?org_id=${orgId}&project_id=${projectId}&host=www.example.com&intent=check%20homepage`,
    ))

    expect(response.status).toBe(200)
    expect(mocks.findMatchingAgentOpsBrowserProcedures).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      projectId,
      host: 'www.example.com',
      intent: 'check homepage',
    }))
  })

  it('creates a procedure and optional first version', async () => {
    const response = await POST(request('http://localhost:3000/api/agent-ops/browser-procedures', {
      method: 'POST',
      body: JSON.stringify({
        org_id: orgId,
        project_id: projectId,
        host_pattern: 'www.example.com',
        name: 'Check homepage',
        description: 'Validate homepage.',
        intent_triggers: ['check homepage'],
        procedure_type: 'qa',
        initial_version: {
          definition: { steps: [] },
        },
      }),
      headers: { 'content-type': 'application/json' },
    }) as NextRequest)

    expect(response.status).toBe(201)
    expect(mocks.createAgentOpsBrowserProcedure).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      projectId,
      createdByUserId: userId,
    }))
    expect(mocks.createAgentOpsBrowserProcedureVersion).toHaveBeenCalledWith(expect.objectContaining({
      procedureId,
      definition: { steps: [] },
      createdByUserId: userId,
    }))
  })

  it('promotes a procedure through the detail route without execution coupling', async () => {
    const response = await PATCH(request(`http://localhost:3000/api/agent-ops/browser-procedures/${procedureId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        org_id: orgId,
        action: 'promote',
      }),
      headers: { 'content-type': 'application/json' },
    }) as NextRequest, {
      params: Promise.resolve({ id: procedureId }),
    })

    expect(response.status).toBe(200)
    expect(mocks.updateAgentOpsBrowserProcedureTrustState).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      procedureId,
      trustState: 'active',
    }))
  })
})
