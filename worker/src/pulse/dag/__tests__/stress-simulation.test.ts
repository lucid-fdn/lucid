/**
 * Phase 4N DAG Planner — Stress Simulation (At-Scale)
 *
 * Drives the IncrementalScheduler through a fleet of ~50 DAGs with
 * mixed topologies (linear chains, diamond joins, wide fan-in
 * barriers) under realistic at-least-once Pulse delivery semantics
 * (10% of completions are duplicated via lease-expiry / orphan
 * re-claim / BYO retry). The test exists to pin the invariants the
 * Blocker #1 atomic-claim fix (`neq('status','completed').select('id')`)
 * is supposed to buy us:
 *
 *   I1. Every DAG reaches `status = 'completed'`.
 *   I2. Every node is stamped exactly once — duplicate deliveries
 *       produce zero extra writes.
 *   I3. `dag_complete_node` runs exactly once per completed node
 *       (second caller bails at the atomic claim).
 *   I4. `dag_bump_completed` runs exactly `total_nodes` times per DAG.
 *   I5. `DagStepCreator.create` runs exactly once per promoted node
 *       (no double-enqueue into Pulse).
 *   I6. Total `create` calls == total nodes across the fleet — joins
 *       promote exactly once even with concurrent parent completions.
 *
 * The fake Supabase is a synchronous in-memory model of the
 * orchestration_dag_* tables + the three promotion/decrement RPCs.
 * Because JS is single-threaded, any `execute()` call runs atomically
 * between awaits — this is exactly the row-lock semantics Postgres
 * gives the conditional UPDATE, and the reason the scheduler's
 * single-round-trip claim pattern is safe under concurrency.
 */

import { describe, it, expect, vi } from 'vitest'
import { IncrementalScheduler } from '../scheduler.js'
import type { DagStepCreator } from '../dag-step-creator.js'

// ─── Fixture types ───────────────────────────────────────────────────

type NodeStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'cancelled'
type DagStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused'

interface NodeRec {
  id: string
  dag_id: string
  node_key: string
  node_type: 'leaf' | 'group'
  step_type: string | null
  status: NodeStatus
  pending_parent_count: number
  runtime_target: null
  route_class: null
  confidence_floor: null
  payload: null
  completed_at: string | null
  [extra: string]: unknown // accepts confidence stamps written by the gate
}

interface DagRec {
  id: string
  org_id: string
  agent_id: string
  root_event_id: string
  status: DagStatus
  total_nodes: number
  completed_nodes: number
  failed_nodes: number
  budget_max_tokens: null
  started_at: string | null
  completed_at: string | null
}

interface EdgeRec {
  dag_id: string
  parent_id: string
  child_id: string
}

// ─── In-memory model of the scheduler's DB surface ───────────────────

class FakeDagDb {
  dags = new Map<string, DagRec>()
  nodes = new Map<string, NodeRec>()
  edgesByParent = new Map<string, string[]>()

  // Invariant metrics
  stampCompleteAttempts = 0
  stampCompleteWins = 0
  completeNodeRpcCalls = new Map<string, number>() // nodeId -> count
  bumpCompletedRpcCalls = new Map<string, number>() // dagId -> count

  insertDag(d: DagRec): void {
    this.dags.set(d.id, d)
  }
  insertNode(n: NodeRec): void {
    this.nodes.set(n.id, n)
  }
  insertEdge(e: EdgeRec): void {
    const arr = this.edgesByParent.get(e.parent_id) ?? []
    arr.push(e.child_id)
    this.edgesByParent.set(e.parent_id, arr)
  }

  // Synchronous RPC equivalents. Each call is atomic relative to
  // other awaits in the event loop — same guarantee Postgres row
  // locks give the real CTE.

  dagPromoteRoots(dagId: string): NodeRec[] {
    const promoted: NodeRec[] = []
    for (const n of this.nodes.values()) {
      if (n.dag_id !== dagId) continue
      if (n.pending_parent_count === 0 && n.status === 'pending') {
        n.status = 'ready'
        promoted.push(n)
      }
    }
    return promoted.map((n) => ({ ...n }))
  }

  dagCompleteNode(dagId: string, nodeId: string): NodeRec[] {
    this.completeNodeRpcCalls.set(
      nodeId,
      (this.completeNodeRpcCalls.get(nodeId) ?? 0) + 1,
    )
    const promoted: NodeRec[] = []
    const children = this.edgesByParent.get(nodeId) ?? []
    for (const childId of children) {
      const child = this.nodes.get(childId)
      if (!child || child.dag_id !== dagId) continue
      child.pending_parent_count = Math.max(0, child.pending_parent_count - 1)
      if (child.pending_parent_count === 0 && child.status === 'pending') {
        child.status = 'ready'
        promoted.push(child)
      }
    }
    return promoted.map((n) => ({ ...n }))
  }

