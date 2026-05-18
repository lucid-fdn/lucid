import 'server-only'

import type {
  KnowledgeTrajectoryPoint,
  KnowledgeTrajectoryRegression,
  KnowledgeTrajectoryResult,
} from '@contracts/knowledge-intelligence'
import type { KnowledgeClaim } from '@contracts/knowledge-claims'
import { listKnowledgeMetricClaims } from '@/lib/db/knowledge-claims'

const DEFAULT_REGRESSION_THRESHOLD = 0.1

export interface FindKnowledgeTrajectoryInput {
  orgId: string
  subject: string
  metric?: string | null
  projectId?: string | null
  teamId?: string | null
  assistantId?: string | null
  since?: string | null
  until?: string | null
  limit?: number
}

export function normalizeTrajectoryMetric(label: string): string {
  return label.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '')
}

export function claimToTrajectoryPoint(claim: KnowledgeClaim): KnowledgeTrajectoryPoint | null {
  if (!claim.claimMetric || claim.claimValue === null || claim.claimValue === undefined || !Number.isFinite(claim.claimValue)) {
    return null
  }
  return {
    claimId: claim.id,
    subject: claim.subject,
    metric: normalizeTrajectoryMetric(claim.claimMetric),
    value: claim.claimValue,
    unit: claim.claimUnit ?? null,
    period: claim.claimPeriod ?? null,
    observedAt: claim.observedAt ?? claim.validFrom ?? claim.createdAt,
    validFrom: claim.validFrom ?? null,
    validUntil: claim.validUntil ?? null,
    confidence: claim.confidence,
    weight: claim.weight,
    evidenceCount: claim.evidence.length,
    sourceId: claim.sourceId ?? null,
    projectId: claim.projectId ?? null,
    teamId: claim.teamId ?? null,
  }
}

export function detectMetricRegressions(
  points: KnowledgeTrajectoryPoint[],
  options: { threshold?: number } = {},
): KnowledgeTrajectoryRegression[] {
  const threshold = options.threshold ?? DEFAULT_REGRESSION_THRESHOLD
  const byMetric = new Map<string, KnowledgeTrajectoryPoint[]>()
  for (const point of points) {
    byMetric.set(point.metric, [...(byMetric.get(point.metric) ?? []), point])
  }

  const regressions: KnowledgeTrajectoryRegression[] = []
  for (const [metric, metricPoints] of byMetric) {
    const ordered = [...metricPoints].sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    for (let i = 1; i < ordered.length; i += 1) {
      const previous = ordered[i - 1]
      const current = ordered[i]
      if (!previous || !current || previous.value <= 0) continue
      const dropRatio = (previous.value - current.value) / Math.abs(previous.value)
      if (dropRatio < threshold) continue
      regressions.push({
        metric,
        fromClaimId: previous.claimId,
        toClaimId: current.claimId,
        fromValue: previous.value,
        toValue: current.value,
        dropRatio,
        severity: dropRatio >= 0.5 ? 'critical' : dropRatio >= 0.25 ? 'warning' : 'watch',
      })
    }
  }
  return regressions
}

export function computeTrajectoryStats(points: KnowledgeTrajectoryPoint[]): KnowledgeTrajectoryResult['stats'] {
  if (points.length < 2) {
    return {
      pointCount: points.length,
      metricCount: new Set(points.map((point) => point.metric)).size,
      firstObservedAt: points[0]?.observedAt ?? null,
      lastObservedAt: points[0]?.observedAt ?? null,
      weightedConfidence: points[0]?.confidence ?? null,
      trendDirection: 'insufficient_data',
    }
  }

  const ordered = [...points].sort((a, b) => a.observedAt.localeCompare(b.observedAt))
  const metricDirections = new Map<string, 'improving' | 'declining' | 'flat'>()
  for (const metric of new Set(ordered.map((point) => point.metric))) {
    const metricPoints = ordered.filter((point) => point.metric === metric)
    const first = metricPoints[0]
    const last = metricPoints[metricPoints.length - 1]
    if (!first || !last || metricPoints.length < 2) continue
    const delta = last.value - first.value
    const tolerance = Math.max(Math.abs(first.value) * 0.02, 0.000001)
    metricDirections.set(metric, Math.abs(delta) <= tolerance ? 'flat' : delta > 0 ? 'improving' : 'declining')
  }

  const directions = new Set(metricDirections.values())
  const trendDirection =
    directions.size === 0 ? 'insufficient_data'
      : directions.size > 1 ? 'mixed'
        : Array.from(directions)[0] ?? 'insufficient_data'
  const weightedSum = points.reduce((sum, point) => sum + point.confidence * point.weight, 0)
  const weightSum = points.reduce((sum, point) => sum + point.weight, 0)

  return {
    pointCount: points.length,
    metricCount: new Set(points.map((point) => point.metric)).size,
    firstObservedAt: ordered[0]?.observedAt ?? null,
    lastObservedAt: ordered[ordered.length - 1]?.observedAt ?? null,
    weightedConfidence: weightSum > 0 ? clamp01(weightedSum / weightSum) : null,
    trendDirection,
  }
}

export function buildKnowledgeTrajectory(input: {
  orgId: string
  subject: string
  metric?: string | null
  points: KnowledgeTrajectoryPoint[]
  regressionThreshold?: number
}): KnowledgeTrajectoryResult {
  const normalizedMetric = input.metric ? normalizeTrajectoryMetric(input.metric) : null
  const points = normalizedMetric
    ? input.points.filter((point) => point.metric === normalizedMetric)
    : input.points

  return {
    schemaVersion: 1,
    orgId: input.orgId,
    subject: input.subject,
    metric: normalizedMetric,
    points,
    regressions: detectMetricRegressions(points, { threshold: input.regressionThreshold }),
    stats: computeTrajectoryStats(points),
  }
}

export async function findKnowledgeTrajectory(input: FindKnowledgeTrajectoryInput): Promise<KnowledgeTrajectoryResult> {
  const metric = input.metric ? normalizeTrajectoryMetric(input.metric) : null
  const claims = await listKnowledgeMetricClaims({
    orgId: input.orgId,
    subject: input.subject,
    metric,
    projectId: input.projectId,
    teamId: input.teamId,
    assistantId: input.assistantId,
    since: input.since,
    until: input.until,
    status: 'active',
    limit: input.limit,
  })
  const points = claims.map(claimToTrajectoryPoint).filter((point): point is KnowledgeTrajectoryPoint => Boolean(point))
  return buildKnowledgeTrajectory({
    orgId: input.orgId,
    subject: input.subject,
    metric,
    points,
  })
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
