/**
 * create_work_item — Agent runtime tool for standalone human task creation.
 *
 * Creates a `human_work_items` row with `kind='pulse_standalone'`. Optionally
 * sets `external_mirror` so the sweep safety net (reconcile cron) picks it up
 * and mirrors to an external PM tool.
 *
 * Phase 6: docs/plans/2026-04-08-pulse-nerve-human-pm-integration.md
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface CreateWorkItemParams {
  title: string
  description?: string
  assignee?: string // user_id or role name
  priority?: 'critical' | 'high' | 'normal' | 'low'
  external_mirror?: boolean // true = mirror to org's primary PM provider
  due_at?: string // ISO 8601
}

export interface CreateWorkItemContext {
  supabase: SupabaseClient
  assistantId: string
  orgId: string
  runId?: string
}

const PRIORITY_VALUES = ['critical', 'high', 'normal', 'low'] as const
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function toolCreateWorkItem(
  params: CreateWorkItemParams,
  ctx: CreateWorkItemContext,
): Promise<string> {
  // ── Validate ────────────────────────────────────────────────────────
  if (!params.title || typeof params.title !== 'string' || params.title.trim().length === 0) {
    return JSON.stringify({ ok: false, error: 'title is required' })
  }
  const title = params.title.trim().slice(0, 500)

  const priority =
    typeof params.priority === 'string' &&
    (PRIORITY_VALUES as readonly string[]).includes(params.priority)
      ? params.priority
      : 'normal'

  let normalizedDueAt: string | null = null
  if (params.due_at && typeof params.due_at === 'string') {
    const d = new Date(params.due_at)
    if (isNaN(d.getTime())) {
      return JSON.stringify({ ok: false, error: 'invalid due_at — must be ISO 8601' })
    }
    normalizedDueAt = d.toISOString()
  }

  // Cap description to prevent unbounded payloads.
  const description = typeof params.description === 'string'
    ? params.description.slice(0, 10_000)
    : null

  // Assignee: if it looks like a UUID, treat as user_id; otherwise role.
  let assigneeUserId: string | null = null
  let assigneeRole: string | null = null
  if (typeof params.assignee === 'string' && params.assignee.trim().length > 0) {
    const a = params.assignee.trim()
    if (UUID_RE.test(a)) {
      assigneeUserId = a
    } else {
      assigneeRole = a
    }
  }

  const externalMirror = params.external_mirror === true ? { primary: true } : null

  // ── Insert ──────────────────────────────────────────────────────────
  const { data, error } = await ctx.supabase
    .from('human_work_items')
    .insert({
      org_id: ctx.orgId,
      kind: 'pulse_standalone',
      agent_id: ctx.assistantId,
      title,
      description,
      priority,
      labels: [],
      assignee_user_id: assigneeUserId,
      assignee_role: assigneeRole,
      status: 'open',
      due_at: normalizedDueAt,
      external_mirror: externalMirror,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[create_work_item] insert error:', error.message)
    return JSON.stringify({ ok: false, error: 'Failed to create work item' })
  }

  const workItemId = data?.id as string | undefined
  if (!workItemId) {
    return JSON.stringify({ ok: false, error: 'no id returned' })
  }

  // ── Activity feed event (best-effort) ───────────────────────────────
  try {
    await ctx.supabase.from('human_work_item_events').insert({
      work_item_id: workItemId,
      org_id: ctx.orgId,
      actor_kind: 'agent',
      actor_agent_id: ctx.assistantId,
      event_type: 'created',
      payload: {
        source: 'create_work_item_tool',
        run_id: ctx.runId ?? null,
      },
    })
  } catch (err) {
    console.warn('[create_work_item] activity feed insert failed:', err instanceof Error ? err.message : err)
  }

  return JSON.stringify({
    ok: true,
    work_item_id: workItemId,
    title,
    status: 'open',
    priority,
    mirror_pending: externalMirror != null,
  })
}
