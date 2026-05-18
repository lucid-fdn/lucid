/**
 * Pulse — renew-lease route tests
 *
 * Locks in the route-level contract for BYO runtimes that want to
 * extend their claim on an in-flight inbound event before the TTL
 * lease (or DB orphan detector) considers them stale:
 *   - auth 401, JSON 400, zod 400
 *   - 404 event not found
 *   - 403 cross-org ownership mismatch
 *   - 409 when event is no longer in claimed/processing
 *   - 200 success + updated_at touch + best-effort Pulse lease renewal
 *
 * renew-lease diverges from fail-inbound in that "already finished"
 * is an error (409), not a success envelope — the runtime should not
 * be trying to extend a lease on something it doesn't own anymore.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('../../_auth', () => ({
  authenticateRuntime: vi.fn(),
}))

const fromMock = vi.fn()
vi.mock('@/lib/db/client', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}))

vi.mock('@/lib/pulse', () => ({
  isPulseAvailable: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/pulse/redis-client', () => ({
  getPulseRedis: vi.fn().mockReturnValue(null),
}))

vi.mock('@contracts/pulse', () => ({
  PulseKeys: {
    lease: (runId: string) => `pulse:lease:${runId}`,
  },
  RENEW_LEASE_LUA: 'FAKE_LUA',
  LEASE_TTL_SECONDS: 60,
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
}

function setSupabaseMock(chains: MockChains) {
  fromMock.mockImplementation((table: string) => {
    const singleMock = vi.fn(async () => {
      if (table === 'assistant_inbound_events') return chains.event ?? { data: null, error: null }
      if (table === 'ai_assistants') return chains.assistant ?? { data: null, error: null }
      return { data: null, error: null }
    })
    const selectChain = { eq: vi.fn(() => ({ single: singleMock })) }

    const updateInMock = vi.fn(async () => ({ error: null }))
    const updateChain = { eq: vi.fn(() => ({ in: updateInMock })) }

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
  return new Request('http://localhost/api/runtimes/messages/renew-lease', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/runtimes/messages/renew-lease', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromMock.mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue(null)

    const { POST } = await import('../renew-lease/route')
    const res = await POST(buildRequest({ eventId: EVENT_ID, runId: RUN_ID }) as any)
    expect(res.status).toBe(401)
  })

  it('returns 400 on invalid JSON body', async () => {
    await authedRuntime()
    const { POST } = await import('../renew-lease/route')
    const req = new Request('http://localhost/api/runtimes/messages/renew-lease', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad',
    })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
  })

  it('returns 400 on zod validation failure (missing runId)', async () => {
    await authedRuntime()
    const { POST } = await import('../renew-lease/route')
    const res = await POST(buildRequest({ eventId: EVENT_ID }) as any)
    expect(res.status).toBe(400)
  })

  it('returns 404 when event not found', async () => {
    await authedRuntime()
    setSupabaseMock({ event: { data: null, error: { message: 'not found' } } })

    const { POST } = await import('../renew-lease/route')
    const res = await POST(buildRequest({ eventId: EVENT_ID, runId: RUN_ID }) as any)
    expect(res.status).toBe(404)
  })

  it('returns 403 when the event belongs to a different org', async () => {
    await authedRuntime()
    setSupabaseMock({
      event: {
        data: { id: EVENT_ID, status: 'claimed', assistant_id: ASSISTANT_ID },
        error: null,
      },
      assistant: { data: { org_id: 'other-org' }, error: null },
    })

    const { POST } = await import('../renew-lease/route')
    const res = await POST(buildRequest({ eventId: EVENT_ID, runId: RUN_ID }) as any)
    expect(res.status).toBe(403)
  })

  it('returns 409 when event is no longer in an active state', async () => {
    await authedRuntime()
    setSupabaseMock({
      event: {
        data: { id: EVENT_ID, status: 'completed', assistant_id: ASSISTANT_ID },
        error: null,
      },
      assistant: { data: { org_id: 'org-1' }, error: null },
    })

    const { POST } = await import('../renew-lease/route')
    const res = await POST(buildRequest({ eventId: EVENT_ID, runId: RUN_ID }) as any)
    expect(res.status).toBe(409)
  })

  it('returns 200 with status=renewed on success', async () => {
    await authedRuntime()
    setSupabaseMock({
      event: {
        data: { id: EVENT_ID, status: 'processing', assistant_id: ASSISTANT_ID },
        error: null,
      },
      assistant: { data: { org_id: 'org-1' }, error: null },
    })

    const { POST } = await import('../renew-lease/route')
    const res = await POST(buildRequest({ eventId: EVENT_ID, runId: RUN_ID }) as any)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('renewed')
    expect(data.eventId).toBe(EVENT_ID)
    expect(data.runId).toBe(RUN_ID)
  })

  it('best-effort Pulse lease renewal fires when Pulse is available', async () => {
    await authedRuntime()
    setSupabaseMock({
      event: {
        data: { id: EVENT_ID, status: 'claimed', assistant_id: ASSISTANT_ID },
        error: null,
      },
      assistant: { data: { org_id: 'org-1' }, error: null },
    })

    const { isPulseAvailable } = await import('@/lib/pulse')
    vi.mocked(isPulseAvailable).mockReturnValue(true)

    const evalMock = vi.fn().mockResolvedValue(1)
    const { getPulseRedis } = await import('@/lib/pulse/redis-client')
    vi.mocked(getPulseRedis).mockReturnValue({
      get: vi.fn().mockResolvedValue(
        JSON.stringify({ workerId: 'relay-runtime-1' }),
      ),
      eval: evalMock,
    } as any)

    const { POST } = await import('../renew-lease/route')
    const res = await POST(buildRequest({ eventId: EVENT_ID, runId: RUN_ID }) as any)
    expect(res.status).toBe(200)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(evalMock).toHaveBeenCalledWith(
      'FAKE_LUA',
      [`pulse:lease:${RUN_ID}`],
      ['relay-runtime-1', '60'],
    )
  })
})
