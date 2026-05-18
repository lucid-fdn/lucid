import { describe, expect, it } from 'vitest'

import { evaluateKnowledgeSourcePolicy, getSourceFreshness } from '../source-policy'
import type { KnowledgeSourcePolicyInput } from '../source-policy'

const baseSource: KnowledgeSourcePolicyInput = {
  id: 'source-1',
  type: 'agent_ops',
  visibility: 'project',
  trustLevel: 'operator_approved',
  federationPolicy: 'source_scoped',
  retentionPolicy: 'standard',
  status: 'active',
  includeInRetrieval: true,
  refreshPolicy: 'manual',
  refreshStatus: 'ok',
  lastSeenAt: '2026-05-05T00:00:00.000Z',
  lastRefreshedAt: '2026-05-05T00:00:00.000Z',
}

describe('knowledge source policy', () => {
  it('allows active source-scoped sources and applies trust/freshness weights', () => {
    const decision = evaluateKnowledgeSourcePolicy(baseSource, {
      now: new Date('2026-05-06T00:00:00.000Z'),
    })

    expect(decision.eligible).toBe(true)
    expect(decision.freshness).toBe('fresh')
    expect(decision.scoreMultiplier).toBe(1)
  })

  it('hard-excludes archived, paused, disabled, or isolated sources by default', () => {
    expect(evaluateKnowledgeSourcePolicy({ ...baseSource, status: 'archived' }).reasons).toContain('source_archived')
    expect(evaluateKnowledgeSourcePolicy({ ...baseSource, status: 'paused' }).reasons).toContain('source_paused')
    expect(evaluateKnowledgeSourcePolicy({ ...baseSource, includeInRetrieval: false }).reasons).toContain('retrieval_disabled')
    expect(evaluateKnowledgeSourcePolicy({ ...baseSource, federationPolicy: 'isolated' }).reasons).toContain('source_isolated')
  })

  it('marks sources stale by explicit status, stale_after, or old refresh timestamps', () => {
    const now = new Date('2026-05-06T00:00:00.000Z')

    expect(getSourceFreshness({ ...baseSource, status: 'stale' }, now)).toBe('stale')
    expect(getSourceFreshness({ ...baseSource, staleAfter: '2026-05-01T00:00:00.000Z' }, now)).toBe('stale')
    expect(getSourceFreshness({ ...baseSource, lastRefreshedAt: '2026-02-01T00:00:00.000Z' }, now)).toBe('stale')
  })
})
