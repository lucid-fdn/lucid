import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  isUserOrgMember: vi.fn(),
  checkRateLimit: vi.fn(),
  getAgentOpsProjectPolicy: vi.fn(),
  recordAgentOpsProjectTimelineEvent: vi.fn(),
  upsertAgentOpsProjectPolicy: vi.fn(),
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
  getAgentOpsProjectPolicy: mocks.getAgentOpsProjectPolicy,
  isUserOrgMember: mocks.isUserOrgMember,
  recordAgentOpsProjectTimelineEvent: mocks.recordAgentOpsProjectTimelineEvent,
  upsertAgentOpsProjectPolicy: mocks.upsertAgentOpsProjectPolicy,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { POST } from '../route'

const orgId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const userId = '44444444-4444-4444-8444-444444444444'
const runId = '55555555-5555-4555-8555-555555555555'
const fingerprint = 'agent-ops:performance-alert:v1:test'

function jsonRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/agent-ops/alerts', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('/api/agent-ops/alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue(userId)
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.checkRateLimit.mockResolvedValue({ success: true })
    mocks.getAgentOpsProjectPolicy.mockResolvedValue({
      orgId,
      projectId,
      safetyMode: 'guard',
      metadata: {
        performance_alerts: {
          notify_in_app: true,
        },
      },
    })
    mocks.upsertAgentOpsProjectPolicy.mockResolvedValue({
      orgId,
      projectId,
      safetyMode: 'guard',
      metadata: {},
    })
    mocks.recordAgentOpsProjectTimelineEvent.mockResolvedValue(true)
  })

  it('resolves performance alerts in policy metadata and records a timeline closure event', async () => {
    const response = await POST(jsonRequest({
      action: 'resolve',
      org_id: orgId,
      project_id: projectId,
      fingerprint,
      title: 'Agent Ops performance budget breached',
      note: 'Recovered after reducing retry pressure.',
      resolving_ops_run_id: runId,
    }) as NextRequest)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.upsertAgentOpsProjectPolicy).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      projectId,
      mode: 'guard',
      metadata: {
        performance_alerts: expect.objectContaining({
          notify_in_app: true,
          resolved_fingerprints: {
            [fingerprint]: expect.objectContaining({
              resolved_by: userId,
              resolving_run_id: runId,
              note: 'Recovered after reducing retry pressure.',
            }),
          },
        }),
      },
      updatedBy: userId,
    }))
    expect(mocks.recordAgentOpsProjectTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      projectId,
      runId,
      eventType: 'agent_ops_performance_alert_resolved',
      title: 'Resolved: Agent Ops performance budget breached',
      body: 'Recovered after reducing retry pressure.',
      metadata: expect.objectContaining({
        fingerprint,
        alert_kind: 'agent_ops_performance_budget',
        resolution_kind: 'manual',
      }),
      createdBy: userId,
    }))
    expect(body.resolution).toMatchObject({
      fingerprint,
      resolvedBy: userId,
      resolvingRunId: runId,
      timelineInserted: true,
    })
  })
})
