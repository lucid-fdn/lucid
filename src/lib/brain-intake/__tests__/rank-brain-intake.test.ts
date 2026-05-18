import { describe, expect, it } from 'vitest'

import { rankBrainIntakeItems } from '../rank-brain-intake'
import type { BrainIntakeDraftItem } from '../schema'

function item(patch: Partial<BrainIntakeDraftItem>): BrainIntakeDraftItem {
  return {
    id: 'item-1',
    kind: 'fact',
    destination: 'knowledge_fact',
    selected: true,
    title: 'Fact',
    body: 'Our support SLA is two business days.',
    confidence: 0.8,
    requiresReview: false,
    warnings: [],
    suggestedScope: 'workspace',
    trustLevel: 'observed',
    priority: 'normal',
    freshness: 'unknown',
    recommendedAction: 'store',
    explanation: '',
    citations: [],
    extractedFacts: [],
    conflicts: [],
    ...patch,
  }
}

describe('rankBrainIntakeItems', () => {
  it('requires review for sensitive values', () => {
    const [ranked] = rankBrainIntakeItems([
      item({ body: 'The API key is sk-secret and should be used by support.' }),
    ])

    expect(ranked.priority).toBe('critical')
    expect(ranked.recommendedAction).toBe('review')
    expect(ranked.requiresReview).toBe(true)
    expect(ranked.warnings.some((warning) => warning.includes('sensitive'))).toBe(true)
  })

  it('marks recall tests as test actions', () => {
    const [ranked] = rankBrainIntakeItems([
      item({
        kind: 'recall_question',
        destination: 'recall_test',
        body: 'What should agents remember about refunds?',
      }),
    ])

    expect(ranked.recommendedAction).toBe('test_recall')
    expect(ranked.priority).toBe('low')
  })
})
