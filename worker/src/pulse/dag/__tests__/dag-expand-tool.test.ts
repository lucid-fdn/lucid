/**
 * expand_dag agent tool — End-to-End (Phase 4N-b, Task 43).
 *
 * Exercises the full `toolExpandDag` → `DagMutator.apply()` →
 * `scheduler.onMutation()` pipeline against a mocked Supabase harness.
 *
 * What this test pins:
 *   1. Input validation rejects malformed envelopes with structured errors.
 *   2. Happy path: tool returns the JSON envelope with dag_id,
 *      applied_graph_version, added_node_ids, node_ids_by_key, idempotent.
 *   3. After mutator commits, scheduler.onMutation fires the
 *      `dag_promote_added_subgraph` RPC and any returned leaves are
 *      enqueued via `DagStepCreator.create`.
 *   4. CAS conflict from the mutator surfaces as a structured envelope
 *      (not a thrown exception).
 *   5. Idempotent replay returns `idempotent: true` and does NOT call
 *      the scheduler (no double-promotion).
 *
 * The mutator is exercised in its `redis: null` mode (matches how the
 * tool is wired in BuiltInToolExecutor) — the DB row lock is the
 * authoritative gate, the advisory lock is just an optimization.
 */

import { describe, it, expect, vi } from 'vitest'
import { toolExpandDag } from '../../../agent/runtime-tools/dag-expand.js'
import { IncrementalScheduler } from '../scheduler.js'
import { DagStepCreator } from '../dag-step-creator.js'

const ORG_ID = '11111111-1111-4111-8111-111111111111'
const AGENT_ID = '22222222-2222-4222-8222-222222222222'
const DAG_ID = '33333333-3333-4333-8333-333333333333'
const PARENT_NODE_ID = '44444444-4444-4444-8444-444444444444'
const ADDED_NODE_ID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ADDED_NODE_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

interface RpcScript {
  /** Sequenced returns for `dag_apply_expand_mutation`. */
  expand: Array<{ data?: unknown; error?: { code?: string; message: string } }>
  /** Returns for `dag_promote_added_subgraph`. */
  promote: unknown
}

function buildHarness(script: RpcScript) {
  const dagHeader = {
    id: DAG_ID,
    org_id: ORG_ID,
    agent_id: AGENT_ID,
    root_event_id: null,
    status: 'running' as const,
    total_nodes: 5,
    completed_nodes: 1,
    failed_nodes: 0,
  }

  const versionFn = vi.fn(async () => ({ data: { graph_version: 2 }, error: null }))
  const edgesFn = vi.fn(async () => ({ data: [], error: null }))
  const dagHeaderFn = vi.fn(async () => ({ data: dagHeader, error: null }))

  const from = vi.fn((table: string) => {
    if (table === 'orchestration_dags') {
      // Two SELECT shapes:
      //   - mutator: select('graph_version').eq().maybeSingle()
      //   - scheduler: select(...).eq().maybeSingle()  → dag header
      return {
        select: vi.fn((cols?: string) => ({
          eq: vi.fn(() => ({
            maybeSingle: cols === 'graph_version' ? versionFn : dagHeaderFn,
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
            then: (r: (v: { error: null }) => void) => r({ error: null }),
          })),
        })),
      }
    }
    if (table === 'orchestration_dag_edges') {
      return {
        select: vi.fn(() => ({ eq: edgesFn })),
      }
    }
    if (table === 'orchestration_dag_nodes') {
      // Scheduler confidence-gate stamps `confidence_observed` +
      // `confidence_source` on every admitted node via `.update().eq('id').eq('dag_id')`.
      return {
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        })),
      }
    }
    if (table === 'orchestration_dag_mutations') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        })),
      }
    }
    throw new Error(`[expand_dag harness] unexpected table: ${table}`)
  })

  let expandIdx = 0
  const rpc = vi.fn(async (name: string) => {
    if (name === 'dag_apply_expand_mutation') {
      const ret = script.expand[expandIdx] ?? { data: null, error: null }
      expandIdx++
      return ret
    }
    if (name === 'dag_promote_added_subgraph') {
      return { data: script.promote ?? [], error: null }
    }
    return { data: null, error: null }
  })

  const supabase = { from, rpc } as any
  return { supabase, rpc }
}

function makeScheduler(supabase: any) {
  const createSpy = vi.fn(async () => ({ stepId: 'mock-step', isNew: true }))
  const scheduler = new IncrementalScheduler(
    supabase,
    { create: createSpy } as unknown as DagStepCreator,
  )
  return { scheduler, createSpy }
}

