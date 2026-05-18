import { describe, expect, it, vi } from 'vitest'
import { MemoryRetriever } from '../MemoryRetriever.js'

function createSupabaseMock() {
  const rpc = vi.fn().mockResolvedValue({
    data: [{
      id: 'memory-1',
      content: 'User prefers concise answers.',
      category: 'preference',
      importance: 0.9,
      similarity: 0.82,
    }],
    error: null,
  })

  const update = vi.fn(() => ({
    in: vi.fn().mockResolvedValue({ error: null }),
  }))

  const from = vi.fn(() => ({
    update,
  }))

  return {
    supabase: { rpc, from },
    rpc,
    from,
  }
}

describe('MemoryRetriever', () => {
  it('requires scoped user id and calls only the scoped semantic search RPC', async () => {
    const { supabase, rpc } = createSupabaseMock()
    const retriever = new MemoryRetriever(supabase as never, {
      embedder: { embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]) } as never,
    })

    const results = await retriever.retrieve('assistant-1', 'org:user:telegram:42', 'answer style')

    expect(results).toHaveLength(1)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('search_memory_v2', expect.objectContaining({
      p_assistant_id: 'assistant-1',
      p_scoped_user_id: 'org:user:telegram:42',
      p_query_embedding: '[0.1,0.2,0.3]',
    }))
    expect(rpc).not.toHaveBeenCalledWith('search_memory', expect.anything())
  })

  it('does not search when scoped user id is missing', async () => {
    const { supabase, rpc } = createSupabaseMock()
    const embed = vi.fn()
    const retriever = new MemoryRetriever(supabase as never, {
      embedder: { embed } as never,
    })

    await expect(retriever.retrieve('assistant-1', '', 'answer style')).resolves.toEqual([])
    expect(embed).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('passes optional source filters for org, project, channel, and conversation isolation', async () => {
    const { supabase, rpc } = createSupabaseMock()
    const retriever = new MemoryRetriever(supabase as never, {
      embedder: { embed: vi.fn().mockResolvedValue([0.4, 0.5, 0.6]) } as never,
    })

    await retriever.retrieve('assistant-1', 'tenant:user', 'pricing', {
      orgId: 'org-1',
      projectId: 'project-1',
      channelType: 'slack',
      conversationId: 'conversation-1',
      categories: ['fact', 'instruction'],
    })

    expect(rpc).toHaveBeenCalledWith('search_memory_v2', expect.objectContaining({
      p_org_id: 'org-1',
      p_project_id: 'project-1',
      p_channel_type: 'slack',
      p_conversation_id: 'conversation-1',
      p_categories: ['fact', 'instruction'],
    }))
  })

  it('scopes category browsing by assistant and scoped user', async () => {
    const eq = vi.fn()
    const query = {
      select: vi.fn(() => query),
      eq,
      order: vi.fn(() => query),
      gte: vi.fn(() => query),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    eq.mockReturnValue(query)
    const from = vi.fn(() => query)

    const retriever = new MemoryRetriever({ from } as never, {
      embedder: { embed: vi.fn() } as never,
    })

    await retriever.retrieveByCategory('assistant-1', 'tenant:user', 'preference', { limit: 5 })

    expect(from).toHaveBeenCalledWith('assistant_memory')
    expect(eq).toHaveBeenCalledWith('assistant_id', 'assistant-1')
    expect(eq).toHaveBeenCalledWith('scoped_user_id', 'tenant:user')
    expect(eq).toHaveBeenCalledWith('category', 'preference')
  })
})
