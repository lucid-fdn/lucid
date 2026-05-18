import 'server-only'

import { getProjectResourceCounts } from '@/lib/db/projects'
import { buildAgentUiProjectionMap } from '@/lib/agents/ui-projection'
import { getRuntimeModePresentation, summarizeRuntimePackaging, type RuntimePackagingSummary } from '@/lib/engines/presentation'
import { getProjectAttentionData, type ProjectAttentionData } from '@/lib/projects/attention'
import { deriveProjectProofLoop, type ProjectProofLoop } from '@/lib/projects/proof'
import { summarizeCrewRuns } from '@/lib/teams/read-model'

export interface ProjectOperationalMetrics {
  operatorLoad: number
  activeIncidentCount: number
  crewFailureRate: number | null
  crewRecoveryRate: number | null
  crewIncidentRate: number | null
  crewTrendDirection: 'improving' | 'worsening' | 'steady' | 'insufficient_data'
  crewTrendSummary: string
  recoveryStreak: number
}

export interface ProjectOverviewProjection {
  counts: Awaited<ReturnType<typeof getProjectResourceCounts>>
  attention: ProjectAttentionData
  activeAgents: number
  metrics: ProjectOperationalMetrics
  runtimeCounts: {
    shared: number
    managed: number
    byo: number
  }
  runtimePackaging: RuntimePackagingSummary
  proofLoop: ProjectProofLoop
  agentProjectionById: ReturnType<typeof buildAgentUiProjectionMap>
}

export function buildProjectOverviewProjection({
  counts,
  attention,
}: {
  counts: Awaited<ReturnType<typeof getProjectResourceCounts>>
  attention: ProjectAttentionData
}): ProjectOverviewProjection {
  const projectFeedEvents = attention.projectFeedEvents ?? []
  const activeAgents = attention.assistants.filter((assistant) => assistant.is_active !== false).length
  const crewHealth = summarizeCrewRuns(attention.recentCrewRuns)
  const shared = attention.assistants.filter((assistant) => (assistant.runtime_flavor ?? 'shared') === 'shared').length
  const managed = attention.assistants.filter((assistant) => assistant.runtime_flavor === 'c1_managed').length
  const byo = attention.assistants.filter((assistant) => assistant.runtime_flavor === 'c2a_autonomous').length
  const sharedRuntime = getRuntimeModePresentation({ runtimeFlavor: 'shared' })
  const managedRuntime = getRuntimeModePresentation({ runtimeFlavor: 'c1_managed', runtimeTier: 'dedicated' })
  const byoRuntime = getRuntimeModePresentation({ runtimeFlavor: 'c2a_autonomous', runtimeTier: 'byo' })
  const runtimePackaging = summarizeRuntimePackaging([
    ...Array.from({ length: shared }, () => sharedRuntime),
    ...Array.from({ length: managed }, () => managedRuntime),
    ...Array.from({ length: byo }, () => byoRuntime),
  ])

  return {
    counts,
    attention,
    activeAgents,
    metrics: {
      operatorLoad:
        attention.summary.approvals
        + attention.summary.readyWorkItems
        + attention.summary.livenessIncidents
        + attention.summary.criticalEvents,
      activeIncidentCount:
        attention.summary.livenessIncidents
        + attention.summary.criticalEvents
        + attention.summary.failedRuns,
      crewFailureRate: crewHealth.failureRate,
      crewRecoveryRate: crewHealth.recoveryRate,
      crewIncidentRate: crewHealth.incidentRate,
      crewTrendDirection: crewHealth.trendDirection,
      crewTrendSummary: crewHealth.trendSummary,
      recoveryStreak: crewHealth.recoveryStreak,
    },
    runtimeCounts: {
      shared,
      managed,
      byo,
    },
    runtimePackaging,
    proofLoop: deriveProjectProofLoop({
      assistantCount: counts.assistants,
      recentEventCount: projectFeedEvents.length,
      attention: attention.summary,
      runtimePackaging,
    }),
    agentProjectionById: buildAgentUiProjectionMap({
      agents: attention.assistants,
      feedEvents: projectFeedEvents,
      approvals: attention.pendingApprovals,
    }),
  }
}

export async function getProjectOverviewProjection(
  orgId: string,
  projectId: string,
): Promise<ProjectOverviewProjection> {
  const [counts, attention] = await Promise.all([
    getProjectResourceCounts(orgId, projectId),
    getProjectAttentionData(orgId, projectId),
  ])

  return buildProjectOverviewProjection({
    counts,
    attention,
  })
}
