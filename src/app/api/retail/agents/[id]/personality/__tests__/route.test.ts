import { NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { featuresMock } = vi.hoisted(() => ({
  featuresMock: { retailFunnel: true },
}))
vi.mock('@/lib/features', () => ({
  FEATURES: featuresMock,
}))

vi.mock('@/lib/auth/csrf', () => ({
  withCSRF: <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
}))

const {
  getUserIdMock,
  updateRetailAgentPersonalityMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  getUserIdMock: vi.fn(),
  updateRetailAgentPersonalityMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: getUserIdMock,
}))

vi.mock('@/lib/retail/personality', () => ({
  updateRetailAgentPersonality: updateRetailAgentPersonalityMock,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: captureExceptionMock },
}))

const VALID_ID = '11111111-2222-3333-4444-555555555555'

async function loadRoute() {
  const mod = await import('../route')
  return mod.POST as unknown as (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<NextResponse>
}

function makeRequest(body: unknown): Request {
  return new Request(`http://localhost/api/retail/agents/${VALID_ID}/personality`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeCtx(id = VALID_ID) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  featuresMock.retailFunnel = true
  getUserIdMock.mockResolvedValue('user-1')
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/retail/agents/[id]/personality', () => {
  it('404s when the feature flag is off', async () => {
    featuresMock.retailFunnel = false
    const POST = await loadRoute()
    const res = await POST(makeRequest({ presetId: 'friendly' }), makeCtx())
    expect(res.status).toBe(404)
    expect(getUserIdMock).not.toHaveBeenCalled()
    expect(updateRetailAgentPersonalityMock).not.toHaveBeenCalled()
  })

  it('401s when the user is not signed in', async () => {
    getUserIdMock.mockResolvedValue(null)
    const POST = await loadRoute()
    const res = await POST(makeRequest({ presetId: 'friendly' }), makeCtx())
    expect(res.status).toBe(401)
    expect(updateRetailAgentPersonalityMock).not.toHaveBeenCalled()
  })

  it('400s when neither presetId nor content is provided', async () => {
    const POST = await loadRoute()
    const res = await POST(makeRequest({}), makeCtx())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Validation failed')
    expect(updateRetailAgentPersonalityMock).not.toHaveBeenCalled()
  })

  it('400s when both presetId and content are provided', async () => {
    const POST = await loadRoute()
    const res = await POST(
      makeRequest({ presetId: 'friendly', content: 'hello' }),
      makeCtx(),
    )
    expect(res.status).toBe(400)
    expect(updateRetailAgentPersonalityMock).not.toHaveBeenCalled()
  })

  it('404s when the service returns invalid_id', async () => {
    updateRetailAgentPersonalityMock.mockResolvedValue({
      ok: false,
      reason: 'invalid_id',
    })
    const POST = await loadRoute()
    const res = await POST(makeRequest({ presetId: 'friendly' }), makeCtx())
    expect(res.status).toBe(404)
  })

  it('404s when the service returns not_found (cross-user guard)', async () => {
    updateRetailAgentPersonalityMock.mockResolvedValue({
      ok: false,
      reason: 'not_found',
    })
    const POST = await loadRoute()
    const res = await POST(makeRequest({ presetId: 'friendly' }), makeCtx())
    expect(res.status).toBe(404)
  })

  it('400s when the preset is unknown', async () => {
    updateRetailAgentPersonalityMock.mockResolvedValue({
      ok: false,
      reason: 'invalid_preset',
    })
    const POST = await loadRoute()
    const res = await POST(makeRequest({ presetId: 'nope' }), makeCtx())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/preset/i)
  })

  it('400s when the content is too long', async () => {
    updateRetailAgentPersonalityMock.mockResolvedValue({
      ok: false,
      reason: 'too_long',
    })
    const POST = await loadRoute()
    const res = await POST(makeRequest({ content: 'short' }), makeCtx())
    expect(res.status).toBe(400)
  })

  it('happy path: returns soulContent on preset apply', async () => {
    updateRetailAgentPersonalityMock.mockResolvedValue({
      ok: true,
      assistantId: VALID_ID,
      soulContent: 'You are warm, encouraging...',
    })
    const POST = await loadRoute()
    const res = await POST(makeRequest({ presetId: 'friendly' }), makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      id: VALID_ID,
      soulContent: 'You are warm, encouraging...',
    })
    expect(updateRetailAgentPersonalityMock).toHaveBeenCalledWith({
      userId: 'user-1',
      assistantId: VALID_ID,
      presetId: 'friendly',
      content: undefined,
    })
  })

  it('happy path: passes free-text content through', async () => {
    updateRetailAgentPersonalityMock.mockResolvedValue({
      ok: true,
      assistantId: VALID_ID,
      soulContent: 'You are a no-nonsense assistant.',
    })
    const POST = await loadRoute()
    const res = await POST(
      makeRequest({ content: 'You are a no-nonsense assistant.' }),
      makeCtx(),
    )
    expect(res.status).toBe(200)
    expect(updateRetailAgentPersonalityMock).toHaveBeenCalledWith({
      userId: 'user-1',
      assistantId: VALID_ID,
      presetId: undefined,
      content: 'You are a no-nonsense assistant.',
    })
  })

  it('429s after the per-user rate limit is exceeded', async () => {
    updateRetailAgentPersonalityMock.mockResolvedValue({
      ok: true,
      assistantId: VALID_ID,
      soulContent: 'x',
    })
    const POST = await loadRoute()
    for (let i = 0; i < 20; i++) {
      const ok = await POST(makeRequest({ presetId: 'friendly' }), makeCtx())
      expect(ok.status).toBe(200)
    }
    const tripped = await POST(makeRequest({ presetId: 'friendly' }), makeCtx())
    expect(tripped.status).toBe(429)
  })

  it('500s and captures on unexpected service errors', async () => {
    updateRetailAgentPersonalityMock.mockRejectedValue(new Error('boom'))
    const POST = await loadRoute()
    const res = await POST(makeRequest({ presetId: 'friendly' }), makeCtx())
    expect(res.status).toBe(500)
    expect(captureExceptionMock).toHaveBeenCalled()
  })
})
