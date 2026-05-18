/**
 * Control-plane DAG Planner.
 *
 * Mirrors the worker DagPlanner enough for app/server flows that need to
 * instantiate a validated DagSpec directly into Nerve's existing tables.
 * This is not a second execution engine: it only writes DAG rows, nodes, and
 * edges, then callers use SchedulerBridge to promote roots.
 */

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DagNodeType, DagSource, DagSpec } from '@contracts/dag'
import { dagSpecSchema } from '@contracts/dag'
import { detectCycle } from './cycle-detector'

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

export class DagCycleError extends Error {
  constructor(public readonly cycleNodes: string[]) {
    super(`[dag-planner] cycle detected: ${cycleNodes.join(' -> ')}`)
    this.name = 'DagCycleError'
  }
}

export interface InstantiateDagInput {
  spec: DagSpec
  agentId: string
  orgId: string
  source: DagSource
  templateId?: string | null
  rootEventId?: string | null
  rootEventType?: 'inbound' | 'outbound' | 'scheduled' | 'webhook' | null
}

export interface InstantiateDagResult {
  dagId: string
  nodeIdsByKey: Map<string, string>
  rootNodeIds: string[]
  totalNodes: number
  readyNodes: number
}

type UuidFn = () => string
const defaultUuid: UuidFn = () => globalThis.crypto.randomUUID()

export class ControlPlaneDagPlanner {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly uuid: UuidFn = defaultUuid,
  ) {}

  async instantiate(input: InstantiateDagInput): Promise<InstantiateDagResult> {
    const spec = dagSpecSchema.parse(input.spec)

    if (spec.nodes.length > MAX_DAG_NODES) {
      throw new DagSizeError('nodes', spec.nodes.length, MAX_DAG_NODES)
    }
    if (spec.edges.length > MAX_DAG_EDGES) {
      throw new DagSizeError('edges', spec.edges.length, MAX_DAG_EDGES)
    }

    const cycle = detectCycle(
      [],
      spec.edges.map((edge) => ({ parent: edge.parent, child: edge.child })),
    )
    if (cycle.hasCycle) {
      throw new DagCycleError(cycle.cycleNodes ?? [])
    }

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

    const dagId = this.uuid()
    const { error: dagError } = await this.supabase.from('orchestration_dags').insert({
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
    if (dagError) {
      throw new Error(`[dag-planner] dag insert failed: ${dagError.message}`)
    }

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

    const { error: nodeError } = await this.supabase
      .from('orchestration_dag_nodes')
      .insert(nodeRows)
    if (nodeError) {
      await this.rollbackDag(dagId)
      throw new Error(`[dag-planner] nodes insert failed: ${nodeError.message}`)
    }

    if (spec.edges.length > 0) {
      const edgeRows = spec.edges.map((edge) => ({
        dag_id: dagId,
        parent_node_id: nodeIdsByKey.get(edge.parent)!,
        child_node_id: nodeIdsByKey.get(edge.child)!,
        edge_kind: edge.edge_kind ?? 'data',
      }))
      const { error: edgeError } = await this.supabase
        .from('orchestration_dag_edges')
        .insert(edgeRows)
      if (edgeError) {
        await this.rollbackDag(dagId)
        throw new Error(`[dag-planner] edges insert failed: ${edgeError.message}`)
      }
    }

    const rootNodeIds = spec.nodes
      .filter((node) => (pendingByKey.get(node.node_key) ?? 0) === 0)
      .map((node) => nodeIdsByKey.get(node.node_key)!)

    return { dagId, nodeIdsByKey, rootNodeIds, totalNodes, readyNodes }
  }

  private async rollbackDag(dagId: string): Promise<void> {
    try {
      await this.supabase.from('orchestration_dags').delete().eq('id', dagId)
    } catch {
      // Best-effort rollback. FK cascade handles partial node/edge rows.
    }
  }
}
