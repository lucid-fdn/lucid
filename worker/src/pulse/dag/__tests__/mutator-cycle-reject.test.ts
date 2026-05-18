/**
 * DagMutator — Cycle reject (Phase 4N-b, Task 38)
 *
 * Existing DAG: A → B → C.
 * Proposed addition: edge C → A (would close a cycle A→B→C→A).
 *
 * Expected behavior:
 *   - Pre-check passes (version matches)
 *   - Redis lock acquired
 *   - Under-lock re-check passes
 *   - Cycle detector runs on existing edges ∪ proposed edges
 *   - CycleError thrown with the offending cycle
 *   - RPC `dag_apply_expand_mutation` is NEVER called (cycle check is before DB writes)
 *   - Redis lock is released in `finally`
 */

import { describe, it, expect, vi } from 'vitest'
import { DagMutator, CycleError } from '../mutator.js'

const DAG_ID = '22222222-2222-4222-8222-222222222222'
const NODE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NODE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NODE_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function buildHarness() {
  const versionFn = vi.fn(async () => ({ data: { graph_version: 1 }, error: null }))

  // Existing edges: A→B, B→C.
  const edgesFn = vi.fn(async () => ({
    data: [
      { parent_node_id: NODE_A, child_node_id: NODE_B },
      { parent_node_id: NODE_B, child_node_id: NODE_C },
    ],
    error: null,
  }))

  const from = vi.fn((table: string) => {
    if (table === 'orchestration_dags') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: versionFn })),
        })),
      }
    }
    if (table === 'orchestration_dag_edges') {
      return {
        select: vi.fn(() => ({ eq: edgesFn })),
      }
    }
    if (table === 'orchestration_dag_mutations') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
          })),
        })),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })

  const rpc = vi.fn(async () => ({ data: null, error: null }))
  const supabase = { from, rpc } as any

  const redis = {
    set: vi.fn(async () => 'OK' as string | null),
    eval: vi.fn(async () => 1),
  } as any

  return { supabase, redis, rpc, edgesFn }
}

describe('DagMutator — cycle reject', () => {
  it('rejects an addition that would close a cycle; no RPC, lock released', async () => {
    const { supabase, redis, rpc, edgesFn } = buildHarness()
    const mutator = new DagMutator(supabase, redis)

    const err = await mutator
      .apply({
        dagId: DAG_ID,
        expectedVersion: 1,
        idempotencyKey: 'cycle-1',
        mutationType: 'expand',
        source: 'agent',
        additions: {
          nodes: [],
          // C → A closes A→B→C→A.
          edges: [{ parent: NODE_C, child: NODE_A, edge_kind: 'data' }],
        },
      })
      .catch((e) => e)

    expect(err).toBeInstanceOf(CycleError)
    const cycleErr = err as CycleError
    expect(cycleErr.dagId).toBe(DAG_ID)
    // Cycle detector returns the offending node sequence; assert it references
    // the three nodes that form the loop (order depends on DFS start).
    const nodes = new Set(cycleErr.cycleNodes)
    expect(nodes.has(NODE_A)).toBe(true)
    expect(nodes.has(NODE_B)).toBe(true)
    expect(nodes.has(NODE_C)).toBe(true)

    // Edges were fetched for the cycle check.
    expect(edgesFn).toHaveBeenCalledTimes(1)
    // RPC never called — cycle check short-circuits before Steps 7+8+9.
    expect(rpc).not.toHaveBeenCalled()
    // Lock acquired and released (finally block).
    expect(redis.set).toHaveBeenCalledTimes(1)
    expect(redis.eval).toHaveBeenCalledTimes(1) // fenced lock release
  })

  it('allows an addition that extends the DAG without closing a cycle', async () => {
    // Baseline sanity: same harness, but add C→D (fresh leaf).
    const { supabase, redis, rpc } = buildHarness()

    // Script the RPC to return a successful mutation row so the happy path
    // completes — otherwise the mutator throws "returned no row".
    rpc.mockResolvedValueOnce({
      data: [
        {
          applied_graph_version: 2,
          added_node_ids: ['dddddddd-dddd-4ddd-8ddd-dddddddddddd'],
          idempotent: false,
        },
      ],
      error: null,
    })

    const mutator = new DagMutator(supabase, redis)
    const result = await mutator.apply({
      dagId: DAG_ID,
      expectedVersion: 1,
      idempotencyKey: 'extend-1',
      mutationType: 'expand',
      source: 'agent',
      additions: {
        nodes: [
          { node_key: 'd', node_type: 'leaf', step_type: 'webhook' },
        ],
        edges: [{ parent: NODE_C, child: 'd', edge_kind: 'data' }],
      },
    })

    expect(result.appliedGraphVersion).toBe(2)
    expect(result.idempotent).toBe(false)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(redis.eval).toHaveBeenCalledTimes(1) // fenced lock release
  })
})
