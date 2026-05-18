import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  checkRateLimit: vi.fn(),
  isUserOrgMember: vi.fn(),
  getAgentOpsRunDetail: vi.fn(),
  getAgentOpsBrowserProcedureBySourceRun: vi.fn(),
  getAgentOpsBrowserProcedureDetail: vi.fn(),
  createAgentOpsBrowserProcedure: vi.fn(),
  createAgentOpsBrowserProcedureVersion: vi.fn(),
}))

vi.mock('server-only', () => ({}))

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
  createAgentOpsBrowserProcedure: mocks.createAgentOpsBrowserProcedure,
  createAgentOpsBrowserProcedureVersion: mocks.createAgentOpsBrowserProcedureVersion,
  getAgentOpsBrowserProcedureBySourceRun: mocks.getAgentOpsBrowserProcedureBySourceRun,
  getAgentOpsBrowserProcedureDetail: mocks.getAgentOpsBrowserProcedureDetail,
  isUserOrgMember: mocks.isUserOrgMember,
}))

vi.mock('@/lib/db/agent-ops', () => ({
  getAgentOpsRunDetail: mocks.getAgentOpsRunDetail,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { POST } from '../route'

const orgId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const runId = '11111111-1111-4111-8111-111111111111'
const userId = '44444444-4444-4444-8444-444444444444'
const procedureId = '55555555-5555-4555-8555-555555555555'

function request(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3000/api/agent-ops/runs/${runId}/promote-browser-procedure`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('/api/agent-ops/runs/[id]/promote-browser-procedure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue(userId)
    mocks.checkRateLimit.mockResolvedValue({ success: true })
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.getAgentOpsBrowserProcedureBySourceRun.mockResolvedValue(null)
    mocks.getAgentOpsRunDetail.mockResolvedValue({
      run: {
        id: runId,
        orgId,
        projectId,
        assistantId: null,
        workflowId: 'check-page',
        workflowVersion: '1.0.0',
        status: 'completed',
        runMode: 'execute',
        scope: { type: 'url', ref: 'https://www.example.com/', metadata: {} },
        input: { target: 'https://www.example.com/' },
        output: { summary: 'Healthy' },
        artifactCount: 1,
        findingCount: 0,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        agentRunIds: [],
        humanWorkItemIds: [],
        approvalIds: [],
        metadata: {},
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:01:00.000Z',
      },
      artifacts: [{
        id: '66666666-6666-4666-8666-666666666666',
        orgId,
        runId,
        type: 'screenshot',
        title: 'Screenshot',
        content: { browser_qa: { target_url: 'https://www.example.com/' } },
        createdAt: '2026-05-02T00:00:30.000Z',
      }],
      findings: [],
      browserQaSessions: [{
        id: '77777777-7777-4777-8777-777777777777',
        orgId,
        runId,
        targetUrl: 'https://www.example.com/',
        status: 'completed',
        sessionKey: 'session',
        viewport: {},
        artifactCount: 1,
        startedAt: '2026-05-02T00:00:00.000Z',
        expiresAt: '2026-05-03T00:00:00.000Z',
        metadata: {},
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:01:00.000Z',
      }],
      links: [],
      timelineEvents: [],
      usageEvents: [],
    })
    mocks.createAgentOpsBrowserProcedure.mockResolvedValue({
      id: procedureId,
      name: 'Check Page: Example',
      trustState: 'quarantined',
    })
    mocks.createAgentOpsBrowserProcedureVersion.mockResolvedValue({
      id: '88888888-8888-4888-8888-888888888888',
      version: 1,
    })
  })

  it('creates a quarantined procedure and version from Browser Operator evidence', async () => {
    const response = await POST(request({ org_id: orgId }) as NextRequest, {
      params: Promise.resolve({ id: runId }),
    })

    expect(response.status).toBe(201)
    expect(mocks.createAgentOpsBrowserProcedure).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      projectId,
      scope: 'project',
      trustState: 'quarantined',
      sourceRunId: runId,
      createdByUserId: userId,
    }))
    expect(mocks.createAgentOpsBrowserProcedureVersion).toHaveBeenCalledWith(expect.objectContaining({
      procedureId,
      definitionKind: 'browser_operator_plan',
      riskLevel: 'medium',
      capabilities: expect.arrayContaining(['advanced:browser-trust-shield', 'tool:browser']),
      createdByUserId: userId,
    }))
  })

  it('is idempotent when a source run was already promoted', async () => {
    mocks.getAgentOpsBrowserProcedureBySourceRun.mockResolvedValue({
      id: procedureId,
      name: 'Existing Procedure',
    })
    mocks.getAgentOpsBrowserProcedureDetail.mockResolvedValue({
      procedure: { id: procedureId },
      versions: [{ id: 'version-1', version: 1 }],
    })

    const response = await POST(request({ org_id: orgId }) as NextRequest, {
      params: Promise.resolve({ id: runId }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.existing).toBe(true)
    expect(mocks.createAgentOpsBrowserProcedure).not.toHaveBeenCalled()
  })

  it('rejects runs without browser evidence', async () => {
    mocks.getAgentOpsRunDetail.mockResolvedValue({
      run: {
        id: runId,
        orgId,
        projectId,
        workflowId: 'review',
        workflowVersion: '1.0.0',
        status: 'completed',
        runMode: 'execute',
        scope: { type: 'project', metadata: {} },
        input: {},
        artifactCount: 0,
        findingCount: 0,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        agentRunIds: [],
        humanWorkItemIds: [],
        approvalIds: [],
        metadata: {},
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:01:00.000Z',
      },
      artifacts: [],
      browserQaSessions: [],
      findings: [],
      links: [],
      timelineEvents: [],
      usageEvents: [],
    })

    const response = await POST(request({ org_id: orgId }) as NextRequest, {
      params: Promise.resolve({ id: runId }),
    })

    expect(response.status).toBe(400)
    expect(mocks.createAgentOpsBrowserProcedure).not.toHaveBeenCalled()
  })
})
