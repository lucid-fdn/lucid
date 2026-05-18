/**
 * DagReplay — control-plane mirror of `worker/src/pulse/dag/replay.ts`.
 *
 * Used by the operator replay API (`POST /api/dags/[id]/replay`) to fork
 * an existing DAG at a chosen node without round-tripping through the
 * worker. Behavioral parity with the worker is required — see the worker
 * copy for the algorithm contract and invariants.
 *
 * See: `worker/src/pulse/dag/replay.ts` (source of truth for algorithm)
 *      `docs/superpowers/plans/2026-04-06-nerve-dag-planner-plan.md` Task 70
 */

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  DagMutationType,
  DagNodeStatus,
  DagSpecEdge,
  DagSpecNode,
} from '@contracts/dag'
import type { DagMutator } from './mutator'

/**
 * Diff shape stored in `orchestration_dag_mutations.payload`.
 *
 * Mirrors `worker/src/pulse/dag/types.ts` (`MutationDiff` + helpers). The
 * mutator RPC writes the rows it INSERTed via
 * `jsonb_build_object('added_nodes', p_new_nodes, 'added_edges', p_new_edges)`,
 * so the JSON keys are flat and each element carries the full DB row shape —
 * including the minted `id` UUID and stringified `confidence_floor`.
 */
interface StoredMutationNode {
  id: string
  node_key: string
  node_type: string
  step_type: string | null
  runtime_target: string | null
  route_class: string | null
  payload: unknown
  /** Stored as a numeric string by the RPC ("" when unset). */
  confidence_floor: string | null
}

interface StoredMutationEdge {
  parent_node_id: string
  child_node_id: string
  edge_kind: string | null
}

interface MutationDiff {
  added_nodes?: StoredMutationNode[]
  added_edges?: StoredMutationEdge[]
  removed_node_ids?: string[]
  removed_edge_ids?: string[]
  changed?: Record<string, unknown>
}

// ─── Stored mutation → spec adapters (mirror of worker replay.ts) ─────────────

function storedNodeToSpec(row: StoredMutationNode): DagSpecNode {
  const stepType = row.step_type && row.step_type.length > 0 ? row.step_type : undefined
  const runtimeTarget =
    row.runtime_target && row.runtime_target.length > 0 ? row.runtime_target : undefined
  const routeClass = row.route_class && row.route_class.length > 0 ? row.route_class : undefined
  let confidenceFloor: number | undefined
  if (row.confidence_floor != null && row.confidence_floor !== '') {
    const parsed = Number(row.confidence_floor)
    if (Number.isFinite(parsed)) confidenceFloor = parsed
  }
  return {
    node_key: row.node_key,
    node_type: row.node_type as DagSpecNode['node_type'],
    ...(stepType ? { step_type: stepType as DagSpecNode['step_type'] } : {}),
    ...(runtimeTarget ? { runtime_target: runtimeTarget } : {}),
    ...(routeClass ? { route_class: routeClass as DagSpecNode['route_class'] } : {}),
    payload: row.payload,
    ...(confidenceFloor !== undefined ? { confidence_floor: confidenceFloor } : {}),
  }
}

function resolveEdgeEndpoint(
  oldUuid: string,
  inMutationOldToKey: Map<string, string>,
  cloneIdToKey: Map<string, string>,
  oldToNew: Map<string, string>,
): string {
  const inMutationKey = inMutationOldToKey.get(oldUuid)
  if (inMutationKey) return inMutationKey
  const newUuid = oldToNew.get(oldUuid)
  if (newUuid) {
    const cloneKey = cloneIdToKey.get(newUuid)
    if (cloneKey) return cloneKey
  }
  return oldUuid
}

// ─── Errors ────────────────────────────────────────────────────────────────────

export class DagReplayError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DagReplayError'
  }
}

