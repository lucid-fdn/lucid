import { NextResponse } from 'next/server'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { featuresMock } = vi.hoisted(() => ({
  featuresMock: { retailFunnel: true },
}))
vi.mock('@/lib/features', () => ({
  FEATURES: featuresMock,
}))

// withCSRF is a pass-through in tests — we cover CSRF in csrf.test.ts.
// Mocking it here lets us test the route's business logic without
// supplying a valid CSRF cookie + header on every Request.
vi.mock('@/lib/auth/csrf', () => ({
  withCSRF: <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
}))

const {
  getUserIdMock,
  ensureRetailOrgMock,
  getWorkspaceMock,
  createAssistantMock,
  updateAgentGuardrailsMock,
  ensureAssistantPassportMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  getUserIdMock: vi.fn(),
  ensureRetailOrgMock: vi.fn(),
  getWorkspaceMock: vi.fn(),
  createAssistantMock: vi.fn(),
  updateAgentGuardrailsMock: vi.fn(),
  ensureAssistantPassportMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: getUserIdMock,
}))

vi.mock('@/lib/db', () => ({
  createAssistant: createAssistantMock,
  getWorkspace: getWorkspaceMock,
  updateAgentGuardrails: updateAgentGuardrailsMock,
}))

vi.mock('@/lib/retail/retail-org', () => ({
  ensureRetailOrg: ensureRetailOrgMock,
}))

vi.mock('@/lib/ai/passports', () => ({
  ensureAssistantPassport: ensureAssistantPassportMock,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: captureExceptionMock },
}))

// Use the real rate limiter so we exercise the production code path,
// but reset module state between tests via vi.resetModules() so the
// in-memory window doesn't bleed between cases.
async function loadRoute() {
  const mod = await import('../route')
  return mod.POST as unknown as (req: Request) => Promise<NextResponse>
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/retail/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_TEMPLATE_SLUG = 'personal-research-assistant'
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  featuresMock.retailFunnel = true
  getUserIdMock.mockResolvedValue('user-1')
  ensureRetailOrgMock.mockResolvedValue('org-retail-1')
  getWorkspaceMock.mockResolvedValue({
    project: { id: 'proj-1' },
    env: { id: 'env-1' },
  })
  createAssistantMock.mockResolvedValue({
    id: 'asst-1',
    name: 'Personal research assistant',
    org_id: 'org-retail-1',
  })
  updateAgentGuardrailsMock.mockResolvedValue({ success: true })
  ensureAssistantPassportMock.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

afterAll(() => {
  consoleLogSpy.mockRestore()
  consoleInfoSpy.mockRestore()
})

describe('POST /api/retail/agents', () => {
  it('404s when the feature flag is off', async () => {
    featuresMock.retailFunnel = false
    const POST = await loadRoute()
    const res = await POST(makeRequest({ slug: VALID_TEMPLATE_SLUG }))
    expect(res.status).toBe(404)
    // Must short-circuit before touching auth or DB
    expect(getUserIdMock).not.toHaveBeenCalled()
    expect(createAssistantMock).not.toHaveBeenCalled()
  })

  it('401s when the user is not signed in', async () => {
    getUserIdMock.mockResolvedValue(null)
    const POST = await loadRoute()
    const res = await POST(makeRequest({ slug: VALID_TEMPLATE_SLUG }))
    expect(res.status).toBe(401)
    expect(createAssistantMock).not.toHaveBeenCalled()
  })

  it('400s on Zod validation failure', async () => {
    const POST = await loadRoute()
    // empty slug fails min(1)
    const res = await POST(makeRequest({ slug: '' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Validation failed')
    expect(createAssistantMock).not.toHaveBeenCalled()
  })

  it('404s on an unknown template slug', async () => {
    const POST = await loadRoute()
    const res = await POST(makeRequest({ slug: 'no-such-template' }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Unknown template')
    // Template lookup short-circuits before we touch org provisioning
    expect(ensureRetailOrgMock).not.toHaveBeenCalled()
    expect(createAssistantMock).not.toHaveBeenCalled()
  })

  it('500s when the workspace has no project/env', async () => {
    getWorkspaceMock.mockResolvedValue({ project: null, env: null })
    const POST = await loadRoute()
    const res = await POST(makeRequest({ slug: VALID_TEMPLATE_SLUG }))
    expect(res.status).toBe(500)
    expect(createAssistantMock).not.toHaveBeenCalled()
  })

  it('happy path: creates agent, wires cost cap, returns 201', async () => {
    const POST = await loadRoute()
    const res = await POST(makeRequest({ slug: VALID_TEMPLATE_SLUG }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toEqual({ id: 'asst-1', slug: VALID_TEMPLATE_SLUG })

    // Cost cap was wired with the template's monthly cap
    expect(updateAgentGuardrailsMock).toHaveBeenCalledWith(
      'asst-1',
      'org-retail-1',
      expect.objectContaining({ cost_limit_monthly_usd: expect.any(Number) }),
    )

    // Passport provisioning is fire-and-forget — must be called but not awaited
    expect(ensureAssistantPassportMock).toHaveBeenCalledWith({
      assistantId: 'asst-1',
      existingPassportId: null,
      name: 'Personal research assistant',
    })
  })

  it('still returns 201 if cost cap update fails (non-fatal)', async () => {
    updateAgentGuardrailsMock.mockResolvedValue({
      success: false,
      error: 'cost cap write failed',
    })
    const POST = await loadRoute()
    const res = await POST(makeRequest({ slug: VALID_TEMPLATE_SLUG }))
    expect(res.status).toBe(201)
    // Failure surfaced via ErrorService instead of being silently swallowed
    expect(captureExceptionMock).toHaveBeenCalled()
  })

  it('still returns 201 if passport provisioning rejects (fire-and-forget)', async () => {
    ensureAssistantPassportMock.mockRejectedValue(new Error('L2 unreachable'))
    const POST = await loadRoute()
    const res = await POST(makeRequest({ slug: VALID_TEMPLATE_SLUG }))
    expect(res.status).toBe(201)
    // Let the unhandled-rejection-style .catch() run
    await new Promise((r) => setTimeout(r, 0))
    expect(captureExceptionMock).toHaveBeenCalled()
  })

  it('429s after the per-user rate limit is exceeded', async () => {
    const POST = await loadRoute()
    // Limiter is 10/min — fire 11 and assert the last one trips
    for (let i = 0; i < 10; i++) {
      const ok = await POST(makeRequest({ slug: VALID_TEMPLATE_SLUG }))
      expect(ok.status).toBe(201)
    }
    const tripped = await POST(makeRequest({ slug: VALID_TEMPLATE_SLUG }))
    expect(tripped.status).toBe(429)
  })
}, 20_000)
