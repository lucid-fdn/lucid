/**
 * Human Work Items — Unified human work ledger.
 *
 * Backs two shapes:
 *   - Pulse-standalone jobs (kind='pulse_standalone'): tickets, approvals,
 *     support — not tied to a DAG.
 *   - Nerve DAG nodes (kind='nerve_node'): human_task nodes inside an
 *     agent plan. Completing one calls `dag_complete_node` so the rest
 *     of the DAG walks forward.
 *
 * See: docs/plans/2026-04-08-pulse-nerve-human-pm-integration.md
 * Migration: supabase/migrations/20260408200000_human_work_items.sql
 */

import 'server-only'
import { supabase, ErrorService } from './client'

export type WorkItemKind = 'pulse_standalone' | 'nerve_node'
export type WorkItemPriority = 'critical' | 'high' | 'normal' | 'low'
export type WorkItemStatus =
  | 'open'
  | 'in_progress'
  | 'waiting'
  | 'done'
  | 'cancelled'
  | 'rejected'
export type WorkItemResolution = 'approved' | 'rejected' | 'completed' | null

export interface HumanWorkItem {
  id: string
  org_id: string
  kind: WorkItemKind
  pulse_job_run_id: string | null
  dag_id: string | null
  dag_node_id: string | null
  agent_id: string | null
  title: string
  description: string | null
  priority: WorkItemPriority
  labels: string[]
  assignee_user_id: string | null
  assignee_role: string | null
  status: WorkItemStatus
  resolution: string | null
  resolution_notes: string | null
  due_at: string | null
  sla_seconds: number | null
  started_at: string | null
  completed_at: string | null
  external_mirror: Record<string, unknown> | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ListWorkItemsOptions {
  status?: WorkItemStatus | WorkItemStatus[]
  kind?: WorkItemKind
  assigneeUserId?: string
  assigneeRole?: string
  agentIds?: string[]
  limit?: number
  offset?: number
}

// ─── Read ───

const WORK_ITEM_COLUMNS =
  'id, org_id, kind, pulse_job_run_id, dag_id, dag_node_id, agent_id, title, description, priority, labels, assignee_user_id, assignee_role, status, resolution, resolution_notes, due_at, sla_seconds, started_at, completed_at, external_mirror, created_by, created_at, updated_at'

export async function listWorkItemsForOrg(
  orgId: string,
  opts: ListWorkItemsOptions = {},
): Promise<HumanWorkItem[]> {
  const limit = Math.min(opts.limit ?? 50, 200)
  const offset = Math.min(Math.max(opts.offset ?? 0, 0), 10_000)

  let query = supabase
    .from('human_work_items')
    .select(WORK_ITEM_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (opts.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status]
    query = query.in('status', statuses)
  }
  if (opts.kind) query = query.eq('kind', opts.kind)
  if (opts.assigneeUserId) query = query.eq('assignee_user_id', opts.assigneeUserId)
  if (opts.assigneeRole) query = query.eq('assignee_role', opts.assigneeRole)
  if (opts.agentIds && opts.agentIds.length > 0) query = query.in('agent_id', opts.agentIds)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(new Error(error.message), {
      severity: 'error',
      tags: { layer: 'db', table: 'human_work_items', op: 'list' },
    })
    return []
  }
  return (data ?? []) as HumanWorkItem[]
}

export async function getWorkItemById(id: string): Promise<HumanWorkItem | null> {
  const { data, error } = await supabase
    .from('human_work_items')
    .select(WORK_ITEM_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    ErrorService.captureException(new Error(error.message), {
      severity: 'error',
      tags: { layer: 'db', table: 'human_work_items', op: 'get' },
    })
    return null
  }
  return (data as HumanWorkItem) ?? null
}

// ─── Create (Pulse-standalone) ───

export interface CreatePulseStandaloneInput {
  org_id: string
  pulse_job_run_id: string
  agent_id?: string | null
  title: string
  description?: string | null
  priority?: WorkItemPriority
  labels?: string[]
  assignee_user_id?: string | null
  assignee_role?: string | null
  due_at?: string | null
  sla_seconds?: number | null
  created_by?: string | null
}

