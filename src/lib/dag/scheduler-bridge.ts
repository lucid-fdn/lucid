/**
 * SchedulerBridge — control-plane mirror of worker `IncrementalScheduler`.
 *
 * Phase 4N-c, Task 50. Drives DAG promotion from control-plane endpoints
 * (step complete/fail/mutate) without round-tripping through the worker.
 *
 * Parity is REQUIRED with `worker/src/pulse/dag/scheduler.ts`. The RPCs
 * (`dag_complete_node`, `dag_cancel_subtree`, `dag_bump_completed`,
 * `dag_promote_added_subgraph`) are the authoritative state-machine —
 * this class is a thin wrapper that invokes them and re-uses
 * `insertOrchestrationStep` from `@contracts/dag-step` to materialize
 * newly ready leaves.
 *
 * The bridge implements the subset of methods called from REST and app-level
 * orchestration adapters:
 *   - `onDagCreated(dagId)`
 *   - `onNodeComplete(dagId, nodeId)`
 *   - `onNodeFail(dagId, nodeId, retryable, reason)`
 *   - `onMutation(dagId, addedNodeIds)` (for operator mutate route)
 */

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { insertOrchestrationStep } from '@contracts/dag-step'
import type { DagNodeType, DagStatus } from '@contracts/dag'

interface PromotedNode {
  id: string
  node_key: string
  node_type: DagNodeType
  step_type: string | null
  runtime_target: string | null
  route_class: string | null
  payload?: unknown
}

interface DagHeader {
  id: string
  org_id: string
  agent_id: string
  root_event_id: string | null
  status: DagStatus
  total_nodes: number
  completed_nodes: number
  failed_nodes: number
}

export class SchedulerBridge {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Flip a newly instantiated DAG to running, promote root nodes, and
   * materialize executable leaves as orchestration_steps rows.
   */
  async onDagCreated(dagId: string): Promise<void> {
    const dag = await this.loadDagHeader(dagId)
    if (!dag) throw new Error(`[scheduler-bridge] dag ${dagId} not found`)

    await this.supabase
      .from('orchestration_dags')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', dagId)

    const { data, error } = await this.supabase.rpc('dag_promote_roots', {
      p_dag_id: dagId,
    })
    if (error) {
      throw new Error(`[scheduler-bridge] dag_promote_roots failed: ${error.message}`)
    }

    await this.enqueuePromoted(dag, (data ?? []) as PromotedNode[])
  }

  /**
   * Stamp the node completed and (if the DAG is running) atomically
   * decrement every child's `pending_parent_count`, promoting any that
   * hit 0. Mirrors `IncrementalScheduler.onNodeComplete`.
   */
  async onNodeComplete(dagId: string, nodeId: string): Promise<void> {
    const dag = await this.loadDagHeader(dagId)
    if (!dag) return

    // Band 1: terminal — no-op.
    if (dag.status === 'completed' || dag.status === 'failed' || dag.status === 'cancelled') {
      return
    }

    // Bands 2 & 3: stamp the node completed exactly once. Duplicate
    // completions must not double-decrement child pending_parent_count.
    const { data: claimed, error: stampErr } = await this.supabase
      .from('orchestration_dag_nodes')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', nodeId)
      .eq('dag_id', dagId)
      .neq('status', 'completed')
      .select('id')
    if (stampErr) {
      throw new Error(`[scheduler-bridge] stamp complete failed: ${stampErr.message}`)
    }
    if (!claimed || claimed.length === 0) {
      return
    }

    const { data, error } = await this.supabase.rpc('dag_complete_node', {
      p_dag_id: dagId,
      p_node_id: nodeId,
    })
    if (error) {
      throw new Error(`[scheduler-bridge] dag_complete_node failed: ${error.message}`)
    }
    const promoted = (data ?? []) as PromotedNode[]

    // Band 2: paused/blocked/pending — keep counters truthful, but do not
    // enqueue newly ready children until resume.
    if (dag.status !== 'running') {
      await this.bumpCompletedCounter(dagId)
      return
    }

    await this.enqueuePromoted(dag, promoted)

    await this.bumpCompletedCounter(dagId)
  }

