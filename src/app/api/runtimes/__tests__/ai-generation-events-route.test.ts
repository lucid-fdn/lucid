import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('../_auth', () => ({
  authenticateRuntime: vi.fn(),
}))

const maybeSingle = vi.fn()
const eq = vi.fn(() => ({ eq, maybeSingle }))
const select = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ select }))

vi.mock('@/lib/db/client', () => ({
  supabase: { from },
}))

vi.mock('@/lib/ai/control-plane/events', () => ({
  writeAIGenerationEvent: vi.fn(),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
  },
}))

const RUNTIME = {
  id: '11111111-1111-4111-8111-111111111111',
  orgId: '22222222-2222-4222-8222-222222222222',
  generation: 3,
  status: 'connected',
}

const AGENT_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '44444444-4444-4444-8444-444444444444'
const PROJECT_ID = '55555555-5555-4555-8555-555555555555'

describe('POST /api/runtimes/ai-generation-events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    maybeSingle.mockResolvedValue({
      data: {
        id: AGENT_ID,
        org_id: RUNTIME.orgId,
        project_id: PROJECT_ID,
        created_by: USER_ID,
      },
      error: null,
    })
  })

  it('returns 401 when not authenticated', async () => {
    const { authenticateRuntime } = await import('../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue(null)

    const { POST } = await import('../ai-generation-events/route')
    const res = await POST(new Request('http://localhost/api/runtimes/ai-generation-events', {
      method: 'POST',
      body: JSON.stringify({}),
    }) as any)

    expect(res.status).toBe(401)
  })

  it('writes an AI generation event for an authenticated runtime receipt', async () => {
    const { authenticateRuntime } = await import('../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue(RUNTIME as never)
    const { writeAIGenerationEvent } = await import('@/lib/ai/control-plane/events')
    vi.mocked(writeAIGenerationEvent).mockResolvedValue('event-1')

    const { POST } = await import('../ai-generation-events/route')
    const res = await POST(new Request('http://localhost/api/runtimes/ai-generation-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: 'pulse-run-1',
        agentId: AGENT_ID,
        feature: 'agent-run',
        modality: 'agent-run',
        prompt: 'hello',
        success: true,
        model: 'openai/gpt-4.1',
        provider: 'trustgate',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        receipt: { provider: 'trustgate', latencyMs: 123, requestId: 'pulse-run-1' },
      }),
    }) as any)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, generationEventId: 'event-1' })
    expect(writeAIGenerationEvent).toHaveBeenCalledWith(expect.objectContaining({
      context: {
        userId: USER_ID,
        orgId: RUNTIME.orgId,
        assistantId: AGENT_ID,
        projectId: PROJECT_ID,
      },
      feature: 'agent-run',
      modality: 'agent-run',
      prompt: 'hello',
      success: true,
      model: 'openai/gpt-4.1',
      provider: 'trustgate',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      metadata: expect.objectContaining({
        source: 'runtime',
        runtimeId: RUNTIME.id,
        runtimeGeneration: RUNTIME.generation,
        runId: 'pulse-run-1',
      }),
    }))
  })

  it('returns 202 when no profile owner can be resolved', async () => {
    const { authenticateRuntime } = await import('../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue(RUNTIME as never)
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const { POST } = await import('../ai-generation-events/route')
    const res = await POST(new Request('http://localhost/api/runtimes/ai-generation-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: 'pulse-run-2',
        agentId: AGENT_ID,
        feature: 'agent-run',
        modality: 'agent-run',
        prompt: 'hello',
        success: false,
        error: 'provider failed',
      }),
    }) as any)

    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.skipped).toBe(true)
  })
})
