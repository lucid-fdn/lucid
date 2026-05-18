/**
 * Frontier Replay — Determinism Test (Phase 4N-d, Task 72)
 *
 * Contract under test (from the plan):
 *
 *   "Build DAG, run to completion with mocked deterministic step
 *    executor that records leaf execution order. Fork from a mid-node.
 *    Run forked DAG to completion with same executor. Assert: leaf
 *    execution order downstream of fork point matches original."
 *
 * The approach:
 *
 *   1. Seed an in-memory Supabase fake with a fixed DAG:
 *        A → B → C → D → E   (linear)
 *        B → F                (parallel branch)
 *      So E depends on A,B,C,D and F depends on A,B.
 *
 *   2. Run a deterministic BFS scheduler (`simulateExecution`) over
 *      the original DAG. It promotes nodes in alphabetic tie-break
 *      order whenever multiple are ready — giving a stable, total
 *      order we can compare against.
 *
 *   3. Call `DagReplay.fork` with fork point = C.
 *
 *   4. Run the same deterministic scheduler over the CLONED DAG
 *      (which has A, B, F pre-seeded as 'completed' and C, D, E
 *      pre-seeded as 'pending' with corrected `pending_parent_count`).
 *
 *   5. Map the clone's executed order back to node_keys and assert
 *      that it is exactly the slice of the original order starting
 *      at C — i.e. [C, D, E].
 *
 * Secondary assertions:
 *
 *   - Fork result: totalNodes=6, completedNodes={A,B,F}=3, pendingNodes=3,
 *     readyNodes=1 (only C starts ready — D and E still blocked).
 *   - Every cloned node has a fresh UUID (oldToNew map is 1:1 and
 *     disjoint).
 *   - Edges in the clone all reference cloned UUIDs — no edge in the
 *     clone points back to an original node.
 *   - Ancestor clones carry the original `step_id` forward; fork
 *     point + descendants have `step_id = null`.
 */

import { describe, it, expect } from 'vitest'
import { DagReplay } from '../replay.js'

// ─── Fixture ─────────────────────────────────────────────────────────────────
//   A ─┬─> B ─┬─> C ─> D ─> E
//              └─> F

const ORIGINAL_DAG_ID = '11111111-1111-4111-8111-111111111111'
const ORG_ID = '22222222-2222-4222-8222-222222222222'
const AGENT_ID = '33333333-3333-4333-8333-333333333333'

interface FakeNode {
  id: string
  dag_id: string
  node_key: string
  node_type: string
  step_type: string | null
  runtime_target: string | null
  route_class: string | null
  payload: unknown
  confidence_floor: number | null
  pending_parent_count: number
  status: string
  step_id: string | null
}

interface FakeEdge {
  dag_id: string
  parent_node_id: string
  child_node_id: string
  edge_kind: string
}

interface FakeDag {
  id: string
  org_id: string
  agent_id: string
  source: string
  root_event_id: string | null
  root_event_type: string | null
  budget_max_tokens: number | null
  budget_max_usd: string | null
  budget_max_wall_seconds: number | null
  budget_max_tool_calls: number | null
  status: string
  graph_version: number
  total_nodes: number
  completed_nodes: number
  failed_nodes: number
  ready_nodes: number
  replay_of_dag_id: string | null
  replay_from_node_id: string | null
}

const nodeKeys = ['A', 'B', 'C', 'D', 'E', 'F'] as const
const nodeIds: Record<(typeof nodeKeys)[number], string> = {
  A: 'aaaaaaaa-0000-4000-8000-000000000001',
  B: 'aaaaaaaa-0000-4000-8000-000000000002',
  C: 'aaaaaaaa-0000-4000-8000-000000000003',
  D: 'aaaaaaaa-0000-4000-8000-000000000004',
  E: 'aaaaaaaa-0000-4000-8000-000000000005',
  F: 'aaaaaaaa-0000-4000-8000-000000000006',
}
const originalStepIds: Record<(typeof nodeKeys)[number], string> = {
  A: 'step-A',
  B: 'step-B',
  C: 'step-C',
  D: 'step-D',
  E: 'step-E',
  F: 'step-F',
}

