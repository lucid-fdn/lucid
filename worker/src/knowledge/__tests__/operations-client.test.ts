import { describe, expect, it, vi } from 'vitest'

import { ExternalKnowledgeOperationClient } from '../operations-client'

describe('ExternalKnowledgeOperationClient', () => {
  it('calls the external Knowledge endpoint with a scoped token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      operation: 'knowledge.retrieve_context',
      requestId: 'request-1',
      durationMs: 1,
      result: { packet: { items: [] } },
    }), { status: 200 }))
    const client = new ExternalKnowledgeOperationClient({
      controlPlaneUrl: 'https://lucid.test/',
      token: 'lkc_secret_token',
      fetchImpl,
    })

    await expect(client.call({
      operation: 'knowledge.retrieve_context',
      payload: { query: 'hello' },
    })).resolves.toMatchObject({
      ok: true,
      operation: 'knowledge.retrieve_context',
    })

    expect(fetchImpl).toHaveBeenCalledWith('https://lucid.test/api/knowledge/external/operations', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer lkc_secret_token',
      }),
      body: JSON.stringify({
        operation: 'knowledge.retrieve_context',
        input: { query: 'hello' },
      }),
    }))
  })
})
