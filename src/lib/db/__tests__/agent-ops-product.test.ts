import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockFrom = vi.fn()

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  ErrorService: {
    captureException: vi.fn(),
  },
}))

const orgId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'

describe('agent-ops product DB helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates sanitized project learnings', async () => {
    const { createProjectLearning } = await import('../agent-ops-product')
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: '44444444-4444-4444-8444-444444444444',
          org_id: orgId,
          project_id: projectId,
          assistant_id: null,
          ops_run_id: null,
          learning_type: 'architecture',
          trust_level: 'observed',
          status: 'active',
          title: 'Prefer shared workflows',
          body: 'Use Agent Ops workflow definitions before bespoke orchestration.',
          confidence: 0.8,
          fingerprint: 'agent-ops:learning:v1:test',
          metadata: { source: '<untrusted_content />' },
          created_at: '2026-04-29T00:00:00.000Z',
          updated_at: '2026-04-29T00:00:00.000Z',
        },
        error: null,
      }),
    }
    mockFrom.mockReturnValue(chain)

    const learning = await createProjectLearning({
      orgId,
      projectId,
      type: 'architecture',
      trustLevel: 'observed',
      title: 'Prefer shared workflows',
      body: 'Use Agent Ops workflow definitions before bespoke orchestration.',
      sourceKind: 'agent_ops_run',
      confidence: 0.8,
    })

    expect(mockFrom).toHaveBeenCalledWith('project_learnings')
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: orgId,
      project_id: projectId,
      source_kind: 'agent_ops_run',
      fingerprint: expect.stringMatching(/^agent-ops:learning:v1:/),
    }))
    expect(learning.orgId).toBe(orgId)
  })

  it('records eval run summaries and detailed results', async () => {
    const { recordAgentOpsEvalRun } = await import('../agent-ops-product')
    const evalRunChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: '55555555-5555-4555-8555-555555555555' },
        error: null,
      }),
    }
    const evalResultChain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
    mockFrom
      .mockReturnValueOnce(evalRunChain)
      .mockReturnValueOnce(evalResultChain)

    const result = await recordAgentOpsEvalRun({
      orgId,
      projectId,
      workflowId: 'ship',
      targetKind: 'workflow',
      targetRef: 'ship',
      latencyMs: 1234.4,
      costUsd: 0.012345,
      tokenCount: 4567.8,
      results: [
        {
          scenarioSlug: 'release-gates',
          status: 'passed',
          score: 90,
          summary: 'Release gates are documented.',
        },
        {
          scenarioSlug: 'rollback',
          status: 'failed',
          score: 30,
          summary: 'Rollback evidence missing.',
        },
      ],
    })

    expect(mockFrom).toHaveBeenNthCalledWith(1, 'agent_ops_eval_runs')
    expect(evalRunChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: orgId,
      target_kind: 'workflow',
      score: 60,
      pass_rate: 50,
      latency_ms: 1234,
      cost_usd: 0.012345,
      token_count: 4568,
      metadata: expect.objectContaining({ result_count: 2, failed_count: 1 }),
    }))
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'agent_ops_eval_results')
    expect(evalResultChain.insert).toHaveBeenCalledWith([
      expect.objectContaining({ scenario_slug: 'release-gates', status: 'passed' }),
      expect.objectContaining({ scenario_slug: 'rollback', status: 'failed' }),
    ])
    expect(result).toMatchObject({ score: 60, passRate: 50 })
  })

  it('creates context snapshots with deterministic fingerprints', async () => {
    const { createAgentOpsContextSnapshot } = await import('../agent-ops-product')
    const chain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: '66666666-6666-4666-8666-666666666666',
          org_id: orgId,
          project_id: projectId,
          assistant_id: null,
          ops_run_id: null,
          snapshot_kind: 'handoff',
          title: 'Release handoff',
          summary: 'Ready for canary.',
          state: { branch: 'main' },
          fingerprint: 'agent-ops:snapshot:v1:test',
          metadata: {},
          created_by: null,
          created_at: '2026-04-29T00:00:00.000Z',
        },
        error: null,
      }),
    }
    mockFrom.mockReturnValue(chain)

    const snapshot = await createAgentOpsContextSnapshot({
      orgId,
      projectId,
      kind: 'handoff',
      title: 'Release handoff',
      summary: 'Ready for canary.',
      state: { branch: 'main' },
    })

    expect(mockFrom).toHaveBeenCalledWith('agent_ops_context_snapshots')
    expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: orgId,
      project_id: projectId,
      snapshot_kind: 'handoff',
      fingerprint: expect.stringMatching(/^agent-ops:snapshot:v1:/),
    }), { onConflict: 'org_id,fingerprint' })
    expect(snapshot.title).toBe('Release handoff')
  })

  it('upserts active project safety policies', async () => {
    const { upsertAgentOpsProjectPolicy } = await import('../agent-ops-product')
    const chain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: '77777777-7777-4777-8777-777777777777',
          org_id: orgId,
          project_id: projectId,
          safety_mode: 'freeze',
          policy: { mode: 'freeze', writeActionsAllowed: false },
          status: 'active',
          metadata: { reason: 'incident' },
          updated_by: null,
          created_at: '2026-04-29T00:00:00.000Z',
          updated_at: '2026-04-29T00:00:00.000Z',
        },
        error: null,
      }),
    }
    mockFrom.mockReturnValue(chain)

    const policy = await upsertAgentOpsProjectPolicy({
      orgId,
      projectId,
      mode: 'freeze',
      metadata: { reason: 'incident' },
    })

    expect(mockFrom).toHaveBeenCalledWith('agent_ops_project_policies')
    expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: orgId,
      project_id: projectId,
      safety_mode: 'freeze',
      policy: expect.objectContaining({ mode: 'freeze', writeActionsAllowed: false }),
      status: 'active',
    }), { onConflict: 'org_id,project_key,status' })
    expect(policy.safetyMode).toBe('freeze')
  })

  it('updates project learning status and trust without touching other org rows', async () => {
    const { updateProjectLearning } = await import('../agent-ops-product')
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: '88888888-8888-4888-8888-888888888888',
          org_id: orgId,
          project_id: projectId,
          assistant_id: null,
          ops_run_id: null,
          learning_type: 'architecture',
          trust_level: 'operator_approved',
          status: 'active',
          title: 'Use shared Agent Ops workflows',
          body: 'Prefer workflow contracts.',
          confidence: 1,
          fingerprint: 'agent-ops:learning:v1:test',
          metadata: {},
          created_at: '2026-04-29T00:00:00.000Z',
          updated_at: '2026-04-29T00:00:00.000Z',
        },
        error: null,
      }),
    }
    mockFrom.mockReturnValue(chain)

    const learning = await updateProjectLearning({
      orgId,
      learningId: '88888888-8888-4888-8888-888888888888',
      status: 'active',
      trustLevel: 'operator_approved',
      confidence: 1,
    })

    expect(mockFrom).toHaveBeenCalledWith('project_learnings')
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'active',
      trust_level: 'operator_approved',
      confidence: 1,
      updated_at: expect.any(String),
    }))
    expect(chain.eq).toHaveBeenNthCalledWith(1, 'org_id', orgId)
    expect(chain.eq).toHaveBeenNthCalledWith(2, 'id', '88888888-8888-4888-8888-888888888888')
    expect(learning.trustLevel).toBe('operator_approved')
  })

  it('summarizes Agent Ops performance without provider-specific assumptions', async () => {
    const { getAgentOpsPerformanceSummary } = await import('../agent-ops-product')
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve({
        data: [
          {
            status: 'completed',
            latency_ms: 1_000,
            cost_usd: '0.002',
            total_tokens: 100,
            created_at: '2026-04-29T00:00:00.000Z',
          },
          {
            status: 'failed',
            latency_ms: 3_000,
            cost_usd: '0.004',
            total_tokens: '300',
            created_at: '2026-04-28T00:00:00.000Z',
          },
          {
            status: 'running',
            latency_ms: null,
            cost_usd: null,
            total_tokens: null,
            created_at: '2026-04-27T00:00:00.000Z',
          },
        ],
        error: null,
      })),
    }
    mockFrom.mockReturnValue(chain)

    const summary = await getAgentOpsPerformanceSummary({
      orgId,
      projectId,
      assistantId: '99999999-9999-4999-8999-999999999999',
      windowDays: 14,
    })

    expect(mockFrom).toHaveBeenCalledWith('agent_ops_runs')
    expect(chain.select).toHaveBeenCalledWith('status, latency_ms, cost_usd, total_tokens, created_at')
    expect(chain.eq).toHaveBeenNthCalledWith(1, 'org_id', orgId)
    expect(chain.eq).toHaveBeenNthCalledWith(2, 'project_id', projectId)
    expect(chain.eq).toHaveBeenNthCalledWith(3, 'assistant_id', '99999999-9999-4999-8999-999999999999')
    expect(chain.gte).toHaveBeenCalledWith('created_at', expect.any(String))
    expect(summary).toMatchObject({
      runCount: 3,
      completedRunCount: 1,
      failedRunCount: 1,
      measuredRunCount: 2,
      avgLatencyMs: 2_000,
      p95LatencyMs: 3_000,
      totalCostUsd: 0.006,
      avgCostUsd: 0.002,
      totalTokens: 400,
      avgTokens: 133,
      windowDays: 14,
    })
  })

  it('builds specialist telemetry from existing runs and findings ledgers', async () => {
    const { listAgentOpsSpecialistTelemetry } = await import('../agent-ops-product')
    const runChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve({
        data: [{
          id: '99999999-9999-4999-8999-999999999999',
          project_id: projectId,
          assistant_id: null,
          workflow_id: 'review',
          status: 'completed',
          latency_ms: 1_200,
          cost_usd: '0.003',
          total_tokens: '900',
          metadata: {
            team_ops: {
              specialists: [{ slug: 'security', name: 'Security Reviewer', category: 'security', critical: true }],
            },
          },
          created_at: '2026-04-30T10:00:00.000Z',
        }],
        error: null,
      })),
    }
    const findingChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve({
        data: [{
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          ops_run_id: '99999999-9999-4999-8999-999999999999',
          severity: 'critical',
          status: 'fixed',
          confidence: '0.94',
          metadata: { specialist: 'security' },
          created_at: '2026-04-30T10:01:00.000Z',
          updated_at: '2026-04-30T10:02:00.000Z',
        }],
        error: null,
      })),
    }
    mockFrom
      .mockReturnValueOnce(runChain)
      .mockReturnValueOnce(findingChain)

    const telemetry = await listAgentOpsSpecialistTelemetry({ orgId, projectId, limit: 5 })

    expect(mockFrom).toHaveBeenNthCalledWith(1, 'agent_ops_runs')
    expect(runChain.select).toHaveBeenCalledWith(expect.stringContaining('workflow_id'))
    expect(runChain.eq).toHaveBeenNthCalledWith(1, 'org_id', orgId)
    expect(runChain.eq).toHaveBeenNthCalledWith(2, 'project_id', projectId)
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'agent_ops_findings')
    expect(findingChain.in).toHaveBeenCalledWith('ops_run_id', ['99999999-9999-4999-8999-999999999999'])
    expect(telemetry).toEqual([expect.objectContaining({
      slug: 'security',
      selectedCount: 1,
      findingCount: 1,
      fixedCount: 1,
      usefulFindingCount: 1,
      criticalFindingCount: 1,
      avgLatencyMs: 1_200,
      totalCostUsd: 0.003,
      totalTokens: 900,
      signal: 'high_value',
    })])
  })
})