  dagBumpCompleted(dagId: string): { completed_nodes: number; total_nodes: number } {
    const d = this.dags.get(dagId)!
    d.completed_nodes += 1
    this.bumpCompletedRpcCalls.set(
      dagId,
      (this.bumpCompletedRpcCalls.get(dagId) ?? 0) + 1,
    )
    return { completed_nodes: d.completed_nodes, total_nodes: d.total_nodes }
  }
}

// ─── Fluent QueryBuilder (PromiseLike) ───────────────────────────────

type Op = 'select' | 'update' | null
interface Filter {
  col: string
  op: '=' | '!='
  val: unknown
}

class QueryBuilder implements PromiseLike<{ data: unknown; error: null }> {
  private op: Op = null
  private updatePayload: Record<string, unknown> | null = null
  private filters: Filter[] = []
  private selectAfterUpdate = false

  constructor(
    private readonly db: FakeDagDb,
    private readonly table: string,
  ) {}

  select(_cols?: string): this {
    if (this.op === 'update') {
      this.selectAfterUpdate = true
    } else {
      this.op = 'select'
    }
    return this
  }

  update(payload: Record<string, unknown>): this {
    this.op = 'update'
    this.updatePayload = payload
    return this
  }

  eq(col: string, val: unknown): this {
    this.filters.push({ col, op: '=', val })
    return this
  }

  neq(col: string, val: unknown): this {
    this.filters.push({ col, op: '!=', val })
    return this
  }

  async maybeSingle(): Promise<{ data: unknown; error: null }> {
    const res = this.execute()
    const rows = res.data as unknown[]
    return { data: rows.length > 0 ? rows[0] : null, error: null }
  }

  then<R1 = { data: unknown; error: null }, R2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: null }) => R1 | PromiseLike<R1>)
      | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }

  private matches(row: Record<string, unknown>): boolean {
    for (const f of this.filters) {
      const actual = row[f.col]
      if (f.op === '=' && actual !== f.val) return false
      if (f.op === '!=' && actual === f.val) return false
    }
    return true
  }

  private execute(): { data: unknown; error: null } {
    if (this.table === 'orchestration_dags') {
      const rows = [...this.db.dags.values()].filter((r) =>
        this.matches(r as unknown as Record<string, unknown>),
      )
      if (this.op === 'select') return { data: rows, error: null }
      if (this.op === 'update' && this.updatePayload) {
        for (const r of rows) Object.assign(r, this.updatePayload)
        return { data: null, error: null }
      }
    }
    if (this.table === 'orchestration_dag_nodes') {
      const rows = [...this.db.nodes.values()].filter((r) =>
        this.matches(r as unknown as Record<string, unknown>),
      )
      if (this.op === 'select') return { data: rows, error: null }
      if (this.op === 'update' && this.updatePayload) {
        const isAtomicCompleteClaim =
          this.updatePayload.status === 'completed' && this.selectAfterUpdate
        if (isAtomicCompleteClaim) {
          this.db.stampCompleteAttempts += 1
        }
        for (const r of rows) Object.assign(r, this.updatePayload)
        if (isAtomicCompleteClaim && rows.length > 0) {
          this.db.stampCompleteWins += 1
        }
        if (this.selectAfterUpdate) {
          return { data: rows.map((r) => ({ id: r.id })), error: null }
        }
        return { data: null, error: null }
      }
    }
    return { data: [], error: null }
  }
}

// ─── Fake Supabase client ────────────────────────────────────────────

function buildSupabase(db: FakeDagDb) {
  const from = vi.fn((table: string) => new QueryBuilder(db, table))
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'dag_promote_roots') {
      return { data: db.dagPromoteRoots(args.p_dag_id as string), error: null }
    }
    if (name === 'dag_complete_node') {
      return {
        data: db.dagCompleteNode(
          args.p_dag_id as string,
          args.p_node_id as string,
        ),
        error: null,
      }
    }
    if (name === 'dag_bump_completed') {
      return {
        data: db.dagBumpCompleted(args.p_dag_id as string),
        error: null,
      }
    }
    // Unused in this simulation
    return { data: null, error: null }
  })
  return { from, rpc } as unknown as Parameters<typeof IncrementalScheduler>[0] extends infer _
    ? any
    : never
}

