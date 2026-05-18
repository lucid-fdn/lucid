import { describe, expect, it } from 'vitest'

import {
  evaluateKnowledgeRetrieval,
  scrubKnowledgeEvalQuery,
  summarizeKnowledgeRetrievalEvalResults,
} from '../retrieval-evals'
import type { KnowledgePromptPacket } from '../types'

describe('knowledge retrieval evals', () => {
  it('scores retrieval quality with precision, recall, MRR, nDCG, citation accuracy, and failures', () => {
    const packet = packetWithItems([
      { id: 'page-1', citationKeys: ['run:1'] },
      { id: 'page-2', citationKeys: [] },
    ])

    const metrics = evaluateKnowledgeRetrieval(packet, {
      expectedItemIds: ['page-2'],
      expectedCitationKeys: ['run:1', 'run:2'],
      baselineTopItemId: 'page-1',
      baselineLatencyMs: 80,
      maxLatencyMs: 100,
    })

    expect(metrics.precisionAtK).toBe(0.5)
    expect(metrics.recallAtK).toBe(1)
    expect(metrics.mrr).toBe(0.5)
    expect(metrics.ndcg).toBeGreaterThan(0)
    expect(metrics.citationAccuracy).toBe(0.5)
    expect(metrics.top1Stable).toBe(true)
    expect(metrics.latencyDeltaMs).toBe(40)
    expect(metrics.failureTypes).toContain('bad_citation')
    expect(metrics.failureTypes).toContain('no_citation')
    expect(metrics.failureTypes).toContain('slow_retrieval')
  })

  it('scrubs sensitive query details and summarizes result sets', () => {
    const scrubbed = scrubKnowledgeEvalQuery('Email q@example.com and use sk_secretvalue1234567890')
    const summary = summarizeKnowledgeRetrievalEvalResults([
      { precisionAtK: 1, recallAtK: 0.5, mrr: 1, ndcg: 0.8, citationAccuracy: 1, top1Stable: true, latencyDeltaMs: 10, failureTypes: [] },
      { precisionAtK: 0, recallAtK: 0, mrr: 0, ndcg: 0, citationAccuracy: 0, top1Stable: false, latencyDeltaMs: 20, failureTypes: ['missing_source'] },
    ])

    expect(scrubbed.preview).toContain('[email]')
    expect(scrubbed.preview).toContain('[secret]')
    expect(summary.caseCount).toBe(2)
    expect(summary.precisionAtK).toBe(0.5)
    expect(summary.top1Stability).toBe(0.5)
    expect(summary.failureCounts.missing_source).toBe(1)
  })
})

function packetWithItems(items: Array<{ id: string; citationKeys: string[] }>): KnowledgePromptPacket {
  return {
    version: '2026-05-06.knowledge-prompt-packet.v1',
    generatedAt: '2026-05-06T00:00:00.000Z',
    orgId: 'org-1',
    mode: 'summary',
    budget: {
      maxLatencyMs: 100,
      maxPromptTokens: 1000,
      maxItemsPerLayer: 5,
    },
    items: items.map((item) => ({
      id: item.id,
      layer: 'project_brain',
      label: 'project brain',
      content: item.id,
      citations: item.citationKeys.map((key) => ({ kind: 'run', runId: key.replace('run:', ''), label: key })),
      citationKeys: item.citationKeys,
      trustLevel: 'operator_approved',
      tokenCost: 1,
    })),
    omitted: [],
    telemetry: {
      durationMs: 120,
      timedOut: false,
      fallbackUsed: false,
      retrievalCounts: { project_brain: items.length },
    },
  }
}
