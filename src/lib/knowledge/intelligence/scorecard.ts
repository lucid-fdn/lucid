import 'server-only'

import type {
  KnowledgeEntityScorecard,
  KnowledgeScorecardProfile,
  KnowledgeScorecardSignal,
  KnowledgeTrajectoryResult,
} from '@contracts/knowledge-intelligence'
import type { KnowledgeClaim } from '@contracts/knowledge-claims'
import { listKnowledgeClaims } from '@/lib/db/knowledge-claims'
import { buildKnowledgeTrajectory, claimToTrajectoryPoint, findKnowledgeTrajectory } from './trajectory'

export interface BuildKnowledgeScorecardInput {
  orgId: string
  subject: string
  profile: KnowledgeScorecardProfile
  projectId?: string | null
  teamId?: string | null
  assistantId?: string | null
  metric?: string | null
  since?: string | null
  until?: string | null
}

export async function buildKnowledgeEntityScorecard(input: BuildKnowledgeScorecardInput): Promise<KnowledgeEntityScorecard> {
  const [claims, trajectory] = await Promise.all([
    listKnowledgeClaims({
      orgId: input.orgId,
      projectId: input.projectId,
      teamId: input.teamId,
      assistantId: input.assistantId,
      query: input.subject,
      status: 'active',
      limit: 100,
    }),
    findKnowledgeTrajectory({
      orgId: input.orgId,
      subject: input.subject,
      metric: input.metric,
      projectId: input.projectId,
      teamId: input.teamId,
      assistantId: input.assistantId,
      since: input.since,
      until: input.until,
      limit: 250,
    }),
  ])
  return buildKnowledgeEntityScorecardFromClaims({
    ...input,
    claims: claims.filter((claim) => claim.subject === input.subject || claim.subject.toLowerCase().includes(input.subject.toLowerCase())),
    trajectory,
  })
}

export function buildKnowledgeEntityScorecardFromClaims(input: BuildKnowledgeScorecardInput & {
  claims: KnowledgeClaim[]
  trajectory?: KnowledgeTrajectoryResult | null
}): KnowledgeEntityScorecard {
  const trajectory = input.trajectory ?? buildKnowledgeTrajectory({
    orgId: input.orgId,
    subject: input.subject,
    metric: input.metric,
    points: input.claims.map(claimToTrajectoryPoint).filter((point): point is NonNullable<ReturnType<typeof claimToTrajectoryPoint>> => Boolean(point)),
  })
  const provenance = buildScorecardProvenance(input.claims)
  const baseSignals = [
    buildEvidenceSignal(input.claims),
    buildConsistencySignal(input.claims, trajectory),
    buildFreshnessSignal(input.claims),
    buildTrajectorySignal(trajectory),
    ...buildProfileSignals(input.profile, input.claims, trajectory),
  ]
  const redFlags = buildRedFlags(input.claims, trajectory)
  const signals = dedupeSignals(baseSignals)
  const confidence = computeScorecardConfidence({ signals, provenance })
  const scoredSignals = signals.filter((signal) => signal.status !== 'unknown')
  const overallScore = confidence < 0.35 || scoredSignals.length === 0
    ? null
    : clamp01(scoredSignals.reduce((sum, signal) => sum + signal.score, 0) / scoredSignals.length)

  return {
    schemaVersion: 1,
    profile: input.profile,
    orgId: input.orgId,
    subject: input.subject,
    generatedAt: new Date().toISOString(),
    overallScore,
    confidence,
    signals,
    redFlags,
    recommendations: buildRecommendations(input.profile, signals, redFlags, provenance),
    trajectory,
    provenance,
  }
}

