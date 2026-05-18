import { describe, expect, it } from 'vitest'

import { validateBrainIntakeItems } from '../validate-brain-intake'
import type { BrainIntakeDraftItem } from '../schema'

const item: BrainIntakeDraftItem = {
  id: 'source-1',
  kind: 'source_url',
  destination: 'knowledge_source',
  selected: true,
  title: 'Local source',
  body: 'http://localhost:3000/private',
  confidence: 0.9,
  requiresReview: false,
  warnings: [],
  url: 'http://localhost:3000/private',
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

describe('validateBrainIntakeItems', () => {
  it('requires review for private-network sources', () => {
    const [validated] = validateBrainIntakeItems([item])

    expect(validated.requiresReview).toBe(true)
    expect(validated.recommendedAction).toBe('review')
    expect(validated.warnings.some((warning) => warning.includes('Private-network'))).toBe(true)
  })
})
