import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  convertToModelMessages: vi.fn(),
  getServerAuth: vi.fn(),
  checkRateLimit: vi.fn(),
  getRequestIdentifier: vi.fn(),
  getBYOKModel: vi.fn(),
  getLucidModel: vi.fn(),
  pruneForModel: vi.fn(),
  createMessage: vi.fn(),
  trackAIUsage: vi.fn(),
  searchDocumentChunks: vi.fn(),
  generateEmbedding: vi.fn(),
  incrementUsage: vi.fn(),
  evaluateEntitlement: vi.fn(),
  guardEntitlement: vi.fn(),
  isUserOrgMember: vi.fn(),
  getAssistant: vi.fn(),
  getConversationWithMessages: vi.fn(),
  supabaseRpc: vi.fn(),
  transformPluginRows: vi.fn(),
  runAIGeneration: vi.fn(),
  writeAIGenerationEvent: vi.fn(),
  getAuthoritativeAssistantConnections: vi.fn(),
  applyAuthoritativeConnectionIds: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('ai', () => ({
  streamText: mocks.streamText,
  convertToModelMessages: mocks.convertToModelMessages,
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getServerAuth: mocks.getServerAuth,
}))

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  getRequestIdentifier: mocks.getRequestIdentifier,
  RateLimitPresets: { STANDARD: { windowMs: 60000, max: 60 } },
}))

vi.mock('@/lib/ai/byok-provider', () => ({
  getBYOKModel: mocks.getBYOKModel,
}))

vi.mock('@/lib/ai/providers', () => ({
  getLucidModel: mocks.getLucidModel,
}))

vi.mock('@/lib/ai/context', () => ({
  pruneForModel: mocks.pruneForModel,
}))

vi.mock('@/lib/ai/service', () => ({
  getMessages: vi.fn(),
  createMessage: mocks.createMessage,
  trackAIUsage: mocks.trackAIUsage,
  searchDocumentChunks: mocks.searchDocumentChunks,
  getConversationWithMessages: mocks.getConversationWithMessages,
}))

vi.mock('@/lib/ai/embeddings', () => ({
  generateEmbedding: mocks.generateEmbedding,
}))

vi.mock('@/lib/plans', () => ({
  incrementUsage: mocks.incrementUsage,
}))

vi.mock('@/lib/entitlements', () => ({
  evaluateEntitlement: mocks.evaluateEntitlement,
  guardEntitlement: mocks.guardEntitlement,
}))

vi.mock('@/lib/db', () => ({
  isUserOrgMember: mocks.isUserOrgMember,
  getAssistant: mocks.getAssistant,
}))

vi.mock('@/lib/db/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mocks.supabaseRpc(...args),
  },
}))

vi.mock('@/lib/ai/worker-proxy', () => ({
  transformPluginRows: mocks.transformPluginRows,
}))

vi.mock('@/lib/ai/control-plane/run-generation', () => ({
  runAIGeneration: mocks.runAIGeneration,
}))

vi.mock('@/lib/ai/control-plane/adapters/text', () => ({
  textGenerationAdapter: vi.fn(async (input: { execute: () => unknown }) => ({ result: await input.execute() })),
}))

vi.mock('@/lib/ai/control-plane/adapters/agent-run', () => ({
  agentRunGenerationAdapter: vi.fn(),
}))

vi.mock('@/lib/ai/control-plane/events', () => ({
  writeAIGenerationEvent: mocks.writeAIGenerationEvent,
}))

vi.mock('@/lib/oauth/authoritative-connections', () => ({
  getAuthoritativeAssistantConnections: mocks.getAuthoritativeAssistantConnections,
  applyAuthoritativeConnectionIds: mocks.applyAuthoritativeConnectionIds,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: mocks.captureException,
  },
}))

import { POST } from '../route'

