import 'server-only'

import {
  getAssistantsByProject,
  getDagContextForWorkItem,
  getMCFeedEvents,
  getWorkItemById,
  listWorkItemEvents,
  listWorkItemsForOrg,
  listOrgPmConfigs,
  type WorkItemEvent,
  type DagContextForWorkItem,
} from '@/lib/db'
import {
  getWorkBoardReadModel,
  getWorkItemGraphContext,
  listWorkGraphOverview,
  type WorkBoardReadModel,
  projectPmConfigToWorkGraphStatus,
  type WorkGraphOverview,
  type WorkGraphPmProviderStatus,
  type WorkItemGraphContext,
} from '@/lib/work-graph'
import {
  buildWorkItemLivenessIncidents,
  enrichWorkItemsWithSignals,
  type WorkItemLivenessIncident,
  type WorkItemWithSignal,
} from '@/lib/work-items/signals'
import { isFeatureEnabled, isWorkGraphKillSwitchActive } from '@/lib/features'

export interface ProjectWorkData {
  agents: Array<{ id: string; name: string }>
  agentIds: string[]
  items: WorkItemWithSignal[]
  workGraph: WorkGraphOverview
  workGraphBoards: WorkBoardReadModel[]
  pmFederation: WorkGraphPmProviderStatus[]
  livenessIncidents: WorkItemLivenessIncident[]
  summary: {
    open: number
    inProgress: number
    waiting: number
    overdue: number
    approvals: number
    ready: number
    claimed: number
    blocked: number
    stalled: number
  }
}

export interface ProjectWorkDetailData extends ProjectWorkData {
  item: WorkItemWithSignal | null
  events: WorkItemEvent[]
  dagContext: DagContextForWorkItem | null
  linkedRunEvents: Awaited<ReturnType<typeof getMCFeedEvents>>
  workGraphContext: WorkItemGraphContext | null
}

function emptyWorkGraphOverview(): WorkGraphOverview {
  return {
    goals: [],
    boards: [],
    openCheckouts: [],
    recentEvents: [],
    planningJobs: [],
  }
}

function isWorkGraphReadable(): boolean {
  return isFeatureEnabled('workGraph') && !isWorkGraphKillSwitchActive()
}

export async function getProjectWorkData(orgId: string, projectId: string): Promise<ProjectWorkData> {
  const assistants = await getAssistantsByProject(orgId, projectId)
  const agentIds = assistants.map((assistant) => assistant.id)
  const items =
    agentIds.length > 0
      ? await listWorkItemsForOrg(orgId, {
          status: ['open', 'in_progress', 'waiting'],
          agentIds,
          limit: 100,
        })
      : []
  const includeWorkGraph = isWorkGraphReadable()
  const [enrichedItems, workGraph, pmConfigs] = await Promise.all([
    enrichWorkItemsWithSignals(items),
    includeWorkGraph ? listWorkGraphOverview(orgId, projectId, 25) : Promise.resolve(emptyWorkGraphOverview()),
    includeWorkGraph ? listOrgPmConfigs(orgId) : Promise.resolve([]),
  ])
  const workGraphBoards = includeWorkGraph
    ? (await Promise.all(
        workGraph.boards.slice(0, 3).map((board) => getWorkBoardReadModel(orgId, board.id)),
      )).filter((board): board is WorkBoardReadModel => Boolean(board))
    : []
  const livenessIncidents = buildWorkItemLivenessIncidents(enrichedItems)

  const now = Date.now()

  return {
    agents: assistants.map((assistant) => ({ id: assistant.id, name: assistant.name })),
    agentIds,
    items: enrichedItems,
    workGraph,
    workGraphBoards,
    pmFederation: pmConfigs.map(projectPmConfigToWorkGraphStatus),
    livenessIncidents,
    summary: {
      open: enrichedItems.filter((item) => item.status === 'open').length,
      inProgress: enrichedItems.filter((item) => item.status === 'in_progress').length,
      waiting: enrichedItems.filter((item) => item.status === 'waiting').length,
      overdue: enrichedItems.filter((item) => item.due_at && new Date(item.due_at).getTime() < now).length,
      approvals: enrichedItems.filter((item) => {
        const approvalId =
          item.external_mirror &&
          typeof item.external_mirror === 'object' &&
          typeof (item.external_mirror as Record<string, unknown>).approval_id === 'string'
        return approvalId
      }).length,
      ready: enrichedItems.filter((item) => item.signal.readyForOperator).length,
      claimed: enrichedItems.filter((item) => item.signal.state === 'claimed').length,
      blocked: enrichedItems.filter((item) => item.signal.state === 'blocked' || item.signal.state === 'waiting').length,
      stalled: livenessIncidents.filter((incident) =>
        incident.type === 'stalled_claimed_work' || incident.type === 'stalled_waiting_work',
      ).length,
    },
  }
}

export async function getProjectWorkDetailData(
  orgId: string,
  projectId: string,
  itemId: string,
): Promise<ProjectWorkDetailData> {
  const base = await getProjectWorkData(orgId, projectId)
  const item = await getWorkItemById(itemId)

  if (!item || !item.agent_id || !base.agentIds.includes(item.agent_id)) {
    return {
      ...base,
      item: null,
      events: [],
      dagContext: null,
      linkedRunEvents: [],
      workGraphContext: null,
    }
  }
  const [enrichedItem] = await enrichWorkItemsWithSignals([item])

  const [events, dagContext, linkedRunEvents, workGraphContext] = await Promise.all([
    listWorkItemEvents(itemId, 100),
    item.kind === 'nerve_node' && item.dag_id && item.dag_node_id
      ? getDagContextForWorkItem(item.dag_id, item.dag_node_id)
      : Promise.resolve(null),
    item.pulse_job_run_id && item.agent_id
      ? getMCFeedEvents(orgId, { limit: 50, agentId: item.agent_id }).then((feedEvents) =>
          feedEvents.filter((event) => event.run_id === item.pulse_job_run_id),
        )
      : Promise.resolve([]),
    isWorkGraphReadable() ? getWorkItemGraphContext(orgId, itemId) : Promise.resolve(null),
  ])

  return {
    ...base,
    item: enrichedItem ?? null,
    events,
    dagContext,
    linkedRunEvents,
    workGraphContext,
  }
}
