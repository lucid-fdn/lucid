import { describe, expect, it } from 'vitest'
import { getEngineMemoryAdapter } from '../index.js'

describe('EngineMemoryAdapter', () => {
  const knowledgePromptPacket = {
    version: '2026-05-06.knowledge-prompt-packet.v1' as const,
    generatedAt: '2026-05-06T00:00:00.000Z',
    orgId: 'org-1',
    mode: 'summary' as const,
    budget: {
      maxLatencyMs: 180,
      maxPromptTokens: 1200,
      maxItemsPerLayer: 8,
    },
    items: [{
      id: 'assistant_memory:0',
      layer: 'assistant_memory' as const,
      label: 'assistant memory',
      content: 'User prefers concise answers.',
      citations: [],
      trustLevel: 'observed' as const,
      tokenCost: 8,
    }, {
      id: 'org_brain:0',
      layer: 'org_brain' as const,
      label: 'org brain',
      content: '[policy] Verify before trading.',
      citations: [],
      trustLevel: 'system' as const,
      tokenCost: 8,
    }],
    omitted: [],
    telemetry: {
      durationMs: 0,
      timedOut: false,
      fallbackUsed: false,
      retrievalCounts: {
        assistant_memory: 1,
        org_brain: 1,
      },
    },
  }

  it('mounts OpenClaw memories into system prompt sections with org knowledge wrapping', () => {
    const adapter = getEngineMemoryAdapter('openclaw')
    const mounted = adapter.mountMemory({
      memories: ['User prefers concise answers'],
      boardMemories: ['[policy] Verify before trading'],
    }, {
      engine: 'openclaw',
      runtimeFlavor: 'shared',
      channelOwnership: 'lucid_relay',
    })

    expect(mounted.systemSections).toEqual([
      '\n\n## Memories\nUser prefers concise answers',
      '\n\n## Organization Knowledge\n<org_knowledge>\n[policy] Verify before trading\n</org_knowledge>',
    ])
    expect(mounted.promptMemoryInjection).toEqual(['User prefers concise answers'])
    expect(mounted.promptBoardMemories).toEqual(['[policy] Verify before trading'])
  })

  it('keeps Hermes memories as prompt-native arrays without OpenClaw formatting', () => {
    const adapter = getEngineMemoryAdapter('hermes')
    const mounted = adapter.mountMemory({
      memories: ['remember this'],
      boardMemories: ['Org fact'],
    }, {
      engine: 'hermes',
      runtimeFlavor: 'shared',
      channelOwnership: 'lucid_relay',
    })

    expect(mounted.systemSections).toEqual([])
    expect(mounted.promptMemoryInjection).toEqual(['remember this'])
    expect(mounted.promptBoardMemories).toEqual(['Org fact'])
  })

  it('mounts KnowledgePromptPacket once for OpenClaw instead of duplicating legacy memory sections', () => {
    const adapter = getEngineMemoryAdapter('openclaw')
    const mounted = adapter.mountMemory({
      memories: ['legacy user memory'],
      boardMemories: ['legacy org memory'],
      knowledgePromptPacket,
    }, {
      engine: 'openclaw',
      runtimeFlavor: 'shared',
      channelOwnership: 'lucid_relay',
    })

    expect(mounted.systemSections).toHaveLength(1)
    expect(mounted.systemSections[0]).toContain('## Knowledge Context')
    expect(mounted.systemSections[0]).toContain('<knowledge_context>')
    expect(mounted.systemSections[0]).not.toContain('## Memories')
    expect(mounted.systemSections[0]).not.toContain('<org_knowledge>')
    expect(mounted.promptMemoryInjection).toEqual([
      '[assistant memory; trust=observed] User prefers concise answers.',
      '[org brain; trust=system] [policy] Verify before trading.',
    ])
    expect(mounted.promptBoardMemories).toEqual([])
  })

  it('mounts KnowledgePromptPacket for Hermes as prompt-native memory items', () => {
    const adapter = getEngineMemoryAdapter('hermes')
    const mounted = adapter.mountMemory({
      memories: ['legacy user memory'],
      boardMemories: ['legacy org memory'],
      knowledgePromptPacket,
    }, {
      engine: 'hermes',
      runtimeFlavor: 'shared',
      channelOwnership: 'lucid_relay',
    })

    expect(mounted.systemSections).toEqual([])
    expect(mounted.promptMemoryInjection).toEqual([
      '[assistant memory; trust=observed] User prefers concise answers.',
      '[org brain; trust=system] [policy] Verify before trading.',
    ])
    expect(mounted.promptBoardMemories).toEqual([])
  })
})
