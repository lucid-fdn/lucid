import 'server-only'

import type {
  WorkArtifactLink,
  WorkArtifactLinkCreate,
  WorkBoard,
  WorkBoardColumn,
  WorkBoardColumnCreate,
  WorkBoardCreate,
  WorkBoardMove,
  WorkGoal,
  WorkGoalCreate,
  WorkGraphActorKind,
  WorkGraphEvent,
  WorkGraphPlanningJob,
  WorkGraphPlanningJobStatus,
  WorkItemCheckout,
  WorkItemCheckoutCreate,
  WorkItemEngineFacet,
  WorkItemGoalLink,
  WorkItemRelation,
  WorkItemRelationCreate,
} from '@contracts/work-graph'
import {
  WorkArtifactLinkCreateSchema,
  WorkBoardCreateSchema,
  WorkBoardMoveSchema,
  WorkGoalCreateSchema,
  WorkItemCheckoutCreateSchema,
  WorkItemRelationCreateSchema,
} from '@contracts/work-graph'
import {
  claimWorkItem,
  getWorkItemById,
  transitionActiveWorkItemStatus,
  type HumanWorkItem,
} from '@/lib/db/human-work-items'
import { ErrorService, supabase } from '@/lib/db/client'
import { DEFAULT_WORK_BOARD_COLUMNS, WORK_GRAPH_ALLOWED_ARTIFACT_REF_TABLES, WORK_GRAPH_CYCLE_RELATIONS } from './constants'
import { makeInitialRank, rankBetween } from './ranks'
import type { WorkBoardReadModel, WorkGraphOverview, WorkItemGraphContext } from './types'

const GOAL_COLUMNS =
  'id, org_id, project_id, parent_goal_id, title, description, status, priority, source, target_date, owner_user_id, owner_agent_id, rollup, metadata, created_by, created_at, updated_at, archived_at'
const BOARD_COLUMNS =
  'id, org_id, project_id, goal_id, name, kind, scope, source, external_config, created_by, created_at, updated_at, archived_at'
const BOARD_COLUMN_COLUMNS =
  'id, board_id, org_id, key, label, status_filter, position, wip_limit, color, is_done, external_mapping, created_at, updated_at'
const BOARD_ITEM_COLUMNS =
  'id, board_id, column_id, org_id, work_item_id, rank, swimlane_key, metadata, created_at, updated_at'
const RELATION_COLUMNS =
  'id, org_id, project_id, source_work_item_id, target_work_item_id, relation_type, reason, metadata, created_by, created_at'
const CHECKOUT_COLUMNS =
  'id, org_id, project_id, work_item_id, owner_kind, owner_user_id, owner_agent_id, owner_team_id, external_owner_ref, status, purpose, lease_expires_at, agent_ops_run_id, runtime_id, required_capabilities, metadata, created_by, created_at, updated_at, released_at'
const ARTIFACT_LINK_COLUMNS =
  'id, org_id, project_id, goal_id, work_item_id, artifact_type, label, url, ref_table, ref_id, summary, metadata, created_by, created_at'
const EVENT_COLUMNS =
  'id, org_id, project_id, goal_id, work_item_id, actor_kind, actor_user_id, actor_agent_id, actor_external_provider, event_type, payload, created_at'
const PLANNING_JOB_COLUMNS =
  'id, org_id, project_id, goal_id, status, source, input, proposal, validation_errors, model_policy, created_by, created_at, started_at, completed_at, updated_at'
const ENGINE_FACET_COLUMNS =
  'id, org_id, project_id, work_item_id, engine, runtime_flavor, facet_key, facet_state, source_runtime_id, source_snapshot_id, observed_at, created_at, updated_at'
const WORK_ITEM_COLUMNS =
  'id, org_id, kind, pulse_job_run_id, dag_id, dag_node_id, agent_id, title, description, priority, labels, assignee_user_id, assignee_role, status, resolution, resolution_notes, due_at, sla_seconds, started_at, completed_at, external_mirror, created_by, created_at, updated_at'
const GOAL_LINK_COLUMNS =
  'id, org_id, goal_id, work_item_id, link_type, weight, metadata, created_by, created_at'

interface ActorInput {
  actorKind?: WorkGraphActorKind
  actorUserId?: string | null
  actorAgentId?: string | null
  actorExternalProvider?: string | null
}

function captureDbError(error: { message: string }, op: string, table: string) {
  ErrorService.captureException(new Error(error.message), {
    severity: 'error',
    tags: { layer: 'db', table, op },
  })
}

