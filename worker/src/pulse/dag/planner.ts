/**
 * DagPlanner — Phase 4N-a, Task 23.
 *
 * Turns a validated `DagSpec` (usually from `template-loader.ts`) into a
 * live DAG instance: inserts the `orchestration_dags` row, bulk-inserts
 * `orchestration_dag_nodes` with `pending_parent_count` computed entirely
 * from in-memory iteration over the template, bulk-inserts
 * `orchestration_dag_edges` resolving node_keys → UUIDs, and stamps
 * `ready_nodes` on the dag row.
 *
 * Invariants (spec §3.7 "Counter-driven readiness"):
 *   - `pending_parent_count` is computed ONCE from the template edges —
 *     never by scanning the live graph.
 *   - The initial UPDATE of `ready_nodes` equals the count of nodes with
 *     `pending_parent_count = 0` at insert time.
 *   - No row-level locks held across node/edge inserts — the atomicity
 *     we need is "the dag row exists iff its nodes and edges do". The
 *     planner relies on DB-side FK CASCADE to guarantee cleanup if the
 *     planner throws mid-way (the caller must catch and delete the dag
 *     row — planner does not swallow errors).
 *
 * Cycle detection runs BEFORE insert via `detectCycle()` (Chunk 9).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { detectCycle } from './cycle-detector.js'
import type { DagSpec, DagSource, DagNodeType } from './types.js'

/**
 * Hard caps on DAG size — enforced BEFORE any DB writes so a malformed
 * template or runaway agent can't spray thousands of rows into
 * `orchestration_dag_nodes` / `orchestration_dag_edges`. Spec §3.4 targets
 * <100 nodes per DAG in production; we cap at 200 nodes / 400 edges to
 * leave headroom for aggressive templates while still bounding blast
 * radius from a buggy caller.
 */
export const MAX_DAG_NODES = 200
export const MAX_DAG_EDGES = 400

export class DagSizeError extends Error {
  constructor(
    public readonly kind: 'nodes' | 'edges',
    public readonly count: number,
    public readonly limit: number,
  ) {
    super(`[dag-planner] ${kind} count ${count} exceeds limit ${limit}`)
    this.name = 'DagSizeError'
  }
}

export interface InstantiateInput {
  spec: DagSpec
  agentId: string
  orgId: string
  source: DagSource
  templateId?: string | null
  rootEventId?: string | null
  rootEventType?: 'inbound' | 'outbound' | 'scheduled' | 'webhook' | null
}

export interface InstantiateResult {
  dagId: string
  /** Newly-minted UUIDs for each node, keyed by node_key. */
  nodeIdsByKey: Map<string, string>
  /** Subset of nodeIds with `pending_parent_count = 0`. */
  rootNodeIds: string[]
  /** Total node count = `spec.nodes.length`. */
  totalNodes: number
  /** Count of rows with `pending_parent_count = 0` at creation. */
  readyNodes: number
}

export class DagCycleError extends Error {
  constructor(public readonly cycleNodes: string[]) {
    super(`[dag-planner] cycle detected: ${cycleNodes.join(' -> ')}`)
    this.name = 'DagCycleError'
  }
}

/**
 * Minimal subset of `crypto.randomUUID()` so we can DI-inject in tests
 * without depending on the global. Defaults to Node's built-in in prod.
 */
type UuidFn = () => string
const defaultUuid: UuidFn = () => globalThis.crypto.randomUUID()

