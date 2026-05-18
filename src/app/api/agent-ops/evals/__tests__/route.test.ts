import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  checkRateLimit: vi.fn(),
  isUserOrgMember: vi.fn(),
  recordAgentOpsEvalRun: vi.fn(),
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
  recordAgentOpsEvalRun: mocks.recordAgentOpsEvalRun,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { POST } from '../route'

const orgId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const userId = '44444444-4444-4444-8444-444444444444'

describe('/api/agent-ops/evals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue(userId)
    mocks.checkRateLimit.mockResolvedValue({ success: true })
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.recordAgentOpsEvalRun.mockResolvedValue({
      evalRunId: '55555555-5555-4555-8555-555555555555',
      score: 90,
      passRate: 100,
    })
  })

  it('records benchmark metrics through the shared eval run path', async () => {
    const response = await POST(new NextRequest('http://localhost:3000/api/agent-ops/evals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId,
        project_id: projectId,
        workflow_id: 'model-benchmark',
        target_kind: 'model',
        target_ref: 'gpt-5.2',
        latency_ms: 1234,
        cost_usd: 0.012,
        token_count: 4567,
        metadata: {
          benchmark_summary: {
            best_candidate_id: 'candidate-1',
          },
        },
        results: [
          {
            scenarioSlug: 'benchmark:candidate-1',
            status: 'passed',
            score: 90,
            summary: 'Candidate passed.',
            evidence: { candidate_id: 'candidate-1' },
            metrics: { latency_ms: 1234 },
            metadata: { benchmark: true },
          },
        ],
      }),
    }) as NextRequest)

    expect(response.status).toBe(201)
    expect(mocks.recordAgentOpsEvalRun).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      projectId,
      workflowId: 'model-benchmark',
      targetKind: 'model',
      targetRef: 'gpt-5.2',
      latencyMs: 1234,
      costUsd: 0.012,
      tokenCount: 4567,
      createdBy: userId,
      metadata: {
        benchmark_summary: {
          best_candidate_id: 'candidate-1',
        },
      },
    }))
  })
})
