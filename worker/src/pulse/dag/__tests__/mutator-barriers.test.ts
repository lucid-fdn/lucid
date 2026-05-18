/**
 * DagMutator + Scheduler — Barriers (Phase 4N-b, Task 40)
 *
 * A barrier is a join node — it has N parents and should not become
 * `ready` until ALL N parents complete. The barrier contract is
 * enforced by two DB-side guarantees:
 *
 *   1. `dag_promote_added_subgraph` (called by scheduler.onMutation)
 *      sets `pending_parent_count = N` when the barrier is added to
 *      an in-flight DAG with N still-running parents. The barrier is
 *      NOT promoted at this point (count > 0).
 *
 *   2. `dag_complete_node` (called by scheduler.onNodeComplete) runs
 *      the atomic decrement-and-claim CTE: it decrements each child's
 *      `pending_parent_count` by 1 and — in the SAME statement —
 *      returns only those children whose counter hit 0 AND whose
 *      status is still `pending`. For a 2-parent barrier, the first
 *      parent completion decrements 2→1 (no promotion) and the second
 *      decrements 1→0 (promotion).
 *
 * We can't test the SQL CTE itself in a unit test, but we CAN verify
 * the scheduler's trust in the contract by:
 *   a. Scripting `dag_promote_added_subgraph` to return empty on the
 *      initial mutation (barrier not yet ready).
 *   b. Scripting `dag_complete_node` to return empty on the first
 *      parent completion (barrier still blocked).
 *   c. Scripting `dag_complete_node` to return the barrier row on the
 *      second parent completion (barrier promoted).
 *   d. Asserting `dagStepCreator.create()` is called exactly once, on
 *      step (c), with the barrier's ID.
 *
 * This pins the scheduler's end-to-end barrier handling without
 * needing a live Postgres fixture.
 */

import { describe, it, expect, vi } from 'vitest'
import { IncrementalScheduler } from '../scheduler.js'
import type { DagStepCreator } from '../dag-step-creator.js'

const DAG_ID = '44444444-4444-4444-8444-444444444444'
const AGENT_ID = '55555555-5555-4555-8555-555555555555'
const ORG_ID = '66666666-6666-4666-8666-666666666666'
const ROOT_EVENT_ID = '77777777-7777-4777-8777-777777777777'

const PARENT_1 = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PARENT_2 = 'bbbb2222-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const BARRIER = 'cccc3333-cccc-4ccc-8ccc-cccccccccccc'

const DAG_HEADER = {
  id: DAG_ID,
  org_id: ORG_ID,
  agent_id: AGENT_ID,
  root_event_id: ROOT_EVENT_ID,
  status: 'running' as const,
  total_nodes: 4,
  completed_nodes: 0,
  failed_nodes: 0,
}

interface RpcScript {
  dag_promote_added_subgraph?: unknown
  /** Sequential return values for successive dag_complete_node calls. */
  dag_complete_node: unknown[]
}

function buildHarness(script: RpcScript) {
  const createSpy = vi.fn(async () => ({ stepId: 'step', isNew: true }))

  const chain: any = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => ({ data: DAG_HEADER, error: null }))
  chain.update = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => {
        const leaf: any = Promise.resolve({ error: null })
        leaf.neq = vi.fn(() => ({
          select: vi.fn(async () => ({
            data: [{ id: 'claimed' }],
            error: null,
          })),
        }))
        return leaf
      }),
    })),
  }))
  const from = vi.fn(() => chain)

  let completeIdx = 0
  const rpc = vi.fn(async (name: string) => {
    if (name === 'dag_promote_added_subgraph') {
      return { data: script.dag_promote_added_subgraph ?? [], error: null }
    }
    if (name === 'dag_complete_node') {
      const ret = script.dag_complete_node[completeIdx] ?? []
      completeIdx++
      return { data: ret, error: null }
    }
    if (name === 'dag_bump_completed') {
      return {
        data: { completed_nodes: completeIdx, total_nodes: 4 },
        error: null,
      }
    }
    return { data: null, error: null }
  })

  const supabase = { from, rpc } as any
  const scheduler = new IncrementalScheduler(
    supabase,
    { create: createSpy } as unknown as DagStepCreator,
  )
  return { scheduler, createSpy, rpc }
}

describe('DagMutator + Scheduler — barriers', () => {
  it('barrier with 2 parents stays pending after N-1 completes, promotes on Nth', async () => {
    const { scheduler, createSpy } = buildHarness({
      // Mutation added the barrier; promote_added_subgraph returns [] because
      // both parents are still running (pending_parent_count = 2).
      dag_promote_added_subgraph: [],
      // First parent completes → CTE decrements 2→1, returns empty (no promotion).
      // Second parent completes → CTE decrements 1→0, returns the barrier row.
      dag_complete_node: [
        [],
        [
          {
            id: BARRIER,
            node_key: 'barrier',
            node_type: 'leaf',
            step_type: 'outbound',
            runtime_target: null,
            route_class: null,
          },
        ],
      ],
    })

    // Phase 1: scheduler.onMutation after DagMutator.apply() committed.
    await scheduler.onMutation(DAG_ID, [BARRIER])
    expect(createSpy).not.toHaveBeenCalled() // barrier blocked by 2 parents

    // Phase 2: parent 1 completes → still blocked.
    await scheduler.onNodeComplete(DAG_ID, PARENT_1)
    expect(createSpy).not.toHaveBeenCalled()

    // Phase 3: parent 2 completes → barrier promoted and enqueued.
    await scheduler.onNodeComplete(DAG_ID, PARENT_2)
    expect(createSpy).toHaveBeenCalledTimes(1)
    const input = createSpy.mock.calls[0][0] as { dagNodeId: string; stepType: string }
    expect(input.dagNodeId).toBe(BARRIER)
    expect(input.stepType).toBe('outbound')
  })

  it('onMutation is a no-op when the added subgraph promotes nothing', async () => {
    // Degenerate case: mutation added a barrier with N still-running
    // parents. The RPC returns empty, so scheduler.onMutation fires no
    // side effects and leaves the barrier sitting at pending_parent_count=N.
    const { scheduler, createSpy, rpc } = buildHarness({
      dag_promote_added_subgraph: [],
      dag_complete_node: [],
    })

    await scheduler.onMutation(DAG_ID, [BARRIER])

    expect(createSpy).not.toHaveBeenCalled()
    const rpcNames = rpc.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(rpcNames).toContain('dag_promote_added_subgraph')
    expect(rpcNames).not.toContain('dag_complete_node') // onMutation does not decrement
  })

  it('barrier added under a terminal parent is promoted immediately', async () => {
    // Alternative path: mutation hangs a barrier off a parent that's
    // already `completed`. The RPC filters that parent out of the
    // pending_parent_count (SQL: `p.status NOT IN ('completed','skipped')`),
    // so the barrier's count is 0 and it promotes on the initial
    // `onMutation` call — no parent completions needed.
    const { scheduler, createSpy } = buildHarness({
      dag_promote_added_subgraph: [
        {
          id: BARRIER,
          node_key: 'barrier',
          node_type: 'leaf',
          step_type: 'outbound',
          runtime_target: null,
          route_class: null,
        },
      ],
      dag_complete_node: [],
    })

    await scheduler.onMutation(DAG_ID, [BARRIER])

    expect(createSpy).toHaveBeenCalledTimes(1)
    const input = createSpy.mock.calls[0][0] as { dagNodeId: string }
    expect(input.dagNodeId).toBe(BARRIER)
  })
})
