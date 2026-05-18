import 'server-only'

import { ErrorService, supabase } from '@/lib/db/client'
import type { HumanWorkItem } from '@/lib/db/human-work-items'

export type WorkItemSignalState = 'ready' | 'claimed' | 'waiting' | 'blocked' | 'resolved'
export type WorkItemSignalSeverity = 'info' | 'warn' | 'critical'
export type WorkItemSignalReason =
  | 'ready_unassigned'
  | 'ready_assigned'
  | 'claimed_active'
  | 'waiting_status'
  | 'dag_paused'
  | 'dag_blocked'
  | 'dag_pending_parents'
  | 'dag_failed'
  | 'dag_cancelled'
  | 'dag_node_terminal'
  | 'resolved'

export interface WorkItemSignal {
  state: WorkItemSignalState
  reason: WorkItemSignalReason
  label: string
  detail: string
  severity: WorkItemSignalSeverity
  readyForOperator: boolean
  stalled: boolean
}

export interface WorkItemWithSignal extends HumanWorkItem {
  signal: WorkItemSignal
}

export interface WorkItemLivenessIncident {
  key: string
  type:
    | 'unassigned_work'
    | 'stalled_claimed_work'
    | 'stalled_waiting_work'
    | 'overdue_work'
    | 'orphaned_dag_work'
  severity: WorkItemSignalSeverity
  title: string
  detail: string
  workItemId: string
  agentId: string | null
  createdAt: string
}

interface DagNodeSnapshot {
  id: string
  dag_id: string
  status: string
  pending_parent_count: number
}

interface DagSnapshot {
  id: string
  status: string
}

interface WorkSignalContext {
  dagNode?: DagNodeSnapshot | null
  dag?: DagSnapshot | null
  now?: number
}

const UNASSIGNED_STALE_MS = 30 * 60 * 1000
const CLAIMED_STALE_MS = 4 * 60 * 60 * 1000
const WAITING_STALE_MS = 2 * 60 * 60 * 1000

function buildSignal(input: Omit<WorkItemSignal, 'stalled'> & { stalled?: boolean }): WorkItemSignal {
  return {
    ...input,
    stalled: input.stalled === true,
  }
}

function isTerminalWorkStatus(status: HumanWorkItem['status']) {
  return status === 'done' || status === 'cancelled' || status === 'rejected'
}

function getAgeMs(iso: string | null | undefined, now: number) {
  if (!iso) return null
  const value = new Date(iso).getTime()
  return Number.isFinite(value) ? Math.max(0, now - value) : null
}

function getOverdue(item: HumanWorkItem, now: number) {
  if (!item.due_at || isTerminalWorkStatus(item.status)) return false
  return new Date(item.due_at).getTime() < now
}

