import { describe, expect, it } from 'vitest'

import { classifyBrainIntake } from '../classify-brain-intake'
import type { BrainIntakeClassifyRequest, BrainIntakeDestination, BrainIntakeRecommendedAction } from '../schema'

const base = {
  orgId: '00000000-0000-4000-8000-000000000001',
  scopeId: '00000000-0000-4000-8000-000000000001',
  files: [],
} satisfies Pick<BrainIntakeClassifyRequest, 'orgId' | 'scopeId' | 'files'>

interface StressCase {
  name: string
  input: BrainIntakeClassifyRequest
  destinations?: BrainIntakeDestination[]
  actions?: BrainIntakeRecommendedAction[]
  reviewAtLeast?: number
  skippedAtLeast?: number
  duplicateCount?: number
  warningIncludes?: string
  minConfidence?: number
}

const cases: StressCase[] = [
  {
    name: 'policy plus source',
    input: {
      ...base,
      text: 'Never mention unreleased pricing without approval. Docs: https://docs.example.com/pricing',
    },
    destinations: ['context', 'knowledge_source'],
    actions: ['store'],
    minConfidence: 0.8,
  },
  {
    name: 'plain fact',
    input: {
      ...base,
      text: 'Starter support SLA is two business days for non-urgent tickets.',
    },
    destinations: ['knowledge_fact'],
    minConfidence: 0.7,
  },
  {
    name: 'recall question',
    input: {
      ...base,
      text: 'What should agents recall about our refund policy?',
    },
    destinations: ['recall_test'],
    actions: ['test_recall'],
  },
  {
    name: 'long document',
    input: {
      ...base,
      text: Array.from({ length: 20 }, (_, index) => (
        `Section ${index}: Customer onboarding playbook step with detailed instructions and owner.`
      )).join('\n'),
    },
    destinations: ['knowledge_document'],
    minConfidence: 0.8,
  },
  {
    name: 'sensitive secret',
    input: {
      ...base,
      text: 'The API key is sk-secret-value and support should use it for testing.',
    },
    destinations: ['context'],
    actions: ['review'],
    reviewAtLeast: 1,
    warningIncludes: 'sensitive',
  },
  {
    name: 'private URL',
    input: {
      ...base,
      text: 'Internal docs are at http://localhost:3000/private',
    },
    destinations: ['knowledge_source', 'knowledge_fact'],
    reviewAtLeast: 1,
    warningIncludes: 'Private-network',
  },
  {
    name: 'duplicate readable files',
    input: {
      ...base,
      text: '',
      files: [
        { name: 'playbook.md', type: 'text/markdown', size: 10, text: '# Playbook\nDo this first.' },
        { name: 'copy.md', type: 'text/markdown', size: 10, text: '# Playbook\nDo this first.' },
      ],
    },
    destinations: ['knowledge_document'],
    duplicateCount: 1,
    skippedAtLeast: 1,
  },
  {
    name: 'binary PDF',
    input: {
      ...base,
      text: '',
      files: [{ name: 'deck.pdf', type: 'application/pdf', size: 2048 }],
    },
    destinations: ['knowledge_document'],
    actions: ['review'],
    reviewAtLeast: 1,
  },
  {
    name: 'mixed decision risk signal',
    input: {
      ...base,
      text: 'We decided to focus on YC founders. Risk: enterprise procurement can delay deals. Customer signal: teams ask for Slack alerts.',
    },
    destinations: ['context'],
    minConfidence: 0.8,
  },
  {
    name: 'same URL twice',
    input: {
      ...base,
      text: 'https://docs.example.com/product https://docs.example.com/product/',
    },
    destinations: ['knowledge_source'],
    duplicateCount: 1,
    skippedAtLeast: 1,
  },
  {
    name: 'source wrapper text does not become context',
    input: {
      ...base,
      text: [
        'Always cite Citrine Ledger launch policy before answering.',
        'Launch docs live at https://example.com/citrine',
        'What should agents recall about Citrine Ledger?',
      ].join('\n'),
    },
    destinations: ['context', 'knowledge_source', 'recall_test'],
    minConfidence: 0.8,
  },
]

describe('Brain intake stress matrix', () => {
  it.each(cases)('$name returns expected structured preview', (testCase) => {
    const result = classifyBrainIntake(testCase.input)
    const destinations = result.items.map((item) => item.destination)
    const actions = result.items.map((item) => item.recommendedAction)
    const reviewCount = result.items.filter((item) => item.requiresReview || item.recommendedAction === 'review').length
    const skippedCount = result.items.filter((item) => !item.selected || item.recommendedAction === 'skip').length
    const warnings = result.items.flatMap((item) => item.warnings)

    for (const destination of testCase.destinations ?? []) {
      expect(destinations, `${testCase.name} destinations`).toContain(destination)
    }
    for (const action of testCase.actions ?? []) {
      expect(actions, `${testCase.name} actions`).toContain(action)
    }
    if (typeof testCase.reviewAtLeast === 'number') {
      expect(reviewCount, `${testCase.name} review count`).toBeGreaterThanOrEqual(testCase.reviewAtLeast)
    }
    if (typeof testCase.skippedAtLeast === 'number') {
      expect(skippedCount, `${testCase.name} skipped count`).toBeGreaterThanOrEqual(testCase.skippedAtLeast)
    }
    if (typeof testCase.duplicateCount === 'number') {
      expect(result.quality.duplicateCount, `${testCase.name} duplicate count`).toBe(testCase.duplicateCount)
    }
    if (testCase.warningIncludes) {
      expect(warnings.some((warning) => warning.includes(testCase.warningIncludes)), `${testCase.name} warnings`).toBe(true)
    }
    if (typeof testCase.minConfidence === 'number') {
      expect(result.quality.confidence, `${testCase.name} confidence`).toBeGreaterThanOrEqual(testCase.minConfidence)
    }
    if (testCase.name === 'source wrapper text does not become context') {
      expect(result.items.filter((item) => item.destination === 'context')).toHaveLength(1)
    }

    expect(result.summary).toBeTruthy()
    expect(result.preview.affectedLayers.length).toBeGreaterThan(0)
  })
})
