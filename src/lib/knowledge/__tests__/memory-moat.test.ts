import { describe, expect, it } from 'vitest'

import {
  buildKnowledgeBenchmarkSuite,
  buildKnowledgeContinuityMatrix,
  buildKnowledgeCostControlReport,
  buildKnowledgeContextExplanation,
  detectKnowledgeContradictions,
  getMemoryCorrectionActions,
  scoreKnowledgePromptItem,
} from '../memory-moat'
import type { KnowledgePromptPacketItem } from '../types'

describe('Knowledge memory moat', () => {
  it('scores memory confidence from trust, freshness, and citations', () => {
    const high = scoreKnowledgePromptItem({
      trustLevel: 'operator_approved',
      freshness: 'fresh',
      citations: [{ kind: 'run', runId: 'run-1' }],
    })
    const low = scoreKnowledgePromptItem({
      trustLevel: 'unverified',
      freshness: 'stale',
      citations: [],
    })

    expect(high).toBeGreaterThan(0.9)
    expect(low).toBeLessThan(0.4)
  })

  it('explains the operational context ladder compactly', () => {
    const explanation = buildKnowledgeContextExplanation({
      orgId: 'org-1',
      ownerUserId: 'user-1',
      policyHints: ['no-autotrade'],
      summaries: [
        { layer: 'project', text: 'Project is preparing launch.' },
        { layer: 'task', text: 'QA run is active.' },
        { layer: 'org', text: 'Require proof summaries.' },
      ],
    }, {
      latestMessage: 'Check the preview.',
      latestDelta: 'Need screenshots.',
      blockers: ['preview is slow'],
      fallbackFetchRequired: false,
      changedEvidence: [],
    })

    expect(explanation).toMatchObject({
      latestMessage: 'Check the preview.',
      currentRunOrTask: 'QA run is active.',
      project: 'Project is preparing launch.',
      orgPolicy: 'Require proof summaries.',
      owner: 'user-1',
      nextAction: 'Need screenshots.',
    })
  })

  it('detects simple contradictions across memory layers', () => {
    const contradictions = detectKnowledgeContradictions([
      item('a', 'project_brain', 'Checkout uses Stripe.'),
      item('b', 'assistant_memory', 'Checkout does not use Stripe.'),
    ])

    expect(contradictions).toHaveLength(1)
    expect(contradictions[0]?.layers).toEqual(expect.arrayContaining(['project_brain', 'assistant_memory']))
  })

  it('computes cost controls and safe correction actions', () => {
    const report = buildKnowledgeCostControlReport({
      budget: { maxLatencyMs: 180, maxPromptTokens: 10, maxItemsPerLayer: 3 },
      items: [item('a', 'project_brain', 'x', 8), item('b', 'rag', 'y', 7)],
    })

    expect(report.exceeded).toBe(true)
    expect(report.recommendedAction).toBe('summarize_or_archive_sources')
    expect(getMemoryCorrectionActions({ layer: 'assistant_memory', trustLevel: 'observed' })).toEqual(expect.arrayContaining([
      'forget',
      'correct',
      'archive',
      'make_verifiable',
    ]))
  })

  it('defines continuity and benchmark contracts for channels/runtimes', () => {
    const matrix = buildKnowledgeContinuityMatrix()
    expect(matrix.channels.discord).toBe('shared_knowledge_api')
    expect(matrix.channels.telegram).toBe('shared_knowledge_api')
    expect(matrix.runtimes.openclaw).toBe('knowledge_prompt_packet')
    expect(matrix.runtimes.hermes).toBe('knowledge_prompt_packet')
    expect(buildKnowledgeBenchmarkSuite().map((benchmark) => benchmark.slug)).toEqual(expect.arrayContaining([
      'cross-channel-user-memory',
      'safe-correction-loop',
    ]))
  })
})

function item(
  id: string,
  layer: KnowledgePromptPacketItem['layer'],
  content: string,
  tokenCost = 8,
): KnowledgePromptPacketItem {
  return {
    id,
    layer,
    label: layer.replace(/_/g, ' '),
    content,
    citations: [],
    citationKeys: [],
    trustLevel: 'observed',
    tokenCost,
    freshness: 'unknown',
  }
}
