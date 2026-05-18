import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('../../../_auth', () => ({
  authenticateRuntime: vi.fn(),
}))

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('@/lib/pulse/redis-client', () => ({
  getPulseRedis: vi.fn(),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
  },
}))

vi.mock('@contracts/dag-step', () => ({
  insertOrchestrationStep: vi.fn(),
}))

const agentQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
}

const redis = {
  set: vi.fn(),
  xadd: vi.fn(),
}

const EVENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const AGENT_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'
const ORG_ID = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/runtimes/steps/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/runtimes/steps/enqueue', () => {
  beforeEach(async () => {
    vi.clearAllMocks()

    const { authenticateRuntime } = await import('../../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue({
      id: 'runtime-1',
      orgId: ORG_ID,
      generation: 1,
      status: 'connected',
    } as never)

    const { supabase } = await import('@/lib/db/client')
    agentQuery.select.mockReturnValue(agentQuery)
    agentQuery.eq.mockReturnValue(agentQuery)
    agentQuery.single.mockResolvedValue({
      data: { id: AGENT_ID, org_id: ORG_ID },
      error: null,
    })
    vi.mocked(supabase.from as never).mockReturnValue(agentQuery)

    const { insertOrchestrationStep } = await import('@contracts/dag-step')
    vi.mocked(insertOrchestrationStep).mockResolvedValue({ stepId: 'step-1' } as never)

    const { getPulseRedis } = await import('@/lib/pulse/redis-client')
    redis.set.mockResolvedValue('OK')
    redis.xadd.mockResolvedValue('stream-id-1')
    vi.mocked(getPulseRedis).mockResolvedValue(redis as never)
  })

  it('returns 401 when not authenticated', async () => {
    const { authenticateRuntime } = await import('../../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue(null)

    const { POST } = await import('../route')
    const res = await POST(makeRequest({}) as never)

    expect(res.status).toBe(401)
  })

  it('enqueues a step into Pulse streams on success', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeRequest({
      eventId: EVENT_ID,
      eventType: 'inbound',
      agentId: AGENT_ID,
      orgId: ORG_ID,
      stepType: 'approval',
      priority: 'normal',
      approvalConfig: {
        toolName: 'send_message',
        toolArgs: { text: 'hello' },
        timeoutSeconds: 60,
      },
    }) as never)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      stepId: 'step-1',
      runId: `${EVENT_ID}:0`,
    })
    expect(redis.set).toHaveBeenCalledTimes(1)
    expect(redis.xadd).toHaveBeenCalledTimes(1)
  })

  it('returns duplicate when the dedup lease already exists', async () => {
    redis.set.mockResolvedValueOnce(null)

    const { POST } = await import('../route')
    const res = await POST(makeRequest({
      eventId: EVENT_ID,
      eventType: 'inbound',
      agentId: AGENT_ID,
      orgId: ORG_ID,
      stepType: 'approval',
      priority: 'normal',
      approvalConfig: {
        toolName: 'send_message',
        toolArgs: { text: 'hello' },
        timeoutSeconds: 60,
      },
    }) as never)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      stepId: 'step-1',
      runId: `${EVENT_ID}:0`,
      duplicate: true,
    })
    expect(redis.xadd).not.toHaveBeenCalled()
  })

  it('returns 503 when Pulse is unavailable', async () => {
    const { getPulseRedis } = await import('@/lib/pulse/redis-client')
    vi.mocked(getPulseRedis).mockResolvedValue(null)

    const { POST } = await import('../route')
    const res = await POST(makeRequest({
      eventId: EVENT_ID,
      eventType: 'inbound',
      agentId: AGENT_ID,
      orgId: ORG_ID,
      stepType: 'approval',
      priority: 'normal',
      approvalConfig: {
        toolName: 'send_message',
        toolArgs: { text: 'hello' },
        timeoutSeconds: 60,
      },
    }) as never)

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ error: 'Pulse not available' })
  })
})