export async function appendWorkGraphEvent(input: {
  orgId: string
  projectId?: string | null
  goalId?: string | null
  workItemId?: string | null
  actorKind?: WorkGraphActorKind
  actorUserId?: string | null
  actorAgentId?: string | null
  actorExternalProvider?: string | null
  eventType: string
  payload?: Record<string, unknown>
}): Promise<WorkGraphEvent | null> {
  const { data, error } = await supabase
    .from('work_graph_events')
    .insert({
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      goal_id: input.goalId ?? null,
      work_item_id: input.workItemId ?? null,
      actor_kind: input.actorKind ?? 'system',
      actor_user_id: input.actorUserId ?? null,
      actor_agent_id: input.actorAgentId ?? null,
      actor_external_provider: input.actorExternalProvider ?? null,
      event_type: input.eventType,
      payload: input.payload ?? {},
    })
    .select(EVENT_COLUMNS)
    .single()

  if (error) {
    captureDbError(error, 'append_event', 'work_graph_events')
    return null
  }
  return data as WorkGraphEvent
}

export async function listWorkGraphOverview(
  orgId: string,
  projectId: string,
  limit = 50,
): Promise<WorkGraphOverview> {
  const boundedLimit = Math.min(Math.max(limit, 1), 100)
  const [goals, boards, openCheckouts, recentEvents, planningJobs] = await Promise.all([
    listWorkGoals(orgId, projectId, { limit: boundedLimit }),
    listWorkBoards(orgId, projectId, { limit: boundedLimit }),
    listActiveCheckouts(orgId, projectId, boundedLimit),
    listWorkGraphEvents(orgId, projectId, boundedLimit),
    listPlanningJobs(orgId, projectId, boundedLimit),
  ])

  return { goals, boards, openCheckouts, recentEvents, planningJobs }
}

export async function createWorkGoal(
  orgId: string,
  input: WorkGoalCreate,
  actor: ActorInput = {},
): Promise<WorkGoal | null> {
  const validated = WorkGoalCreateSchema.parse(input)
  const { data, error } = await supabase
    .from('work_goals')
    .insert({
      org_id: orgId,
      project_id: validated.project_id ?? null,
      parent_goal_id: validated.parent_goal_id ?? null,
      title: validated.title,
      description: validated.description ?? null,
      status: validated.status ?? 'draft',
      priority: validated.priority ?? 'normal',
      source: validated.source ?? 'lucid',
      target_date: validated.target_date ?? null,
      owner_user_id: validated.owner_user_id ?? null,
      owner_agent_id: validated.owner_agent_id ?? null,
      metadata: validated.metadata ?? {},
      created_by: actor.actorUserId ?? null,
    })
    .select(GOAL_COLUMNS)
    .single()

  if (error) {
    captureDbError(error, 'create', 'work_goals')
    return null
  }
  const goal = data as WorkGoal
  await appendWorkGraphEvent({
    orgId,
    projectId: goal.project_id ?? null,
    goalId: goal.id,
    actorKind: actor.actorKind ?? 'user',
    actorUserId: actor.actorUserId ?? null,
    actorAgentId: actor.actorAgentId ?? null,
    eventType: 'goal.created',
    payload: { title: goal.title, source: goal.source },
  })
  return goal
}

export async function listWorkGoals(
  orgId: string,
  projectId?: string | null,
  opts: { limit?: number; includeArchived?: boolean } = {},
): Promise<WorkGoal[]> {
  let query = supabase
    .from('work_goals')
    .select(GOAL_COLUMNS)
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })
    .limit(Math.min(opts.limit ?? 100, 200))

  if (projectId) query = query.eq('project_id', projectId)
  if (!opts.includeArchived) query = query.is('archived_at', null)

  const { data, error } = await query
  if (error) {
    captureDbError(error, 'list', 'work_goals')
    return []
  }
  return (data ?? []) as WorkGoal[]
}

