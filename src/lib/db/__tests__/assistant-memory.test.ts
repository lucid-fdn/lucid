import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  getAssistantMemories,
  mapAssistantMemoryRows,
  searchAssistantMemoriesForKnowledge,
  type AssistantMemoryRow,
} from '../assistant-memory'

describe('assistant memory DB helpers', () => {
  it('maps encrypted memories through an explicit decrypt-capable helper', async () => {
    const rows: AssistantMemoryRow[] = [{
      id: 'memory-1',
      content: null,
      content_encrypted: 'ciphertext',
      content_iv: 'iv',
      content_auth_tag: 'tag',
      encryption_mode: 'APP_LAYER',
      key_id: 'key',
      category: 'preference',
      importance: 0.8,
      source_run_id: 'run-1',
      source_channel_type: 'discord',
    }]

    const mapped = await mapAssistantMemoryRows(rows, {
      decrypt: vi.fn().mockResolvedValue('User prefers direct answers.'),
    })

    expect(mapped[0]).toMatchObject({
      id: 'memory-1',
      fact_text: 'User prefers direct answers.',
      encrypted: true,
      redaction_state: 'none',
      source_run_id: 'run-1',
      source_channel_type: 'discord',
    })
  })

  it('does not expose blank encrypted content as plaintext when decryptor is unavailable', async () => {
    const mapped = await mapAssistantMemoryRows([{
      id: 'memory-1',
      content: null,
      content_encrypted: 'ciphertext',
      category: 'fact',
      importance: 1,
      encryption_mode: 'APP_LAYER',
    }])

    expect(mapped[0]).toMatchObject({
      fact_text: '',
      encrypted: true,
      redaction_state: 'encrypted_unavailable',
    })
  })

  it('selects encryption and provenance fields for admin/API reads', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null })
    const order = vi.fn(() => ({ limit }))
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    const countEq = vi.fn().mockResolvedValue({ count: 0 })
    const countSelect = vi.fn(() => ({ eq: countEq }))
    const from = vi
      .fn()
      .mockReturnValueOnce({ select })
      .mockReturnValueOnce({ select: countSelect })

    await getAssistantMemories('assistant-1', 10, {
      client: { from } as never,
    })

    expect(select).toHaveBeenCalledWith(expect.stringContaining('content_encrypted'))
    expect(select).toHaveBeenCalledWith(expect.stringContaining('source_inbound_event_id'))
    expect(select).toHaveBeenCalledWith(expect.stringContaining('source_evidence_handle'))
    expect(eq).toHaveBeenCalledWith('assistant_id', 'assistant-1')
  })

  it('uses scoped semantic memory search for Knowledge retrieval', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        id: 'memory-1',
        content: 'User prefers concise answers.',
        category: 'preference',
        importance: 0.8,
        similarity: 0.91,
      }],
      error: null,
    })

    const results = await searchAssistantMemoriesForKnowledge({
      assistantId: 'assistant-1',
      scopedUserId: 'user-1',
      queryEmbedding: [0.1, 0.2],
      orgId: '22222222-2222-4222-8222-222222222222',
      client: { rpc } as never,
    })

    expect(rpc).toHaveBeenCalledWith('search_memory_v2', expect.objectContaining({
      p_assistant_id: 'assistant-1',
      p_scoped_user_id: 'user-1',
      p_query_embedding: '[0.1,0.2]',
      p_org_id: '22222222-2222-4222-8222-222222222222',
    }))
    expect(results[0]).toMatchObject({
      fact_text: 'User prefers concise answers.',
      similarity: 0.91,
    })
  })
})
