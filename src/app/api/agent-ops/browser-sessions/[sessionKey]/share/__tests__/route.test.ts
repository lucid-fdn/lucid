import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  checkRateLimit: vi.fn(),
  isUserOrgMember: vi.fn(),
  getAgentOpsRunForOrg: vi.fn(),
  listAgentOpsBrowserQaSessionsForRun: vi.fn(),
  listAgentOpsBrowserSessionShares: vi.fn(),
  createAgentOpsBrowserSessionShare: vi.fn(),
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
  isUserOrgMember: mocks.isUserOrgMember,
  getAgentOpsRunForOrg: mocks.getAgentOpsRunForOrg,
  listAgentOpsBrowserQaSessionsForRun: mocks.listAgentOpsBrowserQaSessionsForRun,
  listAgentOpsBrowserSessionShares: mocks.listAgentOpsBrowserSessionShares,
  createAgentOpsBrowserSessionShare: mocks.createAgentOpsBrowserSessionShare,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { POST } from '../route'

const orgId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const runId = '44444444-4444-4444-8444-444444444444'
const userId = '55555555-5555-4555-8555-555555555555'
const sessionKey = 'session-key-1'

function request(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3000/api/agent-ops/browser-sessions/${sessionKey}/share`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('/api/agent-ops/browser-sessions/[sessionKey]/share', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue(userId)
    mocks.checkRateLimit.mockResolvedValue({ success: true })
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.getAgentOpsRunForOrg.mockResolvedValue({ id: runId, orgId, projectId })
    mocks.listAgentOpsBrowserQaSessionsForRun.mockResolvedValue([{ id: 'session-1', sessionKey }])
    mocks.createAgentOpsBrowserSessionShare.mockResolvedValue({
      share: { id: 'share-1', sessionKey, runId },
      token: 'lucid_browser_share_secret',
    })
  })

  it('creates a share only after validating run/session ownership', async () => {
    const response = await POST(request({
      org_id: orgId,
      project_id: projectId,
      run_id: runId,
      scope: 'read-only',
      ttl_seconds: 300,
    }), {
      params: Promise.resolve({ sessionKey }),
    })

    expect(response.status).toBe(201)
    expect(mocks.getAgentOpsRunForOrg).toHaveBeenCalledWith(orgId, runId)
    expect(mocks.listAgentOpsBrowserQaSessionsForRun).toHaveBeenCalledWith(orgId, runId, 100)
    expect(mocks.createAgentOpsBrowserSessionShare).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      projectId,
      runId,
      sessionKey,
      scope: 'read-only',
      createdByUserId: userId,
    }))
  })

  it('rejects shares for sessions outside the claimed run', async () => {
    mocks.listAgentOpsBrowserQaSessionsForRun.mockResolvedValue([])

    const response = await POST(request({
      org_id: orgId,
      project_id: projectId,
      run_id: runId,
      scope: 'read-only',
    }), {
      params: Promise.resolve({ sessionKey }),
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toContain('Browser session not found')
    expect(mocks.createAgentOpsBrowserSessionShare).not.toHaveBeenCalled()
  })
})
