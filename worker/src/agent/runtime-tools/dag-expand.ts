/**
 * expand_dag — Phase 4N-b, Task 41.
 *
 * Agent-facing runtime tool that expands an in-flight DAG with new
 * nodes/edges under a CAS + Redis advisory lock. Thin wrapper around
 * `DagMutator.apply()` followed by `scheduler.onMutation()`.
 *
 * Spec §4.3 11-step flow is owned by the mutator — this tool just:
 *   1. Normalizes and validates the agent's request
 *   2. Calls `dagMutator.apply(input)`
 *   3. On success, fires `scheduler.onMutation(dagId, addedNodeIds)` so
 *      the newly-inserted subgraph gets its pending_parent_count computed
 *      and any count=0 leaves are promoted.
 *
 * Returns a JSON envelope with `dag_id`, `applied_graph_version`,
 * `added_node_ids`, `node_ids_by_key`, and `idempotent`. Never throws —
 * the agent loop expects string results.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DagMutator,
  CasConflictError,
  CycleError,
  LockTimeoutError,
  IdempotencyReplayError,
  InvalidEdgeEndpointError,
} from '../../pulse/dag/mutator.js'
import type { IncrementalScheduler } from '../../pulse/dag/scheduler.js'
import type { IPulseRedisAdapter } from '../../pulse/adapters/types.js'
import type { DagSpecNode, DagSpecEdge } from '../../pulse/dag/types.js'

export interface ExpandDagParams {
  dag_id: string
  expected_version: number
  idempotency_key: string
  /** Audit-only — the mutator does not enforce containment, but the agent
   * should pass the node_id under which it's expanding so operators can
   * trace the expansion zone. */
  expansion_zone_node_id?: string
  additions: {
    nodes?: DagSpecNode[]
    edges?: DagSpecEdge[]
  }
}

export interface ExpandDagContext {
  supabase: SupabaseClient
  redis: IPulseRedisAdapter | null
  assistantId: string
  orgId: string
  runId?: string
  workerId?: string
  /** Scheduler is optional — when provided, `onMutation` fires after the
   * mutator commits. Runs OUTSIDE the advisory lock so a slow scheduler
   * cannot deadlock other concurrent mutators. */
  scheduler?: IncrementalScheduler
}

export async function toolExpandDag(
  params: ExpandDagParams,
  ctx: ExpandDagContext,
): Promise<string> {
  // ── Basic shape validation ───────────────────────────────────────────
  if (!params.dag_id || typeof params.dag_id !== 'string') {
    return JSON.stringify({ error: 'dag_id is required' })
  }
  if (typeof params.expected_version !== 'number' || params.expected_version < 1) {
    return JSON.stringify({ error: 'expected_version must be a positive integer' })
  }
  if (!params.idempotency_key || typeof params.idempotency_key !== 'string') {
    return JSON.stringify({ error: 'idempotency_key is required' })
  }
  if (!params.additions || typeof params.additions !== 'object') {
    return JSON.stringify({ error: 'additions is required' })
  }

  const nodes = params.additions.nodes ?? []
  const edges = params.additions.edges ?? []
  if (nodes.length === 0 && edges.length === 0) {
    return JSON.stringify({ error: 'additions must contain at least one node or edge' })
  }

  const specNodes: DagSpecNode[] = nodes
  const specEdges: DagSpecEdge[] = edges

  const mutator = new DagMutator(ctx.supabase, ctx.redis)

  try {
    const result = await mutator.apply({
      dagId: params.dag_id,
      expectedVersion: params.expected_version,
      idempotencyKey: params.idempotency_key,
      mutationType: 'expand',
      source: 'agent',
      sourceRunId: ctx.runId ?? null,
      targetNodeId: params.expansion_zone_node_id ?? null,
      additions: { nodes: specNodes, edges: specEdges },
      workerId: ctx.workerId,
    })

    // Fire scheduler.onMutation OUTSIDE the mutator's lock (the mutator
    // released it in its finally). A scheduler failure is non-fatal —
    // the mutation committed and the next scheduler pass will pick up
    // the unpromoted added subgraph.
    if (ctx.scheduler && !result.idempotent && result.addedNodeIds.length > 0) {
      try {
        await ctx.scheduler.onMutation(params.dag_id, result.addedNodeIds)
      } catch (schedErr) {
        return JSON.stringify({
          dag_id: params.dag_id,
          applied_graph_version: result.appliedGraphVersion,
          added_node_ids: result.addedNodeIds,
          node_ids_by_key: Object.fromEntries(result.nodeIdsByKey),
          idempotent: result.idempotent,
          warning: `scheduler onMutation failed: ${schedErr instanceof Error ? schedErr.message : String(schedErr)}`,
        })
      }
    }

    return JSON.stringify({
      dag_id: params.dag_id,
      applied_graph_version: result.appliedGraphVersion,
      added_node_ids: result.addedNodeIds,
      node_ids_by_key: Object.fromEntries(result.nodeIdsByKey),
      idempotent: result.idempotent,
    })
  } catch (err) {
    if (err instanceof CasConflictError) {
      return JSON.stringify({
        error: 'cas_conflict',
        message: `expected version ${err.expectedVersion} but current is ${err.actualVersion}. Re-fetch the dag and retry.`,
        expected_version: err.expectedVersion,
        actual_version: err.actualVersion,
      })
    }
    if (err instanceof CycleError) {
      return JSON.stringify({
        error: 'cycle',
        message: `proposed additions would create a cycle: ${err.cycleNodes.join(' -> ')}`,
        cycle_nodes: err.cycleNodes,
      })
    }
    if (err instanceof LockTimeoutError) {
      return JSON.stringify({
        error: 'lock_timeout',
        message: 'another mutator is currently holding the advisory lock. Retry shortly.',
      })
    }
    if (err instanceof InvalidEdgeEndpointError) {
      return JSON.stringify({
        error: 'invalid_edge_endpoint',
        message: `edge ${err.role} "${err.endpoint}" is neither a node_key from additions.nodes nor a valid UUID for an existing node`,
        role: err.role,
        endpoint: err.endpoint,
      })
    }
    if (err instanceof IdempotencyReplayError) {
      return JSON.stringify({
        error: 'idempotent_replay',
        message: `mutation ${err.idempotencyKey} was already applied at version ${err.priorAppliedVersion}`,
        prior_applied_version: err.priorAppliedVersion,
      })
    }
    return JSON.stringify({
      error: `expand_dag failed: ${err instanceof Error ? err.message : String(err)}`,
    })
  }
}
