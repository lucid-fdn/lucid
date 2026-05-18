import {
  listTeamOpsSpecialistProfiles,
  type TeamOpsSpecialistCategory,
} from './team-ops'
import type {
  AgentOpsFindingSeverity,
  AgentOpsFindingStatus,
  AgentOpsRunStatus,
  AgentOpsWorkflowId,
} from './workflow-types'

export type AgentOpsSpecialistTelemetrySignal =
  | 'high_value'
  | 'watch'
  | 'needs_tuning'
  | 'insufficient_data'

export interface AgentOpsSpecialistTelemetryRunInput {
  id: string
  workflowId: AgentOpsWorkflowId | string
  status: AgentOpsRunStatus | string
  projectId?: string | null
  assistantId?: string | null
  latencyMs?: number | null
  costUsd?: number | null
  totalTokens?: number | null
  metadata?: Record<string, unknown> | null
  createdAt: string
}

export interface AgentOpsSpecialistTelemetryFindingInput {
  id: string
  runId: string
  severity: AgentOpsFindingSeverity
  status: AgentOpsFindingStatus
  confidence?: number | null
  metadata?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface AgentOpsSpecialistTelemetrySummary {
  slug: string
  name: string
  category: TeamOpsSpecialistCategory | 'unattributed'
  critical: boolean
  selectedCount: number
  runCount: number
  completedRunCount: number
  failedRunCount: number
  blockedRunCount: number
  findingCount: number
  openCount: number
  acceptedCount: number
  fixedCount: number
  dismissedCount: number
  needsInfoCount: number
  usefulFindingCount: number
  falsePositiveCount: number
  criticalFindingCount: number
  highSeverityFindingCount: number
  avgConfidence: number | null
  usefulnessRate: number | null
  avgLatencyMs: number | null
  totalCostUsd: number
  totalTokens: number
  lastSeenAt: string | null
  signal: AgentOpsSpecialistTelemetrySignal
  recommendation: string
}

interface MutableSpecialistTelemetrySummary extends AgentOpsSpecialistTelemetrySummary {
  confidenceSum: number
  confidenceCount: number
  latencySum: number
  latencyCount: number
}

interface SelectedSpecialist {
  slug: string
  name?: string
  category?: TeamOpsSpecialistCategory | string
  critical?: boolean
}

const UNATTRIBUTED_SPECIALIST = Object.freeze({
  slug: 'unattributed',
  name: 'Unattributed findings',
  category: 'unattributed',
  critical: false,
} satisfies SelectedSpecialist & { category: 'unattributed' })

export function summarizeAgentOpsSpecialistTelemetry(input: {
  runs: AgentOpsSpecialistTelemetryRunInput[]
  findings: AgentOpsSpecialistTelemetryFindingInput[]
  limit?: number
}): AgentOpsSpecialistTelemetrySummary[] {
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 50)
  const summaries = new Map<string, MutableSpecialistTelemetrySummary>()
  const runSpecialists = new Map<string, SelectedSpecialist[]>()

  for (const run of input.runs) {
    const selected = extractTeamOpsSpecialistsFromMetadata(run.metadata)
    runSpecialists.set(run.id, selected)
    for (const specialist of selected) {
      const summary = getOrCreateSpecialistSummary(summaries, specialist)
      summary.selectedCount += 1
      summary.runCount += 1
      if (run.status === 'completed') summary.completedRunCount += 1
      if (run.status === 'failed' || run.status === 'cancelled') summary.failedRunCount += 1
      if (run.status === 'blocked') summary.blockedRunCount += 1
      addRunMetrics(summary, run)
    }
  }

  for (const finding of input.findings) {
    const specialist = resolveFindingSpecialist(finding, runSpecialists.get(finding.runId) ?? [])
    const summary = getOrCreateSpecialistSummary(summaries, specialist)
    summary.findingCount += 1
    summary.lastSeenAt = latestTimestamp(summary.lastSeenAt, finding.updatedAt || finding.createdAt)
    if (finding.status === 'open') summary.openCount += 1
    if (finding.status === 'accepted') summary.acceptedCount += 1
    if (finding.status === 'fixed') summary.fixedCount += 1
    if (finding.status === 'dismissed') summary.dismissedCount += 1
    if (finding.status === 'needs_info') summary.needsInfoCount += 1
    if (finding.severity === 'critical') summary.criticalFindingCount += 1
    if (finding.severity === 'high') summary.highSeverityFindingCount += 1
    if (typeof finding.confidence === 'number' && Number.isFinite(finding.confidence)) {
      summary.confidenceSum += finding.confidence
      summary.confidenceCount += 1
    }
  }