export function evaluateWorkItemSignal(
  item: HumanWorkItem,
  context: WorkSignalContext = {},
): WorkItemSignal {
  const dagNode = context.dagNode ?? null
  const dag = context.dag ?? null
  const now = context.now ?? Date.now()
  const claimedAgeMs = getAgeMs(item.started_at, now)

  if (isTerminalWorkStatus(item.status)) {
    return buildSignal({
      state: 'resolved',
      reason: 'resolved',
      label: 'Resolved',
      detail: 'This work item is already resolved and no longer blocks project execution.',
      severity: 'info',
      readyForOperator: false,
    })
  }

  if (dag?.status === 'failed') {
    return buildSignal({
      state: 'blocked',
      reason: 'dag_failed',
      label: 'Blocked by DAG failure',
      detail: 'The parent DAG already failed. This work item should be reviewed before more execution is scheduled.',
      severity: 'critical',
      readyForOperator: false,
    })
  }

  if (dag?.status === 'cancelled') {
    return buildSignal({
      state: 'blocked',
      reason: 'dag_cancelled',
      label: 'Blocked by DAG cancellation',
      detail: 'The parent DAG was cancelled. This work item is now orphaned and needs operator review.',
      severity: 'critical',
      readyForOperator: false,
    })
  }

  if (dagNode && ['failed', 'cancelled', 'superseded'].includes(dagNode.status)) {
    return buildSignal({
      state: 'blocked',
      reason: 'dag_node_terminal',
      label: 'Blocked by node state',
      detail: 'The backing DAG node is no longer executable. This work item needs cleanup or escalation.',
      severity: 'critical',
      readyForOperator: false,
    })
  }

  if (item.status === 'in_progress') {
    return buildSignal({
      state: 'claimed',
      reason: 'claimed_active',
      label: 'Claimed',
      detail: 'This work item is already claimed and waiting for the current operator to resolve it.',
      severity: claimedAgeMs !== null && claimedAgeMs >= CLAIMED_STALE_MS ? 'warn' : 'info',
      readyForOperator: false,
      stalled: claimedAgeMs !== null && claimedAgeMs >= CLAIMED_STALE_MS,
    })
  }

  if (dag?.status === 'paused') {
    return buildSignal({
      state: 'waiting',
      reason: 'dag_paused',
      label: 'Waiting on DAG resume',
      detail: 'The parent DAG is paused. This work item should not be claimed until execution resumes.',
      severity: 'warn',
      readyForOperator: false,
    })
  }

  if (dag?.status === 'blocked') {
    return buildSignal({
      state: 'blocked',
      reason: 'dag_blocked',
      label: 'Blocked upstream',
      detail: 'The parent DAG is blocked by an upstream dependency or policy gate.',
      severity: 'warn',
      readyForOperator: false,
    })
  }

  if (dagNode && dagNode.pending_parent_count > 0) {
    return buildSignal({
      state: 'blocked',
      reason: 'dag_pending_parents',
      label: 'Blocked on predecessors',
      detail: 'This DAG-backed work item still has unresolved parent steps and should not be claimed yet.',
      severity: 'warn',
      readyForOperator: false,
    })
  }

  if (dagNode?.status === 'pending') {
    return buildSignal({
      state: 'blocked',
      reason: 'dag_pending_parents',
      label: 'Blocked on promotion',
      detail: 'The DAG node has not promoted into a ready state yet. Scheduling should hold this item back.',
      severity: 'warn',
      readyForOperator: false,
    })
  }

  if (item.status === 'waiting') {
    return buildSignal({
      state: 'waiting',
      reason: 'waiting_status',
      label: 'Waiting',
      detail: 'This work item is explicitly waiting on external context or a prior operator decision.',
      severity: 'warn',
      readyForOperator: false,
    })
  }

  return buildSignal({
    state: 'ready',
    reason: item.assignee_user_id ? 'ready_assigned' : 'ready_unassigned',
    label: item.assignee_user_id ? 'Ready for assignee' : 'Ready for claim',
    detail: item.assignee_user_id
      ? 'This work item is ready for its assigned operator.'
      : 'This work item is ready for an operator to claim.',
    severity: getOverdue(item, now) ? 'warn' : 'info',
    readyForOperator: true,
  })
}

