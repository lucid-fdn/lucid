import type { CrewEdge, CrewMember, CrewRun } from '@contracts/crew'
import type { Agent } from '@/types/agent'
import { getRuntimeModePresentation, summarizeRuntimePackaging } from '@/lib/engines/presentation'
import {
  deriveCrewRunContinuation,
  type ContinuationHandoff,
} from '@/lib/runs/continuation'

export interface CrewHealthSummary {
  totalRuns: number
  resolvedRuns: number
  activeRuns: number
  failedRuns: number
  cancelledRuns: number
  successRate: number | null
  failureRate: number | null
  recoveryRate: number | null
  recentFailureRate: number | null
  incidentRate: number | null
  recentResolvedRuns: number
  recentRecoveryCount: number
  recoveryStreak: number
  trendDirection: 'improving' | 'worsening' | 'steady' | 'insufficient_data'
  trendSummary: string
  averageCost: number
  averageDurationMinutes: number
}

export interface CrewConnectionSummary {
  memberId: string
  outboundCount: number
  inboundCount: number
}

export interface CrewRuntimeSummary {
  uniqueModes: string[]
  primaryMode: string | null
  primaryDescription: string | null
  operatorLabel: string | null
  alignmentLabel: string
  guidance: string
  assistedMembers: number
  sharedCount: number
  managedCount: number
  byoCount: number
}

export interface CrewInterventionRecord {
  runId: string
  status: CrewRun['status']
  startedAt: string
  completedAt: string | null
  title: string
  detail: string
  fingerprint: string
  recurring: boolean
  handoff: ContinuationHandoff | null
}

export interface CrewInterventionHistory {
  totalInterventions: number
  activeIncidents: number
  failedRuns: number
  cancelledRuns: number
  recurringIncidentCount: number
  consecutiveFailureCount: number
  latestFailureAt: string | null
  incidents: CrewInterventionRecord[]
}

function normalizeInterventionFingerprint(run: CrewRun) {
  const seed = run.error_message ?? run.outcome_summary ?? run.status

  return `${run.status}:${seed}`
    .toLowerCase()
    .replace(/[0-9a-f]{8,}/g, ':id')
    .replace(/\d+/g, ':n')
    .replace(/\s+/g, ' ')
    .trim()
}

export function summarizeCrewRuns(runs: CrewRun[]): CrewHealthSummary {
  const completedRuns = runs.filter((run) => run.status === 'completed')
  const failedRuns = runs.filter((run) => run.status === 'failed' || run.status === 'cancelled')
  const cancelledRuns = runs.filter((run) => run.status === 'cancelled')
  const resolvedRuns = completedRuns.length + failedRuns.length
  const incidentRuns = runs.filter((run) =>
    run.status === 'failed'
    || run.status === 'cancelled'
    || run.status === 'starting'
    || run.status === 'running',
  )
  const chronologicalRuns = [...runs].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
  )
  let recoveredFailures = 0

  for (let index = 0; index < chronologicalRuns.length; index += 1) {
    const run = chronologicalRuns[index]
    if (run.status !== 'failed' && run.status !== 'cancelled') continue

    const recovered = chronologicalRuns
      .slice(index + 1)
      .some((candidate) => candidate.status === 'completed')

    if (recovered) recoveredFailures += 1
  }

  const recentResolvedRuns = [...chronologicalRuns]
    .filter((run) => run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled')
    .slice(-5)
  const recentFailures = recentResolvedRuns.filter(
    (run) => run.status === 'failed' || run.status === 'cancelled',
  ).length
  let recentRecoveryCount = 0

  for (let index = 0; index < recentResolvedRuns.length; index += 1) {
    const run = recentResolvedRuns[index]
    if (run.status !== 'failed' && run.status !== 'cancelled') continue

    const recovered = recentResolvedRuns
      .slice(index + 1)
      .some((candidate) => candidate.status === 'completed')

    if (recovered) recentRecoveryCount += 1
  }

  let recoveryStreak = 0
  for (const run of [...chronologicalRuns].reverse()) {
    if (run.status === 'completed') {
      recoveryStreak += 1
      continue
    }
    if (run.status === 'failed' || run.status === 'cancelled') break
  }

  let trendDirection: CrewHealthSummary['trendDirection'] = 'insufficient_data'
  if (recentResolvedRuns.length > 0 && resolvedRuns > 0) {
    const currentFailureRate = Math.round((recentFailures / recentResolvedRuns.length) * 100)
    const baselineFailureRate = Math.round((failedRuns.length / resolvedRuns) * 100)
    const delta = currentFailureRate - baselineFailureRate

    if (Math.abs(delta) <= 10) {
      trendDirection = 'steady'
    } else if (delta < 0) {
      trendDirection = 'improving'
    } else {
      trendDirection = 'worsening'
    }
  }

  const trendSummary =
    trendDirection === 'insufficient_data'
      ? 'Not enough resolved runs to establish a reliability trend yet.'
      : trendDirection === 'improving'
        ? `Recent failures are below the overall baseline across the last ${recentResolvedRuns.length} resolved runs.`
        : trendDirection === 'worsening'
          ? `Recent failures are above the overall baseline across the last ${recentResolvedRuns.length} resolved runs.`
          : `Recent reliability is tracking close to the overall baseline across the last ${recentResolvedRuns.length} resolved runs.`

  return {
    totalRuns: runs.length,
    resolvedRuns,
    activeRuns: runs.filter((run) => run.status === 'starting' || run.status === 'running').length,
    failedRuns: runs.filter((run) => run.status === 'failed').length,
    cancelledRuns: cancelledRuns.length,
    successRate: resolvedRuns > 0 ? Math.round((completedRuns.length / resolvedRuns) * 100) : null,
    failureRate: resolvedRuns > 0 ? Math.round((failedRuns.length / resolvedRuns) * 100) : null,
    recoveryRate: failedRuns.length > 0 ? Math.round((recoveredFailures / failedRuns.length) * 100) : null,
    recentFailureRate:
      recentResolvedRuns.length > 0 ? Math.round((recentFailures / recentResolvedRuns.length) * 100) : null,
    incidentRate: runs.length > 0 ? Math.round((incidentRuns.length / runs.length) * 100) : null,
    recentResolvedRuns: recentResolvedRuns.length,
    recentRecoveryCount,
    recoveryStreak,
    trendDirection,
    trendSummary,
    averageCost:
      runs.length > 0
        ? runs.reduce((sum, run) => sum + Number(run.total_cost_usd ?? 0), 0) / runs.length
        : 0,
    averageDurationMinutes:
      runs.length > 0
        ? runs.reduce((sum, run) => {
            const end = run.completed_at ? new Date(run.completed_at).getTime() : Date.now()
            return sum + Math.max(0, end - new Date(run.started_at).getTime())
          }, 0) /
          runs.length /
          60_000
        : 0,
  }
}

