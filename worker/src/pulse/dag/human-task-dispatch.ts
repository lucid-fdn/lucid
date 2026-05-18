/**
 * Human Task Dispatch — Phase 2 of Pulse + Nerve Human + PM Integration.
 *
 * When the IncrementalScheduler promotes a `human_task` DAG node, instead
 * of materializing a Pulse step (DagStepCreator) it inserts a row into
 * `human_work_items` with `kind='nerve_node'`. The node is marked complete
 * via `dag_complete_node` when a human (or external PM webhook) resolves
 * the work item — at which point the rest of the DAG walks forward
 * through the existing CTE-driven readiness model.
 *
 * Why this lives in worker/src/pulse/dag/ and not in a separate package:
 *   - The scheduler is the only caller; coupling stays explicit
 *   - It re-uses the supabase client + DAG header that the scheduler
 *     already loaded — no second round-trip to read the DAG row
 *   - It's the symmetric counterpart to DagStepCreator (Pulse step branch)
 *
 * See: docs/plans/2026-04-08-pulse-nerve-human-pm-integration.md §Phase 2
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DagNodeType } from './types.js'

/**
 * Subset of the DAG header fields the dispatcher needs. Mirrors
 * `IncrementalScheduler.DagHeader` so we don't have to export that
 * private interface.
 */
export interface HumanTaskDagHeader {
  id: string
  org_id: string
  agent_id: string
}

/**
 * Subset of the promoted node fields the dispatcher needs. The
 * scheduler's `PromotedNode` is private; this is the slice we read.
 *
 * `payload` is the JSONB column from `orchestration_dag_nodes`. The
 * planner stores the agent's authored payload here at template
 * instantiation; for human_task nodes the payload carries the human
 * presentation fields (title, description, assignee, priority, due_at).
 */
export interface HumanTaskPromotedNode {
  id: string
  node_key: string
  node_type: DagNodeType
  payload?: unknown
}

/**
 * Shape the planner / template author writes into a human_task node's
 * payload. All fields except `title` are optional — the dispatcher
 * derives sane fallbacks from `node_key` so a minimal template ("just
 * pause here for a human") still works.
 */
interface HumanTaskPayload {
  title?: string
  description?: string
  priority?: 'critical' | 'high' | 'normal' | 'low'
  labels?: string[]
  assignee_user_id?: string
  assignee_role?: string
  due_at?: string
  sla_seconds?: number
  /**
   * When truthy, the work item should be mirrored to an external PM tool.
   * `true` = use org's primary provider. Object = explicit provider config.
   */
  external_mirror?: boolean | Record<string, unknown>
}

/**
 * Result of dispatching a human task node. The caller uses `needsPmSync`
 * to decide whether to enqueue an outbound PM sync job.
 */
export interface HumanTaskDispatchResult {
  workItemId: string
  needsPmSync: boolean
}

const PRIORITY_VALUES = ['critical', 'high', 'normal', 'low'] as const

function parsePayload(raw: unknown, nodeKey: string): HumanTaskPayload {
  if (!raw || typeof raw !== 'object') return {}
  const obj = raw as Record<string, unknown>

  const out: HumanTaskPayload = {}
  if (typeof obj.title === 'string' && obj.title.trim().length > 0) {
    out.title = obj.title.trim().slice(0, 500)
  }
  if (typeof obj.description === 'string') out.description = obj.description.slice(0, 10_000)
  if (
    typeof obj.priority === 'string' &&
    (PRIORITY_VALUES as readonly string[]).includes(obj.priority)
  ) {
    out.priority = obj.priority as HumanTaskPayload['priority']
  }
  if (Array.isArray(obj.labels)) {
    out.labels = obj.labels
      .filter((x): x is string => typeof x === 'string')
      .slice(0, 50)
  }
  if (typeof obj.assignee_user_id === 'string') out.assignee_user_id = obj.assignee_user_id
  if (typeof obj.assignee_role === 'string') out.assignee_role = obj.assignee_role
  if (typeof obj.due_at === 'string') {
    const parsed = new Date(obj.due_at)
    if (!isNaN(parsed.getTime())) out.due_at = parsed.toISOString()
  }
  if (typeof obj.sla_seconds === 'number' && Number.isFinite(obj.sla_seconds)) {
    out.sla_seconds = Math.max(0, Math.floor(obj.sla_seconds))
  }
  if (obj.external_mirror === true) {
    out.external_mirror = true
  } else if (obj.external_mirror && typeof obj.external_mirror === 'object') {
    out.external_mirror = obj.external_mirror as Record<string, unknown>
  }

  // Title fallback: humans deserve a readable label even on a bare node.
  if (!out.title) out.title = `Human task: ${nodeKey}`
  return out
}

