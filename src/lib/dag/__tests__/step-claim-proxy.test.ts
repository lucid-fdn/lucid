/**
 * step-claim-proxy tests — Phase 4N-c, Task 51.
 *
 * Covers claim/complete/fail/renew flows with mocked supabase client and
 * mocked SchedulerBridge. Verifies cross-runtime guard, CAS race fall-through,
 * and ownership status checks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const mockFrom = vi.fn()
const mockRpc = vi.fn()
vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}))

const onNodeComplete = vi.fn()
const onNodeFail = vi.fn()
vi.mock('../scheduler-bridge', () => ({
  SchedulerBridge: class {
    onNodeComplete = onNodeComplete
    onNodeFail = onNodeFail
  },
}))

import {
  claimNextStep,
  completeStep,
  failStep,
  renewStepLease,
} from '../step-claim-proxy'

const RUNTIME_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ORG_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const AGENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const STEP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const DAG_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const NODE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

interface FakeQueryBuilder {
  select: (columns?: string) => FakeQueryBuilder
  eq: (column?: string, value?: unknown) => FakeQueryBuilder
  in: (column?: string, values?: unknown[]) => FakeQueryBuilder
  not: (column?: string, operator?: string, value?: unknown) => FakeQueryBuilder
  order: (column?: string, options?: Record<string, unknown>) => FakeQueryBuilder
  limit: (count?: number) => FakeQueryBuilder
  insert: (payload: unknown) => FakeQueryBuilder
  update: (values: unknown) => FakeQueryBuilder
  maybeSingle: () => Promise<unknown>
  single: () => Promise<unknown>
  then: Promise<unknown>['then']
}

function makeQB(result: unknown): FakeQueryBuilder {
  // Chainable Postgrest query builder mock — terminal `await` resolves to result.
  const qb: FakeQueryBuilder = {
    select: vi.fn(() => qb),
    eq: vi.fn(() => qb),
    in: vi.fn(() => qb),
    not: vi.fn(() => qb),
    order: vi.fn(() => qb),
    limit: vi.fn(() => qb),
    insert: vi.fn(() => qb),
    update: vi.fn(() => qb),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  }
  return qb
}

beforeEach(() => {
  mockFrom.mockReset()
  mockRpc.mockReset()
  onNodeComplete.mockClear()
  onNodeFail.mockClear()
})

describe('claimNextStep', () => {
  it('returns null when runtime owns no agents', async () => {
    mockFrom.mockReturnValueOnce(makeQB({ data: [], error: null }))
    const out = await claimNextStep(RUNTIME_ID, ORG_ID)
    expect(out).toBeNull()
  })

  it('returns null when no candidate steps', async () => {
    mockFrom.mockReturnValueOnce(makeQB({ data: [{ id: AGENT_ID }], error: null }))
    mockFrom.mockReturnValueOnce(makeQB({ data: [], error: null }))
    const out = await claimNextStep(RUNTIME_ID, ORG_ID)
    expect(out).toBeNull()
  })

  it('claims a candidate via CAS update and returns StepRunPacket', async () => {
    mockFrom.mockReturnValueOnce(makeQB({ data: [{ id: AGENT_ID }], error: null }))
    mockFrom.mockReturnValueOnce(
      makeQB({
        data: [
          {
            id: STEP_ID,
            dag_id: DAG_ID,
            dag_node_id: NODE_ID,
            step_type: 'inbound',
            attempt: 0,
            agent_id: AGENT_ID,
            org_id: ORG_ID,
            input: { foo: 'bar' },
            webhook_url: null,
            status: 'pending',
            timeout_at: null,
          },
        ],
        error: null,
      }),
    )
    mockFrom.mockReturnValueOnce(
      makeQB({
        data: {
          id: STEP_ID,
          dag_id: DAG_ID,
          dag_node_id: NODE_ID,
          step_type: 'inbound',
          attempt: 0,
          agent_id: AGENT_ID,
          org_id: ORG_ID,
          input: { foo: 'bar' },
          webhook_url: null,
          status: 'claimed',
          timeout_at: null,
        },
        error: null,
      }),
    )

    const out = await claimNextStep(RUNTIME_ID, ORG_ID)
    expect(out).not.toBeNull()
    expect(out!.stepId).toBe(STEP_ID)
    expect(out!.dagId).toBe(DAG_ID)
    expect(out!.dagNodeId).toBe(NODE_ID)
    expect(out!.stepType).toBe('inbound')
    expect(out!.payload).toEqual({ foo: 'bar' })
    expect(out!.leaseExpiresAt).toBeTruthy()
  })

  it('enriches Agent Ops steps with bounded assistant context', async () => {
    const input = {
      agent_ops: {
        run_id: '99999999-9999-4999-8999-999999999999',
      },
    }
    mockFrom.mockReturnValueOnce(makeQB({ data: [{ id: AGENT_ID }], error: null }))
    mockFrom.mockReturnValueOnce(
      makeQB({
        data: [
          {
            id: STEP_ID,
            dag_id: DAG_ID,
            dag_node_id: NODE_ID,
            step_type: 'scheduled',
            attempt: 0,
            agent_id: AGENT_ID,
            org_id: ORG_ID,
            input,
            webhook_url: null,
            status: 'pending',
            timeout_at: null,
          },
        ],
        error: null,
      }),
    )
    mockFrom.mockReturnValueOnce(
      makeQB({
        data: {
          id: STEP_ID,
          dag_id: DAG_ID,
          dag_node_id: NODE_ID,
          step_type: 'scheduled',
          attempt: 0,
          agent_id: AGENT_ID,
          org_id: ORG_ID,
          input,
          webhook_url: null,
          status: 'claimed',
          timeout_at: null,
        },
        error: null,
      }),
    )
    mockFrom.mockReturnValueOnce(
      makeQB({
        data: {
          id: AGENT_ID,
          name: 'Reviewer',
          engine: 'openclaw',
          system_prompt: 'Review carefully.',
          soul_content: null,
          lucid_model: 'gpt-4o-mini',
          temperature: 0.2,
          max_tokens: 2048,
          memory_enabled: true,
          approval_required_tools: ['deploy'],
          policy_config: { mode: 'careful' },
          org_id: ORG_ID,
          runtime_flavor: 'c1_managed',
        },
        error: null,
      }),
    )
    mockFrom.mockReturnValueOnce(
      makeQB({
        data: [
          {
            learning_type: 'architecture',
            trust_level: 'observed',
            title: 'Shared workflow rule',
            body: 'Prefer Agent Ops workflow definitions before bespoke orchestration.',
            confidence: 0.8,
          },
        ],
        error: null,
      }),
    )
    mockRpc
      .mockResolvedValueOnce({ data: [{ content: 'Prefer focused reviews.' }], error: null })
      .mockResolvedValueOnce({ data: [{ category: 'architecture', content: 'Use app router.' }], error: null })

    const out = await claimNextStep(RUNTIME_ID, ORG_ID)

    expect(out?.assistantConfig).toMatchObject({
      id: AGENT_ID,
      name: 'Reviewer',
      modelId: 'gpt-4o-mini',
      policyConfig: { mode: 'careful' },
      approvalRequiredTools: ['deploy'],
    })
    expect(out?.memoryInjection).toEqual(['Prefer focused reviews.'])
    expect(out?.boardMemories).toEqual([
      '[architecture] Use app router.',
      '[project_learning:architecture/observed/80%] Shared workflow rule: Prefer Agent Ops workflow definitions before bespoke orchestration.',
    ])
  })

  it('falls through to next candidate when CAS update returns no row (peer race)', async () => {
    mockFrom.mockReturnValueOnce(makeQB({ data: [{ id: AGENT_ID }], error: null }))
    mockFrom.mockReturnValueOnce(
      makeQB({
        data: [
          {
            id: STEP_ID,
            dag_id: DAG_ID,
            dag_node_id: NODE_ID,
            step_type: 'inbound',
            attempt: 0,
            agent_id: AGENT_ID,
            org_id: ORG_ID,
            input: null,
            webhook_url: null,
            status: 'pending',
            timeout_at: null,
          },
        ],
        error: null,
      }),
    )
    // CAS update misses (peer worker grabbed it first).
    mockFrom.mockReturnValueOnce(makeQB({ data: null, error: null }))

    const out = await claimNextStep(RUNTIME_ID, ORG_ID)
    expect(out).toBeNull()
  })
})

describe('completeStep', () => {
  it('rejects unknown step', async () => {
    mockFrom.mockReturnValueOnce(makeQB({ data: null, error: null }))
    const result = await completeStep(RUNTIME_ID, ORG_ID, STEP_ID)
    expect(result).toEqual({ ok: false, error: 'Step not found', status: 404 })
  })

  it('rejects step from a different runtime', async () => {
    mockFrom.mockReturnValueOnce(
      makeQB({
        data: {
          id: STEP_ID,
          dag_id: DAG_ID,
          dag_node_id: NODE_ID,
          step_type: 'inbound',
          attempt: 0,
          agent_id: AGENT_ID,
          org_id: ORG_ID,
          input: null,
          webhook_url: null,
          status: 'claimed',
          timeout_at: null,
        },
        error: null,
      }),
    )
    mockFrom.mockReturnValueOnce(makeQB({ data: { runtime_id: 'other-runtime' }, error: null }))

    const result = await completeStep(RUNTIME_ID, ORG_ID, STEP_ID)
    expect(result).toEqual({ ok: false, error: 'Step not found', status: 404 })
  })

  it('rejects step not in claimable status', async () => {
    mockFrom.mockReturnValueOnce(
      makeQB({
        data: {
          id: STEP_ID,
          dag_id: DAG_ID,
          dag_node_id: NODE_ID,
          step_type: 'inbound',
          attempt: 0,
          agent_id: AGENT_ID,
          org_id: ORG_ID,
          input: null,
          webhook_url: null,
          status: 'completed',
          timeout_at: null,
        },
        error: null,
      }),
    )
    mockFrom.mockReturnValueOnce(makeQB({ data: { runtime_id: RUNTIME_ID }, error: null }))

    const result = await completeStep(RUNTIME_ID, ORG_ID, STEP_ID)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(409)
  })

  it('completes a claimed step and drives the scheduler bridge', async () => {
    mockFrom.mockReturnValueOnce(
      makeQB({
        data: {
          id: STEP_ID,
          dag_id: DAG_ID,
          dag_node_id: NODE_ID,
          step_type: 'inbound',
          attempt: 0,
          agent_id: AGENT_ID,
          org_id: ORG_ID,
          input: null,
          webhook_url: null,
          status: 'claimed',
          timeout_at: null,
        },
        error: null,
      }),
    )
    mockFrom.mockReturnValueOnce(makeQB({ data: { runtime_id: RUNTIME_ID }, error: null }))
    mockFrom.mockReturnValueOnce(makeQB({ data: null, error: null }))

    const result = await completeStep(RUNTIME_ID, ORG_ID, STEP_ID, {
      output: 'ok',
      durationMs: 42,
    })
    expect(result).toEqual({ ok: true })
    expect(onNodeComplete).toHaveBeenCalledWith(DAG_ID, NODE_ID)
  })

  it('marks the Agent Ops run completed when the DAG finishes', async () => {
    const input = {
      agent_ops: {
        run_id: '99999999-9999-4999-8999-999999999999',
      },
    }
    mockFrom.mockReturnValueOnce(
      makeQB({
        data: {
          id: STEP_ID,
          dag_id: DAG_ID,
          dag_node_id: NODE_ID,
          step_type: 'scheduled',
          attempt: 0,
          agent_id: AGENT_ID,
          org_id: ORG_ID,
          input,
          webhook_url: null,
          status: 'claimed',
          timeout_at: null,
        },
        error: null,
      }),
    )
    mockFrom.mockReturnValueOnce(makeQB({ data: { runtime_id: RUNTIME_ID }, error: null }))
    mockFrom.mockReturnValueOnce(makeQB({ data: null, error: null }))
    mockFrom.mockReturnValueOnce(makeQB({ data: { id: 'artifact-1' }, error: null }))
    mockFrom.mockReturnValueOnce(makeQB({ data: { status: 'completed' }, error: null }))
    const runUpdateQb = makeQB({ data: null, error: null })
    mockFrom.mockReturnValueOnce(runUpdateQb)

    const result = await completeStep(RUNTIME_ID, ORG_ID, STEP_ID, {
      output: 'Final Agent Ops report',
      durationMs: 42,
    })

    expect(result).toEqual({ ok: true })
    expect(runUpdateQb.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        output: expect.objectContaining({
          summary: 'Final Agent Ops report',
          completed_dag_id: DAG_ID,
          completed_step_id: STEP_ID,
        }),
      }),
    )
  })

  it('projects structured Agent Ops output into Mission Control artifacts and findings', async () => {
    const input = {
      agent_ops: {
        run_id: '99999999-9999-4999-8999-999999999999',
        step_id: 'review',
        step_title: 'Review implementation',
      },
    }
    mockFrom.mockReturnValueOnce(
      makeQB({
        data: {
          id: STEP_ID,
          dag_id: DAG_ID,
          dag_node_id: NODE_ID,
          step_type: 'scheduled',
          attempt: 0,
          agent_id: AGENT_ID,
          org_id: ORG_ID,
          input,
          webhook_url: null,
          status: 'claimed',
          timeout_at: null,
        },
        error: null,
      }),
    )
    mockFrom.mockReturnValueOnce(makeQB({ data: { runtime_id: RUNTIME_ID }, error: null }))
    mockFrom.mockReturnValueOnce(makeQB({ data: null, error: null }))
    const transcriptInsertQb = makeQB({ data: { id: 'transcript-artifact' }, error: null })
    const evidenceInsertQb = makeQB({ data: { id: 'evidence-artifact' }, error: null })
    const findingInsertQb = makeQB({ data: { id: 'finding-1' }, error: null })
    mockFrom.mockReturnValueOnce(transcriptInsertQb)
    mockFrom.mockReturnValueOnce(evidenceInsertQb)
    mockFrom.mockReturnValueOnce(findingInsertQb)
    mockFrom.mockReturnValueOnce(makeQB({ data: { status: 'completed' }, error: null }))
    const runUpdateQb = makeQB({ data: null, error: null })
    mockFrom.mockReturnValueOnce(runUpdateQb)

    const result = await completeStep(RUNTIME_ID, ORG_ID, STEP_ID, {
      output: JSON.stringify({
        summary: 'Review finished.',
        findings: [
          {
            severity: 'high',
            title: 'Missing authorization guard',
            body: 'The route accepts org ids without checking membership.',
            file_path: 'src/app/api/example/route.ts',
            start_line: 27,
            confidence: 0.91,
          },
        ],
        evidence: [
          {
            type: 'diff',
            title: 'Route diff',
            summary: 'The changed route adds a write path.',
            content: { files: ['src/app/api/example/route.ts'] },
          },
        ],
        risks: ['Cross-org write access.'],
        next_actions: ['Add membership enforcement before writes.'],
      }),
      durationMs: 123,
    })

    expect(result).toEqual({ ok: true })
    expect(transcriptInsertQb.insert).toHaveBeenCalledWith(expect.objectContaining({
      artifact_type: 'transcript',
      title: 'Agent Ops step transcript: Review implementation',
      source_kind: 'orchestration_step',
      source_ref: STEP_ID,
    }))
    expect(evidenceInsertQb.insert).toHaveBeenCalledWith(expect.objectContaining({
      artifact_type: 'diff',
      title: 'Route diff',
      ops_run_id: '99999999-9999-4999-8999-999999999999',
    }))
    expect(findingInsertQb.insert).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'high',
      title: 'Missing authorization guard',
      evidence_artifact_id: 'evidence-artifact',
      file_path: 'src/app/api/example/route.ts',
      start_line: 27,
    }))
    expect(runUpdateQb.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        output: expect.objectContaining({
          summary: 'Review finished.',
          findings: [expect.objectContaining({ title: 'Missing authorization guard' })],
          evidence: [expect.objectContaining({ title: 'Route diff' })],
          risks: ['Cross-org write access.'],
          next_actions: ['Add membership enforcement before writes.'],
          completed_dag_id: DAG_ID,
          completed_dag_node_id: NODE_ID,
          completed_step_id: STEP_ID,
        }),
      }),
    )
  })
})

describe('failStep', () => {
  it('drives scheduler bridge with retryable flag', async () => {
    mockFrom.mockReturnValueOnce(
      makeQB({
        data: {
          id: STEP_ID,
          dag_id: DAG_ID,
          dag_node_id: NODE_ID,
          step_type: 'inbound',
          attempt: 0,
          agent_id: AGENT_ID,
          org_id: ORG_ID,
          input: null,
          webhook_url: null,
          status: 'claimed',
          timeout_at: null,
        },
        error: null,
      }),
    )
    mockFrom.mockReturnValueOnce(makeQB({ data: { runtime_id: RUNTIME_ID }, error: null }))
    mockFrom.mockReturnValueOnce(makeQB({ data: null, error: null }))

    const result = await failStep(RUNTIME_ID, ORG_ID, STEP_ID, 'boom', false)
    expect(result).toEqual({ ok: true })
    expect(onNodeFail).toHaveBeenCalledWith(DAG_ID, NODE_ID, false, 'boom')
  })
})

describe('renewStepLease', () => {
  it('returns new lease expiry on success', async () => {
    mockFrom.mockReturnValueOnce(
      makeQB({
        data: {
          id: STEP_ID,
          dag_id: DAG_ID,
          dag_node_id: NODE_ID,
          step_type: 'inbound',
          attempt: 0,
          agent_id: AGENT_ID,
          org_id: ORG_ID,
          input: null,
          webhook_url: null,
          status: 'claimed',
          timeout_at: null,
        },
        error: null,
      }),
    )
    mockFrom.mockReturnValueOnce(makeQB({ data: { runtime_id: RUNTIME_ID }, error: null }))
    mockFrom.mockReturnValueOnce(makeQB({ data: null, error: null }))

    const result = await renewStepLease(RUNTIME_ID, ORG_ID, STEP_ID)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.leaseExpiresAt).toBeTruthy()
  })
})