  return [...summaries.values()]
    .map(finalizeSpecialistTelemetrySummary)
    .sort(compareSpecialistTelemetry)
    .slice(0, limit)
}

export function extractTeamOpsSpecialistsFromMetadata(metadata: Record<string, unknown> | null | undefined): SelectedSpecialist[] {
  const teamOps = readRecord(metadata?.team_ops)
  const specialists = Array.isArray(teamOps?.specialists) ? teamOps.specialists : []
  return specialists
    .map((item) => readSelectedSpecialist(item))
    .filter((item): item is SelectedSpecialist => Boolean(item))
}

function resolveFindingSpecialist(
  finding: AgentOpsSpecialistTelemetryFindingInput,
  selectedSpecialists: SelectedSpecialist[],
): SelectedSpecialist {
  const metadata = readRecord(finding.metadata)
  const slug = readString(metadata?.specialist)
    ?? readString(metadata?.specialist_slug)
    ?? readString(metadata?.team_ops_specialist)
    ?? readString(metadata?.review_specialist)

  if (slug) {
    const selected = selectedSpecialists.find((specialist) => specialist.slug === normalizeSpecialistSlug(slug))
    if (selected) return selected
    return profileForSlug(slug) ?? {
      slug: normalizeSpecialistSlug(slug),
      name: formatSpecialistName(slug),
      category: readString(metadata?.category) ?? undefined,
    }
  }

  if (selectedSpecialists.length === 1) return selectedSpecialists[0]
  return UNATTRIBUTED_SPECIALIST
}

function getOrCreateSpecialistSummary(
  summaries: Map<string, MutableSpecialistTelemetrySummary>,
  specialist: SelectedSpecialist,
): MutableSpecialistTelemetrySummary {
  const slug = normalizeSpecialistSlug(specialist.slug)
  const existing = summaries.get(slug)
  if (existing) return existing

  const profile = profileForSlug(slug)
  const summary: MutableSpecialistTelemetrySummary = {
    slug,
    name: specialist.name ?? profile?.name ?? formatSpecialistName(slug),
    category: normalizeCategory(specialist.category ?? profile?.category),
    critical: Boolean(specialist.critical ?? profile?.critical),
    selectedCount: 0,
    runCount: 0,
    completedRunCount: 0,
    failedRunCount: 0,
    blockedRunCount: 0,
    findingCount: 0,
    openCount: 0,
    acceptedCount: 0,
    fixedCount: 0,
    dismissedCount: 0,
    needsInfoCount: 0,
    usefulFindingCount: 0,
    falsePositiveCount: 0,
    criticalFindingCount: 0,
    highSeverityFindingCount: 0,
    avgConfidence: null,
    usefulnessRate: null,
    avgLatencyMs: null,
    totalCostUsd: 0,
    totalTokens: 0,
    lastSeenAt: null,
    signal: 'insufficient_data',
    recommendation: 'Collect more specialist evidence before tuning dispatch.',
    confidenceSum: 0,
    confidenceCount: 0,
    latencySum: 0,
    latencyCount: 0,
  }
  summaries.set(slug, summary)
  return summary
}

function addRunMetrics(summary: MutableSpecialistTelemetrySummary, run: AgentOpsSpecialistTelemetryRunInput): void {
  summary.lastSeenAt = latestTimestamp(summary.lastSeenAt, run.createdAt)
  if (typeof run.latencyMs === 'number' && Number.isFinite(run.latencyMs)) {
    summary.latencySum += run.latencyMs
    summary.latencyCount += 1
  }
  if (typeof run.costUsd === 'number' && Number.isFinite(run.costUsd)) {
    summary.totalCostUsd = roundMetric(summary.totalCostUsd + run.costUsd, 6)
  }
  if (typeof run.totalTokens === 'number' && Number.isFinite(run.totalTokens)) {
    summary.totalTokens += Math.round(run.totalTokens)
  }
}