/**
 * Create a `human_work_items` row for a freshly-promoted human_task DAG
 * node and append a `created` event to the activity feed. Returns the
 * inserted work item id (or `null` on insert failure — the scheduler
 * should leave the node in `ready` state so the next pass can retry).
 *
 * Idempotency: the migration unique-indexes (dag_id, dag_node_id) WHERE
 * kind='nerve_node' so a double-fire (e.g., scheduler retry) cannot
 * create duplicate work items. The dispatcher swallows unique-violation
 * errors and treats them as "already dispatched, no-op success".
 */
export async function dispatchHumanTaskNode(
  supabase: SupabaseClient,
  dag: HumanTaskDagHeader,
  node: HumanTaskPromotedNode,
): Promise<HumanTaskDispatchResult | null> {
  const payload = parsePayload(node.payload, node.node_key)

  // Compute due_at from sla_seconds if not explicitly set.
  let dueAt = payload.due_at ?? null
  if (!dueAt && payload.sla_seconds && payload.sla_seconds > 0) {
    dueAt = new Date(Date.now() + payload.sla_seconds * 1000).toISOString()
  }

  // Normalize external_mirror: `true` becomes `{ primary: true }` (use org's
  // primary PM provider); objects pass through as-is; falsy stays null.
  const externalMirror = payload.external_mirror
    ? typeof payload.external_mirror === 'object'
      ? payload.external_mirror
      : { primary: true }
    : null

  const { data, error } = await supabase
    .from('human_work_items')
    .insert({
      org_id: dag.org_id,
      kind: 'nerve_node',
      dag_id: dag.id,
      dag_node_id: node.id,
      agent_id: dag.agent_id,
      title: payload.title!,
      description: payload.description ?? null,
      priority: payload.priority ?? 'normal',
      labels: payload.labels ?? [],
      assignee_user_id: payload.assignee_user_id ?? null,
      assignee_role: payload.assignee_role ?? null,
      status: 'open',
      due_at: dueAt,
      sla_seconds: payload.sla_seconds ?? null,
      external_mirror: externalMirror,
    })
    .select('id')
    .single()

  if (error) {
    // Idempotency: if the row already exists (double-fire), look it up
    // and treat as success. Anything else is a real failure.
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('human_work_items')
        .select('id, external_mirror')
        .eq('dag_id', dag.id)
        .eq('dag_node_id', node.id)
        .maybeSingle()
      if (!existing?.id) return null
      return {
        workItemId: existing.id as string,
        needsPmSync: existing.external_mirror != null,
      }
    }
    console.error(
      `[human-task-dispatch] Failed to insert work item for dag=${dag.id} node=${node.id}:`,
      error.message,
    )
    return null
  }

  const workItemId = data?.id as string | undefined
  if (!workItemId) return null
  const needsPmSync = externalMirror != null

  // Append the activity-feed `created` event. Best-effort: a feed
  // failure should NOT block the work item — the row exists, the human
  // can still resolve it; we just lose the audit entry.
  try {
    await supabase.from('human_work_item_events').insert({
      work_item_id: workItemId,
      org_id: dag.org_id,
      actor_kind: 'agent',
      actor_agent_id: dag.agent_id,
      event_type: 'created',
      payload: {
        dag_id: dag.id,
        dag_node_id: node.id,
        node_key: node.node_key,
      },
    })
  } catch (err) {
    console.warn(
      `[human-task-dispatch] Failed to write created event for work item ${workItemId}:`,
      err instanceof Error ? err.message : err,
    )
  }

  return { workItemId, needsPmSync }
}
