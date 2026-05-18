import { describe, expect, it } from 'vitest'
import {
  buildKnowledgePromptPacket,
  renderKnowledgePromptPacket,
} from '../prompt-packet'
import type { RetrievedKnowledge } from '../types'

describe('KnowledgePromptPacket', () => {
  it('keeps prompt packets bounded by token budget and per-layer limits', () => {
    const retrieved: RetrievedKnowledge[] = [
      {
        id: 'a',
        layer: 'assistant_memory',
        content: 'User prefers concise answers.',
        score: 0.9,
        citations: [],
        trustLevel: 'observed',
        tokenCost: 8,
      },
      {
        id: 'b',
        layer: 'assistant_memory',
        content: 'User prefers TypeScript examples.',
        score: 0.8,
        citations: [],
        trustLevel: 'observed',
        tokenCost: 8,
      },
      {
        id: 'c',
        layer: 'project_brain',
        content: 'Project uses Agent Ops for QA workflows.',
        score: 0.7,
        citations: [],
        trustLevel: 'operator_approved',
        tokenCost: 8,
      },
    ]

    const packet = buildKnowledgePromptPacket({
      orgId: 'org-1',
      query: 'how should I answer?',
      budget: { maxPromptTokens: 20, maxItemsPerLayer: 1 },
    }, retrieved)

    expect(packet.items.map(item => item.id)).toEqual(['a', 'c'])
    expect(packet.omitted).toEqual([{ layer: 'assistant_memory', reason: 'budget', count: 1 }])
    expect(packet.telemetry.retrievalCounts).toMatchObject({
      assistant_memory: 2,
      project_brain: 1,
    })
  })

  it('renders prompt-safe knowledge context without internal implementation terms', () => {
    const packet = buildKnowledgePromptPacket({
      orgId: 'org-1',
      query: 'what do we know?',
    }, [{
      id: 'memory-1',
      layer: 'assistant_memory',
      content: 'User prefers direct answers.',
      score: 1,
      citations: [],
      trustLevel: 'observed',
      tokenCost: 6,
    }])

    expect(renderKnowledgePromptPacket(packet)).toContain('<knowledge_context>')
    expect(renderKnowledgePromptPacket(packet)).toContain('[assistant memory; trust=observed; confidence=')
  })

  it('adds compact source labels and citation keys to prompt packet items', () => {
    const packet = buildKnowledgePromptPacket({
      orgId: 'org-1',
      query: 'what changed?',
    }, [{
      id: 'project-knowledge-1',
      layer: 'project_brain',
      content: 'Checkout now uses Agent Ops.',
      source: {
        orgId: 'org-1',
        type: 'agent_ops',
        visibility: 'project',
        trustLevel: 'operator_approved',
        label: 'Agent Ops run',
      },
      score: 1,
      citations: [{ kind: 'run', runId: 'run-1', label: 'QA run' }],
      trustLevel: 'operator_approved',
      freshness: 'fresh',
      tokenCost: 8,
    }])

    expect(packet.items[0]?.sourceLabel).toBe('Agent Ops run')
    expect(packet.items[0]?.confidence).toBeGreaterThan(0.8)
    expect(packet.quality?.citationCoverage).toBe(1)
    expect(packet.items[0]?.citationKeys).toEqual(['run:run-1'])
    expect(renderKnowledgePromptPacket(packet)).toContain('source=Agent Ops run')
    expect(renderKnowledgePromptPacket(packet)).toContain('citations=run:run-1')
  })
})