function buildEvidenceSignal(claims: KnowledgeClaim[]): KnowledgeScorecardSignal {
  const evidenceCount = claims.reduce((sum, claim) => sum + claim.evidence.length, 0)
  const score = claims.length === 0 ? 0 : clamp01(evidenceCount / Math.max(claims.length * 2, 1))
  return {
    id: 'evidence_depth',
    label: 'Evidence depth',
    score,
    status: signalStatus(score),
    summary: evidenceCount > 0
      ? `${evidenceCount} evidence link${evidenceCount === 1 ? '' : 's'} support ${claims.length} active claim${claims.length === 1 ? '' : 's'}.`
      : 'No evidence links are attached yet.',
    evidenceClaimIds: claims.filter((claim) => claim.evidence.length > 0).map((claim) => claim.id).slice(0, 10),
    metadata: {},
  }
}

function buildConsistencySignal(claims: KnowledgeClaim[], trajectory: KnowledgeTrajectoryResult): KnowledgeScorecardSignal {
  const conflicts = claims.filter((claim) => {
    const text = `${claim.claimType} ${claim.claim}`.toLowerCase()
    return /\b(conflict|contradiction|blocked|false|failed|risk|regression)\b/.test(text)
  })
  const penalty = Math.min(0.6, conflicts.length * 0.15 + trajectory.regressions.length * 0.2)
  const score = clamp01(0.9 - penalty)
  return {
    id: 'consistency',
    label: 'Consistency',
    score,
    status: signalStatus(score),
    summary: conflicts.length || trajectory.regressions.length
      ? `${conflicts.length} conflict-like claim${conflicts.length === 1 ? '' : 's'} and ${trajectory.regressions.length} trajectory regression${trajectory.regressions.length === 1 ? '' : 's'} need review.`
      : 'No obvious contradictions or trajectory regressions found in active claims.',
    evidenceClaimIds: conflicts.map((claim) => claim.id).slice(0, 10),
    metadata: {},
  }
}

function buildFreshnessSignal(claims: KnowledgeClaim[]): KnowledgeScorecardSignal {
  const now = Date.now()
  const stale = claims.filter((claim) => claim.validUntil && Date.parse(claim.validUntil) < now)
  const score = claims.length === 0 ? 0 : clamp01(1 - stale.length / claims.length)
  return {
    id: 'freshness',
    label: 'Freshness',
    score,
    status: signalStatus(score),
    summary: stale.length > 0
      ? `${stale.length} active claim${stale.length === 1 ? ' is' : 's are'} past its validity window.`
      : 'Active claims are not past their validity window.',
    evidenceClaimIds: stale.map((claim) => claim.id).slice(0, 10),
    metadata: {},
  }
}

function buildTrajectorySignal(trajectory: KnowledgeTrajectoryResult): KnowledgeScorecardSignal {
  const pointCount = trajectory.stats.pointCount
  const score = pointCount < 2 ? 0 : trajectory.regressions.length === 0 ? 0.85 : clamp01(0.75 - trajectory.regressions.length * 0.2)
  return {
    id: 'trajectory',
    label: 'Trajectory',
    score,
    status: pointCount < 2 ? 'unknown' : signalStatus(score),
    summary: pointCount < 2
      ? 'Not enough metric claims to determine a trajectory yet.'
      : `Trajectory is ${trajectory.stats.trendDirection}; ${trajectory.regressions.length} regression${trajectory.regressions.length === 1 ? '' : 's'} detected.`,
    evidenceClaimIds: trajectory.points.map((point) => point.claimId).slice(0, 10),
    metadata: { trendDirection: trajectory.stats.trendDirection },
  }
}

function buildProfileSignals(
  profile: KnowledgeScorecardProfile,
  claims: KnowledgeClaim[],
  trajectory: KnowledgeTrajectoryResult,
): KnowledgeScorecardSignal[] {
  if (profile === 'founder') return buildFounderSignals(claims, trajectory)
  if (profile === 'wallet' || profile === 'token') return buildWeb3Signals(claims, trajectory)
  if (profile === 'merchant' || profile === 'customer') return buildCommerceSignals(claims)
  return [buildExecutionSignal(claims)]
}