export async function createWorkBoard(
  orgId: string,
  input: WorkBoardCreate & { columns?: WorkBoardColumnCreate[] },
  actor: ActorInput = {},
): Promise<{ board: WorkBoard; columns: WorkBoardColumn[] } | null> {
  const validated = WorkBoardCreateSchema.parse(input)
  const { data, error } = await supabase
    .from('work_boards')
    .insert({
      org_id: orgId,
      project_id: validated.project_id ?? null,
      goal_id: validated.goal_id ?? null,
      name: validated.name,
      kind: validated.kind ?? 'kanban',
      scope: validated.scope ?? {},
      source: validated.source ?? 'lucid',
      external_config: validated.external_config ?? {},
      created_by: actor.actorUserId ?? null,
    })
    .select(BOARD_COLUMNS)
    .single()

  if (error) {
    captureDbError(error, 'create', 'work_boards')
    return null
  }

  const board = data as WorkBoard
  const columnsInput = input.columns?.length ? input.columns : [...DEFAULT_WORK_BOARD_COLUMNS]
  const columnRows = columnsInput.map((column, index) => ({
    board_id: board.id,
    org_id: orgId,
    key: column.key,
    label: column.label,
    status_filter: column.status_filter ?? [],
    position: column.position ?? (index + 1) * 1000,
    wip_limit: column.wip_limit ?? null,
    color: column.color ?? null,
    is_done: column.is_done ?? false,
    external_mapping: column.external_mapping ?? {},
  }))

  const { data: columnsData, error: columnsError } = await supabase
    .from('work_board_columns')
    .insert(columnRows)
    .select(BOARD_COLUMN_COLUMNS)
    .order('position', { ascending: true })

  if (columnsError) {
    captureDbError(columnsError, 'create_columns', 'work_board_columns')
    return { board, columns: [] }
  }

  await appendWorkGraphEvent({
    orgId,
    projectId: board.project_id ?? null,
    goalId: board.goal_id ?? null,
    actorKind: actor.actorKind ?? 'user',
    actorUserId: actor.actorUserId ?? null,
    actorAgentId: actor.actorAgentId ?? null,
    eventType: 'board.created',
    payload: { board_id: board.id, name: board.name, kind: board.kind },
  })

  return { board, columns: (columnsData ?? []) as WorkBoardColumn[] }
}

export async function linkWorkItemToGoal(
  orgId: string,
  input: {
    goalId: string
    workItemId: string
    linkType?: 'primary' | 'supporting' | 'evidence'
    weight?: number
    metadata?: Record<string, unknown>
  },
  actor: ActorInput = {},
): Promise<WorkItemGoalLink | null> {
  const { data, error } = await supabase
    .from('work_item_goal_links')
    .upsert({
      org_id: orgId,
      goal_id: input.goalId,
      work_item_id: input.workItemId,
      link_type: input.linkType ?? 'primary',
      weight: input.weight ?? 1,
      metadata: input.metadata ?? {},
      created_by: actor.actorUserId ?? null,
    }, { onConflict: 'goal_id,work_item_id,link_type' })
    .select(GOAL_LINK_COLUMNS)
    .single()

  if (error) {
    captureDbError(error, 'link_goal', 'work_item_goal_links')
    return null
  }

  const link = data as WorkItemGoalLink
  await appendWorkGraphEvent({
    orgId,
    goalId: link.goal_id,
    workItemId: link.work_item_id,
    actorKind: actor.actorKind ?? 'user',
    actorUserId: actor.actorUserId ?? null,
    actorAgentId: actor.actorAgentId ?? null,
    eventType: 'goal.work_item_linked',
    payload: { link_id: link.id, link_type: link.link_type },
  })
  return link
}

export async function listWorkBoards(
  orgId: string,
  projectId?: string | null,
  opts: { limit?: number; includeArchived?: boolean } = {},
): Promise<WorkBoard[]> {
  let query = supabase
    .from('work_boards')
    .select(BOARD_COLUMNS)
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })
    .limit(Math.min(opts.limit ?? 50, 100))

  if (projectId) query = query.eq('project_id', projectId)
  if (!opts.includeArchived) query = query.is('archived_at', null)

  const { data, error } = await query
  if (error) {
    captureDbError(error, 'list', 'work_boards')
    return []
  }
  return (data ?? []) as WorkBoard[]
}

