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
const runId = '11111111-1111-4111-8111-111111111111'

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    org_id: orgId,
    project_id: null,
    assistant_id: null,
    requested_by: null,
    workflow_id: 'review',
    workflow_slug: 'review',
    workflow_version: '1.0.0',
    status: 'queued',
    scope_type: 'project',
    scope_ref: 'lucid',
    scope_label: null,
    input: {},
    output: null,
    output_sections: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
    orchestration_dag_id: null,
    root_agent_run_id: null,
    artifact_count: 0,
    finding_count: 0,
    latency_ms: null,
    cost_usd: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    error_message: null,
    metadata: {},
    started_at: null,
    completed_at: null,
    created_at: '2026-04-28T00:00:00.000Z',
    updated_at: '2026-04-28T00:00:00.000Z',
    ...overrides,
  }
}

describe('agent-ops DB stores', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates product-level Agent Ops runs without touching legacy workflow tables', async () => {
    const { createAgentOpsRun } = await import('../agent-ops')
    const { getAgentOpsWorkflow } = await import('@/lib/agent-ops')

    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: runRow(), error: null }),
    }
    mockFrom.mockReturnValue(chain)

    const run = await createAgentOpsRun({
      orgId,
      workflowId: 'review',
      scope: { type: 'project', ref: 'lucid', metadata: {} },
      input: {},
      metadata: {},
      workflow: getAgentOpsWorkflow('review'),
      status: 'queued',
    })

    expect(mockFrom).toHaveBeenCalledWith('agent_ops_runs')
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: orgId,
      workflow_id: 'review',
      workflow_slug: 'review',
      scope_type: 'project',
      safety_mode: 'read_only',
    }))
    expect(run.workflowId).toBe('review')
    expect(run.scope.ref).toBe('lucid')
  })

  it('appends artifacts and maps snake_case rows to public contracts', async () => {
    const { appendAgentOpsArtifactRow } = await import('../agent-ops')

    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: '55555555-5555-4555-8555-555555555555',
          org_id: orgId,
          ops_run_id: runId,
          artifact_type: 'log_excerpt',
          title: 'Logs',
          summary: null,
          uri: null,
          content: { lines: ['ok'] },
          checksum: null,
          created_at: '2026-04-28T00:00:00.000Z',
        },
        error: null,
      }),
    }
    mockFrom.mockReturnValue(chain)

    const artifact = await appendAgentOpsArtifactRow({
      orgId,
      runId,
      type: 'log_excerpt',
      title: 'Logs',
      content: { lines: ['ok'] },
    })

    expect(mockFrom).toHaveBeenCalledWith('agent_ops_artifacts')
    expect(artifact.runId).toBe(runId)
    expect(artifact.type).toBe('log_excerpt')
  })

  it('appends dedupe-friendly findings', async () => {
    const { appendAgentOpsFindingRow } = await import('../agent-ops')

    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: '66666666-6666-4666-8666-666666666666',
          org_id: orgId,
          ops_run_id: runId,
          severity: 'high',
          status: 'open',
          title: 'Missing auth check',
          body: 'Route trusts caller input.',
          file_path: 'src/api.ts',
          start_line: 42,
          end_line: null,
          confidence: 0.91,
          evidence_artifact_id: null,
          fingerprint: 'fingerprint-1',
          metadata: {},
          created_at: '2026-04-28T00:00:00.000Z',
          updated_at: '2026-04-28T00:00:00.000Z',
        },
        error: null,
      }),
    }
    mockFrom.mockReturnValue(chain)

    const finding = await appendAgentOpsFindingRow({
      orgId,
      runId,
      severity: 'high',
      title: 'Missing auth check',
      body: 'Route trusts caller input.',
      filePath: 'src/api.ts',
      startLine: 42,
      confidence: 0.91,
      fingerprint: 'fingerprint-1',
      metadata: {},
    })

    expect(mockFrom).toHaveBeenCalledWith('agent_ops_findings')
    expect(finding.status).toBe('open')
    expect(finding.fingerprint).toBe('fingerprint-1')
  })

  it('links Agent Ops runs to backing DAGs and root agent runs on status updates', async () => {
    const { updateAgentOpsRunStatus } = await import('../agent-ops')
    const dagId = '77777777-7777-4777-8777-777777777777'
    const rootAgentRunId = '88888888-8888-4888-8888-888888888888'

    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: runRow({
          status: 'running',
          orchestration_dag_id: dagId,
          root_agent_run_id: rootAgentRunId,
        }),
        error: null,
      }),
    }
    const linkChain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
    mockFrom.mockImplementation((table: string) => {
      if (table === 'agent_ops_runs') return updateChain
      if (table === 'agent_ops_run_links') return linkChain
      throw new Error(`Unexpected table ${table}`)
    })

    const run = await updateAgentOpsRunStatus({
      orgId,
      runId,
      status: 'running',
      orchestrationDagId: dagId,
      rootAgentRunId,
    })

    expect(run.status).toBe('running')
    expect(linkChain.insert).toHaveBeenCalledTimes(2)
    expect(linkChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: orgId,
      ops_run_id: runId,
      link_type: 'orchestration_dag',
      ref_id: dagId,
    }))
    expect(linkChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: orgId,
      ops_run_id: runId,
      link_type: 'agent_run',
      ref_id: rootAgentRunId,
    }))
  })

  it('records project timeline events with Agent Ops run provenance', async () => {
    const { recordAgentOpsProjectTimelineEvent } = await import('../agent-ops')
    const projectId = '99999999-9999-4999-8999-999999999999'
    const insert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ insert })

    const inserted = await recordAgentOpsProjectTimelineEvent({
      orgId,
      projectId,
      runId,
      eventType: 'agent_ops_run_started',
      title: 'review Agent Ops run started',
      body: 'Review latest run',
      evidence: { workflow_id: 'review' },
      metadata: { source: 'run' },
      createdBy: '33333333-3333-4333-8333-333333333333',
    })

    expect(inserted).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('project_timeline_events')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: orgId,
      project_id: projectId,
      ops_run_id: runId,
      event_type: 'agent_ops_run_started',
      title: 'review Agent Ops run started',
    }))
  })

  it('reports duplicate performance timeline alerts without throwing', async () => {
    const { recordAgentOpsProjectTimelineEvent } = await import('../agent-ops')
    const projectId = '99999999-9999-4999-8999-999999999999'
    const insert = vi.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    mockFrom.mockReturnValue({ insert })

    const inserted = await recordAgentOpsProjectTimelineEvent({
      orgId,
      projectId,
      eventType: 'agent_ops_performance_alert',
      title: 'Agent Ops performance budget near limit',
      metadata: { fingerprint: 'agent-ops:performance-alert:v1:test' },
    })

    expect(inserted).toBe(false)
  })

  it('loads run detail with links and project timeline provenance', async () => {
    const { getAgentOpsRunDetail } = await import('../agent-ops')
    const projectId = '99999999-9999-4999-8999-999999999999'
    const now = '2026-04-28T00:00:00.000Z'

    function selectChain(data: unknown[]) {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data, error: null }),
      }
    }

    const runChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: runRow(), error: null }),
    }
    const artifactsChain = selectChain([])
    const findingsChain = selectChain([])
    const browserSessionsChain = selectChain([])
    const browserSessionEventsChain = selectChain([])
    const browserSessionSharesChain = selectChain([])
    const browserSessionActionsChain = selectChain([])
    const operatorProfilesChain = selectChain([])
    const designFeedbackChain = selectChain([])
    const decisionEventsChain = selectChain([{
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      org_id: orgId,
      project_id: projectId,
      ops_run_id: runId,
      phase: 'review',
      question_id: 'docs-copy-style',
      door_type: 'two_way',
      decision_mode: 'silent_decision',
      question: 'Which copy style should Agent Ops use?',
      options: [],
      selected_option: { id: 'plain', label: 'Plain' },
      risk_reason: 'Copy style can be changed later.',
      reversible: true,
      flipped_from_event_id: null,
      metadata: {},
      created_by_user_id: null,
      created_at: now,
    }])
    const linksChain = selectChain([{
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      org_id: orgId,
      ops_run_id: runId,
      link_type: 'external',
      ref_id: null,
      ref_text: 'project:lucid',
      label: 'Lucid project',
      metadata: { source: 'project' },
      created_at: now,
    }])
    const timelineChain = selectChain([{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      org_id: orgId,
      project_id: projectId,
      ops_run_id: runId,
      event_type: 'agent_ops_run_started',
      title: 'review Agent Ops run started',
      body: 'Lucid project',
      evidence: { workflow_id: 'review' },
      metadata: { source: 'project' },
      created_by: '33333333-3333-4333-8333-333333333333',
      created_at: now,
    }])
    const usageChain = selectChain([{
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      org_id: orgId,
      ops_run_id: runId,
      source_kind: 'orchestration_step',
      source_ref: 'step-1',
      duration_ms: 123,
      input_tokens: 10,
      output_tokens: 20,
      total_tokens: 30,
      cost_usd: '0.0003',
      metadata: { step_type: 'scheduled' },
      created_at: now,
    }])
    const evalReceiptsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({ data: [], error: null })),
    }

    mockFrom.mockImplementation((table: string) => {
      if (table === 'agent_ops_runs') return runChain
      if (table === 'agent_ops_artifacts') return artifactsChain
      if (table === 'agent_ops_findings') return findingsChain
      if (table === 'agent_ops_browser_qa_sessions') return browserSessionsChain
      if (table === 'agent_ops_browser_session_events') return browserSessionEventsChain
      if (table === 'agent_ops_browser_session_shares') return browserSessionSharesChain
      if (table === 'agent_ops_browser_session_actions') return browserSessionActionsChain
      if (table === 'agent_ops_operator_profiles') return operatorProfilesChain
      if (table === 'agent_ops_design_feedback') return designFeedbackChain
      if (table === 'agent_ops_decision_events') return decisionEventsChain
      if (table === 'agent_ops_run_links') return linksChain
      if (table === 'project_timeline_events') return timelineChain
      if (table === 'agent_ops_run_usage_events') return usageChain
      if (table === 'agent_ops_eval_receipts') return evalReceiptsChain
      throw new Error(`Unexpected table ${table}`)
    })

    const detail = await getAgentOpsRunDetail(orgId, runId)

    expect(detail?.links).toEqual([expect.objectContaining({
      linkType: 'external',
      refText: 'project:lucid',
      label: 'Lucid project',
    })])
    expect(detail?.timelineEvents).toEqual([expect.objectContaining({
      eventType: 'agent_ops_run_started',
      title: 'review Agent Ops run started',
      runId,
    })])
    expect(detail?.usageEvents).toEqual([expect.objectContaining({
      sourceKind: 'orchestration_step',
      sourceRef: 'step-1',
      durationMs: 123,
      totalTokens: 30,
      costUsd: 0.0003,
    })])
    expect(detail?.decisionEvents).toEqual([expect.objectContaining({
      questionId: 'docs-copy-style',
      decisionMode: 'silent_decision',
      selectedOption: { id: 'plain', label: 'Plain' },
    })])
  })

  it('records usage events for Agent Ops run metric rollups', async () => {
    const { recordAgentOpsRunUsageEvent } = await import('../agent-ops')
    const upsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ upsert })

    await recordAgentOpsRunUsageEvent({
      orgId,
      runId,
      sourceKind: 'orchestration_step',
      sourceRef: 'step-1',
      durationMs: 12.7,
      inputTokens: 10,
      outputTokens: 20,
      costUsd: 0.0004,
    })

    expect(mockFrom).toHaveBeenCalledWith('agent_ops_run_usage_events')
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: orgId,
      ops_run_id: runId,
      source_kind: 'orchestration_step',
      source_ref: 'step-1',
      duration_ms: 13,
      input_tokens: 10,
      output_tokens: 20,
      total_tokens: 30,
      cost_usd: 0.0004,
    }), expect.objectContaining({ onConflict: 'ops_run_id,source_kind,source_ref' }))
  })

  it('lists recent performance alerts from the project timeline', async () => {
    const { listAgentOpsPerformanceAlertTimelineEvents } = await import('../agent-ops')
    const projectId = '99999999-9999-4999-8999-999999999999'
    const assistantId = '33333333-3333-4333-8333-333333333333'
    const now = '2026-04-30T10:00:00.000Z'
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          org_id: orgId,
          project_id: projectId,
          ops_run_id: null,
          event_type: 'agent_ops_performance_alert',
          title: 'Agent Ops performance budget breached',
          body: 'p95 latency is over budget.',
          evidence: { status: 'breach' },
          metadata: {
            fingerprint: 'agent-ops:performance-alert:v1:test',
            status: 'breach',
            assistant_id: assistantId,
          },
          created_by: null,
          created_at: now,
        }],
        error: null,
      }),
    }
    mockFrom.mockReturnValue(chain)

    const events = await listAgentOpsPerformanceAlertTimelineEvents({
      orgId,
      projectId,
      assistantId,
      limit: 5,
    })

    expect(mockFrom).toHaveBeenCalledWith('project_timeline_events')
    expect(chain.eq).toHaveBeenCalledWith('org_id', orgId)
    expect(chain.eq).toHaveBeenCalledWith('event_type', 'agent_ops_performance_alert')
    expect(chain.eq).toHaveBeenCalledWith('project_id', projectId)
    expect(chain.contains).toHaveBeenCalledWith('metadata', { assistant_id: assistantId })
    expect(events).toEqual([expect.objectContaining({
      eventType: 'agent_ops_performance_alert',
      title: 'Agent Ops performance budget breached',
      metadata: expect.objectContaining({ fingerprint: 'agent-ops:performance-alert:v1:test' }),
    })])
  })
})