export async function createPulseStandaloneWorkItem(
  input: CreatePulseStandaloneInput,
): Promise<HumanWorkItem | null> {
  const { data, error } = await supabase
    .from('human_work_items')
    .insert({
      org_id: input.org_id,
      kind: 'pulse_standalone',
      pulse_job_run_id: input.pulse_job_run_id,
      agent_id: input.agent_id ?? null,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? 'normal',
      labels: input.labels ?? [],
      assignee_user_id: input.assignee_user_id ?? null,
      assignee_role: input.assignee_role ?? null,
      status: 'open',
      due_at: input.due_at ?? null,
      sla_seconds: input.sla_seconds ?? null,
      created_by: input.created_by ?? null,
    })
    .select(WORK_ITEM_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(new Error(error.message), {
      severity: 'error',
      tags: { layer: 'db', table: 'human_work_items', op: 'create_pulse_standalone' },
    })
    return null
  }
  return data as HumanWorkItem
}

// ─── Lifecycle ───

export async function claimWorkItem(
  id: string,
  userId: string,
): Promise<HumanWorkItem | null> {
  const { data, error } = await supabase
    .from('human_work_items')
    .update({
      assignee_user_id: userId,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    .eq('id', id)
    .in('status', ['open', 'in_progress'])
    .select(WORK_ITEM_COLUMNS)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(new Error(error.message), {
      severity: 'error',
      tags: { layer: 'db', table: 'human_work_items', op: 'claim' },
    })
    return null
  }
  if (!data) return null

  await appendWorkItemEvent({
    work_item_id: id,
    org_id: (data as HumanWorkItem).org_id,
    actor_kind: 'user',
    actor_user_id: userId,
    event_type: 'assigned',
    payload: { assignee_user_id: userId },
  })
  return data as HumanWorkItem
}

export interface CompleteWorkItemInput {
  id: string
  userId: string
  resolution: 'approved' | 'rejected' | 'completed'
  resolutionNotes?: string | null
}

/**
 * Complete a work item. For `nerve_node` kind, this ALSO calls
 * `dag_complete_node` so the rest of the DAG walks forward. The
 * CTE RPC is actor-agnostic — it decrements children regardless of
 * who resolved the node, so this works identically to agent-driven
 * completion.
 *
 * Returns the updated work item, the list of promoted child node
 * ids (empty unless nerve_node), and whether the DAG advanced.
 */
export async function completeWorkItem(
  input: CompleteWorkItemInput,
): Promise<{
  workItem: HumanWorkItem
  promotedNodeIds: string[]
} | null> {
  const existing = await getWorkItemById(input.id)
  if (!existing) return null
  if (existing.status === 'done' || existing.status === 'cancelled') {
    return { workItem: existing, promotedNodeIds: [] }
  }

  const nextStatus: WorkItemStatus = input.resolution === 'rejected' ? 'rejected' : 'done'
  const nowIso = new Date().toISOString()

  // For nerve_node, advance the DAG FIRST via the actor-agnostic CTE RPC.
  // If the RPC fails we bail out without touching the work item so retries
  // stay safe (no split-brain where the work item is closed but downstream
  // DAG siblings never promoted). Rejection stamps confidence=0, approval
  // stamps confidence=1.0 — the scheduler interprets these via the gate.
  let promotedNodeIds: string[] = []
  if (existing.kind === 'nerve_node' && existing.dag_id && existing.dag_node_id) {
    try {
      const observed = input.resolution === 'rejected' ? 0 : 1
      const { data: rpcData, error: rpcError } = await supabase.rpc('dag_complete_node', {
        p_dag_id: existing.dag_id,
        p_node_id: existing.dag_node_id,
        p_status: input.resolution === 'rejected' ? 'failed' : 'completed',
        p_confidence_observed: observed,
        p_confidence_source: 'human',
      })
      if (rpcError) {
        ErrorService.captureException(new Error(rpcError.message), {
          severity: 'error',
          tags: { layer: 'db', op: 'dag_complete_node', source: 'human_work_item' },
        })
        return null
      }
      if (Array.isArray(rpcData)) {
        promotedNodeIds = rpcData
          .map((row: { id?: string }) => row.id)
          .filter((id): id is string => typeof id === 'string')
      }
    } catch (err) {
      ErrorService.captureException(err as Error, {
        severity: 'error',
        tags: { layer: 'db', op: 'dag_complete_node', source: 'human_work_item' },
      })
      return null
    }
  }

  const { data, error } = await supabase
    .from('human_work_items')
    .update({
      status: nextStatus,
      resolution: input.resolution,
      resolution_notes: input.resolutionNotes ?? null,
      completed_at: nowIso,
    })
    .eq('id', input.id)
    .in('status', ['open', 'in_progress', 'waiting'])
    .select(WORK_ITEM_COLUMNS)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(new Error(error.message), {
      severity: 'error',
      tags: { layer: 'db', table: 'human_work_items', op: 'complete' },
    })
    return null
  }
  if (!data) {
    // 0 rows matched: item was already completed by a concurrent request.
    // Treat as idempotent success with the existing state.
    const existing2 = await getWorkItemById(input.id)
    if (existing2) return { workItem: existing2, promotedNodeIds: [] }
    return null
  }

  const workItem = data as HumanWorkItem

  await appendWorkItemEvent({
    work_item_id: workItem.id,
    org_id: workItem.org_id,
    actor_kind: 'user',
    actor_user_id: input.userId,
    event_type: 'resolved',
    payload: {
      resolution: input.resolution,
      resolution_notes: input.resolutionNotes ?? null,
    },
  })

  // Phase 6 — Bidirectional approval bridge: if this work item is linked
  // to an mc_pending_approvals row, resolve the approval so the agent's
  // waitForApproval() polling picks it up. Guard: only update 'pending'
  // rows to prevent infinite loops (second writer matches 0 rows).
  const approvalId =
    workItem.external_mirror &&
    typeof workItem.external_mirror === 'object' &&
    typeof (workItem.external_mirror as Record<string, unknown>).approval_id === 'string'
      ? ((workItem.external_mirror as Record<string, unknown>).approval_id as string)
      : null
  if (approvalId) {
    try {
      await supabase
        .from('mc_pending_approvals')
        .update({
          status: input.resolution === 'rejected' ? 'denied' : 'approved',
          resolved_by: input.userId,
          resolved_at: nowIso,
        })
        .eq('id', approvalId)
        .eq('status', 'pending')
    } catch {
      // best-effort — approval bridge failure doesn't block work item completion.
    }
  }

  return { workItem, promotedNodeIds }
}