// ─── Topology generators ─────────────────────────────────────────────

const ORG_ID = '22222222-2222-4222-8222-222222222222'
const AGENT_ID = '33333333-3333-4333-8333-333333333333'

function uuid(prefix: string, i: number): string {
  const hex = i.toString(16).padStart(12, '0')
  return `${prefix}-0000-4000-8000-${hex}`
}

function makeNode(
  db: FakeDagDb,
  dagId: string,
  key: string,
  idx: number,
  pendingParents: number,
): NodeRec {
  const id = uuid(`aaaa${(idx % 10000).toString(16).padStart(4, '0')}`, idx)
  const n: NodeRec = {
    id,
    dag_id: dagId,
    node_key: key,
    node_type: 'leaf',
    step_type: 'outbound',
    status: 'pending',
    pending_parent_count: pendingParents,
    runtime_target: null,
    route_class: null,
    confidence_floor: null,
    payload: null,
    completed_at: null,
  }
  db.insertNode(n)
  return n
}

function makeDag(
  db: FakeDagDb,
  dagId: string,
  totalNodes: number,
): DagRec {
  const d: DagRec = {
    id: dagId,
    org_id: ORG_ID,
    agent_id: AGENT_ID,
    root_event_id: uuid('eeee0000', totalNodes),
    status: 'pending',
    total_nodes: totalNodes,
    completed_nodes: 0,
    failed_nodes: 0,
    budget_max_tokens: null,
    started_at: null,
    completed_at: null,
  }
  db.insertDag(d)
  return d
}

let globalNodeCounter = 0

/** Linear chain: R → A → B → C → … (length nodes total) */
function buildLinearDag(db: FakeDagDb, dagIdx: number, length: number): DagRec {
  const dagId = uuid(`dddd${dagIdx.toString(16).padStart(4, '0')}`, dagIdx)
  const dag = makeDag(db, dagId, length)
  const nodes: NodeRec[] = []
  for (let i = 0; i < length; i++) {
    const n = makeNode(
      db,
      dagId,
      `lin-${i}`,
      ++globalNodeCounter,
      i === 0 ? 0 : 1,
    )
    nodes.push(n)
  }
  for (let i = 1; i < length; i++) {
    db.insertEdge({ dag_id: dagId, parent_id: nodes[i - 1].id, child_id: nodes[i].id })
  }
  return dag
}

/** Diamond: R → {A, B} → J (4 nodes, concurrent join on J) */
function buildDiamondDag(db: FakeDagDb, dagIdx: number): DagRec {
  const dagId = uuid(`dddd${dagIdx.toString(16).padStart(4, '0')}`, dagIdx)
  const dag = makeDag(db, dagId, 4)
  const r = makeNode(db, dagId, 'r', ++globalNodeCounter, 0)
  const a = makeNode(db, dagId, 'a', ++globalNodeCounter, 1)
  const b = makeNode(db, dagId, 'b', ++globalNodeCounter, 1)
  const j = makeNode(db, dagId, 'j', ++globalNodeCounter, 2)
  db.insertEdge({ dag_id: dagId, parent_id: r.id, child_id: a.id })
  db.insertEdge({ dag_id: dagId, parent_id: r.id, child_id: b.id })
  db.insertEdge({ dag_id: dagId, parent_id: a.id, child_id: j.id })
  db.insertEdge({ dag_id: dagId, parent_id: b.id, child_id: j.id })
  return dag
}

/** Wide barrier: R → {P1..Pwidth} → J (width+2 nodes, N-way join) */
function buildWideBarrierDag(
  db: FakeDagDb,
  dagIdx: number,
  width: number,
): DagRec {
  const dagId = uuid(`dddd${dagIdx.toString(16).padStart(4, '0')}`, dagIdx)
  const dag = makeDag(db, dagId, width + 2)
  const r = makeNode(db, dagId, 'r', ++globalNodeCounter, 0)
  const parents: NodeRec[] = []
  for (let i = 0; i < width; i++) {
    parents.push(makeNode(db, dagId, `p${i}`, ++globalNodeCounter, 1))
  }
  const j = makeNode(db, dagId, 'j', ++globalNodeCounter, width)
  for (const p of parents) {
    db.insertEdge({ dag_id: dagId, parent_id: r.id, child_id: p.id })
    db.insertEdge({ dag_id: dagId, parent_id: p.id, child_id: j.id })
  }
  return dag
}