export async function getWorkBoardReadModel(
  orgId: string,
  boardId: string,
): Promise<WorkBoardReadModel | null> {
  const { data: boardData, error: boardError } = await supabase
    .from('work_boards')
    .select(BOARD_COLUMNS)
    .eq('org_id', orgId)
    .eq('id', boardId)
    .maybeSingle()

  if (boardError) {
    captureDbError(boardError, 'get', 'work_boards')
    return null
  }
  if (!boardData) return null

  const { data: columnsData, error: columnsError } = await supabase
    .from('work_board_columns')
    .select(BOARD_COLUMN_COLUMNS)
    .eq('org_id', orgId)
    .eq('board_id', boardId)
    .order('position', { ascending: true })

  if (columnsError) {
    captureDbError(columnsError, 'list', 'work_board_columns')
    return null
  }

  const { data: itemsData, error: itemsError } = await supabase
    .from('work_board_items')
    .select(BOARD_ITEM_COLUMNS)
    .eq('org_id', orgId)
    .eq('board_id', boardId)
    .order('rank', { ascending: true })

  if (itemsError) {
    captureDbError(itemsError, 'list', 'work_board_items')
    return null
  }

  const items = (itemsData ?? []) as WorkBoardReadModel['columns'][number]['items']
  const workItemIds = items.map((item) => item.work_item_id)
  const workItemById = new Map<string, HumanWorkItem>()
  if (workItemIds.length > 0) {
    const { data: workItemsData, error: workItemsError } = await supabase
      .from('human_work_items')
      .select(WORK_ITEM_COLUMNS)
      .eq('org_id', orgId)
      .in('id', workItemIds)

    if (workItemsError) {
      captureDbError(workItemsError, 'list_for_board', 'human_work_items')
    } else {
      for (const item of (workItemsData ?? []) as HumanWorkItem[]) {
        workItemById.set(item.id, item)
      }
    }
  }

  const itemGroups = new Map<string, WorkBoardReadModel['columns'][number]['items']>()
  for (const item of items) {
    const grouped = itemGroups.get(item.column_id) ?? []
    grouped.push({ ...item, workItem: workItemById.get(item.work_item_id) ?? null })
    itemGroups.set(item.column_id, grouped)
  }

  return {
    ...(boardData as WorkBoard),
    columns: ((columnsData ?? []) as WorkBoardColumn[]).map((column) => ({
      ...column,
      items: itemGroups.get(column.id) ?? [],
    })),
  }
}

export async function moveWorkBoardItem(
  orgId: string,
  boardId: string,
  input: WorkBoardMove,
  actor: ActorInput = {},
): Promise<WorkBoardReadModel | null> {
  const validated = WorkBoardMoveSchema.parse(input)
  const rank = validated.rank ?? rankBetween(validated.before_rank, validated.after_rank)
  const { data: column, error: columnError } = await supabase
    .from('work_board_columns')
    .select(BOARD_COLUMN_COLUMNS)
    .eq('org_id', orgId)
    .eq('board_id', boardId)
    .eq('id', validated.column_id)
    .maybeSingle()

  if (columnError) {
    captureDbError(columnError, 'get_move_column', 'work_board_columns')
    return null
  }
  if (!column) return null

  const { error } = await supabase
    .from('work_board_items')
    .upsert({
      board_id: boardId,
      column_id: validated.column_id,
      org_id: orgId,
      work_item_id: validated.work_item_id,
      rank,
      swimlane_key: validated.swimlane_key ?? null,
      metadata: validated.metadata ?? {},
    }, { onConflict: 'board_id,work_item_id' })

  if (error) {
    captureDbError(error, 'move', 'work_board_items')
    return null
  }

  const mappedStatus = deriveActiveStatusFromBoardColumn(column as WorkBoardColumn)
  if (mappedStatus) {
    await transitionActiveWorkItemStatus({
      id: validated.work_item_id,
      status: mappedStatus,
      actorKind: mapWorkGraphActorToWorkItemActor(actor.actorKind),
      actorUserId: actor.actorUserId ?? null,
      actorAgentId: actor.actorAgentId ?? null,
      reason: 'Moved on Work Graph board',
    })
  }

  await appendWorkGraphEvent({
    orgId,
    workItemId: validated.work_item_id,
    actorKind: actor.actorKind ?? 'user',
    actorUserId: actor.actorUserId ?? null,
    actorAgentId: actor.actorAgentId ?? null,
    eventType: 'board.item_moved',
    payload: { board_id: boardId, column_id: validated.column_id, rank },
  })

  return getWorkBoardReadModel(orgId, boardId)
}

function deriveActiveStatusFromBoardColumn(
  column: WorkBoardColumn,
): 'open' | 'in_progress' | 'waiting' | null {
  const status = column.status_filter[0]
  if (status === 'open' || status === 'in_progress' || status === 'waiting') return status
  return null
}

function mapWorkGraphActorToWorkItemActor(
  actorKind: WorkGraphActorKind | undefined,
): 'user' | 'agent' | 'system' | 'external_sync' {
  if (actorKind === 'user' || actorKind === 'agent' || actorKind === 'external_sync') return actorKind
  return 'system'
}

