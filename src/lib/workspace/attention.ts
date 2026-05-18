import 'server-only'

import type { PendingApproval } from '@/lib/mission-control/types'
import type { ProjectRecord } from '@/lib/db/projects'
import { getProjectsForWorkspace } from '@/lib/db/projects'
import {
  getProjectAttentionData,
  type ProjectAttentionData,
} from '@/lib/projects/attention'
import { summarizeCrewRuns } from '@/lib/teams/read-model'
import type {
  WorkItemLivenessIncident,
  WorkItemWithSignal,
} from '@/lib/work-items/signals'

const WORKSPACE_ATTENTION_BATCH_SIZE = 4

export interface WorkspaceAttentionSummary {
  projects: number
  approvals: number
  failedRuns: number
  activeRuns: number
  readyWorkItems: number
  blockedWorkItems: number
  livenessIncidents: number
  criticalEvents: number
}

export interface WorkspaceAttentionProject {
  projectId: string
  projectSlug: string
  projectName: string
  summary: ProjectAttentionData['summary']
  operatorLoad: number
  degradationScore: number
  trendDirection: 'improving' | 'worsening' | 'steady' | 'insufficient_data'
  recoveryStreak: number
  priorityScore: number
  priorityReason: string
  attentionCount: number
}

export interface WorkspaceAttentionWorkItem extends WorkItemWithSignal {
  projectId: string
  projectSlug: string
  projectName: string
}

export interface WorkspaceAttentionApproval extends PendingApproval {
  projectId: string
  projectSlug: string
  projectName: string
}

export interface WorkspaceAttentionIncident extends WorkItemLivenessIncident {
  projectId: string
  projectSlug: string
  projectName: string
}

export interface WorkspaceAttentionFailure {
  key: string
  title: string
  detail: string
  kind: 'crew_run' | 'event'
  projectId: string
  projectSlug: string
  projectName: string
}

function getProjectAttentionScore(summary: ProjectAttentionData['summary']) {
  return (
    summary.approvals
    + summary.failedRuns
    + summary.readyWorkItems
    + summary.livenessIncidents
    + summary.criticalEvents
  )
}

function getWorkspaceProjectPriority(attention: WorkspaceAttentionProjectSnapshot['attention']) {
  const crewHealth = summarizeCrewRuns(attention.recentCrewRuns)
  const operatorLoad =
    attention.summary.approvals
    + attention.summary.readyWorkItems
    + attention.summary.livenessIncidents
    + attention.summary.criticalEvents

  const degradationScore =
    attention.summary.failedRuns
    + attention.summary.criticalEvents
    + attention.summary.livenessIncidents
    + (crewHealth.trendDirection === 'worsening' ? 2 : 0)
    + (crewHealth.trendDirection === 'improving' ? -1 : 0)

  const priorityScore = operatorLoad + degradationScore
  const priorityReason =
    crewHealth.trendDirection === 'worsening'
      ? 'Degrading reliability trend with active operator load.'
      : attention.summary.livenessIncidents > 0 && attention.summary.failedRuns > 0
        ? 'Degrading reliability with stalled execution that needs intervention.'
      : attention.summary.livenessIncidents > 0
        ? 'Execution is stalled or orphaned and needs intervention.'
        : attention.summary.approvals > 0
          ? 'Approval debt is blocking forward progress.'
          : attention.summary.readyWorkItems > 0
            ? 'Operator-ready work is available to move now.'
            : 'Low current attention load.'

  return {
    operatorLoad,
    degradationScore,
    trendDirection: crewHealth.trendDirection,
    recoveryStreak: crewHealth.recoveryStreak,
    priorityScore,
    priorityReason,
  }
}

export interface WorkspaceAttentionProjectSnapshot {
  project: Pick<ProjectRecord, 'id' | 'slug' | 'name'>
  attention: Pick<
    ProjectAttentionData,
    | 'pendingApprovals'
    | 'readyWorkItems'
    | 'blockedWorkItems'
    | 'livenessIncidents'
    | 'failedCrewRuns'
    | 'failedEvents'
    | 'recentCrewRuns'
    | 'summary'
  >
}

export interface WorkspaceAttentionData {
  summary: WorkspaceAttentionSummary
  attentionCount: number
  projects: WorkspaceAttentionProject[]
  pendingApprovals: WorkspaceAttentionApproval[]
  readyWorkItems: WorkspaceAttentionWorkItem[]
  blockedWorkItems: WorkspaceAttentionWorkItem[]
  livenessIncidents: WorkspaceAttentionIncident[]
  failures: WorkspaceAttentionFailure[]
}

export function getWorkspaceAttentionCount(summary: WorkspaceAttentionSummary): number {
  return (
    summary.approvals
    + summary.failedRuns
    + summary.readyWorkItems
    + summary.livenessIncidents
    + summary.criticalEvents
  )
}

