/**
 * Pulse — fail-inbound route tests
 *
 * Locks in the route-level contract for BYO runtimes that explicitly
 * fail/nack an inbound event they've claimed:
 *   - auth 401, JSON 400, zod 400
 *   - 404 event not found
 *   - 403 cross-org ownership mismatch
 *   - `already_applied` when event is no longer in claimed/processing
 *   - success 200 + status='failed' update + best-effort Pulse release
 *   - 500 on DB update failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('../../_auth', () => ({
  authenticateRuntime: vi.fn(),
}))

// Chainable supabase mock built per-test via setSupabaseMock(...)
const fromMock = vi.fn()
vi.mock('@/lib/db/client', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}))

vi.mock('@/lib/pulse', () => ({
  failForRuntime: vi.fn(),
  isPulseAvailable: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/pulse/redis-client', () => ({
  getPulseRedis: vi.fn().mockReturnValue(null),
}))

vi.mock('@contracts/pulse', () => ({
  PulseKeys: {
    lease: (runId: string) => `pulse:lease:${runId}`,
  },
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

const EVENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const RUN_ID = `${EVENT_ID}:0`
const ASSISTANT_ID = '33333333-3333-3333-3333-333333333333'

interface MockChains {
  event?: { data?: unknown; error?: unknown }
  assistant?: { data?: unknown; error?: unknown }
  updateError?: unknown
}

function setSupabaseMock(chains: MockChains) {
  fromMock.mockImplementation((table: string) => {
    const singleMock = vi.fn(async () => {
      if (table === 'assistant_inbound_events') return chains.event ?? { data: null, error: null }
      if (table === 'ai_assistants') return chains.assistant ?? { data: null, error: null }
      return { data: null, error: null }
    })
    const selectChain = {
      eq: vi.fn(() => ({ single: singleMock })),
    }

    const updateInMock = vi.fn(async () => ({ error: chains.updateError ?? null }))
    const updateChain = {
      eq: vi.fn(() => ({ in: updateInMock })),
    }

    return {
      select: vi.fn(() => selectChain),
      update: vi.fn(() => updateChain),
    }
  })
}

async function authedRuntime() {
  const { authenticateRuntime } = await import('../../_auth')
  vi.mocked(authenticateRuntime).mockResolvedValue({
    id: 'runtime-1',
    orgId: 'org-1',
    generation: 1,
    status: 'connected',
  } as any)
}

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/runtimes/messages/fail-inbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/runtimes/messages/fail-inbound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromMock.mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue(null)

    const { POST } = await import('../fail-inbound/route')
    const res = await POST(buildRequest({ eventId: EVENT_ID, runId: RUN_ID }) as any)
    expect(res.status).toBe(401)
  })

  it('returns 400 on invalid JSON body', async () => {
    await authedRuntime()
    const { POST } = await import('../fail-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/fail-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-valid-json',
    })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
  })

  it('returns 400 on zod validation failure (missing eventId)', async () => {
    await authedRuntime()
    const { POST } = await import('../fail-inbound/route')
    const res = await POST(buildRequest({ runId: RUN_ID }) as any)
    expect(res.status).toBe(400)
  })

  it('returns 400 on non-uuid eventId', async () => {
    await authedRuntime()
    const { POST } = await import('../fail-inbound/route')
    const res = await POST(buildRequest({ eventId: 'not-a-uuid', runId: RUN_ID }) as any)
    expect(res.status).toBe(400)
  })

  it('returns 404 when event not found', async () => {
    await authedRuntime()
    setSupabaseMock({ event: { data: null, error: { message: 'not found' } } })

    const { POST } = await import('../fail-inbound/route')
    const res = await POST(buildRequest({ eventId: EVENT_ID, runId: RUN_ID }) as any)
    expect(res.status).toBe(404)
  })

  it('returns 403 when event belongs to a different org', async () => {
    await authedRuntime()
    setSupabaseMock({
      event: {
        data: { id: EVENT_ID, status: 'claimed', assistant_id: ASSISTANT_ID },
        error: null,
      },
      assistant: { data: { org_id: 'other-org' }, error: null },
    })

    const { POST } = await import('../fail-inbound/route')
    const res = await POST(buildRequest({ eventId: EVENT_ID, runId: RUN_ID }) as any)
    expect(res.status).toBe(403)
  })

  it('returns already_applied when event is no longer claimed/processing', async () => {
    await authedRuntime()
    setSupabaseMock({
      event: {
        data: { id: EVENT_ID, status: 'completed', assistant_id: ASSISTANT_ID },
        error: null,
      },
      assistant: { data: { org_id: 'org-1' }, error: null },
    })

    const { POST } = await import('../fail-inbound/route')
    const res = await POST(buildRequest({ eventId: EVENT_ID, runId: RUN_ID }) as any)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('already_applied')
    expect(data.eventId).toBe(EVENT_ID)
  })

  it('returns 200 with status=failed on successful fail', async () => {
    await authedRuntime()
    setSupabaseMock({
      event: {
        data: { id: EVENT_ID, status: 'claimed', assistant_id: ASSISTANT_ID },
        error: null,
      },
      assistant: { data: { org_id: 'org-1' }, error: null },
      updateError: null,
    })

    const { POST } = await import('../fail-inbound/route')
    const res = await POST(
      buildRequest({ eventId: EVENT_ID, runId: RUN_ID, errorMessage: 'boom' }) as any,
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('failed')
    expect(data.eventId).toBe(EVENT_ID)
    expect(data.runId).toBe(RUN_ID)
  })

  it('returns 500 when the failed-status UPDATE errors', async () => {
    await authedRuntime()
    setSupabaseMock({
      event: {
        data: { id: EVENT_ID, status: 'processing', assistant_id: ASSISTANT_ID },
        error: null,
      },
      assistant: { data: { org_id: 'org-1' }, error: null },
      updateError: { message: 'db down' },
    })

    const { POST } = await import('../fail-inbound/route')
    const res = await POST(buildRequest({ eventId: EVENT_ID, runId: RUN_ID }) as any)
    expect(res.status).toBe(500)
  })

  it('fires Pulse release (best-effort) when Pulse is available', async () => {
    await authedRuntime()
    setSupabaseMock({
      event: {
        data: { id: EVENT_ID, status: 'claimed', assistant_id: ASSISTANT_ID },
        error: null,
      },
      assistant: { data: { org_id: 'org-1' }, error: null },
      updateError: null,
    })

    const { isPulseAvailable, failForRuntime } = await import('@/lib/pulse')
    vi.mocked(isPulseAvailable).mockReturnValue(true)

    const { getPulseRedis } = await import('@/lib/pulse/redis-client')
    vi.mocked(getPulseRedis).mockReturnValue({
      get: vi.fn().mockResolvedValue(
        JSON.stringify({ workerId: 'relay-runtime-1', agentId: ASSISTANT_ID }),
      ),
    } as any)

    const { POST } = await import('../fail-inbound/route')
    const res = await POST(
      buildRequest({ eventId: EVENT_ID, runId: `${EVENT_ID}:2` }) as any,
    )
    expect(res.status).toBe(200)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(failForRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: `${EVENT_ID}:2`,
        eventId: EVENT_ID,
        eventType: 'inbound',
        attempt: 2,
        agentId: ASSISTANT_ID,
      }),
      'relay-runtime-1',
    )
  })
})
