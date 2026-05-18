import 'server-only'

import type { FeedEvent, PendingApproval } from '@/lib/mission-control/types'
import type { CrewRun } from '@contracts/crew'
import { getAssistantsByProject, getMCFeedEvents, getPendingApprovals, listWorkItemsForOrg } from '@/lib/db'
import { getCrewsByProject, getCrewRuns } from '@/lib/db/crews'
import { ErrorService } from '@/lib/db/client'
import {
  buildWorkItemLivenessIncidents,
  enrichWorkItemsWithSignals,
  type WorkItemLivenessIncident,
  type WorkItemWithSignal,
} from '@/lib/work-items/signals'

export interface ProjectAttentionData {
  assistants: Awaited<ReturnType<typeof getAssistantsByProject>>
  projectAgentIds: string[]
  projectFeedEvents: FeedEvent[]
  pendingApprovals: PendingApproval[]
  failedEvents: FeedEvent[]
  criticalEvents: FeedEvent[]
  openWorkItems: WorkItemWithSignal[]
  readyWorkItems: WorkItemWithSignal[]
  blockedWorkItems: WorkItemWithSignal[]
  livenessIncidents: WorkItemLivenessIncident[]
  activeCrewRuns: Array<CrewRun & { crewName: string }>
  failedCrewRuns: Array<CrewRun & { crewName: string }>
  recentCrewRuns: Array<CrewRun & { crewName: string }>
  summary: {
    approvals: number
    failedRuns: number
    activeRuns: number
    openWorkItems: number
    readyWorkItems: number
    blockedWorkItems: number
    livenessIncidents: number
    criticalEvents: number
  }
}

const PROJECT_ATTENTION_TIMEOUT_MS = 8_000

function isFailureEvent(event: FeedEvent) {
  return (
    event.severity === 'error' ||
    event.severity === 'critical' ||
    event.event_type === 'task_failed' ||
    event.event_type === 'crew_run_failed' ||
    event.event_type === 'crew_member_failed'
  )
}

function isCriticalEvent(event: FeedEvent) {
  return event.severity === 'critical' || event.severity === 'error'
}

async function withAttentionTimeout<T>(
  operation: Promise<T>,
  fallback: T,
  context: Record<string, unknown>,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null

  try {
    return await Promise.race([
      operation,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), PROJECT_ATTENTION_TIMEOUT_MS)
      }),
    ])
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        fn: 'withAttentionTimeout',
        ...context,
      },
      tags: {
        layer: 'projects',
        area: 'attention',
      },
    })
    return fallback
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function getProjectAttentionData(
  orgId: string,
  projectId: string,
): Promise<ProjectAttentionData> {
  const assistants = await getAssistantsByProject(orgId, projectId)
  const projectAgentIds = assistants.map((assistant) => assistant.id)

  const [approvals, feedEvents, workItems, crews] = await Promise.all([
    withAttentionTimeout(getPendingApprovals(orgId).catch(() => []), [], {
      op: 'approvals',
      orgId,
      projectId,
    }),
    withAttentionTimeout(getMCFeedEvents(orgId, { limit: 100 }).catch(() => []), [], {
      op: 'feed-events',
      orgId,
      projectId,
    }),
    withAttentionTimeout(
      projectAgentIds.length > 0
        ? listWorkItemsForOrg(orgId, {
            status: ['open', 'in_progress', 'waiting'],
            agentIds: projectAgentIds,
            limit: 100,
          }).catch(() => [])
        : Promise.resolve([]),
      [],
      {
        op: 'work-items',
        orgId,
        projectId,
      },
    ),
    withAttentionTimeout(getCrewsByProject(orgId, projectId).catch(() => []), [], {
      op: 'crews',
      orgId,
      projectId,
    }),
  ])

  const projectAgentIdSet = new Set(projectAgentIds)
  const pendingApprovals = approvals.filter((approval) => projectAgentIdSet.has(approval.agent_id))
  const projectFeedEvents = feedEvents.filter((event) => projectAgentIdSet.has(event.agent_id))
  const failedEvents = projectFeedEvents.filter(isFailureEvent).slice(0, 12)
  const criticalEvents = projectFeedEvents.filter(isCriticalEvent).slice(0, 12)
  const openWorkItems = await enrichWorkItemsWithSignals(workItems)
  const readyWorkItems = openWorkItems.filter((item) => item.signal.readyForOperator)
  const blockedWorkItems = openWorkItems.filter(
    (item) => item.signal.state === 'blocked' || item.signal.state === 'waiting',
  )
  const livenessIncidents = buildWorkItemLivenessIncidents(openWorkItems)

  const crewRunsByCrew = await withAttentionTimeout(
    Promise.all(
      crews.map(async (crew) => ({
        crew,
        runs: await getCrewRuns(crew.id).catch(() => [] as CrewRun[]),
      })),
    ),
    [],
    {
      op: 'crew-runs',
      orgId,
      projectId,
      crewCount: crews.length,
    },
  )

  const recentCrewRuns = crewRunsByCrew
    .flatMap(({ crew, runs }) =>
      runs.map((run) => ({
        ...run,
        crewName: crew.name,
      })),
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const activeCrewRuns = recentCrewRuns.filter((run) => run.status === 'starting' || run.status === 'running')
  const failedCrewRuns = recentCrewRuns.filter((run) => run.status === 'failed')

  return {
    assistants,
    projectAgentIds,
    projectFeedEvents,
    pendingApprovals,
    failedEvents,
    criticalEvents,
    openWorkItems,
    readyWorkItems,
    blockedWorkItems,
    livenessIncidents,
    activeCrewRuns,
    failedCrewRuns,
    recentCrewRuns: recentCrewRuns.slice(0, 12),
    summary: {
      approvals: pendingApprovals.length,
      failedRuns: failedCrewRuns.length + failedEvents.length,
      activeRuns: activeCrewRuns.length,
      openWorkItems: openWorkItems.length,
      readyWorkItems: readyWorkItems.length,
      blockedWorkItems: blockedWorkItems.length,
      livenessIncidents: livenessIncidents.length,
      criticalEvents: criticalEvents.length,
    },
  }
}
