import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  blendMemoryRecall,
  retrieveAssistantMemoryRecall,
} from '../assistant-recall.js'

describe('assistant memory recall', () => {
  const originalFetch = globalThis.fetch
  const makeSupabase = (rpc: ReturnType<typeof vi.fn>) => ({
    rpc,
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  })

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }] }),
      text: async () => '',
    } as never)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('blends semantic and recent memories with deduplication', () => {
    const blended = blendMemoryRecall([
      {
        id: 'semantic-1',
        content: 'User prefers TypeScript examples.',
        source: 'semantic',
        score: 0.9,
      },
      {
        id: 'semantic-2',
        content: 'User prefers concise answers.',
        source: 'semantic',
        score: 0.8,
      },
    ], [
      {
        id: 'recent-1',
        content: 'User prefers concise answers.',
        source: 'recent',
        score: 0.7,
      },
      {
        id: 'recent-2',
        content: 'User likes production-safe changes.',
        source: 'recent',
        score: 0.6,
      },
    ], 3)

    expect(blended).toEqual([
      'User prefers TypeScript examples.',
      'User prefers concise answers.',
      'User likes production-safe changes.',
    ])
  })

  it('runs recent and scoped semantic recall, then reports telemetry', async () => {
    const rpc = vi.fn(async (name: string, params: Record<string, unknown>) => {
      if (name === 'get_recent_memories_v2') {
        return {
          data: [{
            id: 'recent-1',
            content: 'User prefers concise answers.',
            category: 'preference',
            importance: 0.7,
            encryption_mode: 'NONE',
          }],
          error: null,
        }
      }

      if (name === 'search_memory_v2') {
        expect(params).toMatchObject({
          p_assistant_id: 'assistant-1',
          p_scoped_user_id: 'tenant:user',
          p_channel_type: 'discord',
          p_conversation_id: 'conversation-1',
        })
        return {
          data: [{
            id: 'semantic-1',
            content: 'User is currently testing Discord memory.',
            category: 'context',
            importance: 0.8,
            similarity: 0.88,
            encryption_mode: 'NONE',
          }],
          error: null,
        }
      }

      return { data: [], error: null }
    })

    const result = await retrieveAssistantMemoryRecall({
      supabase: makeSupabase(rpc) as never,
      assistantId: 'assistant-1',
      assistantOrgId: 'org-1',
      scopedUserId: 'tenant:user',
      tenantKey: 'tenant',
      query: 'discord memory test',
      channelType: 'discord',
      conversationId: 'conversation-1',
      lucidApiUrl: 'https://lucid.example',
      semanticEnabled: true,
    })

    expect(result.memories).toEqual([
      'User is currently testing Discord memory.',
      'User prefers concise answers.',
    ])
    expect(result.telemetry).toMatchObject({
      semanticEnabled: true,
      semanticAttempted: true,
      fallbackUsed: false,
      recentCount: 1,
      semanticCount: 1,
      finalCount: 2,
    })
  })

  it('falls back to recent memory when semantic recall is unavailable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('embedding service down')) as never
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const rpc = vi.fn(async (name: string) => {
      if (name === 'get_recent_memories_v2') {
        return {
          data: [{
            id: 'recent-1',
            content: 'User prefers concise answers.',
            category: 'preference',
            importance: 0.7,
            encryption_mode: 'NONE',
          }],
          error: null,
        }
      }

      return { data: [], error: null }
    })

    const result = await retrieveAssistantMemoryRecall({
      supabase: makeSupabase(rpc) as never,
      assistantId: 'assistant-1',
      assistantOrgId: 'org-1',
      scopedUserId: 'tenant:user',
      tenantKey: 'tenant',
      query: 'answer style',
      lucidApiUrl: 'https://lucid.example',
      semanticEnabled: true,
    })

    expect(result.memories).toEqual(['User prefers concise answers.'])
    expect(result.telemetry).toMatchObject({
      semanticEnabled: true,
      semanticAttempted: true,
      fallbackUsed: true,
      semanticCount: 0,
      recentCount: 1,
    })
  })

  it('decrypts encrypted recent and semantic memories through the shared decrypt path', async () => {
    const decryptMessageRow = vi
      .fn()
      .mockResolvedValueOnce({ content: 'Encrypted recent memory.' })
      .mockResolvedValueOnce({ content: 'Encrypted semantic memory.' })

    const rpc = vi.fn(async (name: string) => {
      if (name === 'get_recent_memories_v2') {
        return {
          data: [{
            id: 'recent-1',
            content: null,
            content_encrypted: 'cipher',
            content_iv: 'iv',
            content_auth_tag: 'tag',
            key_id: 'key',
            category: 'context',
            importance: 0.5,
            encryption_mode: 'APP_LAYER',
          }],
          error: null,
        }
      }

      if (name === 'search_memory_v2') {
        return {
          data: [{
            id: 'semantic-1',
            content: null,
            content_encrypted: 'cipher',
            content_iv: 'iv',
            content_auth_tag: 'tag',
            key_id: 'key',
            category: 'context',
            importance: 0.9,
            similarity: 0.9,
            encryption_mode: 'APP_LAYER',
          }],
          error: null,
        }
      }

      return { data: [], error: null }
    })

    const result = await retrieveAssistantMemoryRecall({
      supabase: makeSupabase(rpc) as never,
      assistantId: 'assistant-1',
      assistantOrgId: 'org-1',
      scopedUserId: 'tenant:user',
      tenantKey: 'tenant',
      query: 'encrypted memory',
      lucidApiUrl: 'https://lucid.example',
      encryptionService: { decryptMessageRow } as never,
      semanticEnabled: true,
    })

    expect(result.memories).toEqual([
      'Encrypted semantic memory.',
      'Encrypted recent memory.',
    ])
    expect(decryptMessageRow).toHaveBeenCalledTimes(2)
    expect(decryptMessageRow).toHaveBeenCalledWith(expect.any(Object), 'org-1', 'tenant:tenant:user:recent-1')
    expect(decryptMessageRow).toHaveBeenCalledWith(expect.any(Object), 'org-1', 'tenant:tenant:user:semantic-1')
  })
})