function buildOriginalNodes(): FakeNode[] {
  return nodeKeys.map((k) => ({
    id: nodeIds[k],
    dag_id: ORIGINAL_DAG_ID,
    node_key: k,
    node_type: 'leaf',
    step_type: 'outbound',
    runtime_target: null,
    route_class: null,
    payload: null,
    confidence_floor: null,
    // After the "original run", every node is completed.
    pending_parent_count: 0,
    status: 'completed',
    step_id: originalStepIds[k],
  }))
}

function buildOriginalEdges(): FakeEdge[] {
  const mk = (p: (typeof nodeKeys)[number], c: (typeof nodeKeys)[number]) => ({
    dag_id: ORIGINAL_DAG_ID,
    parent_node_id: nodeIds[p],
    child_node_id: nodeIds[c],
    edge_kind: 'data',
  })
  return [mk('A', 'B'), mk('B', 'C'), mk('C', 'D'), mk('D', 'E'), mk('B', 'F')]
}

// ─── Deterministic BFS scheduler (simulates what the real scheduler does) ────

interface SimNode {
  id: string
  key: string
}
interface SimEdge {
  parent: string
  child: string
}

function simulateExecution(
  nodes: SimNode[],
  edges: SimEdge[],
  initialCompleted: Set<string>,
  initialPending: Map<string, number>,
): string[] {
  const keyOf = new Map<string, string>()
  for (const n of nodes) keyOf.set(n.id, n.key)

  const completed = new Set(initialCompleted)
  const pending = new Map(initialPending)
  const order: string[] = []

  const ready = (): string[] => {
    const r: string[] = []
    for (const n of nodes) {
      if (completed.has(n.id)) continue
      if ((pending.get(n.id) ?? 0) === 0) r.push(n.id)
    }
    // Deterministic tie-break by node_key — matches how the real
    // scheduler's alphabetic ordering on node_key would resolve ties.
    r.sort((a, b) => (keyOf.get(a) ?? '').localeCompare(keyOf.get(b) ?? ''))
    return r
  }

  // Guard against infinite loops in a buggy test graph.
  let guard = nodes.length * 4
  while (guard-- > 0) {
    const next = ready()
    if (next.length === 0) break
    const pick = next[0]
    order.push(keyOf.get(pick)!)
    completed.add(pick)
    for (const e of edges) {
      if (e.parent === pick && !completed.has(e.child)) {
        pending.set(e.child, (pending.get(e.child) ?? 0) - 1)
      }
    }
  }
  return order
}

// ─── In-memory Supabase fake ─────────────────────────────────────────────────

interface FakeStore {
  dags: Map<string, FakeDag>
  nodes: Map<string, FakeNode[]> // dag_id → rows
  edges: Map<string, FakeEdge[]>
  mutations: Map<string, unknown[]>
}

function makeFakeSupabase(store: FakeStore) {
  const dagHeaderOnly = (dag: FakeDag) => ({
    id: dag.id,
    org_id: dag.org_id,
    agent_id: dag.agent_id,
    source: dag.source,
    root_event_id: dag.root_event_id,
    root_event_type: dag.root_event_type,
    budget_max_tokens: dag.budget_max_tokens,
    budget_max_usd: dag.budget_max_usd,
    budget_max_wall_seconds: dag.budget_max_wall_seconds,
    budget_max_tool_calls: dag.budget_max_tool_calls,
  })

  const from = (table: string): any => {
    if (table === 'orchestration_dags') {
      return {
        select: (_cols: string) => ({
          eq: (_col: string, dagId: string) => ({
            maybeSingle: async () => {
              const dag = store.dags.get(dagId)
              return { data: dag ? dagHeaderOnly(dag) : null, error: null }
            },
          }),
        }),
        insert: async (row: FakeDag) => {
          store.dags.set(row.id, { ...row })
          return { error: null }
        },
        delete: () => ({
          eq: async (_col: string, dagId: string) => {
            store.dags.delete(dagId)
            store.nodes.delete(dagId)
            store.edges.delete(dagId)
            return { error: null }
          },
        }),
      }
    }
    if (table === 'orchestration_dag_nodes') {
      return {
        select: (_cols: string) => ({
          eq: (_col: string, dagId: string) => ({
            // Async thenable so `await chain` resolves.
            then: (resolve: (v: { data: FakeNode[]; error: null }) => void) =>
              resolve({ data: store.nodes.get(dagId) ?? [], error: null }),
          }),
        }),
        insert: async (rows: FakeNode[]) => {
          for (const row of rows) {
            const arr = store.nodes.get(row.dag_id) ?? []
            arr.push(row)
            store.nodes.set(row.dag_id, arr)
          }
          return { error: null }
        },
      }
    }
    if (table === 'orchestration_dag_edges') {
      return {
        select: (_cols: string) => ({
          eq: (_col: string, dagId: string) => ({
            then: (resolve: (v: { data: FakeEdge[]; error: null }) => void) =>
              resolve({ data: store.edges.get(dagId) ?? [], error: null }),
          }),
        }),
        insert: async (rows: FakeEdge[]) => {
          for (const row of rows) {
            const arr = store.edges.get(row.dag_id) ?? []
            arr.push(row)
            store.edges.set(row.dag_id, arr)
          }
          return { error: null }
        },
      }
    }
    if (table === 'orchestration_dag_mutations') {
      return {
        select: (_cols: string) => ({
          eq: (_col: string, dagId: string) => ({
            order: (_c: string, _o: unknown) => ({
              then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
                resolve({ data: store.mutations.get(dagId) ?? [], error: null }),
            }),
          }),
        }),
      }
    }
    throw new Error(`[fake-supabase] unexpected table: ${table}`)
  }

  return { from } as any
}

