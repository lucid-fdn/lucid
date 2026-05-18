import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  verifyExternalKnowledgeToken: vi.fn(),
  runExternalKnowledgeOperation: vi.fn(),
}))

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  getRequestIdentifier: vi.fn(() => 'test-request'),
  RateLimitPresets: {
    RELAXED: { name: 'relaxed' },
    STANDARD: { name: 'standard' },
  },
}))

vi.mock('@/lib/db', () => ({
  verifyExternalKnowledgeToken: mocks.verifyExternalKnowledgeToken,
}))

vi.mock('@/lib/knowledge/external-operation-runner', () => ({
  runExternalKnowledgeOperation: mocks.runExternalKnowledgeOperation,
}))

import { GET, POST } from '../route'

const client = {
  id: '11111111-1111-4111-8111-111111111111',
  orgId: '22222222-2222-4222-8222-222222222222',
  projectId: null,
  teamId: null,
  name: 'Local agent',
  scopes: ['knowledge:read'],
}

describe('/api/knowledge/mcp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkRateLimit.mockResolvedValue({ success: true })
    mocks.verifyExternalKnowledgeToken.mockResolvedValue(client)
    mocks.runExternalKnowledgeOperation.mockResolvedValue({
      status: 200,
      envelope: {
        ok: true,
        result: { packet: { items: [] } },
      },
    })
  })

  it('lists only tools allowed by the token scopes', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/knowledge/mcp', {
      headers: { authorization: 'Bearer lkc_test_token' },
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.tools.map((tool: { name: string }) => tool.name)).toContain('lucid_knowledge_retrieve_context')
    expect(body.tools.map((tool: { name: string }) => tool.name)).not.toContain('lucid_knowledge_claims_create')
  })

  it('dispatches MCP tool calls through the shared external operation runner', async () => {
    const response = await POST(new NextRequest('http://localhost:3000/api/knowledge/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer lkc_test_token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-1',
        method: 'tools/call',
        params: {
          name: 'lucid_knowledge_retrieve_context',
          arguments: { query: 'hello' },
        },
      }),
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.result.structuredContent).toEqual({ packet: { items: [] } })
    expect(mocks.runExternalKnowledgeOperation).toHaveBeenCalledWith(expect.objectContaining({
      token: 'lkc_test_token',
      operation: 'knowledge.retrieve_context',
      input: { query: 'hello' },
      surface: 'mcp',
      requestId: 'call-1',
    }))
  })
})
