import { describe, expect, it } from 'vitest'

import { compareBrainIntakeItems } from '../compare-brain-intake'
import type { BrainIntakeDraftItem } from '../schema'

function source(id: string, url: string): BrainIntakeDraftItem {
  return {
    id,
    kind: 'source_url',
    destination: 'knowledge_source',
    selected: true,
    title: url,
    body: url,
    confidence: 0.9,
    requiresReview: false,
    warnings: [],
    url,
    suggestedScope: 'workspace',
    trustLevel: 'observed',
    priority: 'normal',
    freshness: 'unknown',
    recommendedAction: 'store',
    explanation: '',
    citations: [],
    extractedFacts: [],
    conflicts: [],
  }
}

describe('compareBrainIntakeItems', () => {
  it('marks exact URL duplicates as skipped', () => {
    const result = compareBrainIntakeItems([
      source('a', 'https://docs.example.com/product'),
      source('b', 'https://docs.example.com/product/'),
    ])

    expect(result[1]).toMatchObject({
      selected: false,
      recommendedAction: 'skip',
      requiresReview: true,
    })
    expect(result[1].duplicateOf?.id).toBe('a')
  })
})