async function loadDagSnapshots(
  items: HumanWorkItem[],
): Promise<{
  dagNodesById: Map<string, DagNodeSnapshot>
  dagsById: Map<string, DagSnapshot>
}> {
  const dagNodeIds = [...new Set(items.map((item) => item.dag_node_id).filter((id): id is string => Boolean(id)))]
  const dagIds = [...new Set(items.map((item) => item.dag_id).filter((id): id is string => Boolean(id)))]

  if (dagNodeIds.length === 0 && dagIds.length === 0) {
    return {
      dagNodesById: new Map(),
      dagsById: new Map(),
    }
  }

  const [dagNodeRes, dagRes] = await Promise.all([
    dagNodeIds.length > 0
      ? supabase
          .from('orchestration_dag_nodes')
          .select('id, dag_id, status, pending_parent_count')
          .in('id', dagNodeIds)
      : Promise.resolve({ data: [], error: null }),
    dagIds.length > 0
      ? supabase
          .from('orchestration_dags')
          .select('id, status')
          .in('id', dagIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (dagNodeRes.error) {
    ErrorService.captureException(new Error(dagNodeRes.error.message), {
      severity: 'warning',
      tags: { layer: 'work-items', op: 'load-dag-node-snapshots' },
    })
  }
  if (dagRes.error) {
    ErrorService.captureException(new Error(dagRes.error.message), {
      severity: 'warning',
      tags: { layer: 'work-items', op: 'load-dag-snapshots' },
    })
  }

  return {
    dagNodesById: new Map(((dagNodeRes.data ?? []) as DagNodeSnapshot[]).map((row) => [row.id, row])),
    dagsById: new Map(((dagRes.data ?? []) as DagSnapshot[]).map((row) => [row.id, row])),
  }
}

export async function enrichWorkItemsWithSignals(
  items: HumanWorkItem[],
): Promise<WorkItemWithSignal[]> {
  if (items.length === 0) return []

  const { dagNodesById, dagsById } = await loadDagSnapshots(items)
  const now = Date.now()

  return items.map((item) => ({
    ...item,
    signal: evaluateWorkItemSignal(item, {
      dagNode: item.dag_node_id ? dagNodesById.get(item.dag_node_id) ?? null : null,
      dag: item.dag_id ? dagsById.get(item.dag_id) ?? null : null,
      now,
    }),
  }))
}

export async function getWorkItemWithSignal(
  item: HumanWorkItem,
): Promise<WorkItemWithSignal> {
  const [enriched] = await enrichWorkItemsWithSignals([item])
  return enriched
}

export function buildWorkItemLivenessIncidents(
  items: WorkItemWithSignal[],
): WorkItemLivenessIncident[] {
  const now = Date.now()
  const incidents: WorkItemLivenessIncident[] = []

  for (const item of items) {
    const createdAgeMs = getAgeMs(item.created_at, now)
    const startedAgeMs = getAgeMs(item.started_at, now)
    const overdue = getOverdue(item, now)

    if (item.signal.reason === 'dag_failed' || item.signal.reason === 'dag_cancelled' || item.signal.reason === 'dag_node_terminal') {
      incidents.push({
        key: `orphaned:${item.id}`,
        type: 'orphaned_dag_work',
        severity: 'critical',
        title: 'Orphaned DAG work item',
        detail: item.signal.detail,
        workItemId: item.id,
        agentId: item.agent_id,
        createdAt: item.created_at,
      })
    }

    if (item.status === 'open' && !item.assignee_user_id && createdAgeMs !== null && createdAgeMs >= UNASSIGNED_STALE_MS) {
      incidents.push({
        key: `unassigned:${item.id}`,
        type: 'unassigned_work',
        severity: overdue ? 'critical' : 'warn',
        title: 'Unassigned ready work',
        detail: overdue
          ? 'This ready work item is overdue and still has no assignee.'
          : 'This ready work item has been sitting without an assignee longer than the acceptable operator window.',
        workItemId: item.id,
        agentId: item.agent_id,
        createdAt: item.created_at,
      })
    }

    if (item.status === 'in_progress' && startedAgeMs !== null && startedAgeMs >= CLAIMED_STALE_MS) {
      incidents.push({
        key: `claimed:${item.id}`,
        type: 'stalled_claimed_work',
        severity: overdue ? 'critical' : 'warn',
        title: 'Claimed work appears stalled',
        detail: 'This work item has been in progress longer than the allowed operator window and should be reviewed or escalated.',
        workItemId: item.id,
        agentId: item.agent_id,
        createdAt: item.created_at,
      })
    }

    if (item.status === 'waiting' && createdAgeMs !== null && createdAgeMs >= WAITING_STALE_MS) {
      incidents.push({
        key: `waiting:${item.id}`,
        type: 'stalled_waiting_work',
        severity: overdue ? 'critical' : 'warn',
        title: 'Waiting work appears stalled',
        detail: 'This work item has stayed in waiting long enough that it should surface as explicit operator attention.',
        workItemId: item.id,
        agentId: item.agent_id,
        createdAt: item.created_at,
      })
    }

    if (overdue) {
      incidents.push({
        key: `overdue:${item.id}`,
        type: 'overdue_work',
        severity: 'warn',
        title: 'Overdue work item',
        detail: 'This work item is past its due date and should be prioritized in the project queue.',
        workItemId: item.id,
        agentId: item.agent_id,
        createdAt: item.created_at,
      })
    }
  }

  return incidents
}
