import { describe, expect, it } from 'vitest'

import {
  BrainQueryRequestSchema,
  BrainRememberRequestSchema,
} from '../schemas'

const orgId = '00000000-0000-4000-8000-000000000001'

describe('Brain runtime schemas', () => {
  it('accepts scoped source-aware queries without engine-specific fields', () => {
    const parsed = BrainQueryRequestSchema.parse({
      org_id: orgId,
      source_key: 'workspace/default',
      query: 'What should agents know before answering?',
      layers: ['facts', 'guidance', 'documents', 'graph', 'evidence'],
      budget: {
        max_latency_ms: 2500,
        max_prompt_tokens: 6000,
        max_items_per_layer: 20,
      },
    })

    expect(parsed).toMatchObject({
      org_id: orgId,
      source_key: 'workspace/default',
      query: 'What should agents know before answering?',
    })
  })

  it('accepts guidance, source, fact, and document writes through one contract', () => {
    const base = {
      org_id: orgId,
      title: 'Default refund policy',
      body: 'Refund requests must include the order id and reason.',
    }

    expect(BrainRememberRequestSchema.parse({
      ...base,
      kind: 'guidance',
      guidance_kind: 'policy',
    }).kind).toBe('guidance')

    expect(BrainRememberRequestSchema.parse({
      ...base,
      kind: 'fact',
    }).kind).toBe('fact')

    expect(BrainRememberRequestSchema.parse({
      ...base,
      kind: 'source',
      url: 'https://docs.example.com/refunds',
    }).kind).toBe('source')

    expect(BrainRememberRequestSchema.parse({
      ...base,
      kind: 'document',
      file_name: 'refunds.md',
      mime_type: 'text/markdown',
    }).kind).toBe('document')
  })
})
