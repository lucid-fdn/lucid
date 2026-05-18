import { describe, expect, it, vi } from 'vitest'
import type { KnowledgeClaim } from '@contracts/knowledge-claims'

vi.mock('server-only', () => ({}))

import {
  buildKnowledgeTrajectory,
  claimToTrajectoryPoint,
  detectMetricRegressions,
  normalizeTrajectoryMetric,
} from '../trajectory'
import type { KnowledgeTrajectoryPoint } from '@contracts/knowledge-intelligence'

describe('knowledge trajectory intelligence', () => {
  it('normalizes metric labels for stable storage and routing', () => {
    expect(normalizeTrajectoryMetric(' Monthly Recurring Revenue ')).toBe('monthly_recurring_revenue')
    expect(normalizeTrajectoryMetric('TVL / 7d Δ')).toBe('tvl_7d_δ')
  })

  it('converts metric claims into trajectory points', () => {
    const claim = makeClaim({ claimMetric: 'MRR', claimValue: 12000, observedAt: '2026-05-01T00:00:00.000Z' })
    expect(claimToTrajectoryPoint(claim)).toMatchObject({
      claimId: claim.id,
      subject: 'Acme Founder',
      metric: 'mrr',
      value: 12000,
      observedAt: '2026-05-01T00:00:00.000Z',
      evidenceCount: 1,
    })
  })

  it('detects meaningful regressions without flagging small noise', () => {
    const points = [
      claimToTrajectoryPoint(makeClaim({ id: uuid(1), claimMetric: 'MRR', claimValue: 100, observedAt: '2026-05-01T00:00:00.000Z' })),
      claimToTrajectoryPoint(makeClaim({ id: uuid(2), claimMetric: 'MRR', claimValue: 94, observedAt: '2026-05-02T00:00:00.000Z' })),
      claimToTrajectoryPoint(makeClaim({ id: uuid(3), claimMetric: 'MRR', claimValue: 70, observedAt: '2026-05-03T00:00:00.000Z' })),
    ].filter((point): point is KnowledgeTrajectoryPoint => Boolean(point))

    const regressions = detectMetricRegressions(points)
    expect(regressions).toHaveLength(1)
    expect(regressions[0]).toMatchObject({ metric: 'mrr', fromValue: 94, toValue: 70, severity: 'warning' })
  })

  it('builds stats for improving trajectories', () => {
    const points = [
      claimToTrajectoryPoint(makeClaim({ id: uuid(4), claimMetric: 'Users', claimValue: 10, observedAt: '2026-05-01T00:00:00.000Z' })),
      claimToTrajectoryPoint(makeClaim({ id: uuid(5), claimMetric: 'Users', claimValue: 18, observedAt: '2026-05-02T00:00:00.000Z' })),
    ].filter((point): point is KnowledgeTrajectoryPoint => Boolean(point))

    const result = buildKnowledgeTrajectory({ orgId: uuid(10), subject: 'Acme Founder', metric: 'users', points })
    expect(result.stats.trendDirection).toBe('improving')
    expect(result.stats.pointCount).toBe(2)
    expect(result.regressions).toHaveLength(0)
  })
})

function makeClaim(overrides: Partial<KnowledgeClaim> = {}): KnowledgeClaim {
  return {
    id: uuid(1),
    orgId: uuid(10),
    projectId: null,
    teamId: null,
    assistantId: null,
    sourceId: uuid(20),
    pageId: null,
    claimType: 'claim',
    subject: 'Acme Founder',
    claim: 'Acme grew MRR with strong execution.',
    holderType: 'operator',
    holderId: null,
    confidence: 0.86,
    weight: 0.8,
    status: 'active',
    validFrom: null,
    validUntil: null,
    claimMetric: 'MRR',
    claimValue: 12000,
    claimUnit: 'usd',
    claimPeriod: 'month',
    observedAt: '2026-05-01T00:00:00.000Z',
    resolvedOutcome: null,
    resolvedAt: null,
    supersededBy: null,
    embeddingStatus: 'ready',
    embeddingModel: null,
    embeddingProviderId: null,
    semanticFingerprint: null,
    semanticClusterKey: null,
    evidence: [{ kind: 'url', url: 'https://example.com', label: 'source' }],
    metadata: {},
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  }
}

function uuid(seed: number): string {
  return `00000000-0000-4000-8000-${seed.toString().padStart(12, '0')}`
}