export class DagPlanner {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly uuid: UuidFn = defaultUuid,
  ) {}

  async instantiateFromTemplate(input: InstantiateInput): Promise<InstantiateResult> {
    const { spec } = input

    // ----- 0. Size hard-cap (fail fast before cycle check + DB writes) --
    // Bounds blast radius from malformed templates or buggy agent callers.
    if (spec.nodes.length > MAX_DAG_NODES) {
      throw new DagSizeError('nodes', spec.nodes.length, MAX_DAG_NODES)
    }
    if (spec.edges.length > MAX_DAG_EDGES) {
      throw new DagSizeError('edges', spec.edges.length, MAX_DAG_EDGES)
    }

    // ----- 1. Cycle check (fail fast before any DB writes) --------------
    const cycle = detectCycle(
      [],
      spec.edges.map((e) => ({ parent: e.parent, child: e.child })),
    )
    if (cycle.hasCycle) {
      throw new DagCycleError(cycle.cycleNodes ?? [])
    }

    // ----- 2. Compute pending_parent_count in-memory --------------------
    const nodeIdsByKey = new Map<string, string>()
    for (const node of spec.nodes) {
      nodeIdsByKey.set(node.node_key, this.uuid())
    }

    const pendingByKey = new Map<string, number>()
    for (const node of spec.nodes) pendingByKey.set(node.node_key, 0)
    for (const edge of spec.edges) {
      pendingByKey.set(edge.child, (pendingByKey.get(edge.child) ?? 0) + 1)
    }

    const totalNodes = spec.nodes.length
    let readyNodes = 0
    for (const count of pendingByKey.values()) {
      if (count === 0) readyNodes++
    }

    // ----- 3. INSERT orchestration_dags ---------------------------------
    const dagId = this.uuid()
    const { error: dagErr } = await this.supabase.from('orchestration_dags').insert({
      id: dagId,
      org_id: input.orgId,
      agent_id: input.agentId,
      source: input.source,
      template_id: input.templateId ?? null,
      root_event_id: input.rootEventId ?? null,
      root_event_type: input.rootEventType ?? null,
      status: 'pending',
      graph_version: 1,
      total_nodes: totalNodes,
      completed_nodes: 0,
      failed_nodes: 0,
      ready_nodes: readyNodes,
    })
    if (dagErr) {
      throw new Error(`[dag-planner] dag insert failed: ${dagErr.message}`)
    }

    // ----- 4. Bulk INSERT orchestration_dag_nodes -----------------------
    const nodeRows = spec.nodes.map((node) => ({
      id: nodeIdsByKey.get(node.node_key)!,
      dag_id: dagId,
      node_key: node.node_key,
      node_type: node.node_type as DagNodeType,
      step_type: node.step_type ?? null,
      runtime_target: node.runtime_target ?? null,
      route_class: node.route_class ?? null,
      payload: node.payload ?? null,
      confidence_floor: node.confidence_floor ?? null,
      pending_parent_count: pendingByKey.get(node.node_key) ?? 0,
      status: 'pending',
    }))
    const { error: nodeErr } = await this.supabase
      .from('orchestration_dag_nodes')
      .insert(nodeRows)
    if (nodeErr) {
      // Best-effort rollback — dag row exists but nodes/edges don't.
      await this.supabase.from('orchestration_dags').delete().eq('id', dagId)
      throw new Error(`[dag-planner] nodes insert failed: ${nodeErr.message}`)
    }

    // ----- 5. Bulk INSERT orchestration_dag_edges -----------------------
    if (spec.edges.length > 0) {
      const edgeRows = spec.edges.map((edge) => ({
        dag_id: dagId,
        parent_node_id: nodeIdsByKey.get(edge.parent)!,
        child_node_id: nodeIdsByKey.get(edge.child)!,
        edge_kind: edge.edge_kind ?? 'data',
      }))
      const { error: edgeErr } = await this.supabase
        .from('orchestration_dag_edges')
        .insert(edgeRows)
      if (edgeErr) {
        await this.supabase.from('orchestration_dags').delete().eq('id', dagId)
        throw new Error(`[dag-planner] edges insert failed: ${edgeErr.message}`)
      }
    }

    // ----- 6. Collect root node IDs for caller --------------------------
    const rootNodeIds: string[] = []
    for (const node of spec.nodes) {
      if ((pendingByKey.get(node.node_key) ?? 0) === 0) {
        rootNodeIds.push(nodeIdsByKey.get(node.node_key)!)
      }
    }

    return { dagId, nodeIdsByKey, rootNodeIds, totalNodes, readyNodes }
  }
}
