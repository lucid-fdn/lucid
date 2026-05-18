import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  isUserOrgMember: vi.fn(),
  checkRateLimit: vi.fn(),
  getAgentOpsProjectPolicy: vi.fn(),
  upsertAgentOpsProjectPolicy: vi.fn(),
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
  getAgentOpsProjectPolicy: mocks.getAgentOpsProjectPolicy,
  isUserOrgMember: mocks.isUserOrgMember,
  upsertAgentOpsProjectPolicy: mocks.upsertAgentOpsProjectPolicy,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { POST } from '../route'

const orgId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const userId = '44444444-4444-4444-8444-444444444444'

function jsonRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/agent-ops/project-policy', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('/api/agent-ops/project-policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue(userId)
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.checkRateLimit.mockResolvedValue({ success: true })
    mocks.upsertAgentOpsProjectPolicy.mockResolvedValue({
      orgId,
      projectId,
      safetyMode: 'guard',
      metadata: {},
    })
  })

  it('persists typed performance budgets inside project policy metadata', async () => {
    const response = await POST(jsonRequest({
      org_id: orgId,
      project_id: projectId,
      safety_mode: 'guard',
      metadata: { owner: 'ops' },
      performance_budget: {
        avg_latency_ms: 120_000,
        p95_latency_ms: 300_000,
        avg_cost_usd: 0.25,
        total_cost_usd: 50,
        failure_rate_pct: 10,
        min_run_count: 3,
        min_measured_run_count: 2,
        warning_ratio: 0.8,
      },
    }) as NextRequest)

    expect(response.status).toBe(200)
    expect(mocks.upsertAgentOpsProjectPolicy).toHaveBeenCalledWith({
      orgId,
      projectId,
      mode: 'guard',
      metadata: {
        owner: 'ops',
        performance_budget: {
          avg_latency_ms: 120_000,
          p95_latency_ms: 300_000,
          avg_cost_usd: 0.25,
          total_cost_usd: 50,
          failure_rate_pct: 10,
          min_run_count: 3,
          min_measured_run_count: 2,
          warning_ratio: 0.8,
        },
      },
      updatedBy: userId,
    })
  })

  it('rejects invalid performance budget values before persistence', async () => {
    const response = await POST(jsonRequest({
      org_id: orgId,
      safety_mode: 'normal',
      performance_budget: {
        failure_rate_pct: 150,
      },
    }) as NextRequest)

    expect(response.status).toBe(400)
    expect(mocks.upsertAgentOpsProjectPolicy).not.toHaveBeenCalled()
  })

  it('persists typed performance alert controls inside project policy metadata', async () => {
    const snoozedUntil = '2026-04-30T12:00:00.000Z'
    const response = await POST(jsonRequest({
      org_id: orgId,
      project_id: projectId,
      safety_mode: 'guard',
      metadata: { owner: 'ops' },
      performance_alerts: {
        enabled: true,
        min_status: 'breach',
        notify_in_app: false,
        muted: false,
        snoozed_until: snoozedUntil,
        acknowledged_fingerprints: {
          'agent-ops:performance-alert:v1:test': {
            acknowledged_at: '2026-04-30T10:00:00.000Z',
            acknowledged_by: null,
          },
        },
      },
    }) as NextRequest)

    expect(response.status).toBe(200)
    expect(mocks.upsertAgentOpsProjectPolicy).toHaveBeenCalledWith(expect.objectContaining({
      metadata: {
        owner: 'ops',
        performance_alerts: {
          enabled: true,
          min_status: 'breach',
          notify_in_app: false,
          muted: false,
          snoozed_until: snoozedUntil,
          acknowledged_fingerprints: {
            'agent-ops:performance-alert:v1:test': {
              acknowledged_at: '2026-04-30T10:00:00.000Z',
              acknowledged_by: null,
            },
          },
        },
      },
    }))
  })

  it('persists typed Team Policy workflow gates inside project policy metadata', async () => {
    const response = await POST(jsonRequest({
      org_id: orgId,
      project_id: projectId,
      safety_mode: 'guard',
      team_policy: {
        workflows: [
          {
            workflow_id: 'review',
            level: 'required',
            gate_targets: ['ship', 'deploy'],
            freshness_hours: 168,
          },
          {
            workflow_id: 'qa',
            level: 'recommended',
            gate_targets: ['ship'],
            freshness_hours: 72,
          },
        ],
      },
    }) as NextRequest)

    expect(response.status).toBe(200)
    expect(mocks.upsertAgentOpsProjectPolicy).toHaveBeenCalledWith(expect.objectContaining({
      metadata: {
        team_policy: {
          workflows: [
            {
              workflow_id: 'review',
              level: 'required',
              gate_targets: ['ship', 'deploy'],
              freshness_hours: 168,
              enabled: true,
            },
            {
              workflow_id: 'qa',
              level: 'recommended',
              gate_targets: ['ship'],
              freshness_hours: 72,
              enabled: true,
            },
          ],
          metadata: {},
        },
      },
    }))
  })

  it('persists typed Team Setup Doctor readiness inside project policy metadata', async () => {
    const response = await POST(jsonRequest({
      org_id: orgId,
      project_id: projectId,
      safety_mode: 'guard',
      team_setup_doctor: {
        installed_requirement_ids: ['runtime-doctor', 'capability-doctor'],
        notes: {
          'runtime-doctor': 'Shared runtime doctor passed in staging.',
        },
      },
    }) as NextRequest)

    expect(response.status).toBe(200)
    expect(mocks.upsertAgentOpsProjectPolicy).toHaveBeenCalledWith(expect.objectContaining({
      metadata: {
        team_setup_doctor: {
          installed_requirement_ids: ['runtime-doctor', 'capability-doctor'],
          notes: {
            'runtime-doctor': 'Shared runtime doctor passed in staging.',
          },
        },
      },
    }))
  })
})