// ─── Patch (external sync) ───

export interface PatchWorkItemInput {
  id: string
  patch: {
    title?: string
    description?: string | null
    priority?: WorkItemPriority
    labels?: string[]
    due_at?: string | null
  }
  actorProvider: string
}

/**
 * Apply a partial update from an external PM tool webhook (issue.updated).
 * Only non-undefined fields are written. Appends an `external_synced` event.
 */
export async function patchWorkItem(
  input: PatchWorkItemInput,
): Promise<HumanWorkItem | null> {
  const update: Record<string, unknown> = {}
  if (input.patch.title !== undefined) update.title = input.patch.title
  if (input.patch.description !== undefined) update.description = input.patch.description
  if (input.patch.priority !== undefined) update.priority = input.patch.priority
  if (input.patch.labels !== undefined) update.labels = input.patch.labels
  if (input.patch.due_at !== undefined) update.due_at = input.patch.due_at

  if (Object.keys(update).length === 0) return null

  // Only patch non-terminal items — external webhooks should not mutate
  // completed/cancelled/rejected work items.
  const { data, error } = await supabase
    .from('human_work_items')
    .update(update)
    .eq('id', input.id)
    .not('status', 'in', '("done","cancelled","rejected")')
    .select(WORK_ITEM_COLUMNS)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(new Error(error.message), {
      severity: 'error',
      tags: { layer: 'db', table: 'human_work_items', op: 'patch' },
    })
    return null
  }
  if (!data) return null

  const workItem = data as HumanWorkItem
  await appendWorkItemEvent({
    work_item_id: workItem.id,
    org_id: workItem.org_id,
    actor_kind: 'external_sync',
    actor_external_provider: input.actorProvider,
    event_type: 'external_synced',
    payload: { patch: input.patch },
  })

  return workItem
}