function buildFounderSignals(claims: KnowledgeClaim[], trajectory: KnowledgeTrajectoryResult): KnowledgeScorecardSignal[] {
  const growthMetrics = new Set(['mrr', 'arr', 'revenue', 'users', 'mau', 'dau', 'growth'])
  const growthPoints = trajectory.points.filter((point) => growthMetrics.has(point.metric))
  const growthScore = growthPoints.length < 2
    ? 0
    : trajectory.regressions.some((regression) => growthMetrics.has(regression.metric)) ? 0.45 : 0.85
  return [
    {
      id: 'founder_growth_trajectory',
      label: 'Founder growth trajectory',
      score: growthScore,
      status: growthPoints.length < 2 ? 'unknown' : signalStatus(growthScore),
      summary: growthPoints.length < 2
        ? 'Add MRR, ARR, revenue, users, or growth metric claims to score founder momentum.'
        : 'Growth metrics are present and can be tracked over time.',
      evidenceClaimIds: growthPoints.map((point) => point.claimId).slice(0, 10),
      metadata: {},
    },
    buildExecutionSignal(claims),
  ]
}

function buildExecutionSignal(claims: KnowledgeClaim[]): KnowledgeScorecardSignal {
  const positive = claims.filter((claim) => /\b(shipped|launched|closed|resolved|grew|improved|completed|won)\b/i.test(claim.claim))
  const negative = claims.filter((claim) => /\b(missed|failed|blocked|delayed|churn|regressed|lost)\b/i.test(claim.claim))
  const score = claims.length === 0 ? 0 : clamp01(0.5 + positive.length * 0.08 - negative.length * 0.12)
  return {
    id: 'execution_consistency',
    label: 'Execution consistency',
    score,
    status: claims.length === 0 ? 'unknown' : signalStatus(score),
    summary: `${positive.length} positive execution signal${positive.length === 1 ? '' : 's'} and ${negative.length} negative signal${negative.length === 1 ? '' : 's'} found.`,
    evidenceClaimIds: [...positive, ...negative].map((claim) => claim.id).slice(0, 10),
    metadata: {},
  }
}

function buildWeb3Signals(claims: KnowledgeClaim[], trajectory: KnowledgeTrajectoryResult): KnowledgeScorecardSignal[] {
  return [{
    id: 'market_signal_quality',
    label: 'Market signal quality',
    score: trajectory.points.length >= 2 ? 0.75 : claims.length > 0 ? 0.55 : 0,
    status: trajectory.points.length >= 2 ? 'strong' : claims.length > 0 ? 'watch' : 'unknown',
    summary: trajectory.points.length >= 2 ? 'Token or wallet metric history is available.' : 'Add price, volume, PnL, holder, or flow metrics to improve scoring.',
    evidenceClaimIds: claims.map((claim) => claim.id).slice(0, 10),
    metadata: {},
  }]
}

function buildCommerceSignals(claims: KnowledgeClaim[]): KnowledgeScorecardSignal[] {
  const risky = claims.filter((claim) => /\b(captcha|mfa|refund|failed|receipt|blocked|handoff)\b/i.test(claim.claim))
  const score = claims.length === 0 ? 0 : clamp01(0.8 - risky.length * 0.15)
  return [{
    id: 'commerce_reliability',
    label: 'Commerce reliability',
    score,
    status: claims.length === 0 ? 'unknown' : signalStatus(score),
    summary: risky.length > 0 ? `${risky.length} commerce reliability risk${risky.length === 1 ? '' : 's'} found.` : 'No obvious commerce reliability risks found.',
    evidenceClaimIds: risky.map((claim) => claim.id).slice(0, 10),
    metadata: {},
  }]
}