  /**
   * Mark the node failed and, when non-retryable, cancel the subtree.
   * Mirrors `IncrementalScheduler.onNodeFail`.
   */
  async onNodeFail(
    dagId: string,
    nodeId: string,
    retryable: boolean,
    _reason: string,
  ): Promise<void> {
    await this.supabase
      .from('orchestration_dag_nodes')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', nodeId)
      .eq('dag_id', dagId)

    if (retryable) return

    const { error } = await this.supabase.rpc('dag_cancel_subtree', {
      p_dag_id: dagId,
      p_root_node_id: nodeId,
    })
    if (error) {
      throw new Error(`[scheduler-bridge] dag_cancel_subtree failed: ${error.message}`)
    }

    await this.supabase
      .from('orchestration_dags')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        failed_nodes: 1,
      })
      .eq('id', dagId)
  }

  /**
   * Promote any newly added nodes whose parent count is now 0.
   * Mirrors `IncrementalScheduler.onMutation`.
   */
  async onMutation(dagId: string, addedNodeIds: string[]): Promise<void> {
    if (addedNodeIds.length === 0) return

    const dag = await this.loadDagHeader(dagId)
    if (!dag) return

    if (dag.status !== 'running' && dag.status !== 'pending') return

    const { data, error } = await this.supabase.rpc('dag_promote_added_subgraph', {
      p_dag_id: dagId,
      p_node_ids: addedNodeIds,
    })
    if (error) {
      throw new Error(
        `[scheduler-bridge] dag_promote_added_subgraph failed: ${error.message}`,
      )
    }

    const promoted = (data ?? []) as PromotedNode[]
    await this.enqueuePromoted(dag, promoted)
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  private async loadDagHeader(dagId: string): Promise<DagHeader | null> {
    const { data, error } = await this.supabase
      .from('orchestration_dags')
      .select(
        'id, org_id, agent_id, root_event_id, status, total_nodes, completed_nodes, failed_nodes',
      )
      .eq('id', dagId)
      .maybeSingle()
    if (error) {
      throw new Error(`[scheduler-bridge] loadDagHeader failed: ${error.message}`)
    }
    return (data as DagHeader | null) ?? null
  }

  private async enqueuePromoted(dag: DagHeader, promoted: PromotedNode[]): Promise<void> {
    for (const node of promoted) {
      if (node.node_type !== 'leaf' && node.node_type !== 'approval') continue
      if (!node.step_type) continue // non-executable (group/barrier) — skip

      await insertOrchestrationStep(this.supabase, {
        eventId: dag.root_event_id ?? dag.id,
        attempt: 0,
        stepType: node.step_type as
          | 'inbound'
          | 'outbound'
          | 'scheduled'
          | 'webhook'
          | 'approval',
        executorType: node.step_type,
        agentId: dag.agent_id,
        orgId: dag.org_id,
        runId: `dag:${dag.id}:${node.id}`,
        initialStatus: 'pending',
        dagId: dag.id,
        dagNodeId: node.id,
        runtimeTarget: (node.runtime_target as 'shared' | 'dedicated' | null) ?? null,
        routeClass: (node.route_class as 'fast' | 'strong' | 'external' | null) ?? null,
        input: node.payload && typeof node.payload === 'object'
          ? node.payload as Record<string, unknown>
          : undefined,
      })
    }
  }

  private async bumpCompletedCounter(dagId: string): Promise<void> {
    const { data, error } = await this.supabase.rpc('dag_bump_completed', {
      p_dag_id: dagId,
    })
    if (error) {
      throw new Error(`[scheduler-bridge] dag_bump_completed failed: ${error.message}`)
    }
    const row = normalizeRpcSingleRow<{ completed_nodes: number; total_nodes: number }>(data)
    if (row && row.completed_nodes >= row.total_nodes) {
      await this.supabase
        .from('orchestration_dags')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', dagId)
    }
  }
}

function normalizeRpcSingleRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null
  return (data as T | null) ?? null
}