async function getCycleRelationEdges(orgId: string): Promise<Array<Pick<WorkItemRelation, 'source_work_item_id' | 'target_work_item_id' | 'relation_type'>>> {
  const { data, error } = await supabase
    .from('work_item_relations')
    .select('source_work_item_id, target_work_item_id, relation_type')
    .eq('org_id', orgId)
    .in('relation_type', [...WORK_GRAPH_CYCLE_RELATIONS])

  if (error) {
    captureDbError(error, 'list_cycle_edges', 'work_item_relations')
    return []
  }
  return (data ?? []) as Array<Pick<WorkItemRelation, 'source_work_item_id' | 'target_work_item_id' | 'relation_type'>>
}

export async function wouldCreateRelationCycle(
  orgId: string,
  sourceWorkItemId: string,
  targetWorkItemId: string,
  relationType: string,
): Promise<boolean> {
  if (!WORK_GRAPH_CYCLE_RELATIONS.has(relationType)) return false

  const edges = await getCycleRelationEdges(orgId)
  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    const next = adjacency.get(edge.source_work_item_id) ?? []
    next.push(edge.target_work_item_id)
    adjacency.set(edge.source_work_item_id, next)
  }
  const next = adjacency.get(sourceWorkItemId) ?? []
  next.push(targetWorkItemId)
  adjacency.set(sourceWorkItemId, next)

  const visited = new Set<string>()
  const stack = [targetWorkItemId]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || visited.has(current)) continue
    if (current === sourceWorkItemId) return true
    visited.add(current)
    stack.push(...(adjacency.get(current) ?? []))
  }
  return false
}

export async function createWorkItemRelation(
  orgId: string,
  input: WorkItemRelationCreate,
  actor: ActorInput = {},
): Promise<{ relation: WorkItemRelation | null; error?: 'cycle' | 'not_found' }> {
  const validated = WorkItemRelationCreateSchema.parse(input)
  if (validated.source_work_item_id === validated.target_work_item_id) {
    return { relation: null, error: 'cycle' }
  }

  const [source, target] = await Promise.all([
    getWorkItemById(validated.source_work_item_id),
    getWorkItemById(validated.target_work_item_id),
  ])
  if (!source || !target || source.org_id !== orgId || target.org_id !== orgId) {
    return { relation: null, error: 'not_found' }
  }
  if (await wouldCreateRelationCycle(orgId, validated.source_work_item_id, validated.target_work_item_id, validated.relation_type)) {
    return { relation: null, error: 'cycle' }
  }

  const { data, error } = await supabase
    .from('work_item_relations')
    .insert({
      org_id: orgId,
      project_id: validated.project_id ?? null,
      source_work_item_id: validated.source_work_item_id,
      target_work_item_id: validated.target_work_item_id,
      relation_type: validated.relation_type,
      reason: validated.reason ?? null,
      metadata: validated.metadata ?? {},
      created_by: actor.actorUserId ?? null,
    })
    .select(RELATION_COLUMNS)
    .single()

  if (error) {
    captureDbError(error, 'create', 'work_item_relations')
    return { relation: null }
  }

  const relation = data as WorkItemRelation
  await appendWorkGraphEvent({
    orgId,
    projectId: relation.project_id ?? null,
    workItemId: relation.source_work_item_id,
    actorKind: actor.actorKind ?? 'user',
    actorUserId: actor.actorUserId ?? null,
    actorAgentId: actor.actorAgentId ?? null,
    eventType: 'relation.created',
    payload: {
      relation_id: relation.id,
      relation_type: relation.relation_type,
      target_work_item_id: relation.target_work_item_id,
    },
  })
  return { relation }
}