export async function transitionActiveWorkItemStatus(input: {
  id: string
  status: Extract<WorkItemStatus, 'open' | 'in_progress' | 'waiting'>
  actorKind?: 'user' | 'agent' | 'system' | 'external_sync'
  actorUserId?: string | null
  actorAgentId?: string | null
  actorExternalProvider?: string | null
  reason?: string | null
}): Promise<HumanWorkItem | null> {
  const update: Record<string, unknown> = { status: input.status }
  if (input.status === 'in_progress') update.started_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('human_work_items')
    .update(update)
    .eq('id', input.id)
    .in('status', ['open', 'in_progress', 'waiting'])
    .select(WORK_ITEM_COLUMNS)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(new Error(error.message), {
      severity: 'error',
      tags: { layer: 'db', table: 'human_work_items', op: 'transition_active_status' },
    })
    return null
  }
  if (!data) return null

  const workItem = data as HumanWorkItem
  await appendWorkItemEvent({
    work_item_id: workItem.id,
    org_id: workItem.org_id,
    actor_kind: input.actorKind ?? 'system',
    actor_user_id: input.actorUserId ?? null,
    actor_agent_id: input.actorAgentId ?? null,
    actor_external_provider: input.actorExternalProvider ?? null,
    event_type: 'status_changed',
    payload: {
      status: input.status,
      reason: input.reason ?? null,
      source: 'work_graph_board',
    },
  })

  return workItem
}

/**
 * Reopen a work item that was previously completed. Used when an external
 * PM tool sends an `issue.reopened` event.
 *
 * Guard: nerve_node items are NOT reopenable — once the DAG has advanced
 * (children promoted via dag_complete_node), re-opening the node would
 * create a split-brain where the work item says "open" but the DAG
 * already walked forward. The external PM tool sees a noop.
 */
export async function reopenWorkItem(
  id: string,
  actorProvider: string,
): Promise<HumanWorkItem | null> {
  const { data, error } = await supabase
    .from('human_work_items')
    .update({
      status: 'open' as WorkItemStatus,
      resolution: null,
      resolution_notes: null,
      completed_at: null,
    })
    .eq('id', id)
    .eq('kind', 'pulse_standalone')
    .in('status', ['done', 'rejected'])
    .select(WORK_ITEM_COLUMNS)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(new Error(error.message), {
      severity: 'error',
      tags: { layer: 'db', table: 'human_work_items', op: 'reopen' },
    })
    return null
  }
  if (!data) return null

  const workItem = data as HumanWorkItem
  await appendWorkItemEvent({
    work_item_id: workItem.id,
    org_id: workItem.org_id,
    actor_kind: 'external_sync',
    actor_external_provider: actorProvider,
    event_type: 'reopened',
  })

  return workItem
}