// ─── Deterministic PRNG for duplicate-delivery decisions ─────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── The test ────────────────────────────────────────────────────────

describe('IncrementalScheduler — stress simulation (at-scale)', () => {
  it(
    '50 mixed-topology DAGs walk to completion under at-least-once delivery',
    async () => {
      const db = new FakeDagDb()
      const supabase = buildSupabase(db)

      const createSpy = vi.fn(async () => ({ stepId: 'mock', isNew: true }))
      const scheduler = new IncrementalScheduler(
        supabase,
        { create: createSpy } as unknown as DagStepCreator,
        {},
        null, // no budget ledger
        {}, // router off
      )

      // Build the fleet: 20 linear (len 10) + 20 diamond (4) + 10 wide (width 8)
      const dags: DagRec[] = []
      for (let i = 0; i < 20; i++) dags.push(buildLinearDag(db, i, 10))
      for (let i = 20; i < 40; i++) dags.push(buildDiamondDag(db, i))
      for (let i = 40; i < 50; i++) dags.push(buildWideBarrierDag(db, i, 8))

      const expectedNodes = 20 * 10 + 20 * 4 + 10 * (8 + 2)
      expect(db.nodes.size).toBe(expectedNodes) // 380

      // Fire onDagCreated for every DAG in parallel. Each call promotes
      // root(s) and enqueues them via createSpy.
      await Promise.all(dags.map((d) => scheduler.onDagCreated(d.id)))

      // Walk to completion. On each round, grab every create-call issued
      // since last round and fire onNodeComplete concurrently. With
      // probability 10%, fire it twice (simulating at-least-once Pulse
      // delivery / lease expiry → orphan re-claim / BYO retry).
      const rand = mulberry32(0xdeadbeef)
      let processedCalls = 0
      let rounds = 0
      while (processedCalls < createSpy.mock.calls.length) {
        rounds += 1
        if (rounds > 200) throw new Error('walk did not converge — infinite loop')
        const batch = createSpy.mock.calls.slice(processedCalls)
        processedCalls = createSpy.mock.calls.length

        await Promise.all(
          batch.flatMap((call) => {
            const input = call[0] as { dagId: string; dagNodeId: string }
            const promises: Promise<void>[] = [
              scheduler.onNodeComplete(input.dagId, input.dagNodeId),
            ]
            if (rand() < 0.1) {
              promises.push(
                scheduler.onNodeComplete(input.dagId, input.dagNodeId),
              )
            }
            return promises
          }),
        )
      }

      // ── Invariants ─────────────────────────────────────────────────

      // I1: every DAG reached `completed`.
      for (const d of db.dags.values()) {
        expect(d.status).toBe('completed')
        expect(d.completed_nodes).toBe(d.total_nodes)
      }

      // I2: every node was stamped exactly once. `stampCompleteAttempts`
      // counts UPDATE calls (including losing duplicates); `stampWins`
      // counts rows actually flipped to `completed`. Under at-least-once
      // delivery, attempts > wins, but wins == total nodes.
      expect(db.stampCompleteWins).toBe(expectedNodes)
      expect(db.stampCompleteAttempts).toBeGreaterThanOrEqual(expectedNodes)

      // I3: dag_complete_node ran exactly once per node. The second
      // caller of a duplicate delivery bails at the atomic claim before
      // touching the RPC — this is the whole point of Blocker #1.
      expect(db.completeNodeRpcCalls.size).toBe(expectedNodes)
      for (const count of db.completeNodeRpcCalls.values()) {
        expect(count).toBe(1)
      }

      // I4: dag_bump_completed ran exactly total_nodes times per DAG.
      for (const d of db.dags.values()) {
        expect(db.bumpCompletedRpcCalls.get(d.id)).toBe(d.total_nodes)
      }

      // I5 + I6: DagStepCreator.create ran exactly once per promoted
      // (dagId, dagNodeId) tuple AND total creates == total nodes. The
      // latter is the concurrent-join invariant — N-parent barriers
      // promote exactly once even when all N parents complete in the
      // same tick.
      const seen = new Set<string>()
      for (const call of createSpy.mock.calls) {
        const input = call[0] as { dagId: string; dagNodeId: string }
        const key = `${input.dagId}|${input.dagNodeId}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
      expect(createSpy.mock.calls).toHaveLength(expectedNodes)
      expect(seen.size).toBe(expectedNodes)
    },
    30_000, // generous timeout — the simulation is CPU-bound, not I/O
  )
})
