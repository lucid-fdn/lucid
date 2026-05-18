/**
 * IncrementalScheduler — No-Scans + Concurrent-Join (Phase 4N-a, Task 26)
 *
 * Verifies two invariants that are the whole point of the counter-driven
 * model:
 *
 * 1. **No whole-graph scans.** When `onNodeComplete(dagId, nodeId)` fires,
 *    the scheduler must NOT issue a `SELECT … FROM orchestration_dag_nodes
 *    WHERE dag_id = $1` without an `id IN (…)` filter. All per-child work
 *    happens inside the `dag_complete_node` RPC, which is edge-bounded.
 *
 * 2. **Concurrent two-parent completion enqueues the join exactly once.**
 *    Fire `onNodeComplete(B)` and `onNodeComplete(C)` in parallel for a
 *    diamond A → {B,C} → J. The scheduler must call `dagStepCreator.create`
 *    for J exactly once, not twice — the single-statement CTE guarantees
 *    that only the writer that observes `pending_parent_count = 0` AND
 *    `status = pending` promotes the row.
 */

import { describe, it, expect, vi } from 'vitest'
import { IncrementalScheduler } from '../scheduler.js'
import type { DagStepCreator } from '../dag-step-creator.js'

const DAG_ID = '11111111-1111-4111-8111-111111111111'
const AGENT_ID = '22222222-2222-4222-8222-222222222222'
const ORG_ID = '33333333-3333-4333-8333-333333333333'
const ROOT_EVENT_ID = '44444444-4444-4444-8444-444444444444'

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

interface RecordedQuery {
  table?: string
  op: string
  detail?: unknown
}

/**
 * Builds a mock Supabase client that records every `from()` and `rpc()`
 * call. `fromHandlers` can override the default no-op behavior per table.
 */
function buildMockSupabase(
  rpcBehavior: Record<string, (args: unknown) => { data: unknown; error: null } | Promise<{ data: unknown; error: null }>>,
) {
  const queries: RecordedQuery[] = []

  const from = vi.fn((table: string) => {
    queries.push({ table, op: 'from' })
    const chain: any = {
      select: vi.fn(() => {
        queries.push({ table, op: 'select' })
        return chain
      }),
      update: vi.fn(() => {
        queries.push({ table, op: 'update' })
        return chain
      }),
      insert: vi.fn(() => {
        queries.push({ table, op: 'insert' })
        return chain
      }),
      delete: vi.fn(() => {
        queries.push({ table, op: 'delete' })
        return chain
      }),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: DAG_HEADER, error: null })),
      then: undefined,
    }
    // Make update/delete awaitable as a terminal op that resolves.
    // Supports both the legacy `.update().eq().eq()` pattern (awaitable
    // stamps) and the Blocker #1 atomic claim `.update().eq().eq().neq()
    // .select()` used by onNodeComplete.
    chain.update = vi.fn(() => {
      queries.push({ table, op: 'update' })
      return {
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
      }
    })
    return chain
  })

  const rpc = vi.fn(async (name: string, args: unknown) => {
    queries.push({ op: `rpc:${name}`, detail: args })
    const handler = rpcBehavior[name]
    if (!handler) return { data: null, error: null }
    return handler(args)
  })

  return { supabase: { from, rpc } as any, queries }
}

describe('IncrementalScheduler — no-scans', () => {
  it('onNodeComplete never issues a bare SELECT across orchestration_dag_nodes', async () => {
    const { supabase, queries } = buildMockSupabase({
      dag_complete_node: () => ({ data: [], error: null }),
      dag_bump_completed: () => ({ data: { completed_nodes: 1, total_nodes: 100 }, error: null }),
    })

    const dagStepCreator = { create: vi.fn(async () => ({ stepId: 'step', isNew: true })) }
    const scheduler = new IncrementalScheduler(
      supabase,
      dagStepCreator as unknown as DagStepCreator,
    )

    await scheduler.onNodeComplete(DAG_ID, 'node-mid-1')

    // The scheduler should touch orchestration_dag_nodes with a targeted
    // UPDATE (stamp complete) — never a bare SELECT. The only SELECT
    // allowed against `orchestration_dag_nodes` is none: the full node
    // set is never read. The header SELECT is against
    // `orchestration_dags`, not nodes.
    const nodeSelects = queries.filter(
      (q) => q.table === 'orchestration_dag_nodes' && q.op === 'select',
    )
    expect(nodeSelects).toHaveLength(0)

    // Edge-bounded work must run via RPC, not a fluent-query scan.
    const rpcCalls = queries.filter((q) => q.op === 'rpc:dag_complete_node')
    expect(rpcCalls).toHaveLength(1)
  })
})

describe('IncrementalScheduler — concurrent-join', () => {
  it('enqueues a join node exactly once under two concurrent parent completions', async () => {
    // Simulate the DB guarantee: dag_complete_node only promotes the join
    // on the first call. The second call sees status != pending and
    // returns an empty row set. This is the contract the single-statement
    // CTE enforces in prod.
    let joinPromoted = false
    const rpcBehavior = {
      dag_complete_node: (args: unknown) => {
        const typed = args as { p_node_id: string }
        if (typed.p_node_id === 'node-B' && !joinPromoted) {
          joinPromoted = true
          return {
            data: [
              {
                id: 'node-J',
                node_key: 'join',
                node_type: 'leaf' as const,
                step_type: 'outbound',
                runtime_target: null,
                route_class: null,
              },
            ],
            error: null,
          }
        }
        // For the second writer (C), the CTE observes status != pending
        // and returns nothing.
        return { data: [], error: null }
      },
      dag_bump_completed: () => ({ data: { completed_nodes: 1, total_nodes: 4 }, error: null }),
    } as const

    const { supabase } = buildMockSupabase(rpcBehavior as any)
    const createSpy = vi.fn(async () => ({ stepId: 'step', isNew: true }))
    const scheduler = new IncrementalScheduler(
      supabase,
      { create: createSpy } as unknown as DagStepCreator,
    )

    await Promise.all([
      scheduler.onNodeComplete(DAG_ID, 'node-B'),
      scheduler.onNodeComplete(DAG_ID, 'node-C'),
    ])

    // The join node should have been enqueued exactly once.
    const joinCalls = createSpy.mock.calls.filter((c) => {
      const input = c[0] as { dagNodeId?: string }
      return input.dagNodeId === 'node-J'
    })
    expect(joinCalls).toHaveLength(1)
  })
})
