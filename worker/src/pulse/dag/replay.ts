/**
 * DagReplay — Phase 4N-d, Task 70 (Frontier replay).
 *
 * Forks an existing DAG at a chosen "fork point" node. The result is a
 * brand-new `orchestration_dags` row (with `replay_of_dag_id` +
 * `replay_from_node_id` stamped for provenance) whose structure mirrors
 * the original graph, but with every node upstream of the fork point
 * frozen as `completed` and the fork node + every descendant re-created
 * as `pending` so the normal scheduler promotes and re-executes them.
 *
 * The invariants this enforces:
 *
 *   1. **Strict ancestors freeze.** Nodes reachable from the fork node
 *      via reverse edges are cloned with `status='completed'` and their
 *      original `step_id` carried over (so downstream replay can trust
 *      the cached result without re-running the step).
 *
 *   2. **Fork node + descendants re-run.** Everything else — including
 *      the fork node itself, its descendants, and any parallel branches
 *      that aren't strict ancestors — clones with `status='pending'`
 *      and a recomputed `pending_parent_count` that only counts
 *      *pending* parents (ancestors contribute nothing because they're
 *      already `completed`).
 *
 *   3. **Edges remap to cloned UUIDs.** All edges are re-issued against
 *      the new node UUIDs — no edge in the clone references the
 *      original DAG.
 *
 *   4. **Mutations replay in order.** If a `DagMutator` is injected and
 *      the original DAG had expand mutations, they replay into the
 *      clone in `applied_graph_version` order. Each mutation gets a
 *      fresh `idempotency_key = replay:{newDagId}:{originalMutationId}`
 *      so a second fork of the same DAG produces a distinct stream.
 *      Edge endpoints inside mutation payloads are remapped through
 *      the old→new UUID table; unresolved references (mutations that
 *      reference nodes that no longer exist) cause the mutation to be
 *      skipped with a warning, not a hard failure.
 *
 *   5. **No ready_nodes inflation.** `completed_nodes` is pre-stamped
 *      to `ancestors.size`; `ready_nodes` reflects only the cloned
 *      downstream nodes with zero pending parents. The scheduler's
 *      normal readiness flow picks up from there.
 *
 * The new DAG starts in `status='pending'`. The caller is expected to
 * hand it to `scheduler.onDagCreated(newDagId)` to kick off execution.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DagMutator } from './mutator.js'
import type {
  DagMutationType,
  DagNodeStatus,
  DagSpecEdge,
  DagSpecNode,
  MutationDiff,
  StoredMutationEdge,
  StoredMutationNode,
} from './types.js'

// ─── Stored mutation → spec adapters ───────────────────────────────────────────
//
// The mutator RPC writes the rows it INSERTed (full DB shape) into the mutation
// payload. To replay them through `DagMutator.apply()` we need to convert each
// row back into the `DagSpec*` shape the mutator expects, and remap edge
// endpoints from the old DB UUIDs to the new clone's UUIDs.

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

/**
 * Resolve a stored edge endpoint (a UUID) into something `DagMutator` accepts.
 *
 * The mutator's `resolveEndpoint` contract is: a new-node `node_key` (resolved
 * via the mutation's own `nodeIdsByKey` map) OR an existing-node UUID (matched
 * against `UUID_REGEX`). It REJECTS existing-node `node_key` — so for refs
 * that point at nodes already present in the clone we MUST return the clone's
 * UUID, not its node_key.
 *
 * Resolution order:
 *   1. The endpoint refers to a node added by THIS mutation → return its
 *      `node_key` (mutator resolves it against its own newly-minted UUIDs).
 *   2. The endpoint refers to a node that already exists in the clone (either
 *      an original-DAG node or a prior replayed mutation's addition) → return
 *      the clone's UUID via `oldToNew`.
 *   3. Fall through — mutator will reject the raw UUID and the caller skips
 *      the mutation with a warning.
 *
 * Blocker #2 fix (Codex 2026-04-08 audit): the prior implementation returned
 * the clone's `node_key` in case (2), which the mutator interprets as a
 * new-node reference and rejects because no `additions.nodes` entry matches.
 * Every replayed mutation with an edge into an existing node was silently
 * skipped, breaking cross-subgraph edges in the fork.
 */