export function buildWorkspaceAttentionData(
  snapshots: WorkspaceAttentionProjectSnapshot[],
): WorkspaceAttentionData {
  const projects = snapshots
    .map(({ project, attention }) => ({
      projectId: project.id,
      projectSlug: project.slug,
      projectName: project.name,
      summary: attention.summary,
      attentionCount: getProjectAttentionScore(attention.summary),
      ...getWorkspaceProjectPriority(attention),
    }))
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore
      if (b.degradationScore !== a.degradationScore) return b.degradationScore - a.degradationScore
      if (b.operatorLoad !== a.operatorLoad) return b.operatorLoad - a.operatorLoad
      return a.projectName.localeCompare(b.projectName)
    })

  const pendingApprovals = snapshots
    .flatMap(({ project, attention }) =>
      attention.pendingApprovals.map((approval) => ({
        ...approval,
        projectId: project.id,
        projectSlug: project.slug,
        projectName: project.name,
      })),
    )
    .sort(
      (a, b) =>
        new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime(),
    )

  const readyWorkItems = snapshots
    .flatMap(({ project, attention }) =>
      attention.readyWorkItems.map((item) => ({
        ...item,
        projectId: project.id,
        projectSlug: project.slug,
        projectName: project.name,
      })),
    )
    .sort((a, b) => {
      const dueDelta =
        new Date(a.due_at ?? '9999-12-31T00:00:00.000Z').getTime()
        - new Date(b.due_at ?? '9999-12-31T00:00:00.000Z').getTime()
      if (dueDelta !== 0) return dueDelta
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })

  const blockedWorkItems = snapshots
    .flatMap(({ project, attention }) =>
      attention.blockedWorkItems.map((item) => ({
        ...item,
        projectId: project.id,
        projectSlug: project.slug,
        projectName: project.name,
      })),
    )
    .sort((a, b) => {
      const stalledDelta = Number(b.signal.stalled) - Number(a.signal.stalled)
      if (stalledDelta !== 0) return stalledDelta
      return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
    })

  const livenessIncidents = snapshots
    .flatMap(({ project, attention }) =>
      attention.livenessIncidents.map((incident) => ({
        ...incident,
        projectId: project.id,
        projectSlug: project.slug,
        projectName: project.name,
      })),
    )
    .sort((a, b) => {
      const severityRank = (severity: string) =>
        severity === 'critical' ? 3 : severity === 'warn' ? 2 : 1
      const severityDelta = severityRank(b.severity) - severityRank(a.severity)
      if (severityDelta !== 0) return severityDelta
      return a.projectName.localeCompare(b.projectName)
    })

  const failures = snapshots
    .flatMap(({ project, attention }) => [
      ...attention.failedCrewRuns.map((run) => ({
        key: `crew-run:${run.id}`,
        title: `${run.crewName} failed`,
        detail: run.error_message || 'Team run failed and needs review.',
        kind: 'crew_run' as const,
        projectId: project.id,
        projectSlug: project.slug,
        projectName: project.name,
      })),
      ...attention.failedEvents.map((event) => ({
        key: `event:${event.id}`,
        title: event.agent_name || 'Agent failure',
        detail: event.event_type.replace(/_/g, ' '),
        kind: 'event' as const,
        projectId: project.id,
        projectSlug: project.slug,
        projectName: project.name,
      })),
    ])
    .sort((a, b) => a.projectName.localeCompare(b.projectName))

  const summary: WorkspaceAttentionSummary = {
    projects: snapshots.length,
    approvals: pendingApprovals.length,
    failedRuns: failures.length,
    activeRuns: snapshots.reduce((sum, snapshot) => sum + snapshot.attention.summary.activeRuns, 0),
    readyWorkItems: readyWorkItems.length,
    blockedWorkItems: blockedWorkItems.length,
    livenessIncidents: livenessIncidents.length,
    criticalEvents: snapshots.reduce(
      (sum, snapshot) => sum + snapshot.attention.summary.criticalEvents,
      0,
    ),
  }

  return {
    summary,
    attentionCount: getWorkspaceAttentionCount(summary),
    projects,
    pendingApprovals,
    readyWorkItems,
    blockedWorkItems,
    livenessIncidents,
    failures,
  }
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize)
    const batchResults = await Promise.all(batch.map((item) => mapper(item)))
    results.push(...batchResults)
  }

  return results
}

export async function getWorkspaceAttentionData(orgId: string): Promise<WorkspaceAttentionData> {
  const projects = await getProjectsForWorkspace(orgId)

  const snapshots = await mapInBatches(projects, WORKSPACE_ATTENTION_BATCH_SIZE, async (project) => ({
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
    },
    attention: await getProjectAttentionData(orgId, project.id),
  }))

  return buildWorkspaceAttentionData(snapshots)
}
