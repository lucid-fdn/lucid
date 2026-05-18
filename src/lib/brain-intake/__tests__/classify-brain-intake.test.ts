import { describe, expect, it } from 'vitest'

import { classifyBrainIntake } from '../classify-brain-intake'

const base = {
  orgId: '00000000-0000-4000-8000-000000000001',
  scopeId: '00000000-0000-4000-8000-000000000001',
  files: [],
}

describe('classifyBrainIntake', () => {
  it('classifies policy-like text as operating context', () => {
    const result = classifyBrainIntake({
      ...base,
      text: 'Always escalate enterprise pricing requests before agents answer.',
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      destination: 'context',
      contextRecordType: 'policy',
    })
  })

  it('classifies short plain statements as knowledge facts', () => {
    const result = classifyBrainIntake({
      ...base,
      text: 'Our support SLA is two business days for starter customers.',
    })

    expect(result.items[0]).toMatchObject({
      destination: 'knowledge_fact',
      kind: 'fact',
    })
  })

  it('extracts URL sources separately from surrounding text', () => {
    const result = classifyBrainIntake({
      ...base,
      text: 'Docs are here https://docs.example.com/product and we should keep them current.',
    })

    expect(result.items.some((item) => item.destination === 'knowledge_source')).toBe(true)
    expect(result.items.some((item) => item.destination === 'context')).toBe(true)
  })

  it('uses recall questions as recall tests instead of persisted knowledge', () => {
    const result = classifyBrainIntake({
      ...base,
      text: 'What should agents recall about our refund policy?',
    })

    expect(result.items[0]).toMatchObject({
      destination: 'recall_test',
      kind: 'recall_question',
    })
  })

  it('ingests readable files as documents and flags binary files for extraction review', () => {
    const result = classifyBrainIntake({
      ...base,
      text: '',
      files: [
        { name: 'playbook.md', type: 'text/markdown', size: 12, text: '# Playbook\nDo this first.' },
        { name: 'deck.pdf', type: 'application/pdf', size: 1024 },
      ],
    })

    expect(result.items[0]).toMatchObject({ destination: 'knowledge_document' })
    expect(result.items[1]).toMatchObject({
      destination: 'knowledge_document',
      requiresReview: true,
      recommendedAction: 'review',
    })
  })

  it('returns preview quality metadata for the review sheet', () => {
    const result = classifyBrainIntake({
      ...base,
      text: 'Never answer unreleased pricing questions without approval. https://docs.example.com/pricing',
    })

    expect(result.quality.confidence).toBeGreaterThan(0)
    expect(result.preview.affectedLayers).toContain('Sources')
    expect(result.preview.affectedLayers).toContain('Operating context')
    expect(result.preview.estimatedRecallImpact).toBe('high')
  })

  it('segments short mixed multiline input so recall questions do not swallow policies', () => {
    const result = classifyBrainIntake({
      ...base,
      text: [
        'Always cite the Citrine Ledger launch policy before answering launch questions.',
        'Launch policy docs live at https://example.com/launch-policy',
        'What should agents recall about Citrine Ledger launch policy?',
      ].join('\n'),
    })

    expect(result.items.some((item) => item.destination === 'context')).toBe(true)
    expect(result.items.some((item) => item.destination === 'knowledge_source')).toBe(true)
    expect(result.items.some((item) => item.destination === 'recall_test')).toBe(true)
    expect(result.items.filter((item) => item.destination === 'context')).toHaveLength(1)
  })

  it('marks duplicate input items instead of selecting both by default', () => {
    const result = classifyBrainIntake({
      ...base,
      text: '',
      files: [
        { name: 'playbook.md', type: 'text/markdown', size: 12, text: '# Playbook\nDo this first.' },
        { name: 'playbook-copy.md', type: 'text/markdown', size: 12, text: '# Playbook\nDo this first.' },
      ],
    })

    expect(result.items).toHaveLength(2)
    expect(result.items[1]).toMatchObject({
      selected: false,
      recommendedAction: 'skip',
    })
    expect(result.quality.duplicateCount).toBe(1)
  })
})