function resolveEdgeEndpoint(
  oldUuid: string,
  inMutationOldToKey: Map<string, string>,
  oldToNew: Map<string, string>,
): string {
  const inMutationKey = inMutationOldToKey.get(oldUuid)
  if (inMutationKey) return inMutationKey
  const newUuid = oldToNew.get(oldUuid)
  if (newUuid) return newUuid
  return oldUuid
}

// ─── Errors ────────────────────────────────────────────────────────────────────

export class DagReplayError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DagReplayError'
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface DagReplayForkInput {
  originalDagId: string
  fromNodeId: string
  /** Stamped into the replayed mutations' `applied_by_worker` audit field. */
  operatorId?: string
}

export interface DagReplayForkResult {
  newDagId: string
  totalNodes: number
  /** Ancestor count — cloned as 'completed'. */
  completedNodes: number
  /** Non-ancestor count — cloned as 'pending'. */
  pendingNodes: number
  /** Non-ancestor clones with `pending_parent_count=0` — the initial frontier. */
  readyNodes: number
  /** Number of mutations successfully replayed (0 if no mutator injected). */
  replayedMutations: number
  /** Old→new node UUID map (for tests + callers that need to resolve). */
  nodeIdMap: Map<string, string>
}

type UuidFn = () => string
const defaultUuid: UuidFn = () => globalThis.crypto.randomUUID()

export interface DagReplayOptions {
  uuid?: UuidFn
}

