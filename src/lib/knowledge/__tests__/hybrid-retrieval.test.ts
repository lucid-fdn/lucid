import { describe, expect, it } from 'vitest'

import { fuseKnowledgeCandidates, keywordScore, type KnowledgeFusionCandidate } from '../hybrid-retrieval'

describe('hybrid knowledge retrieval fusion', () => {
  it('scores keyword overlap without requiring embeddings', () => {
    expect(keywordScore('browser checkout qa', 'Browser Operator checks checkout flows')).toBeGreaterThan(0.6)
    expect(keywordScore('billing policy', 'Unrelated deployment notes')).toBe(0)
  })

  it('fuses multi-source candidates, dedups by canonical key, and preserves best content', () => {
    const candidates: KnowledgeFusionCandidate[] = [
      candidate('page-1', 'project_brain', 'compiled_truth', 0.8, 'Checkout uses Browser Operator.', 'knowledge_page:1'),
      candidate('chunk-1', 'rag', 'rag_hybrid', 0.95, 'Checkout uses Browser Operator.', 'knowledge_page:1'),
      candidate('memory-1', 'assistant_memory', 'assistant_semantic', 0.9, 'User prefers concise QA summaries.', 'memory:1'),
    ]

    const result = fuseKnowledgeCandidates(candidates, { limit: 10 })

    expect(result.items).toHaveLength(2)
    expect(result.telemetry.dedupedCount).toBe(1)
    expect(result.items[0]?.metadata?.fusionScore).toBeTypeOf('number')
    expect(result.telemetry.layerCounts).toMatchObject({
      project_brain: 1,
      rag: 1,
      assistant_memory: 1,
    })
  })

  it('applies source policy multipliers before final ranking', () => {
    const result = fuseKnowledgeCandidates([
      candidate('trusted', 'project_brain', 'compiled_truth', 0.7, 'Trusted source', 'trusted', 1.2),
      candidate('weak', 'project_brain', 'compiled_truth', 0.9, 'Weak source', 'weak', 0.4),
    ])

    expect(result.items[0]?.id).toBe('trusted')
  })
})

function candidate(
  id: string,
  layer: KnowledgeFusionCandidate['layer'],
  retrievalSource: KnowledgeFusionCandidate['retrievalSource'],
  score: number,
  content: string,
  dedupKey: string,
  sourcePolicyMultiplier = 1,
): KnowledgeFusionCandidate {
  return {
    id,
    layer,
    content,
    score,
    citations: [],
    trustLevel: 'observed',
    tokenCost: Math.ceil(content.length / 4),
    retrievalSource,
    sourcePolicyMultiplier,
    keywordScore: 0.5,
    metadata: { dedupKey },
  }
}