function buildRedFlags(claims: KnowledgeClaim[], trajectory: KnowledgeTrajectoryResult): KnowledgeScorecardSignal[] {
  const riskClaims = claims.filter((claim) => claim.claimType === 'risk' || /\b(red flag|lawsuit|fraud|blocked|critical|security|breach|insolvent)\b/i.test(claim.claim))
  const flags: KnowledgeScorecardSignal[] = riskClaims.slice(0, 8).map((claim) => ({
    id: `risk_claim_${claim.id}`,
    label: 'Red flag claim',
    score: clamp01(1 - claim.confidence),
    status: claim.confidence >= 0.75 ? 'weak' : 'watch',
    summary: claim.claim,
    evidenceClaimIds: [claim.id],
    metadata: {},
  }))
  for (const regression of trajectory.regressions.slice(0, 8)) {
    flags.push({
      id: `trajectory_regression_${regression.toClaimId}`,
      label: 'Trajectory regression',
      score: clamp01(1 - regression.dropRatio),
      status: regression.severity === 'critical' ? 'weak' : 'watch',
      summary: `${regression.metric} dropped ${Math.round(regression.dropRatio * 100)}% from ${regression.fromValue} to ${regression.toValue}.`,
      evidenceClaimIds: [regression.fromClaimId, regression.toClaimId],
      metadata: { metric: regression.metric, severity: regression.severity },
    })
  }
  return flags
}

function buildScorecardProvenance(claims: KnowledgeClaim[]): KnowledgeEntityScorecard['provenance'] {
  const now = Date.now()
  return {
    claimCount: claims.length,
    evidenceCount: claims.reduce((sum, claim) => sum + claim.evidence.length, 0),
    sourceCount: new Set(claims.map((claim) => claim.sourceId).filter(Boolean)).size,
    staleClaimCount: claims.filter((claim) => claim.validUntil && Date.parse(claim.validUntil) < now).length,
    conflictCount: claims.filter((claim) => /\b(conflict|contradiction|disputed|false)\b/i.test(claim.claim)).length,
  }
}

function buildRecommendations(
  profile: KnowledgeScorecardProfile,
  signals: KnowledgeScorecardSignal[],
  redFlags: KnowledgeScorecardSignal[],
  provenance: KnowledgeEntityScorecard['provenance'],
): string[] {
  const recommendations: string[] = []
  if (provenance.claimCount === 0) recommendations.push(`Add ${profile} claims with evidence before trusting this scorecard.`)
  if (provenance.evidenceCount < provenance.claimCount) recommendations.push('Attach evidence to weak claims so future scorecards can explain themselves.')
  if (signals.some((signal) => signal.id === 'trajectory' && signal.status === 'unknown')) recommendations.push('Add metric claims over time to unlock trajectory scoring.')
  if (redFlags.length > 0) recommendations.push('Run an Agent Ops investigation on the red flags before taking action.')
  return recommendations.length > 0 ? recommendations : ['Keep collecting evidence and monitor this scorecard for drift.']
}

function computeScorecardConfidence(input: {
  signals: KnowledgeScorecardSignal[]
  provenance: KnowledgeEntityScorecard['provenance']
}): number {
  if (input.provenance.claimCount === 0) return 0
  const evidenceRatio = Math.min(1, input.provenance.evidenceCount / Math.max(input.provenance.claimCount, 1))
  const knownSignals = input.signals.filter((signal) => signal.status !== 'unknown').length
  const signalRatio = input.signals.length ? knownSignals / input.signals.length : 0
  return clamp01(0.25 + evidenceRatio * 0.45 + signalRatio * 0.3)
}

function dedupeSignals(signals: KnowledgeScorecardSignal[]): KnowledgeScorecardSignal[] {
  const byId = new Map<string, KnowledgeScorecardSignal>()
  for (const signal of signals) {
    if (!byId.has(signal.id)) byId.set(signal.id, signal)
  }
  return Array.from(byId.values())
}

function signalStatus(score: number): KnowledgeScorecardSignal['status'] {
  if (score >= 0.75) return 'strong'
  if (score >= 0.45) return 'watch'
  return 'weak'
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
