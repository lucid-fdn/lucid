import { describe, expect, it, vi } from 'vitest'

import type { Config } from '../../config.js'
import { buildKnowledgeContextLadder, buildKnowledgeHotPacket } from '../../knowledge/prompt-packet.js'
import { loadRuntimeKnowledgePromptPacket } from '../inbound.js'

function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    LUCID_API_BASE_URL: 'http://control-plane.test/v1',
    WORKER_TRIGGER_SECRET: 'worker-secret',
    ...overrides,
  } as Config
}

const baseInput = {
  orgId: 'org-1',
  assistantId: 'assistant-1',
  scopedUserId: 'user-1',
  query: 'What should the agent remember?',
  memories: ['User prefers concise updates.'],
  boardMemories: ['Workspace policy: cite source-backed facts.'],
  contextLadder: buildKnowledgeContextLadder({ orgId: 'org-1', assistantId: 'assistant-1' }),
  hotPacket: buildKnowledgeHotPacket({ latestMessage: 'What should the agent remember?' }),
}

describe('loadRuntimeKnowledgePromptPacket', () => {
  it('uses the control-plane Brain operation when available', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(_url)).toBe('http://control-plane.test/api/knowledge/operations')
      expect(JSON.parse(String(init?.body))).toMatchObject({
        operation: 'knowledge.retrieve_context',
        surface: 'worker_tool',
        input: {
          org_id: 'org-1',
          assistant_id: 'assistant-1',
          scoped_user_id: 'user-1',
        },
      })
      return Response.json({
        ok: true,
        operation: 'knowledge.retrieve_context',
        requestId: 'req-1',
        durationMs: 12,
        result: {
          version: '2026-05-06.knowledge-prompt-packet.v1',
          generatedAt: new Date(0).toISOString(),
          orgId: 'org-1',
          assistantId: 'assistant-1',
          scopedUserId: 'user-1',
          mode: 'evidence',
          budget: { maxLatencyMs: 900, maxPromptTokens: 2600, maxItemsPerLayer: 6 },
          items: [{
            id: 'brain:item-1',
            layer: 'org_brain',
            label: 'Org Brain',
            content: 'Canonical Brain packet.',
            citations: [],
            trustLevel: 'system',
            tokenCost: 6,
          }],
          omitted: [],
          telemetry: {
            durationMs: 12,
            timedOut: false,
            fallbackUsed: false,
            retrievalCounts: { org_brain: 1 },
          },
        },
      })
    }) as unknown as typeof fetch

    const packet = await loadRuntimeKnowledgePromptPacket({
      ...baseInput,
      config: testConfig(),
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(packet?.items[0]?.content).toBe('Canonical Brain packet.')
    expect(packet?.telemetry.fallbackUsed).toBe(false)
  })

  it('falls back to the local legacy packet builder when the Brain operation fails', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'control plane unavailable' },
    }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch

    const packet = await loadRuntimeKnowledgePromptPacket({
      ...baseInput,
      config: testConfig(),
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(packet?.items.map((item) => item.content)).toEqual([
      'User prefers concise updates.',
      'Workspace policy: cite source-backed facts.',
    ])
    expect(packet?.telemetry.retrievalCounts).toMatchObject({
      assistant_memory: 1,
      org_brain: 1,
    })
  })

  it('falls back to the local legacy packet builder when knowledge.retrieve_context returns an error envelope', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        operation: 'knowledge.retrieve_context',
        surface: 'worker_tool',
      })
      return Response.json({
        ok: false,
        operation: 'knowledge.retrieve_context',
        requestId: 'req-failed',
        durationMs: 34,
        error: {
          code: 'retrieve_context_failed',
          message: 'retrieval backend temporarily unavailable',
        },
      })
    }) as unknown as typeof fetch

    const packet = await loadRuntimeKnowledgePromptPacket({
      ...baseInput,
      config: testConfig(),
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(packet?.items.map((item) => item.content)).toEqual([
      'User prefers concise updates.',
      'Workspace policy: cite source-backed facts.',
    ])
    expect(packet?.telemetry.retrievalCounts).toMatchObject({
      assistant_memory: 1,
      org_brain: 1,
    })
  })

  it('uses the local legacy packet builder for offline workers without a trigger secret', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch

    const packet = await loadRuntimeKnowledgePromptPacket({
      ...baseInput,
      config: testConfig({ WORKER_TRIGGER_SECRET: undefined }),
      fetchImpl,
    })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(packet?.items.length).toBe(2)
    expect(packet?.contextExplanation?.latestMessage).toBe('What should the agent remember?')
  })
})