export async function createWorkItemCheckout(
  orgId: string,
  input: WorkItemCheckoutCreate,
  actor: ActorInput = {},
): Promise<{ checkout: WorkItemCheckout | null; error?: 'not_found' | 'claim_failed' }> {
  const validated = WorkItemCheckoutCreateSchema.parse(input)
  const workItem = await getWorkItemById(validated.work_item_id)
  if (!workItem || workItem.org_id !== orgId) return { checkout: null, error: 'not_found' }

  const { data, error } = await supabase
    .from('work_item_checkouts')
    .insert({
      org_id: orgId,
      project_id: validated.project_id ?? null,
      work_item_id: validated.work_item_id,
      owner_kind: validated.owner_kind,
      owner_user_id: validated.owner_user_id ?? null,
      owner_agent_id: validated.owner_agent_id ?? null,
      owner_team_id: validated.owner_team_id ?? null,
      external_owner_ref: validated.external_owner_ref ?? null,
      purpose: validated.purpose,
      lease_expires_at: validated.lease_expires_at ?? null,
      agent_ops_run_id: validated.agent_ops_run_id ?? null,
      runtime_id: validated.runtime_id ?? null,
      required_capabilities: validated.required_capabilities ?? [],
      metadata: validated.metadata ?? {},
      created_by: actor.actorUserId ?? null,
    })
    .select(CHECKOUT_COLUMNS)
    .single()

  if (error) {
    captureDbError(error, 'create', 'work_item_checkouts')
    return { checkout: null }
  }

  const checkout = data as WorkItemCheckout
  if (validated.owner_kind === 'user' && validated.owner_user_id) {
    const claimed = await claimWorkItem(validated.work_item_id, validated.owner_user_id)
    if (!claimed) {
      await releaseWorkItemCheckout(orgId, checkout.id, 'cancelled', actor)
      return { checkout: null, error: 'claim_failed' }
    }
  }

  await appendWorkGraphEvent({
    orgId,
    projectId: checkout.project_id ?? null,
    workItemId: checkout.work_item_id,
    actorKind: actor.actorKind ?? 'user',
    actorUserId: actor.actorUserId ?? null,
    actorAgentId: actor.actorAgentId ?? null,
    eventType: 'checkout.created',
    payload: { checkout_id: checkout.id, owner_kind: checkout.owner_kind, purpose: checkout.purpose },
  })

  return { checkout }
}