function finalizeSpecialistTelemetrySummary(summary: MutableSpecialistTelemetrySummary): AgentOpsSpecialistTelemetrySummary {
  const usefulFindingCount = summary.acceptedCount + summary.fixedCount
  const falsePositiveCount = summary.dismissedCount
  const judgedCount = usefulFindingCount + falsePositiveCount + summary.needsInfoCount
  const avgConfidence = summary.confidenceCount > 0
    ? roundMetric(summary.confidenceSum / summary.confidenceCount, 4)
    : null
  const avgLatencyMs = summary.latencyCount > 0
    ? Math.round(summary.latencySum / summary.latencyCount)
    : null
  const usefulnessRate = judgedCount > 0
    ? Math.round((usefulFindingCount / judgedCount) * 100)
    : null
  const signal = chooseSpecialistTelemetrySignal({
    ...summary,
    usefulFindingCount,
    falsePositiveCount,
    avgConfidence,
    avgLatencyMs,
    usefulnessRate,
  })

  return {
    slug: summary.slug,
    name: summary.name,
    category: summary.category,
    critical: summary.critical,
    selectedCount: summary.selectedCount,
    runCount: summary.runCount,
    completedRunCount: summary.completedRunCount,
    failedRunCount: summary.failedRunCount,
    blockedRunCount: summary.blockedRunCount,
    findingCount: summary.findingCount,
    openCount: summary.openCount,
    acceptedCount: summary.acceptedCount,
    fixedCount: summary.fixedCount,
    dismissedCount: summary.dismissedCount,
    needsInfoCount: summary.needsInfoCount,
    usefulFindingCount,
    falsePositiveCount,
    criticalFindingCount: summary.criticalFindingCount,
    highSeverityFindingCount: summary.highSeverityFindingCount,
    avgConfidence,
    usefulnessRate,
    avgLatencyMs,
    totalCostUsd: roundMetric(summary.totalCostUsd, 6),
    totalTokens: summary.totalTokens,
    lastSeenAt: summary.lastSeenAt,
    signal,
    recommendation: recommendationForSignal(signal, summary.critical),
  }
}

function chooseSpecialistTelemetrySignal(summary: AgentOpsSpecialistTelemetrySummary): AgentOpsSpecialistTelemetrySignal {
  const judgedCount = summary.usefulFindingCount + summary.falsePositiveCount + summary.needsInfoCount
  if (summary.criticalFindingCount > 0 || summary.highSeverityFindingCount >= 2) return 'high_value'
  if (judgedCount < 3) {
    if (summary.selectedCount >= 5 && summary.findingCount === 0) return 'needs_tuning'
    return 'insufficient_data'
  }
  if ((summary.usefulnessRate ?? 0) >= 70 || summary.usefulFindingCount >= 3) return 'high_value'
  if ((summary.usefulnessRate ?? 0) < 35 || summary.falsePositiveCount >= 3) return 'needs_tuning'
  return 'watch'
}

function recommendationForSignal(signal: AgentOpsSpecialistTelemetrySignal, critical: boolean): string {
  if (critical && signal !== 'needs_tuning') return 'Keep enabled for guardrail coverage; tune only with explicit operator evidence.'
  if (signal === 'high_value') return 'Keep this specialist in the dispatch plan.'
  if (signal === 'needs_tuning') return 'Review prompts, evidence scope, or dispatch conditions before expanding usage.'
  if (signal === 'watch') return 'Keep observing outcomes before changing dispatch policy.'
  return 'Collect more accepted, fixed, or dismissed outcomes before making a routing decision.'
}

function compareSpecialistTelemetry(
  left: AgentOpsSpecialistTelemetrySummary,
  right: AgentOpsSpecialistTelemetrySummary,
): number {
  return (
    Number(right.critical) - Number(left.critical)
    || right.usefulFindingCount - left.usefulFindingCount
    || right.criticalFindingCount - left.criticalFindingCount
    || right.findingCount - left.findingCount
    || right.selectedCount - left.selectedCount
    || left.slug.localeCompare(right.slug)
  )
}

function readSelectedSpecialist(value: unknown): SelectedSpecialist | null {
  const record = readRecord(value)
  const slug = readString(record?.slug)
  if (!slug) return null
  return {
    slug: normalizeSpecialistSlug(slug),
    name: readString(record?.name) ?? undefined,
    category: readString(record?.category) ?? undefined,
    critical: typeof record?.critical === 'boolean' ? record.critical : undefined,
  }
}

function profileForSlug(slug: string): SelectedSpecialist | null {
  const normalized = normalizeSpecialistSlug(slug)
  const profile = listTeamOpsSpecialistProfiles().find((candidate) => candidate.slug === normalized)
  if (!profile) return null
  return {
    slug: profile.slug,
    name: profile.name,
    category: profile.category,
    critical: profile.critical,
  }
}

function normalizeSpecialistSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-')
}

function normalizeCategory(value: string | undefined): TeamOpsSpecialistCategory | 'unattributed' {
  return (value || 'unattributed').replace(/-/g, '_') as TeamOpsSpecialistCategory | 'unattributed'
}

function formatSpecialistName(slug: string): string {
  return normalizeSpecialistSlug(slug)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function latestTimestamp(current: string | null, candidate: string | null | undefined): string | null {
  if (!candidate) return current
  if (!current) return candidate
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function roundMetric(value: number, precision: number): number {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}