export async function cancelWorkItem(
  id: string,
  userId: string,
  reason?: string,
): Promise<HumanWorkItem | null> {
  const { data, error } = await supabase
    .from('human_work_items')
    .update({
      status: 'cancelled',
      resolution_notes: reason ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(WORK_ITEM_COLUMNS)
    .single()
  if (error || !data) return null

  const workItem = data as HumanWorkItem
  await appendWorkItemEvent({
    work_item_id: workItem.id,
    org_id: workItem.org_id,
    actor_kind: 'user',
    actor_user_id: userId,
    event_type: 'cancelled',
    payload: { reason: reason ?? null },
  })
  return workItem
}

// ─── Activity feed ───

export interface WorkItemEvent {
  id: string
  work_item_id: string
  org_id: string
  actor_kind: 'user' | 'agent' | 'system' | 'external_sync'
  actor_user_id: string | null
  actor_agent_id: string | null
  actor_external_provider: string | null
  event_type: string
  payload: Record<string, unknown>
  created_at: string
}

export interface AppendWorkItemEventInput {
  work_item_id: string
  org_id: string
  actor_kind: 'user' | 'agent' | 'system' | 'external_sync'
  actor_user_id?: string | null
  actor_agent_id?: string | null
  actor_external_provider?: string | null
  event_type: string
  payload?: Record<string, unknown>
}

const MAX_EVENT_PAYLOAD_BYTES = 50_000

export async function appendWorkItemEvent(
  input: AppendWorkItemEventInput,
): Promise<void> {
  // Cap payload size to keep the activity feed cheap to read and prevent
  // pathological callers from ballooning a single event row. Oversized
  // payloads are truncated to a marker — the caller's insert still succeeds.
  let payload: Record<string, unknown> = input.payload ?? {}
  try {
    const serialized = JSON.stringify(payload)
    if (serialized.length > MAX_EVENT_PAYLOAD_BYTES) {
      payload = {
        _truncated: true,
        _original_bytes: serialized.length,
        event_type: input.event_type,
      }
    }
  } catch {
    payload = { _truncated: true, _reason: 'unserializable' }
  }

  const { error } = await supabase.from('human_work_item_events').insert({
    work_item_id: input.work_item_id,
    org_id: input.org_id,
    actor_kind: input.actor_kind,
    actor_user_id: input.actor_user_id ?? null,
    actor_agent_id: input.actor_agent_id ?? null,
    actor_external_provider: input.actor_external_provider ?? null,
    event_type: input.event_type,
    payload,
  })
  if (error) {
    // Best-effort — activity-feed failures never block lifecycle ops.
    ErrorService.captureException(new Error(error.message), {
      severity: 'warning',
      tags: { layer: 'db', table: 'human_work_item_events', op: 'append' },
    })
  }
}

export async function listWorkItemEvents(
  workItemId: string,
  limit = 100,
): Promise<WorkItemEvent[]> {
  const { data, error } = await supabase
    .from('human_work_item_events')
    .select(
      'id, work_item_id, org_id, actor_kind, actor_user_id, actor_agent_id, actor_external_provider, event_type, payload, created_at',
    )
    .eq('work_item_id', workItemId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 500))
  if (error) return []
  return (data ?? []) as WorkItemEvent[]
}

// ─── DAG context (for nerve_node work items) ───

export interface DagContextForWorkItem {
  dag: {
    id: string
    status: string
    graph_version: number
    total_nodes: number
    completed_nodes: number
    failed_nodes: number
    ready_nodes: number
  }
  node: {
    id: string
    node_key: string
    node_type: string
    status: string
  }
  children: Array<{
    id: string
    node_key: string
    node_type: string
    status: string
    edge_kind: string
  }>
  /** Direct children still blocked on this node (status='pending'). */
  downstreamBlockedCount: number
}

/**
 * Fetch the DAG context surrounding a `nerve_node` work item so the PM UI
 * can render "unblocks N downstream" and a mini frontier view.
 *
 * Keeps the round-trip count at one: dag header + current node + direct
 * children, in parallel. Does NOT recurse — "unblocks N downstream" is
 * intentionally scoped to direct children to keep the query bounded.
 */
export async function getDagContextForWorkItem(
  dagId: string,
  nodeId: string,
): Promise<DagContextForWorkItem | null> {
  const [dagRes, nodeRes, edgesRes] = await Promise.all([
    supabase
      .from('orchestration_dags')
      .select(
        'id, status, graph_version, total_nodes, completed_nodes, failed_nodes, ready_nodes',
      )
      .eq('id', dagId)
      .maybeSingle(),
    supabase
      .from('orchestration_dag_nodes')
      .select('id, node_key, node_type, status')
      .eq('id', nodeId)
      .maybeSingle(),
    supabase
      .from('orchestration_dag_edges')
      .select('edge_kind, child:orchestration_dag_nodes!child_node_id(id, node_key, node_type, status)')
      .eq('dag_id', dagId)
      .eq('parent_node_id', nodeId),
  ])

  if (dagRes.error || !dagRes.data) {
    if (dagRes.error) {
      ErrorService.captureException(new Error(dagRes.error.message), {
        severity: 'warning',
        tags: { layer: 'db', table: 'orchestration_dags', op: 'get_dag_context' },
      })
    }
    return null
  }
  if (nodeRes.error || !nodeRes.data) return null

  type EdgeRow = {
    edge_kind: string
    child:
      | { id: string; node_key: string; node_type: string; status: string }
      | { id: string; node_key: string; node_type: string; status: string }[]
      | null
  }
  const children: DagContextForWorkItem['children'] = []
  for (const row of (edgesRes.data ?? []) as EdgeRow[]) {
    const child = Array.isArray(row.child) ? row.child[0] : row.child
    if (!child) continue
    children.push({
      id: child.id,
      node_key: child.node_key,
      node_type: child.node_type,
      status: child.status,
      edge_kind: row.edge_kind,
    })
  }

  const downstreamBlockedCount = children.filter((c) => c.status === 'pending').length

  return {
    dag: dagRes.data as DagContextForWorkItem['dag'],
    node: nodeRes.data as DagContextForWorkItem['node'],
    children,
    downstreamBlockedCount,
  }
}

export async function commentOnWorkItem(
  workItemId: string,
  orgId: string,
  userId: string,
  comment: string,
): Promise<boolean> {
  const trimmed = comment.trim()
  if (!trimmed) return false
  await appendWorkItemEvent({
    work_item_id: workItemId,
    org_id: orgId,
    actor_kind: 'user',
    actor_user_id: userId,
    event_type: 'commented',
    payload: { body: trimmed.slice(0, 10_000) },
  })
  return true
}
