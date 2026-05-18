import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  checkRateLimit: vi.fn(),
  isUserOrgMember: vi.fn(),
  getAgentOpsRunForOrg: vi.fn(),
  listAgentOpsBrowserQaSessionsForRun: vi.fn(),
  recordAgentOpsBrowserSessionEvent: vi.fn(),
  recordAgentOpsBrowserSessionSharedAction: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: mocks.getUserId,
}))

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  getRequestIdentifier: vi.fn(() => 'test-request'),
  RateLimitPresets: {
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
  recordAgentOpsBrowserSessionEvent: mocks.recordAgentOpsBrowserSessionEvent,
  recordAgentOpsBrowserSessionSharedAction: mocks.recordAgentOpsBrowserSessionSharedAction,
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
  return new NextRequest(`http://localhost:3000/api/agent-ops/browser-sessions/${sessionKey}/handoff`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('/api/agent-ops/browser-sessions/[sessionKey]/handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue(userId)
    mocks.checkRateLimit.mockResolvedValue({ success: true })
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.getAgentOpsRunForOrg.mockResolvedValue({ id: runId, orgId, projectId })
    mocks.listAgentOpsBrowserQaSessionsForRun.mockResolvedValue([{
      id: '66666666-6666-4666-8666-666666666666',
      sessionKey,
    }])
    mocks.recordAgentOpsBrowserSessionEvent.mockResolvedValue({ id: 'event-1' })
    mocks.recordAgentOpsBrowserSessionSharedAction.mockResolvedValue({ id: 'action-1' })
  })

  it('records handoff resolution and audited shared action attribution', async () => {
    const response = await POST(request({
      org_id: orgId,
      project_id: projectId,
      run_id: runId,
      action: 'resolve',
      handoff_state: 'auth_required',
      current_url: 'https://app.example.com/login',
      message: 'Operator completed login.',
      actor_agent_label: 'Browser Operator',
    }), {
      params: Promise.resolve({ sessionKey }),
    })

    expect(response.status).toBe(200)
    expect(mocks.recordAgentOpsBrowserSessionEvent).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      runId,
      browserSessionId: '66666666-6666-4666-8666-666666666666',
      sessionKey,
      eventType: 'handoff_resolved',
      handoffState: 'auth_required',
      currentUrl: 'https://app.example.com/login',
      message: 'Operator completed login.',
      metadata: expect.objectContaining({
        source: 'mission_control_browser_operator',
        actor_user_id: userId,
      }),
    }))
    expect(mocks.recordAgentOpsBrowserSessionSharedAction).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      projectId,
      runId,
      sessionKey,
      actionType: 'handoff_resolved',
      actorAgentLabel: 'Browser Operator',
      status: 'allowed',
    }))
  })

  it('rejects handoff updates for sessions that do not belong to the run', async () => {
    mocks.listAgentOpsBrowserQaSessionsForRun.mockResolvedValue([])

    const response = await POST(request({
      org_id: orgId,
      run_id: runId,
      action: 'resume',
    }), {
      params: Promise.resolve({ sessionKey }),
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toContain('Browser session not found')
    expect(mocks.recordAgentOpsBrowserSessionEvent).not.toHaveBeenCalled()
    expect(mocks.recordAgentOpsBrowserSessionSharedAction).not.toHaveBeenCalled()
  })

  it('records resume requests without coupling to a browser provider', async () => {
    const response = await POST(request({
      org_id: orgId,
      run_id: runId,
      action: 'resume',
    }), {
      params: Promise.resolve({ sessionKey }),
    })

    expect(response.status).toBe(200)
    expect(mocks.recordAgentOpsBrowserSessionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'session_resumed',
      message: 'Browser Operator resume requested from Mission Control.',
    }))
    expect(mocks.recordAgentOpsBrowserSessionSharedAction).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'resume_requested',
      actorAgentLabel: 'Mission Control operator',
    }))
  })
})
