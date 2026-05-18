import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  createSystemNotice: vi.fn(),
  isUserOrgMember: vi.fn(),
  checkRateLimit: vi.fn(),
  listAgentOpsRunsForOrg: vi.fn(),
  getAgentOpsRunDetail: vi.fn(),
  runStore: {
    createRun: vi.fn(),
    getRun: vi.fn(),
    updateRunStatus: vi.fn(),
  },
  runModeRecorder: {
    record: vi.fn(),
  },
  orchestration: {
    startDag: vi.fn(),
    cancelDag: vi.fn(),
    retryDag: vi.fn(),
  },
  appendAgentOpsRunLink: vi.fn(),
  recordAgentOpsProjectTimelineEvent: vi.fn(),
  runtimeSelector: {
    listCandidates: vi.fn(),
  },
  specialistTelemetryProvider: {
    list: vi.fn(),
  },
  teamPolicyGate: {
    evaluateRunStart: vi.fn(),
  },
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: mocks.getUserId,
}))

vi.mock('@/lib/db', () => ({
  createSystemNotice: mocks.createSystemNotice,
  isUserOrgMember: mocks.isUserOrgMember,
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

vi.mock('@/lib/db/agent-ops', () => ({
  appendAgentOpsRunLink: mocks.appendAgentOpsRunLink,
  listAgentOpsRunsForOrg: mocks.listAgentOpsRunsForOrg,
  getAgentOpsRunDetail: mocks.getAgentOpsRunDetail,
  recordAgentOpsProjectTimelineEvent: mocks.recordAgentOpsProjectTimelineEvent,
  supabaseAgentOpsRunModeRecorder: mocks.runModeRecorder,
  supabaseAgentOpsRunStore: mocks.runStore,
}))

vi.mock('@/lib/db/agent-ops-orchestration', () => ({
  supabaseAgentOpsDagOrchestrationAdapter: mocks.orchestration,
}))

vi.mock('@/lib/db/agent-ops-runtime-selector', () => ({
  supabaseAgentOpsRuntimeSelector: mocks.runtimeSelector,
}))

vi.mock('@/lib/db/agent-ops-team-policy-gate', () => ({
  supabaseAgentOpsTeamPolicyGate: mocks.teamPolicyGate,
}))

vi.mock('@/lib/db/agent-ops-product', () => ({
  supabaseAgentOpsSpecialistTelemetryProvider: mocks.specialistTelemetryProvider,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { GET, POST } from '../route'
import { GET as GET_DETAIL, PATCH } from '../[id]/route'

const orgId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const runId = '11111111-1111-4111-8111-111111111111'

function makeRun(overrides: Record<string, unknown> = {}) {
  const now = '2026-04-28T00:00:00.000Z'
  return {
    id: runId,
    orgId,
    workflowId: 'review',
    workflowVersion: '1.0.0',
    status: 'queued',
    runMode: 'execute',
    scope: { type: 'project', ref: 'lucid', metadata: {} },
    input: {},
    output: null,
    agentRunIds: [],
    humanWorkItemIds: [],
    approvalIds: [],
    artifactCount: 0,
    findingCount: 0,
    latencyMs: null,
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function jsonRequest(url: string, method: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('/api/agent-ops/runs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue(userId)
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.createSystemNotice.mockResolvedValue(null)
    mocks.checkRateLimit.mockResolvedValue({ success: true })
    mocks.listAgentOpsRunsForOrg.mockResolvedValue([makeRun()])
    mocks.getAgentOpsRunDetail.mockResolvedValue({
      run: makeRun(),
      artifacts: [],
      findings: [],
      browserQaSessions: [],
      links: [],
      timelineEvents: [],
      usageEvents: [],
    })
    mocks.runStore.createRun.mockResolvedValue(makeRun())
    mocks.runStore.getRun.mockResolvedValue(makeRun())
    mocks.runModeRecorder.record.mockResolvedValue(undefined)
    mocks.runStore.updateRunStatus.mockImplementation(async (input: { status: string }) =>
      makeRun({ status: input.status }),
    )
    mocks.orchestration.startDag.mockResolvedValue({ dagId: '44444444-4444-4444-8444-444444444444' })
    mocks.orchestration.cancelDag.mockResolvedValue(undefined)
    mocks.orchestration.retryDag.mockResolvedValue({ dagId: '55555555-5555-4555-8555-555555555555' })
    mocks.runtimeSelector.listCandidates.mockResolvedValue([{ profileId: 'shared', engine: 'lucid', label: 'Shared' }])
    mocks.specialistTelemetryProvider.list.mockResolvedValue([])
    mocks.teamPolicyGate.evaluateRunStart.mockResolvedValue({
      allowed: true,
      enforced: false,
      targetGates: [],
      required: [],
      recommended: [],
      optional: [],
      missingRequired: [],
      summary: 'No team policy gate applies to this workflow.',
    })
    mocks.appendAgentOpsRunLink.mockResolvedValue(undefined)
    mocks.recordAgentOpsProjectTimelineEvent.mockResolvedValue(undefined)
  })

  it('lists runs for an org member', async () => {
    const response = await GET(new NextRequest(
      `http://localhost:3000/api/agent-ops/runs?org_id=${orgId}&status=queued,running&workflow_id=review`,
    ))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.runs).toHaveLength(1)
    expect(mocks.listAgentOpsRunsForOrg).toHaveBeenCalledWith(orgId, expect.objectContaining({
      status: ['queued', 'running'],
      workflowId: 'review',
    }))
  })

  it('starts a queued Agent Ops run through the public run contract', async () => {
    const response = await POST(jsonRequest('http://localhost:3000/api/agent-ops/runs', 'POST', {
      org_id: orgId,
      workflow_id: 'review',
      scope: { type: 'project', ref: 'lucid' },
      input: { target: 'pr-1' },
    }))
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body.run.status).toBe('queued')
    expect(mocks.runStore.createRun).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      workflowId: 'review',
      status: 'queued',
    }))
    expect(mocks.teamPolicyGate.evaluateRunStart).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      workflow: expect.objectContaining({ id: 'review' }),
    }))
    expect(mocks.appendAgentOpsRunLink).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      runId,
      linkType: 'external',
      refText: 'project:lucid',
      label: 'lucid',
    }))
    expect(mocks.recordAgentOpsProjectTimelineEvent).not.toHaveBeenCalled()
  })

  it('records project timeline events for product-significant contextual workflows', async () => {
    const projectId = '77777777-7777-4777-8777-777777777777'

    const response = await POST(jsonRequest('http://localhost:3000/api/agent-ops/runs', 'POST', {
      org_id: orgId,
      project_id: projectId,
      workflow_id: 'retro',
      scope: {
        type: 'run',
        ref: 'run-123',
        label: 'Release retro',
        metadata: { source: 'run' },
      },
      input: { target: 'release-123' },
    }))

    expect(response.status).toBe(202)
    expect(mocks.appendAgentOpsRunLink).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      runId,
      linkType: 'external',
      refText: 'run:run-123',
      label: 'Release retro',
    }))
    expect(mocks.recordAgentOpsProjectTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      projectId,
      runId,
      eventType: 'agent_ops_run_started',
      title: 'retro Agent Ops run started',
      createdBy: userId,
    }))
  })

  it('starts DAG-backed runs through the orchestration adapter when an assistant owns execution', async () => {
    const assistantId = '66666666-6666-4666-8666-666666666666'
    mocks.runStore.createRun.mockResolvedValue(makeRun({ assistantId }))
    mocks.runStore.updateRunStatus.mockImplementation(async (input: { status: string; orchestrationDagId?: string | null }) =>
      makeRun({ assistantId, status: input.status, orchestrationDagId: input.orchestrationDagId }),
    )

    const response = await POST(jsonRequest('http://localhost:3000/api/agent-ops/runs', 'POST', {
      org_id: orgId,
      assistant_id: assistantId,
      workflow_id: 'review',
      scope: { type: 'project', ref: 'lucid' },
      input: { target: 'pr-1' },
    }))
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body.run.status).toBe('running')
    expect(mocks.orchestration.startDag).toHaveBeenCalledOnce()
    expect(mocks.runStore.updateRunStatus).toHaveBeenCalledWith(expect.objectContaining({
      status: 'running',
      orchestrationDagId: '44444444-4444-4444-8444-444444444444',
    }))
  })

  it('loads run detail with artifacts and findings', async () => {
    mocks.getAgentOpsRunDetail.mockResolvedValue({
      run: makeRun(),
      artifacts: [],
      findings: [],
      browserQaSessions: [],
      links: [{
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        linkType: 'external',
        refText: 'project:lucid',
        label: 'Lucid project',
      }],
      timelineEvents: [{
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        eventType: 'agent_ops_run_started',
        title: 'review Agent Ops run started',
      }],
      usageEvents: [{
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        sourceKind: 'orchestration_step',
        sourceRef: 'step-1',
        durationMs: 123,
        totalTokens: 30,
      }],
    })

    const response = await GET_DETAIL(
      new NextRequest(`http://localhost:3000/api/agent-ops/runs/${runId}?org_id=${orgId}`),
      { params: Promise.resolve({ id: runId }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.run.id).toBe(runId)
    expect(body.links).toHaveLength(1)
    expect(body.timelineEvents).toHaveLength(1)
    expect(body.usageEvents).toHaveLength(1)
    expect(mocks.getAgentOpsRunDetail).toHaveBeenCalledWith(orgId, runId)
  })

  it('cancels runs through the public API contract', async () => {
    const response = await PATCH(
      jsonRequest(`http://localhost:3000/api/agent-ops/runs/${runId}`, 'PATCH', {
        org_id: orgId,
        action: 'cancel',
        reason: 'operator requested',
      }),
      { params: Promise.resolve({ id: runId }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.run.status).toBe('cancelled')
    expect(mocks.orchestration.cancelDag).not.toHaveBeenCalled()
    expect(mocks.runStore.updateRunStatus).toHaveBeenCalledWith(expect.objectContaining({
      runId,
      orgId,
      status: 'cancelled',
    }))
  })

  it('returns conflict when retrying a non-failed run', async () => {
    mocks.runStore.getRun.mockResolvedValue(makeRun({ status: 'running' }))

    const response = await PATCH(
      jsonRequest(`http://localhost:3000/api/agent-ops/runs/${runId}`, 'PATCH', {
        org_id: orgId,
        action: 'retry',
      }),
      { params: Promise.resolve({ id: runId }) },
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toContain('not retryable')
    expect(mocks.orchestration.retryDag).not.toHaveBeenCalled()
    expect(mocks.runStore.updateRunStatus).not.toHaveBeenCalled()
  })
})