// ─── Row shapes we care about ──────────────────────────────────────────────────

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
  // Phase 5N replay determinism (Blocker #4 fix, Codex 2026-04-08 audit):
  // preserve the router version + audit notes on frozen ancestors so a
  // replayed run can compare against the original router output and tag
  // drift if ROUTER_VERSION has since moved on.
  confidence_router_version: string | null
  confidence_router_notes: unknown
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
    /** Optional — when provided, mutations are replayed into the clone. */
    private readonly dagMutator: DagMutator | null = null,
    opts: DagReplayOptions = {},
  ) {
    this.uuid = opts.uuid ?? defaultUuid
  }

  async fork(input: DagReplayForkInput): Promise<DagReplayForkResult> {
    // ─── 1. Load original DAG, nodes, edges ──────────────────────────────────
    const original = await this.loadOriginalDag(input.originalDagId)
    const nodes = await this.loadOriginalNodes(input.originalDagId)
    const edges = await this.loadOriginalEdges(input.originalDagId)

    const fromNode = nodes.find((n) => n.id === input.fromNodeId)
    if (!fromNode) {
      throw new DagReplayError(
        `fork point ${input.fromNodeId} is not a node of dag ${input.originalDagId}`,
      )
    }

    // ─── 2. Compute strict ancestor set via reverse BFS from fromNodeId ──────
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

    // ─── 3. Mint new UUIDs + recompute pending_parent_count ──────────────────
    const newDagId = this.uuid()
    const oldToNew = new Map<string, string>()
    for (const n of nodes) oldToNew.set(n.id, this.uuid())

    // For non-ancestor clones, only count parents that are ALSO non-ancestors
    // — ancestor parents are cloned as 'completed' and must not contribute
    // to the live pending counter.
    const clonePendingCount = new Map<string, number>()
    for (const n of nodes) clonePendingCount.set(n.id, 0)
    for (const e of edges) {
      if (ancestors.has(e.child_node_id)) continue // ancestor child = completed; counter=0
      if (ancestors.has(e.parent_node_id)) continue // ancestor parent = already done
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

    // ─── 4. INSERT new orchestration_dags row ────────────────────────────────
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

    // ─── 5. Clone nodes (ancestors=completed, rest=pending) ──────────────────
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
        // Ancestors carry the original step_id forward so downstream
        // replays can read the cached result without re-executing.
        status: (isAncestor ? 'completed' : 'pending') satisfies DagNodeStatus,
        step_id: isAncestor ? n.step_id : null,
        // Phase 5N (Blocker #4): preserve router determinism metadata on
        // frozen ancestors. The downstream (pending) frontier clears both
        // columns so the scheduler rescores them fresh with the current
        // ROUTER_VERSION and the router can tag version drift if the
        // router has moved forward since the original run.
        confidence_router_version: isAncestor ? n.confidence_router_version : null,
        confidence_router_notes: isAncestor ? n.confidence_router_notes : null,
      }
    })
    const { error: cloneNodesErr } = await this.supabase
      .from('orchestration_dag_nodes')
      .insert(nodeRows)
    if (cloneNodesErr) {
      await this.rollbackDag(newDagId)
      throw new DagReplayError(`clone nodes failed: ${cloneNodesErr.message}`)
    }

    // ─── 6. Clone edges (endpoints remapped to new UUIDs) ────────────────────
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

    // ─── 7. Replay mutations in order (optional, best-effort) ────────────────
    //
    // Stored mutation payloads use the flat keys the mutator RPC writes:
    // `added_nodes` / `added_edges`. Each row carries the full DB shape
    // (including the minted `id`). We convert each row back into a `DagSpec*`
    // and remap edge endpoints from old DB UUIDs to the equivalent endpoints
    // in the clone (using node_key references the mutator can resolve).
    //
    // `oldToNew` is the single source of truth for the resolver: it maps
    // every stored UUID (original DAG + any previously replayed mutation)
    // onto the clone's UUID, which the mutator accepts directly.
    let replayedMutations = 0
    if (this.dagMutator) {
      const mutations = await this.loadOriginalMutations(input.originalDagId)
      let currentVersion = 1
      for (const m of mutations) {
        const addedNodes = m.payload?.added_nodes
        if (!addedNodes?.length) continue // cancel/supersede/no-op — skip

        // Local map: stored node UUID → node_key, for in-mutation edge refs.
        const inMutationOldToKey = new Map<string, string>()
        const specNodes: DagSpecNode[] = []
        for (const row of addedNodes) {
          inMutationOldToKey.set(row.id, row.node_key)
          specNodes.push(storedNodeToSpec(row))
        }

        const addedEdges: StoredMutationEdge[] = m.payload?.added_edges ?? []
        const specEdges: DagSpecEdge[] = addedEdges.map((edge) => ({
          parent: resolveEdgeEndpoint(edge.parent_node_id, inMutationOldToKey, oldToNew),
          child: resolveEdgeEndpoint(edge.child_node_id, inMutationOldToKey, oldToNew),
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
          // Track newly-minted UUIDs in `oldToNew` so downstream mutations'
          // edge endpoints and `target_node_id` resolve against the clone.
          for (const [key, newUuid] of result.nodeIdsByKey) {
            // Find the stored UUID for this key (within this mutation) and
            // map it to the new clone UUID.
            for (const [storedUuid, storedKey] of inMutationOldToKey) {
              if (storedKey === key) {
                oldToNew.set(storedUuid, newUuid)
                break
              }
            }
          }
          if (!result.idempotent) replayedMutations++
        } catch (err) {
          // A mutation that can't replay cleanly is not fatal — we log
          // and continue so the operator gets the best-effort clone.
          // The scheduler will still re-execute the frontier; the
          // replay just won't include the mutation's additions.
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

  // ─── Internals ───────────────────────────────────────────────────────────────

  private async loadOriginalDag(dagId: string): Promise<OriginalDagRow> {
    const { data, error } = await this.supabase
      .from('orchestration_dags')
      .select(
        'id, org_id, agent_id, source, root_event_id, root_event_type, budget_max_tokens, budget_max_usd, budget_max_wall_seconds, budget_max_tool_calls',
      )
      .eq('id', dagId)
      .maybeSingle()
    if (error) throw new DagReplayError(`load dag failed: ${error.message}`)
    if (!data) throw new DagReplayError(`dag ${dagId} not found`)
    return data as OriginalDagRow
  }

  private async loadOriginalNodes(dagId: string): Promise<OriginalNodeRow[]> {
    const { data, error } = await this.supabase
      .from('orchestration_dag_nodes')
      .select(
        'id, node_key, node_type, step_type, runtime_target, route_class, payload, confidence_floor, status, step_id, confidence_router_version, confidence_router_notes',
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
    // Best-effort cleanup — FK CASCADE will take nodes/edges with it.
    try {
      await this.supabase.from('orchestration_dags').delete().eq('id', newDagId)
    } catch {
      // Swallow — the caller is already about to throw a descriptive error.
    }
  }
}