describe('POST /api/ai/chat control-plane migration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getServerAuth.mockResolvedValue({ isAuthenticated: true, userId: 'user-1' })
    mocks.checkRateLimit.mockResolvedValue({ success: true, resetAt: Date.now() + 1000 })
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.evaluateEntitlement.mockResolvedValue({ allowed: true })
    mocks.guardEntitlement.mockReturnValue(null)
    mocks.incrementUsage.mockResolvedValue(undefined)
    mocks.getBYOKModel.mockResolvedValue({ model: 'resolved-model' })
    mocks.getLucidModel.mockReturnValue('lucid-model')
    mocks.convertToModelMessages.mockResolvedValue([{ role: 'user', content: 'Hello' }])
    mocks.pruneForModel.mockResolvedValue([{ role: 'user', content: 'Hello' }])
    mocks.createMessage.mockResolvedValue({})
    mocks.trackAIUsage.mockResolvedValue({})
    mocks.writeAIGenerationEvent.mockResolvedValue('event-1')
    mocks.searchDocumentChunks.mockResolvedValue([])
    mocks.generateEmbedding.mockResolvedValue({ embedding: [0.1] })
    mocks.supabaseRpc.mockResolvedValue({ data: [] })
    mocks.transformPluginRows.mockReturnValue([])
    mocks.getAuthoritativeAssistantConnections.mockResolvedValue({})
    mocks.applyAuthoritativeConnectionIds.mockImplementation((rows: unknown) => rows)

    const streamResult = {
      toUIMessageStreamResponse: vi.fn(() => new Response('chat-stream', {
        status: 200,
        headers: { 'x-lucid-route': 'vercel' },
      })),
    }
    mocks.streamText.mockImplementation((options: { onFinish?: (event: { text: string; usage: { inputTokens: number; outputTokens: number } }) => Promise<void> }) => {
      options.onFinish?.({ text: 'Assistant reply', usage: { inputTokens: 13, outputTokens: 17 } })
      return streamResult
    })
    mocks.runAIGeneration.mockImplementation(async (input: { feature: string; adapter: (adapterInput: unknown) => Promise<unknown>; input: unknown }) => {
      if (input.feature === 'agent-run') {
        return { output: { response: new Response('agent-stream', { status: 200 }) } }
      }
      return { output: await input.adapter(input.input) }
    })
  })

  it('keeps non-agent chat streaming and records final token usage through the control plane', async () => {
    const response = await POST(new NextRequest('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        orgId: 'org-1',
        messages: [{ id: 'msg-1', role: 'user', content: 'Hello' }],
        conversationId: 'conversation-1',
        model: 'lucid-auto',
      }),
    }))

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('chat-stream')
    expect(mocks.runAIGeneration).toHaveBeenCalledWith(expect.objectContaining({
      feature: 'ai-chat',
      modality: 'text',
      recordSuccessEvent: false,
    }))
    expect(mocks.trackAIUsage).toHaveBeenCalledWith('org-1', 13, 17)
    expect(mocks.writeAIGenerationEvent).toHaveBeenCalledWith(expect.objectContaining({
      feature: 'ai-chat',
      modality: 'text',
      success: true,
      usage: {
        inputTokens: 13,
        outputTokens: 17,
        totalTokens: 30,
      },
    }))
  })

  it('wraps assistant-mode worker dispatch as an agent-run without changing the stream response', async () => {
    mocks.getAssistant.mockResolvedValueOnce({
      id: 'assistant-1',
      org_id: 'org-1',
      name: 'Mira',
      system_prompt: null,
      lucid_model: 'lucid-auto',
      temperature: null,
      max_tokens: null,
      memory_enabled: true,
      memory_window_size: null,
      policy_config: {},
      updated_at: new Date().toISOString(),
      runtime_id: null,
    })

    const response = await POST(new NextRequest('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        orgId: 'org-1',
        assistantId: 'assistant-1',
        messages: [{ id: 'msg-1', role: 'user', content: 'Hello agent' }],
        conversationId: 'conversation-1',
        model: 'lucid-auto',
      }),
    }))

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('agent-stream')
    expect(mocks.runAIGeneration).toHaveBeenCalledWith(expect.objectContaining({
      feature: 'agent-run',
      modality: 'agent-run',
      prompt: 'Hello agent',
      input: expect.objectContaining({
        assistantId: 'assistant-1',
        message: 'Hello agent',
        plugins: [],
      }),
    }))
  })
})