export async function releaseWorkItemCheckout(
  orgId: string,
  checkoutId: string,
  status: 'released' | 'cancelled' | 'completed' = 'released',
  actor: ActorInput = {},
): Promise<WorkItemCheckout | null> {
  const { data, error } = await supabase
    .from('work_item_checkouts')
    .update({ status, released_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('id', checkoutId)
    .eq('status', 'active')
    .select(CHECKOUT_COLUMNS)
    .maybeSingle()

  if (error) {
    captureDbError(error, 'release', 'work_item_checkouts')
    return null
  }
  if (!data) return null

  const checkout = data as WorkItemCheckout
  await appendWorkGraphEvent({
    orgId,
    projectId: checkout.project_id ?? null,
    workItemId: checkout.work_item_id,
    actorKind: actor.actorKind ?? 'user',
    actorUserId: actor.actorUserId ?? null,
    actorAgentId: actor.actorAgentId ?? null,
    eventType: `checkout.${status}`,
    payload: { checkout_id: checkout.id },
  })
  return checkout
}

export async function attachAgentOpsRunToCheckout(
  orgId: string,
  checkoutId: string,
  agentOpsRunId: string,
  actor: ActorInput = {},
): Promise<WorkItemCheckout | null> {
  const { data, error } = await supabase
    .from('work_item_checkouts')
    .update({ agent_ops_run_id: agentOpsRunId })
    .eq('org_id', orgId)
    .eq('id', checkoutId)
    .eq('status', 'active')
    .select(CHECKOUT_COLUMNS)
    .maybeSingle()

  if (error) {
    captureDbError(error, 'attach_agent_ops_run', 'work_item_checkouts')
    return null
  }
  if (!data) return null

  const checkout = data as WorkItemCheckout
  await appendWorkGraphEvent({
    orgId,
    projectId: checkout.project_id ?? null,
    workItemId: checkout.work_item_id,
    actorKind: actor.actorKind ?? 'system',
    actorUserId: actor.actorUserId ?? null,
    actorAgentId: actor.actorAgentId ?? null,
    eventType: 'checkout.agent_ops_attached',
    payload: { checkout_id: checkout.id, agent_ops_run_id: agentOpsRunId },
  })
  return checkout
}

export async function listActiveCheckouts(
  orgId: string,
  projectId?: string | null,
  limit = 50,
): Promise<WorkItemCheckout[]> {
  let query = supabase
    .from('work_item_checkouts')
    .select(CHECKOUT_COLUMNS)
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(Math.min(limit, 100))

  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) {
    captureDbError(error, 'list_active', 'work_item_checkouts')
    return []
  }
  return (data ?? []) as WorkItemCheckout[]
}

export async function attachWorkArtifactLink(
  orgId: string,
  input: WorkArtifactLinkCreate,
  actor: ActorInput = {},
): Promise<WorkArtifactLink | null> {
  const validated = WorkArtifactLinkCreateSchema.parse(input)
  if (validated.ref_table && !WORK_GRAPH_ALLOWED_ARTIFACT_REF_TABLES.has(validated.ref_table)) {
    throw new Error(`Unsupported artifact ref_table: ${validated.ref_table}`)
  }

  const { data, error } = await supabase
    .from('work_artifact_links')
    .insert({
      org_id: orgId,
      project_id: validated.project_id ?? null,
      goal_id: validated.goal_id ?? null,
      work_item_id: validated.work_item_id ?? null,
      artifact_type: validated.artifact_type,
      label: validated.label,
      url: validated.url ?? null,
      ref_table: validated.ref_table ?? null,
      ref_id: validated.ref_id ?? null,
      summary: validated.summary ?? null,
      metadata: validated.metadata ?? {},
      created_by: actor.actorUserId ?? null,
    })
    .select(ARTIFACT_LINK_COLUMNS)
    .single()

  if (error) {
    captureDbError(error, 'attach', 'work_artifact_links')
    return null
  }

  const link = data as WorkArtifactLink
  await appendWorkGraphEvent({
    orgId,
    projectId: link.project_id ?? null,
    goalId: link.goal_id ?? null,
    workItemId: link.work_item_id ?? null,
    actorKind: actor.actorKind ?? 'user',
    actorUserId: actor.actorUserId ?? null,
    actorAgentId: actor.actorAgentId ?? null,
    eventType: 'artifact_link.attached',
    payload: { artifact_link_id: link.id, artifact_type: link.artifact_type, ref_table: link.ref_table },
  })
  return link
}

export async function upsertWorkItemEngineFacet(
  orgId: string,
  input: {
    project_id?: string | null
    work_item_id: string
    engine?: string
    runtime_flavor?: 'shared' | 'dedicated' | 'byo' | null
    facet_key: string
    facet_state: Record<string, unknown>
    source_runtime_id?: string | null
    source_snapshot_id?: string | null
  },
  actor: ActorInput = {},
): Promise<WorkItemEngineFacet | null> {
  const { data, error } = await supabase
    .from('work_item_engine_facets')
    .upsert({
      org_id: orgId,
      project_id: input.project_id ?? null,
      work_item_id: input.work_item_id,
      engine: input.engine ?? 'lucid',
      runtime_flavor: input.runtime_flavor ?? null,
      facet_key: input.facet_key,
      facet_state: input.facet_state,
      source_runtime_id: input.source_runtime_id ?? null,
      source_snapshot_id: input.source_snapshot_id ?? null,
      observed_at: new Date().toISOString(),
    }, {
      onConflict: 'work_item_id,engine,facet_key',
    })
    .select(ENGINE_FACET_COLUMNS)
    .single()

  if (error) {
    captureDbError(error, 'upsert', 'work_item_engine_facets')
    return null
  }

  const facet = data as WorkItemEngineFacet
  await appendWorkGraphEvent({
    orgId,
    projectId: facet.project_id ?? null,
    workItemId: facet.work_item_id,
    actorKind: actor.actorKind ?? 'system',
    actorUserId: actor.actorUserId ?? null,
    actorAgentId: actor.actorAgentId ?? null,
    eventType: 'engine_facet.upserted',
    payload: { facet_id: facet.id, engine: facet.engine, facet_key: facet.facet_key },
  })
  return facet
}

export async function getWorkItemGraphContext(
  orgId: string,
  workItemId: string,
): Promise<WorkItemGraphContext | null> {
  const workItem = await getWorkItemById(workItemId)
  if (!workItem || workItem.org_id !== orgId) return null

  const [
    goalLinksResult,
    outgoingRelationsResult,
    incomingRelationsResult,
    checkoutsResult,
    artifactLinksResult,
    engineFacetsResult,
  ] = await Promise.all([
    supabase.from('work_item_goal_links').select('*, goal:work_goals(*)').eq('org_id', orgId).eq('work_item_id', workItemId),
    supabase.from('work_item_relations').select(RELATION_COLUMNS).eq('org_id', orgId).eq('source_work_item_id', workItemId),
    supabase.from('work_item_relations').select(RELATION_COLUMNS).eq('org_id', orgId).eq('target_work_item_id', workItemId),
    supabase.from('work_item_checkouts').select(CHECKOUT_COLUMNS).eq('org_id', orgId).eq('work_item_id', workItemId).eq('status', 'active').limit(1),
    supabase.from('work_artifact_links').select(ARTIFACT_LINK_COLUMNS).eq('org_id', orgId).eq('work_item_id', workItemId).order('created_at', { ascending: false }),
    supabase.from('work_item_engine_facets').select(ENGINE_FACET_COLUMNS).eq('org_id', orgId).eq('work_item_id', workItemId),
  ])

  const goalLinks = (goalLinksResult.data ?? []) as Array<{ goal?: WorkGoal | null } & Record<string, unknown>>
  return {
    workItem,
    goals: goalLinks.map((link) => link.goal).filter((goal): goal is WorkGoal => Boolean(goal)),
    goalLinks: goalLinks.map(({ goal: _goal, ...link }) => link) as WorkItemGraphContext['goalLinks'],
    outgoingRelations: (outgoingRelationsResult.data ?? []) as WorkItemRelation[],
    incomingRelations: (incomingRelationsResult.data ?? []) as WorkItemRelation[],
    activeCheckout: ((checkoutsResult.data ?? []) as WorkItemCheckout[])[0] ?? null,
    artifactLinks: (artifactLinksResult.data ?? []) as WorkItemGraphContext['artifactLinks'],
    engineFacets: (engineFacetsResult.data ?? []) as WorkItemGraphContext['engineFacets'],
  }
}

export async function listWorkGraphEvents(
  orgId: string,
  projectId?: string | null,
  limit = 50,
): Promise<WorkGraphEvent[]> {
  let query = supabase
    .from('work_graph_events')
    .select(EVENT_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 100))

  if (projectId) query = query.eq('project_id', projectId)
  const { data, error } = await query
  if (error) {
    captureDbError(error, 'list', 'work_graph_events')
    return []
  }
  return (data ?? []) as WorkGraphEvent[]
}

