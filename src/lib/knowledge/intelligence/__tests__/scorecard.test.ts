import { describe, expect, it, vi } from 'vitest'
import type { KnowledgeClaim } from '@contracts/knowledge-claims'

vi.mock('server-only', () => ({}))

import { buildKnowledgeEntityScorecardFromClaims } from '../scorecard'

describe('knowledge entity scorecards', () => {
  it('builds founder scorecards with growth and execution signals', () => {
    const scorecard = buildKnowledgeEntityScorecardFromClaims({
      orgId: uuid(10),
      subject: 'Acme Founder',
      profile: 'founder',
      claims: [
        makeClaim({ id: uuid(1), claimMetric: 'MRR', claimValue: 10000, observedAt: '2026-04-01T00:00:00.000Z' }),
        makeClaim({ id: uuid(2), claimMetric: 'MRR', claimValue: 14000, observedAt: '2026-05-01T00:00:00.000Z', claim: 'Acme shipped and grew MRR.' }),
      ],
    })

    expect(scorecard.profile).toBe('founder')
    expect(scorecard.confidence).toBeGreaterThan(0.5)
    expect(scorecard.signals.map((signal) => signal.id)).toContain('founder_growth_trajectory')
    expect(scorecard.signals.map((signal) => signal.id)).toContain('execution_consistency')
    expect(scorecard.trajectory.stats.trendDirection).toBe('improving')
  })

  it('surfaces trajectory regressions as red flags', () => {
    const scorecard = buildKnowledgeEntityScorecardFromClaims({
      orgId: uuid(10),
      subject: 'Acme Token',
      profile: 'token',
      claims: [
        makeClaim({ id: uuid(3), subject: 'Acme Token', claimMetric: 'TVL', claimValue: 100, observedAt: '2026-04-01T00:00:00.000Z' }),
        makeClaim({ id: uuid(4), subject: 'Acme Token', claimMetric: 'TVL', claimValue: 55, observedAt: '2026-05-01T00:00:00.000Z' }),
      ],
    })

    expect(scorecard.trajectory.regressions).toHaveLength(1)
    expect(scorecard.redFlags.some((flag) => flag.id.startsWith('trajectory_regression_'))).toBe(true)
    expect(scorecard.recommendations.join(' ')).toContain('Agent Ops investigation')
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
    claim: 'Acme shipped and improved execution.',
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