export class DagReplayNotFoundError extends DagReplayError {
  constructor(public readonly dagId: string) {
    super(`[dag-replay] dag ${dagId} not found`)
    this.name = 'DagReplayNotFoundError'
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface DagReplayForkInput {
  originalDagId: string
  fromNodeId: string
  operatorId?: string
}

export interface DagReplayForkResult {
  newDagId: string
  totalNodes: number
  completedNodes: number
  pendingNodes: number
  readyNodes: number
  replayedMutations: number
  nodeIdMap: Map<string, string>
}

type UuidFn = () => string
const defaultUuid: UuidFn = () => globalThis.crypto.randomUUID()

export interface DagReplayOptions {
  uuid?: UuidFn
}

// ─── Row shapes ────────────────────────────────────────────────────────────────

interface OriginalDagRow {
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
}

interface OriginalNodeRow {
  id: string
  node_key: string
  node_type: string
  step_type: string | null
  runtime_target: string | null
  route_class: string | null
  payload: unknown
  confidence_floor: number | null
  status: DagNodeStatus
  step_id: string | null
}

interface OriginalEdgeRow {
  parent_node_id: string
  child_node_id: string
  edge_kind: string
}

interface OriginalMutationRow {
  id: string
  mutation_type: DagMutationType
  source: 'agent' | 'operator' | 'system'
  source_run_id: string | null
  target_node_id: string | null
  applied_graph_version: number
  payload: MutationDiff | null
}

export class DagReplay {
  private readonly uuid: UuidFn

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly dagMutator: DagMutator | null = null,
    opts: DagReplayOptions = {},
  ) {
    this.uuid = opts.uuid ?? defaultUuid
  }

  async fork(input: DagReplayForkInput): Promise<DagReplayForkResult> {
    const original = await this.loadOriginalDag(input.originalDagId)
    const nodes = await this.loadOriginalNodes(input.originalDagId)
    const edges = await this.loadOriginalEdges(input.originalDagId)

    const fromNode = nodes.find((n) => n.id === input.fromNodeId)
    if (!fromNode) {
      throw new DagReplayError(
        `fork point ${input.fromNodeId} is not a node of dag ${input.originalDagId}`,
      )
    }

    // Reverse BFS for strict ancestor set
    const parentsOf = new Map<string, string[]>()
    for (const e of edges) {
      const arr = parentsOf.get(e.child_node_id) ?? []
      arr.push(e.parent_node_id)
      parentsOf.set(e.child_node_id, arr)
    }
    const ancestors = new Set<string>()
    const queue: string[] = [...(parentsOf.get(input.fromNodeId) ?? [])]
    while (queue.length > 0) {
      const next = queue.shift()!
      if (ancestors.has(next)) continue
      ancestors.add(next)
      for (const p of parentsOf.get(next) ?? []) queue.push(p)
    }

    const newDagId = this.uuid()
    const oldToNew = new Map<string, string>()
    for (const n of nodes) oldToNew.set(n.id, this.uuid())

    const clonePendingCount = new Map<string, number>()
    for (const n of nodes) clonePendingCount.set(n.id, 0)
    for (const e of edges) {
      if (ancestors.has(e.child_node_id)) continue
      if (ancestors.has(e.parent_node_id)) continue
      clonePendingCount.set(
        e.child_node_id,
        (clonePendingCount.get(e.child_node_id) ?? 0) + 1,
      )
    }

    const totalNodes = nodes.length
    const completedNodes = ancestors.size
    const pendingNodes = totalNodes - completedNodes
    let readyNodes = 0
    for (const n of nodes) {
      if (ancestors.has(n.id)) continue
      if ((clonePendingCount.get(n.id) ?? 0) === 0) readyNodes++
    }

    const { error: insertDagErr } = await this.supabase.from('orchestration_dags').insert({
      id: newDagId,
      org_id: original.org_id,
      agent_id: original.agent_id,
      source: original.source,
      root_event_id: original.root_event_id,
      root_event_type: original.root_event_type,
      status: 'pending',
      graph_version: 1,
      total_nodes: totalNodes,
      completed_nodes: completedNodes,
      failed_nodes: 0,
      ready_nodes: readyNodes,
      budget_max_tokens: original.budget_max_tokens,
      budget_max_usd: original.budget_max_usd,
      budget_max_wall_seconds: original.budget_max_wall_seconds,
      budget_max_tool_calls: original.budget_max_tool_calls,
      replay_of_dag_id: input.originalDagId,
      replay_from_node_id: input.fromNodeId,
    })
    if (insertDagErr) {
      throw new DagReplayError(`insert dag failed: ${insertDagErr.message}`)
    }

    const nodeRows = nodes.map((n) => {
      const isAncestor = ancestors.has(n.id)
      return {
        id: oldToNew.get(n.id)!,
        dag_id: newDagId,
        node_key: n.node_key,
        node_type: n.node_type,
        step_type: n.step_type,
        runtime_target: n.runtime_target,
        route_class: n.route_class,
        payload: n.payload,
        confidence_floor: n.confidence_floor,
        pending_parent_count: isAncestor ? 0 : (clonePendingCount.get(n.id) ?? 0),
        status: (isAncestor ? 'completed' : 'pending') satisfies DagNodeStatus,
        step_id: isAncestor ? n.step_id : null,
      }
    })
    const { error: cloneNodesErr } = await this.supabase
      .from('orchestration_dag_nodes')
      .insert(nodeRows)
    if (cloneNodesErr) {
      await this.rollbackDag(newDagId)
      throw new DagReplayError(`clone nodes failed: ${cloneNodesErr.message}`)
    }

    if (edges.length > 0) {
      const edgeRows = edges.map((e) => ({
        dag_id: newDagId,
        parent_node_id: oldToNew.get(e.parent_node_id)!,
        child_node_id: oldToNew.get(e.child_node_id)!,
        edge_kind: e.edge_kind,
      }))
      const { error: cloneEdgesErr } = await this.supabase
        .from('orchestration_dag_edges')
        .insert(edgeRows)
      if (cloneEdgesErr) {
        await this.rollbackDag(newDagId)
        throw new DagReplayError(`clone edges failed: ${cloneEdgesErr.message}`)
      }
    }

    // Build clone-side `newId → node_key` lookup once. Used by the edge
    // endpoint resolver to translate references to nodes that already exist
    // in the clone (from the original DAG or from a previously replayed
    // mutation in this same loop).
    const cloneIdToKey = new Map<string, string>()
    for (const n of nodes) cloneIdToKey.set(oldToNew.get(n.id)!, n.node_key)

    let replayedMutations = 0
    if (this.dagMutator) {
      const mutations = await this.loadOriginalMutations(input.originalDagId)
      let currentVersion = 1
      for (const m of mutations) {
        const addedNodes = m.payload?.added_nodes
        if (!addedNodes?.length) continue

        const inMutationOldToKey = new Map<string, string>()
        const specNodes: DagSpecNode[] = []
        for (const row of addedNodes) {
          inMutationOldToKey.set(row.id, row.node_key)
          specNodes.push(storedNodeToSpec(row))
        }

        const addedEdges: StoredMutationEdge[] = m.payload?.added_edges ?? []
        const specEdges: DagSpecEdge[] = addedEdges.map((edge) => ({
          parent: resolveEdgeEndpoint(
            edge.parent_node_id,
            inMutationOldToKey,
            cloneIdToKey,
            oldToNew,
          ),
          child: resolveEdgeEndpoint(
            edge.child_node_id,
            inMutationOldToKey,
            cloneIdToKey,
            oldToNew,
          ),
          ...(edge.edge_kind ? { edge_kind: edge.edge_kind as DagSpecEdge['edge_kind'] } : {}),
        }))

        try {
          const result = await this.dagMutator.apply({
            dagId: newDagId,
            expectedVersion: currentVersion,
            idempotencyKey: `replay:${newDagId}:${m.id}`,
            mutationType: m.mutation_type,
            source: 'system',
            sourceRunId: m.source_run_id,
            targetNodeId: m.target_node_id ? (oldToNew.get(m.target_node_id) ?? null) : null,
            additions: { nodes: specNodes, edges: specEdges },
            workerId: `replay:${input.operatorId ?? 'system'}`,
          })
          currentVersion = result.appliedGraphVersion
          for (const [key, newUuid] of result.nodeIdsByKey) {
            cloneIdToKey.set(newUuid, key)
            for (const [storedUuid, storedKey] of inMutationOldToKey) {
              if (storedKey === key) {
                oldToNew.set(storedUuid, newUuid)
                break
              }
            }
          }
          if (!result.idempotent) replayedMutations++
        } catch (err) {
          console.warn(
            `[dag-replay] skipped mutation ${m.id} on clone ${newDagId}: ${
              (err as Error).message
            }`,
          )
        }
      }
    }

    return {
      newDagId,
      totalNodes,
      completedNodes,
      pendingNodes,
      readyNodes,
      replayedMutations,
      nodeIdMap: oldToNew,
    }
  }

  private async loadOriginalDag(dagId: string): Promise<OriginalDagRow> {
    const { data, error } = await this.supabase
      .from('orchestration_dags')
      .select(
        'id, org_id, agent_id, source, root_event_id, root_event_type, budget_max_tokens, budget_max_usd, budget_max_wall_seconds, budget_max_tool_calls',
      )
      .eq('id', dagId)
      .maybeSingle()
    if (error) throw new DagReplayError(`load dag failed: ${error.message}`)
    if (!data) throw new DagReplayNotFoundError(dagId)
    return data as OriginalDagRow
  }

  private async loadOriginalNodes(dagId: string): Promise<OriginalNodeRow[]> {
    const { data, error } = await this.supabase
      .from('orchestration_dag_nodes')
      .select(
        'id, node_key, node_type, step_type, runtime_target, route_class, payload, confidence_floor, status, step_id',
      )
      .eq('dag_id', dagId)
    if (error) throw new DagReplayError(`load nodes failed: ${error.message}`)
    if (!data || data.length === 0) {
      throw new DagReplayError(`dag ${dagId} has no nodes`)
    }
    return data as OriginalNodeRow[]
  }

  private async loadOriginalEdges(dagId: string): Promise<OriginalEdgeRow[]> {
    const { data, error } = await this.supabase
      .from('orchestration_dag_edges')
      .select('parent_node_id, child_node_id, edge_kind')
      .eq('dag_id', dagId)
    if (error) throw new DagReplayError(`load edges failed: ${error.message}`)
    return (data ?? []) as OriginalEdgeRow[]
  }

  private async loadOriginalMutations(dagId: string): Promise<OriginalMutationRow[]> {
    const { data, error } = await this.supabase
      .from('orchestration_dag_mutations')
      .select(
        'id, mutation_type, source, source_run_id, target_node_id, applied_graph_version, payload',
      )
      .eq('dag_id', dagId)
      .order('applied_graph_version', { ascending: true })
    if (error) throw new DagReplayError(`load mutations failed: ${error.message}`)
    return (data ?? []) as OriginalMutationRow[]
  }

  private async rollbackDag(newDagId: string): Promise<void> {
    try {
      await this.supabase.from('orchestration_dags').delete().eq('id', newDagId)
    } catch {
      // ignore
    }
  }
}