export async function createPlanningJob(
  orgId: string,
  input: {
    project_id?: string | null
    goal_id?: string | null
    source: WorkGraphPlanningJob['source']
    input: Record<string, unknown>
    model_policy?: Record<string, unknown>
  },
  actor: ActorInput = {},
): Promise<WorkGraphPlanningJob | null> {
  const { data, error } = await supabase
    .from('work_graph_planning_jobs')
    .insert({
      org_id: orgId,
      project_id: input.project_id ?? null,
      goal_id: input.goal_id ?? null,
      source: input.source,
      input: input.input,
      model_policy: input.model_policy ?? {},
      created_by: actor.actorUserId ?? null,
    })
    .select(PLANNING_JOB_COLUMNS)
    .single()

  if (error) {
    captureDbError(error, 'create', 'work_graph_planning_jobs')
    return null
  }

  const job = data as WorkGraphPlanningJob
  await appendWorkGraphEvent({
    orgId,
    projectId: job.project_id ?? null,
    goalId: job.goal_id ?? null,
    actorKind: actor.actorKind ?? 'user',
    actorUserId: actor.actorUserId ?? null,
    eventType: 'planning_job.created',
    payload: { planning_job_id: job.id, source: job.source },
  })
  return job
}

export async function updatePlanningJob(
  orgId: string,
  planningJobId: string,
  patch: {
    status?: WorkGraphPlanningJobStatus
    proposal?: Record<string, unknown> | null
    validation_errors?: Array<Record<string, unknown>>
    model_policy?: Record<string, unknown>
    started_at?: string | null
    completed_at?: string | null
  },
): Promise<WorkGraphPlanningJob | null> {
  const { data, error } = await supabase
    .from('work_graph_planning_jobs')
    .update(patch)
    .eq('org_id', orgId)
    .eq('id', planningJobId)
    .select(PLANNING_JOB_COLUMNS)
    .maybeSingle()

  if (error) {
    captureDbError(error, 'update', 'work_graph_planning_jobs')
    return null
  }
  return (data as WorkGraphPlanningJob) ?? null
}

export async function listPlanningJobs(
  orgId: string,
  projectId?: string | null,
  limit = 50,
): Promise<WorkGraphPlanningJob[]> {
  let query = supabase
    .from('work_graph_planning_jobs')
    .select(PLANNING_JOB_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 100))

  if (projectId) query = query.eq('project_id', projectId)
  const { data, error } = await query
  if (error) {
    captureDbError(error, 'list', 'work_graph_planning_jobs')
    return []
  }
  return (data ?? []) as WorkGraphPlanningJob[]
}

export async function getPlanningJob(
  orgId: string,
  planningJobId: string,
): Promise<WorkGraphPlanningJob | null> {
  const { data, error } = await supabase
    .from('work_graph_planning_jobs')
    .select(PLANNING_JOB_COLUMNS)
    .eq('org_id', orgId)
    .eq('id', planningJobId)
    .maybeSingle()

  if (error) {
    captureDbError(error, 'get', 'work_graph_planning_jobs')
    return null
  }
  return (data as WorkGraphPlanningJob) ?? null
}
