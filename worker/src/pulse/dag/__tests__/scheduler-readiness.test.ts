/**
 * IncrementalScheduler — Readiness Predicate (Phase 4N-a, Task 27)
 *
 * The readiness predicate (counter == 0 AND status == 'pending') is
 * enforced atomically inside the `dag_complete_node` CTE. At the
 * scheduler layer we verify the contract by mocking the RPC's return
 * value for each predicate case:
 *
 *   - counter == 0 AND pending → RPC returns row → scheduler enqueues
 *   - counter > 0              → RPC returns []  → scheduler enqueues nothing
 *   - status != pending (already ready/running) → RPC returns [] → nothing
 *   - dag paused               → RPC returns []  → nothing
 *   - non-executable (group / no step_type) → RPC returns row but scheduler skips
 *
 * This test suite pins the scheduler's trust in the RPC contract and
 * documents each negative case.
 */

import { describe, it, expect, vi } from 'vitest'
import { IncrementalScheduler } from '../scheduler.js'
import type { DagStepCreator } from '../dag-step-creator.js'

const DAG_ID = '11111111-1111-4111-8111-111111111111'
const AGENT_ID = '22222222-2222-4222-8222-222222222222'
const ORG_ID = '33333333-3333-4333-8333-333333333333'
const ROOT_EVENT_ID = '44444444-4444-4444-8444-444444444444'
const PARENT_NODE_ID = '55555555-5555-4555-8555-555555555555'
const CHILD_NODE_ID = '66666666-6666-4666-8666-666666666666'

const DAG_HEADER_RUNNING = {
  id: DAG_ID,
  org_id: ORG_ID,
  agent_id: AGENT_ID,
  root_event_id: ROOT_EVENT_ID,
  status: 'running' as const,
  total_nodes: 4,
  completed_nodes: 0,
  failed_nodes: 0,
}

interface BuildOpts {
  completeNodeReturns: unknown[]
  dagHeader?: typeof DAG_HEADER_RUNNING | null
}

function buildHarness(opts: BuildOpts) {
  const createSpy = vi.fn(async () => ({ stepId: 'step', isNew: true }))
  // Default to the running header; tests that want a missing header pass
  // `dagHeader: null` explicitly.
  const header =
    'dagHeader' in opts ? opts.dagHeader : DAG_HEADER_RUNNING

  const chain: any = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => ({ data: header ?? null, error: null }))
  chain.update = vi.fn(() => ({
    eq: vi.fn(() => {
      // Terminal supports TWO shapes used by the scheduler:
      //   (a) legacy `.update(x).eq().eq()` — awaitable (confidence stamp,
      //       pause stamp, fail stamp)
      //   (b) atomic claim `.update(x).eq().eq().neq('status','completed')
      //       .select('id')` — idempotent completion gate (Blocker #1)
      const terminal: any = {
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
      }
      return terminal
    }),
  }))

  const from = vi.fn(() => chain)

  const rpc = vi.fn(async (name: string) => {
    if (name === 'dag_complete_node') {
      return { data: opts.completeNodeReturns, error: null }
    }
    if (name === 'dag_bump_completed') {
      return { data: { completed_nodes: 1, total_nodes: 4 }, error: null }
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

describe('IncrementalScheduler — readiness predicate', () => {
  it('promotes leaf child when RPC returns a row with step_type', async () => {
    const { scheduler, createSpy } = buildHarness({
      completeNodeReturns: [
        {
          id: CHILD_NODE_ID,
          node_key: 'child',
          node_type: 'leaf',
          step_type: 'outbound',
          runtime_target: null,
          route_class: null,
        },
      ],
    })

    await scheduler.onNodeComplete(DAG_ID, PARENT_NODE_ID)

    expect(createSpy).toHaveBeenCalledTimes(1)
    const input = createSpy.mock.calls[0][0] as { dagNodeId: string }
    expect(input.dagNodeId).toBe(CHILD_NODE_ID)
  })

  it('does not enqueue when counter > 0 (RPC returns empty)', async () => {
    const { scheduler, createSpy } = buildHarness({
      completeNodeReturns: [],
    })

    await scheduler.onNodeComplete(DAG_ID, PARENT_NODE_ID)

    expect(createSpy).not.toHaveBeenCalled()
  })

  it('does not enqueue when child is already non-pending (RPC returns empty)', async () => {
    // The CTE's `status = 'pending'` guard filters out children that
    // another worker already promoted. The scheduler sees an empty
    // result set and enqueues nothing.
    const { scheduler, createSpy } = buildHarness({
      completeNodeReturns: [],
    })

    await scheduler.onNodeComplete(DAG_ID, PARENT_NODE_ID)

    expect(createSpy).not.toHaveBeenCalled()
  })

  it('pause guard: decrements children + bumps counter but skips enqueue (Blocker #6 wedge fix)', async () => {
    // Operator pause contract (post-Blocker #6 fix): while the dag is
    // `paused`, a worker that finishes its current step MUST still run
    // `dag_complete_node` so child `pending_parent_count` counters stay
    // truthful and any child that hits 0 is flipped to `ready` in DB.
    // It MUST also bump the completed counter so a paused dag whose
    // last node finishes can still finalize cleanly. What it MUST NOT
    // do on the pause path is enqueue an `orchestration_steps` row —
    // promoted children sit in `ready` state without a step row and
    // `onDagResume` rescues them via the orphan-ready scan.
    //
    // See: pause-during-complete.test.ts for the resume side of the
    // contract; scheduler.ts §`onNodeComplete` Bands 2 vs 3.
    const { scheduler, createSpy, rpc } = buildHarness({
      completeNodeReturns: [
        {
          id: CHILD_NODE_ID,
          node_key: 'child',
          node_type: 'leaf',
          step_type: 'outbound',
          runtime_target: null,
          route_class: null,
        },
      ],
      dagHeader: { ...DAG_HEADER_RUNNING, status: 'paused' as any },
    })

    await scheduler.onNodeComplete(DAG_ID, PARENT_NODE_ID)

    // No leaves enqueued — Band 2 skips the step-creation path.
    expect(createSpy).not.toHaveBeenCalled()
    // BUT both `dag_complete_node` and `dag_bump_completed` MUST have
    // run — that's the wedge fix. Without them, child counters stay
    // stale and resume can't recover the DAG.
    const rpcNames = rpc.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(rpcNames).toContain('dag_complete_node')
    expect(rpcNames).toContain('dag_bump_completed')
  })

  it('skips non-executable promoted nodes (group / no step_type)', async () => {
    const { scheduler, createSpy } = buildHarness({
      completeNodeReturns: [
        {
          id: CHILD_NODE_ID,
          node_key: 'group',
          node_type: 'group',
          step_type: null,
          runtime_target: null,
          route_class: null,
        },
      ],
    })

    await scheduler.onNodeComplete(DAG_ID, PARENT_NODE_ID)

    expect(createSpy).not.toHaveBeenCalled()
  })

  it('no-ops when dag header is missing (RPC never called)', async () => {
    const { scheduler, createSpy, rpc } = buildHarness({
      completeNodeReturns: [],
      dagHeader: null,
    })

    await scheduler.onNodeComplete(DAG_ID, PARENT_NODE_ID)

    expect(createSpy).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
})
