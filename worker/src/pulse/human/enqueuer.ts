/**
 * HumanTaskEnqueuer — Phase 1 of Pulse + Nerve Human + PM Integration.
 *
 * Creates a Pulse-standalone human work item (tickets, approvals, reviews)
 * that is NOT tied to a DAG node. Agents or worker code call this to
 * assign work to a human; the item shows up in the Mission Control
 * Work queue where the human claims and resolves it.
 *
 * Symmetry: the Nerve DAG human-task branch lives in
 * `pulse/dag/human-task-dispatch.ts`. This module is its standalone
 * counterpart — same table (`human_work_items`), different `kind`.
 *
 * Why worker-side: worker code can't import from `src/`, and this path
 * is called from agent runtime tools (Phase 6 `create_work_item`) and
 * potentially from cron/SLA nudges. The centralized DB helpers in
 * `src/lib/db/human-work-items.ts` are the source of truth for the
 * Next.js app; this file mirrors their shape for the worker.
 *
 * Feature flag: `FEATURE_HUMAN_WORK_ITEMS` gates whether the enqueuer
 * actually writes to the table. When off, the function returns null
 * without inserting — safe to call unconditionally from tool surfaces.
 *
 * See: docs/plans/2026-04-08-pulse-nerve-human-pm-integration.md §Phase 1
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../../config.js'

export type HumanWorkItemPriority = 'critical' | 'high' | 'normal' | 'low'

export interface EnqueueHumanWorkItemInput {
  orgId: string
  pulseJobRunId: string
  title: string
  description?: string | null
  priority?: HumanWorkItemPriority
  labels?: string[]
  assigneeUserId?: string | null
  assigneeRole?: string | null
  agentId?: string | null
  dueAt?: string | null
  slaSeconds?: number | null
  createdBy?: string | null
}

export interface EnqueuedHumanWorkItem {
  id: string
  orgId: string
  status: string
  priority: HumanWorkItemPriority
}

/**
 * Create a `human_work_items` row with `kind='pulse_standalone'` and
 * append a `created` event to the activity feed.
 *
 * Returns:
 *   - `null` if the feature flag is off or the insert fails (caller
 *     should treat as a soft failure — the originating action still
 *     succeeds, the human assignment is just missed).
 *   - The inserted row id + minimal metadata on success.
 *
 * Idempotency: relies on `pulse_job_run_id` uniqueness at the caller
 * level. If two callers pass the same `pulseJobRunId`, the unique
 * index on `(pulse_job_run_id) WHERE kind='pulse_standalone'` from the
 * Phase 0 migration turns the second insert into a 23505 which we
 * swallow and treat as "already enqueued".
 */
export async function enqueueHumanWorkItem(
  supabase: SupabaseClient,
  config: Pick<Config, 'FEATURE_HUMAN_WORK_ITEMS'>,
  input: EnqueueHumanWorkItemInput,
): Promise<EnqueuedHumanWorkItem | null> {
  if (!config.FEATURE_HUMAN_WORK_ITEMS) return null

  const title = input.title.trim().slice(0, 500)
  if (!title) return null

  // Derive due_at from sla_seconds if only SLA was provided.
  let dueAt = input.dueAt ?? null
  if (!dueAt && input.slaSeconds && input.slaSeconds > 0) {
    dueAt = new Date(Date.now() + input.slaSeconds * 1000).toISOString()
  }

  const priority: HumanWorkItemPriority = input.priority ?? 'normal'

  const { data, error } = await supabase
    .from('human_work_items')
    .insert({
      org_id: input.orgId,
      kind: 'pulse_standalone',
      pulse_job_run_id: input.pulseJobRunId,
      agent_id: input.agentId ?? null,
      title,
      description: input.description ?? null,
      priority,
      labels: input.labels ?? [],
      assignee_user_id: input.assigneeUserId ?? null,
      assignee_role: input.assigneeRole ?? null,
      status: 'open',
      due_at: dueAt,
      sla_seconds: input.slaSeconds ?? null,
      created_by: input.createdBy ?? null,
    })
    .select('id, org_id, status, priority')
    .single()

  if (error) {
    if (error.code === '23505') {
      // Duplicate pulse_job_run_id — treat as already enqueued. Look
      // it up so the caller still has the id.
      const { data: existing } = await supabase
        .from('human_work_items')
        .select('id, org_id, status, priority')
        .eq('pulse_job_run_id', input.pulseJobRunId)
        .eq('kind', 'pulse_standalone')
        .maybeSingle()
      if (!existing) return null
      return {
        id: existing.id as string,
        orgId: existing.org_id as string,
        status: existing.status as string,
        priority: existing.priority as HumanWorkItemPriority,
      }
    }
    console.error(
      `[human-task-enqueuer] Failed to insert work item (org=${input.orgId} run=${input.pulseJobRunId}):`,
      error.message,
    )
    return null
  }

  if (!data) return null

  // Append `created` event. Best-effort: a feed-write failure must not
  // block the caller — the work item exists and the human can still
  // resolve it.
  try {
    await supabase.from('human_work_item_events').insert({
      work_item_id: data.id,
      org_id: input.orgId,
      actor_kind: input.agentId ? 'agent' : 'system',
      actor_agent_id: input.agentId ?? null,
      actor_user_id: input.createdBy ?? null,
      event_type: 'created',
      payload: {
        pulse_job_run_id: input.pulseJobRunId,
        priority,
        assignee_user_id: input.assigneeUserId ?? null,
        assignee_role: input.assigneeRole ?? null,
      },
    })
  } catch (err) {
    console.warn(
      `[human-task-enqueuer] Failed to write created event for work item ${data.id}:`,
      err instanceof Error ? err.message : err,
    )
  }

  return {
    id: data.id as string,
    orgId: data.org_id as string,
    status: data.status as string,
    priority: data.priority as HumanWorkItemPriority,
  }
}