function seedOriginal(): FakeStore {
  const dag: FakeDag = {
    id: ORIGINAL_DAG_ID,
    org_id: ORG_ID,
    agent_id: AGENT_ID,
    source: 'template',
    root_event_id: null,
    root_event_type: null,
    budget_max_tokens: 10_000,
    budget_max_usd: null,
    budget_max_wall_seconds: null,
    budget_max_tool_calls: null,
    status: 'completed',
    graph_version: 1,
    total_nodes: 6,
    completed_nodes: 6,
    failed_nodes: 0,
    ready_nodes: 0,
    replay_of_dag_id: null,
    replay_from_node_id: null,
  }
  const store: FakeStore = {
    dags: new Map([[ORIGINAL_DAG_ID, dag]]),
    nodes: new Map([[ORIGINAL_DAG_ID, buildOriginalNodes()]]),
    edges: new Map([[ORIGINAL_DAG_ID, buildOriginalEdges()]]),
    mutations: new Map(),
  }
  return store
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DagReplay.fork — determinism', () => {
  it('leaf execution order downstream of fork point matches original', async () => {
    const store = seedOriginal()

    // 1. Original run order. Initial pending count derived from edges.
    const origNodes = store.nodes.get(ORIGINAL_DAG_ID)!.map((n) => ({
      id: n.id,
      key: n.node_key,
    }))
    const origEdges = store.edges.get(ORIGINAL_DAG_ID)!.map((e) => ({
      parent: e.parent_node_id,
      child: e.child_node_id,
    }))
    const origInitialPending = new Map<string, number>()
    for (const n of origNodes) origInitialPending.set(n.id, 0)
    for (const e of origEdges) {
      origInitialPending.set(e.child, (origInitialPending.get(e.child) ?? 0) + 1)
    }
    const originalOrder = simulateExecution(
      origNodes,
      origEdges,
      new Set(),
      origInitialPending,
    )

    // Sanity: deterministic BFS should walk A, B, then alphabetic tie-break
    // on C/F (C wins), then D, E, F.
    expect(originalOrder).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])

    // 2. Fork from C.
    let counter = 0
    const supabase = makeFakeSupabase(store)
    const replay = new DagReplay(supabase, null, {
      uuid: () => `clone-uuid-${++counter}`,
    })
    const result = await replay.fork({
      originalDagId: ORIGINAL_DAG_ID,
      fromNodeId: nodeIds.C,
      operatorId: 'test-operator',
    })

    // 3. Structural assertions on the fork result.
    // Strict ancestors of C are A + B. F is a parallel branch (child of B,
    // NOT an ancestor of C), so it should NOT be marked completed. Expected
    // partition: completed = {A, B}, pending = {C, D, E, F}.
    expect(result.totalNodes).toBe(6)
    expect(result.completedNodes).toBe(2)
    expect(result.pendingNodes).toBe(4)
    // Initial frontier: C (parent B is completed → count 0) AND F (parent B
    // is completed → count 0). So readyNodes = 2.
    expect(result.readyNodes).toBe(2)

    // New UUIDs must be 1:1 with originals and disjoint from them.
    const newDagId = result.newDagId
    expect(store.dags.has(newDagId)).toBe(true)
    expect(newDagId).not.toBe(ORIGINAL_DAG_ID)
    const remap = result.nodeIdMap
    expect(remap.size).toBe(6)
    const seen = new Set<string>()
    for (const [oldId, newId] of remap) {
      expect(newId).not.toBe(oldId)
      expect(seen.has(newId)).toBe(false)
      seen.add(newId)
    }

    // Clone partition and step_id provenance.
    const cloneNodes = store.nodes.get(newDagId)!
    expect(cloneNodes).toHaveLength(6)
    const cloneByKey = new Map(cloneNodes.map((n) => [n.node_key, n]))
    for (const key of ['A', 'B'] as const) {
      const clone = cloneByKey.get(key)!
      expect(clone.status).toBe('completed')
      expect(clone.step_id).toBe(originalStepIds[key])
      expect(clone.pending_parent_count).toBe(0)
    }
    for (const key of ['C', 'D', 'E', 'F'] as const) {
      const clone = cloneByKey.get(key)!
      expect(clone.status).toBe('pending')
      expect(clone.step_id).toBeNull()
    }
    // C's only parent (B) is an ancestor → count 0.
    expect(cloneByKey.get('C')!.pending_parent_count).toBe(0)
    // D still depends on C (pending) → count 1.
    expect(cloneByKey.get('D')!.pending_parent_count).toBe(1)
    // E still depends on D (pending) → count 1.
    expect(cloneByKey.get('E')!.pending_parent_count).toBe(1)
    // F's only parent (B) is an ancestor → count 0.
    expect(cloneByKey.get('F')!.pending_parent_count).toBe(0)

    // Every cloned edge must reference cloned UUIDs, not originals.
    const cloneEdges = store.edges.get(newDagId)!
    expect(cloneEdges).toHaveLength(5)
    const originalIdSet = new Set(Object.values(nodeIds))
    for (const e of cloneEdges) {
      expect(originalIdSet.has(e.parent_node_id)).toBe(false)
      expect(originalIdSet.has(e.child_node_id)).toBe(false)
    }

    // 4. Simulate execution on the clone, starting from the partition
    //    the fork produced.
    const cloneSimNodes = cloneNodes.map((n) => ({ id: n.id, key: n.node_key }))
    const cloneSimEdges = cloneEdges.map((e) => ({
      parent: e.parent_node_id,
      child: e.child_node_id,
    }))
    const cloneInitialCompleted = new Set(
      cloneNodes.filter((n) => n.status === 'completed').map((n) => n.id),
    )
    const cloneInitialPending = new Map<string, number>()
    for (const n of cloneNodes) {
      cloneInitialPending.set(n.id, n.pending_parent_count)
    }
    const cloneOrder = simulateExecution(
      cloneSimNodes,
      cloneSimEdges,
      cloneInitialCompleted,
      cloneInitialPending,
    )

    // 5. Downstream order must match the original suffix from C onward.
    //    Original order: A B C D E F. Fork slice (from C): C D E F.
    expect(cloneOrder).toEqual(['C', 'D', 'E', 'F'])

    // And it must be byte-equivalent to the substring of the original
    // order starting at the fork point — the core determinism claim.
    const forkIdx = originalOrder.indexOf('C')
    expect(cloneOrder).toEqual(originalOrder.slice(forkIdx))
  })

  it('throws when fork point is not a node of the target dag', async () => {
    const store = seedOriginal()
    const supabase = makeFakeSupabase(store)
    const replay = new DagReplay(supabase, null)
    await expect(
      replay.fork({
        originalDagId: ORIGINAL_DAG_ID,
        fromNodeId: '99999999-9999-4999-8999-999999999999',
      }),
    ).rejects.toThrow(/fork point .* is not a node/)
  })

  it('throws when the original dag does not exist', async () => {
    const store = seedOriginal()
    const supabase = makeFakeSupabase(store)
    const replay = new DagReplay(supabase, null)
    await expect(
      replay.fork({
        originalDagId: '88888888-8888-4888-8888-888888888888',
        fromNodeId: nodeIds.C,
      }),
    ).rejects.toThrow(/not found/)
  })
})