export function summarizeCrewConnections(
  members: CrewMember[],
  edges: CrewEdge[],
): CrewConnectionSummary[] {
  return members.map((member) => ({
    memberId: member.id,
    outboundCount: edges.filter((edge) => edge.source_member_id === member.id).length,
    inboundCount: edges.filter((edge) => edge.target_member_id === member.id).length,
  }))
}

export function summarizeCrewRuntimeModes(
  members: CrewMember[],
  assistants: Agent[],
): CrewRuntimeSummary {
  const assistantsById = new Map(assistants.map((assistant) => [assistant.id, assistant]))
  const modePresentations: Array<ReturnType<typeof getRuntimeModePresentation>> = []

  let assistedMembers = 0

  for (const member of members) {
    const assistantId = member.assistant_id ?? member.member_ref_id
    if (!assistantId) continue

    const assistant = assistantsById.get(assistantId)
    if (!assistant) continue

    assistedMembers += 1

    const runtimeFlavor =
      assistant.runtime_flavor ?? (assistant.runtime_id ? 'c1_managed' : 'shared')
    const runtimeMode = getRuntimeModePresentation({
      runtimeFlavor,
      runtimeTier:
        runtimeFlavor === 'c2a_autonomous'
          ? 'byo'
          : runtimeFlavor === 'c1_managed'
            ? 'dedicated'
            : null,
    })

    modePresentations.push(runtimeMode)
  }

  const packaging = summarizeRuntimePackaging(modePresentations)

  return {
    uniqueModes: [...new Set(modePresentations.map((mode) => mode.title))],
    primaryMode: packaging.primaryTitle,
    primaryDescription: packaging.primaryDescription,
    operatorLabel: packaging.operatorLabel,
    alignmentLabel: packaging.alignmentLabel,
    guidance: packaging.guidance,
    assistedMembers,
    sharedCount: packaging.sharedCount,
    managedCount: packaging.managedCount,
    byoCount: packaging.byoCount,
  }
}

export function summarizeCrewInterventions(runs: CrewRun[]): CrewInterventionHistory {
  const incidentRuns = [...runs]
    .filter(
      (run) =>
        run.status === 'failed'
        || run.status === 'cancelled'
        || run.status === 'starting'
        || run.status === 'running',
    )
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())

  const fingerprints = new Map<string, number>()
  for (const run of incidentRuns) {
    const fingerprint = normalizeInterventionFingerprint(run)
    fingerprints.set(fingerprint, (fingerprints.get(fingerprint) ?? 0) + 1)
  }

  const incidents = incidentRuns.map((run) => {
    const fingerprint = normalizeInterventionFingerprint(run)
    const handoff = deriveCrewRunContinuation(run)

    return {
      runId: run.id,
      status: run.status,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      title:
        run.status === 'failed'
          ? 'Failed team run'
          : run.status === 'cancelled'
            ? 'Cancelled team run'
            : 'Active team run',
      detail:
        run.error_message
        ?? run.outcome_summary
        ?? (run.status === 'running' || run.status === 'starting'
          ? 'This run is still active. Review member state and runtime health before intervening.'
          : 'No additional operator note was captured for this run.'),
      fingerprint,
      recurring: (fingerprints.get(fingerprint) ?? 0) > 1,
      handoff,
    } satisfies CrewInterventionRecord
  })

  let consecutiveFailureCount = 0
  for (const run of [...runs].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())) {
    if (run.status === 'failed' || run.status === 'cancelled') {
      consecutiveFailureCount += 1
      continue
    }
    if (run.status === 'completed') break
  }

  const latestFailure = incidentRuns.find((run) => run.status === 'failed' || run.status === 'cancelled') ?? null

  return {
    totalInterventions: incidents.length,
    activeIncidents: incidents.filter((incident) => incident.status === 'starting' || incident.status === 'running').length,
    failedRuns: incidents.filter((incident) => incident.status === 'failed').length,
    cancelledRuns: incidents.filter((incident) => incident.status === 'cancelled').length,
    recurringIncidentCount: incidents.filter((incident) => incident.recurring).length,
    consecutiveFailureCount,
    latestFailureAt: latestFailure?.started_at ?? null,
    incidents: incidents.slice(0, 8),
  }
}
