import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  runExternalKnowledgeOperation: vi.fn(),
}))

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  getRequestIdentifier: vi.fn(() => 'test-request'),
  RateLimitPresets: {
    STANDARD: { name: 'standard' },
  },
}))

vi.mock('@/lib/knowledge/external-operation-runner', () => ({
  runExternalKnowledgeOperation: mocks.runExternalKnowledgeOperation,
}))

import { POST } from '../route'

describe('/api/knowledge/external/operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkRateLimit.mockResolvedValue({ success: true })
    mocks.runExternalKnowledgeOperation.mockResolvedValue({
      status: 200,
      envelope: {
        ok: true,
        operation: 'knowledge.retrieve_context',
        requestId: 'request-1',
        durationMs: 12,
        result: { packet: { items: [] } },
      },
    })
  })

  it('accepts the canonical operation envelope shape', async () => {
    const response = await POST(new NextRequest('http://localhost:3000/api/knowledge/external/operations', {
      method: 'POST',
      headers: {
        authorization: 'Bearer lkc_test_token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'knowledge.retrieve_context',
        input: { query: 'launch notes' },
      }),
    }))

    expect(response.status).toBe(200)
    expect(mocks.runExternalKnowledgeOperation).toHaveBeenCalledWith(expect.objectContaining({
      token: 'lkc_test_token',
      operation: 'knowledge.retrieve_context',
      input: { query: 'launch notes' },
      surface: 'external_agent',
    }))
  })

  it('keeps legacy flattened calls working for local mock clients', async () => {
    await POST(new NextRequest('http://localhost:3000/api/knowledge/external/operations', {
      method: 'POST',
      headers: {
        authorization: 'Bearer lkc_test_token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'knowledge.think',
        query: 'what changed?',
        mode: 'answer',
      }),
    }))

    expect(mocks.runExternalKnowledgeOperation).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'knowledge.think',
      input: { query: 'what changed?', mode: 'answer' },
    }))
  })

  it('requires bearer tokens without logging token values', async () => {
    const response = await POST(new NextRequest('http://localhost:3000/api/knowledge/external/operations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'knowledge.retrieve_context', input: { query: 'x' } }),
    }))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(JSON.stringify(body)).not.toContain('lkc_')
    expect(mocks.runExternalKnowledgeOperation).not.toHaveBeenCalled()
  })
})