describe('expand_dag agent tool — E2E', () => {
  it('rejects missing dag_id with a structured error envelope', async () => {
    const { supabase } = buildHarness({ expand: [], promote: [] })
    const { scheduler } = makeScheduler(supabase)

    const result = await toolExpandDag(
      {
        dag_id: '',
        expected_version: 1,
        idempotency_key: 'k1',
        additions: { nodes: [{ node_key: 'x', node_type: 'leaf' }] },
      },
      { supabase, redis: null, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
    )
    const envelope = JSON.parse(result)
    expect(envelope.error).toContain('dag_id')
  })

  it('rejects empty additions', async () => {
    const { supabase } = buildHarness({ expand: [], promote: [] })
    const { scheduler } = makeScheduler(supabase)

    const result = await toolExpandDag(
      {
        dag_id: DAG_ID,
        expected_version: 2,
        idempotency_key: 'k2',
        additions: { nodes: [], edges: [] },
      },
      { supabase, redis: null, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
    )
    const envelope = JSON.parse(result)
    expect(envelope.error).toContain('at least one node or edge')
  })

  it('happy path: 2 nodes + edge under existing parent → mutator commits → scheduler promotes 1 leaf', async () => {
    const { supabase, rpc } = buildHarness({
      expand: [
        {
          data: [
            {
              applied_graph_version: 3,
              added_node_ids: [ADDED_NODE_ID_1, ADDED_NODE_ID_2],
              idempotent: false,
            },
          ],
          error: null,
        },
      ],
      // Subgraph promotion returns the first added node as ready (the
      // second is gated behind the first via the new edge).
      promote: [
        {
          id: ADDED_NODE_ID_1,
          node_key: 'follow_up',
          node_type: 'leaf',
          step_type: 'outbound',
          runtime_target: null,
          route_class: null,
        },
      ],
    })
    const { scheduler, createSpy } = makeScheduler(supabase)

    const result = await toolExpandDag(
      {
        dag_id: DAG_ID,
        expected_version: 2,
        idempotency_key: 'expand-1',
        expansion_zone_node_id: PARENT_NODE_ID,
        additions: {
          nodes: [
            { node_key: 'follow_up', node_type: 'leaf', step_type: 'outbound' },
            { node_key: 'wrap_up', node_type: 'leaf', step_type: 'outbound' },
          ],
          edges: [
            { parent: PARENT_NODE_ID, child: 'follow_up' },
            { parent: 'follow_up', child: 'wrap_up' },
          ],
        },
      },
      { supabase, redis: null, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
    )

    const envelope = JSON.parse(result) as {
      dag_id: string
      applied_graph_version: number
      added_node_ids: string[]
      node_ids_by_key: Record<string, string>
      idempotent: boolean
      error?: string
    }
    expect(envelope.error).toBeUndefined()
    expect(envelope.dag_id).toBe(DAG_ID)
    expect(envelope.applied_graph_version).toBe(3)
    expect(envelope.added_node_ids).toEqual([ADDED_NODE_ID_1, ADDED_NODE_ID_2])
    expect(envelope.idempotent).toBe(false)
    expect(envelope.node_ids_by_key).toBeDefined()

    // Mutator + scheduler each fired their RPCs.
    const rpcNames = rpc.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(rpcNames).toContain('dag_apply_expand_mutation')
    expect(rpcNames).toContain('dag_promote_added_subgraph')

    // Scheduler enqueued the one promoted leaf.
    expect(createSpy).toHaveBeenCalledTimes(1)
    const createInput = createSpy.mock.calls[0][0] as { dagNodeId: string }
    expect(createInput.dagNodeId).toBe(ADDED_NODE_ID_1)
  })

  it('CAS conflict surfaces as cas_conflict envelope (no exception)', async () => {
    const { supabase } = buildHarness({
      // Pre-check returns version 2 (matches expected), so we get past
      // the early CAS gate. RPC returns 40001 — the mutator re-fetches
      // the version (still 2 in this stub) and surfaces the error.
      expand: [
        { data: null, error: { code: '40001', message: 'cas_conflict' } },
      ],
      promote: [],
    })
    const { scheduler, createSpy } = makeScheduler(supabase)

    const result = await toolExpandDag(
      {
        dag_id: DAG_ID,
        expected_version: 2,
        idempotency_key: 'expand-cas',
        additions: {
          nodes: [{ node_key: 'x', node_type: 'leaf', step_type: 'outbound' }],
        },
      },
      { supabase, redis: null, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
    )

    const envelope = JSON.parse(result)
    expect(envelope.error).toBe('cas_conflict')
    expect(envelope.expected_version).toBe(2)
    expect(envelope.actual_version).toBe(2)
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('idempotent replay does not call scheduler.onMutation', async () => {
    const { supabase, rpc } = buildHarness({
      expand: [
        {
          data: [
            {
              applied_graph_version: 3,
              added_node_ids: [],
              idempotent: true,
            },
          ],
          error: null,
        },
      ],
      promote: [],
    })
    const { scheduler, createSpy } = makeScheduler(supabase)

    const result = await toolExpandDag(
      {
        dag_id: DAG_ID,
        expected_version: 2,
        idempotency_key: 'expand-replay',
        additions: {
          nodes: [{ node_key: 'x', node_type: 'leaf', step_type: 'outbound' }],
        },
      },
      { supabase, redis: null, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
    )

    const envelope = JSON.parse(result)
    expect(envelope.idempotent).toBe(true)
    expect(envelope.applied_graph_version).toBe(3)
    expect(envelope.added_node_ids).toEqual([])

    // Scheduler RPC must NOT have fired — no double-promotion on replay.
    const rpcNames = rpc.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(rpcNames).not.toContain('dag_promote_added_subgraph')
    expect(createSpy).not.toHaveBeenCalled()
  })
})
