import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  isUserOrgMember: vi.fn(),
}))

vi.mock('@/lib/runtimes/maintenance', () => ({
  getRuntimeMaintenanceOverview: vi.fn(),
  performRuntimeMaintenanceAction: vi.fn(),
}))

vi.mock('@/lib/mission-control/plan-check', () => ({
  canUseRuntimeMaintenance: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
  },
}))

describe('/api/runtimes/[id]/maintenance', () => {
  function makeNextRequest(url: string, init?: RequestInit) {
    const request = new Request(url, init) as Request & { nextUrl: URL }
    request.nextUrl = new URL(url)
    return request
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is missing', async () => {
    const { getUserId } = await import('@/lib/auth/server-utils')
    vi.mocked(getUserId).mockResolvedValue(null)

    const { GET } = await import('../route')
    const res = await GET(
      makeNextRequest('http://localhost/api/runtimes/rt-1/maintenance?org_id=org-1') as never,
      { params: Promise.resolve({ id: 'rt-1' }) },
    )

    expect(res.status).toBe(401)
  })

  it('returns maintenance overview on GET', async () => {
    const { getUserId } = await import('@/lib/auth/server-utils')
    const { isUserOrgMember } = await import('@/lib/db')
    const { getRuntimeMaintenanceOverview } = await import('@/lib/runtimes/maintenance')
    vi.mocked(getUserId).mockResolvedValue('user-1')
    vi.mocked(isUserOrgMember).mockResolvedValue(true)
    vi.mocked(getRuntimeMaintenanceOverview).mockResolvedValue({
      runtimeId: 'rt-1',
      managedByLucid: true,
      maintenanceChannel: 'stable',
      autoUpdatePolicy: 'manual',
      currentImageRef: null,
      currentImageDigest: null,
      targetImageRef: null,
      lastSuccessfulImageRef: null,
      lastMaintenanceAction: null,
      lastMaintenanceAt: null,
      lastMaintenanceError: 'Railway source deploy failed: Not Authorized',
      jobs: [{
        id: '00000000-0000-4000-8000-000000000001',
        runtimeId: 'rt-1',
        orgId: 'org-1',
        provider: 'railway',
        action: 'redeploy',
        status: 'failed',
        targetImageRef: 'ghcr.io/internal/worker:sha',
        targetImageDigest: null,
        providerOperationId: 'provider-op',
        providerDeploymentId: 'provider-dep',
        requestedBy: 'user-1',
        resultPayload: { providerResult: { error: 'Not Authorized' } },
        error: 'Railway source deploy failed: Not Authorized',
        startedAt: null,
        completedAt: null,
        createdAt: '2026-04-12T12:00:00Z',
      }],
    } as never)

    const { GET } = await import('../route')
    const res = await GET(
      makeNextRequest('http://localhost/api/runtimes/rt-1/maintenance?org_id=org-1') as never,
      { params: Promise.resolve({ id: 'rt-1' }) },
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      maintenance: expect.objectContaining({
        runtimeId: 'rt-1',
        managedByLucid: true,
        currentImageRef: null,
        lastMaintenanceError: 'Lucid provider diagnostics are being reviewed by Lucid operators.',
        jobs: [
          expect.objectContaining({
            targetImageRef: null,
            providerOperationId: null,
            providerDeploymentId: null,
            resultPayload: {},
            error: 'Lucid provider diagnostics are being reviewed by Lucid operators.',
          }),
        ],
      }),
    })
  })

  it('dispatches POST through the maintenance service', async () => {
    const { getUserId } = await import('@/lib/auth/server-utils')
    const { isUserOrgMember } = await import('@/lib/db')
    const { performRuntimeMaintenanceAction } = await import('@/lib/runtimes/maintenance')
    vi.mocked(getUserId).mockResolvedValue('user-1')
    vi.mocked(isUserOrgMember).mockResolvedValue(true)
    vi.mocked(performRuntimeMaintenanceAction).mockResolvedValue({
      ok: true,
      result: {
        success: true,
        action: 'redeploy',
        provider: 'railway',
        status: 'running',
        deploymentId: 'dep-1',
        operationId: 'op-1',
        url: 'https://railway.app/x',
        detail: { success: true },
      },
      state: {
        runtimeId: 'rt-1',
        managedByLucid: true,
        maintenanceChannel: 'stable',
        autoUpdatePolicy: 'manual',
        currentImageRef: null,
        currentImageDigest: null,
        targetImageRef: null,
        lastSuccessfulImageRef: null,
        lastMaintenanceAction: 'redeploy',
        lastMaintenanceAt: '2026-04-12T12:00:00Z',
        lastMaintenanceError: null,
        jobs: [],
      },
    } as never)

    const { POST } = await import('../route')
    const res = await POST(
      makeNextRequest('http://localhost/api/runtimes/rt-1/maintenance?org_id=org-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'redeploy' }),
      }) as never,
      { params: Promise.resolve({ id: 'rt-1' }) },
    )

    expect(res.status).toBe(200)
    expect(performRuntimeMaintenanceAction).toHaveBeenCalledWith({
      runtimeId: 'rt-1',
      orgId: 'org-1',
      requestedBy: 'user-1',
      action: 'redeploy',
    })
  })

  it('accepts restart maintenance actions', async () => {
    const { getUserId } = await import('@/lib/auth/server-utils')
    const { isUserOrgMember } = await import('@/lib/db')
    const { performRuntimeMaintenanceAction } = await import('@/lib/runtimes/maintenance')
    vi.mocked(getUserId).mockResolvedValue('user-1')
    vi.mocked(isUserOrgMember).mockResolvedValue(true)
    vi.mocked(performRuntimeMaintenanceAction).mockResolvedValue({
      ok: true,
      result: {
        success: true,
        action: 'restart',
        provider: 'railway',
        status: 'queued',
        deploymentId: 'dep-1',
        operationId: 'op-2',
        url: 'https://railway.app/x',
        detail: { success: true },
      },
      state: null,
    } as never)

    const { POST } = await import('../route')
    const res = await POST(
      makeNextRequest('http://localhost/api/runtimes/rt-1/maintenance?org_id=org-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart' }),
      }) as never,
      { params: Promise.resolve({ id: 'rt-1' }) },
    )

    expect(res.status).toBe(200)
    expect(performRuntimeMaintenanceAction).toHaveBeenCalledWith({
      runtimeId: 'rt-1',
      orgId: 'org-1',
      requestedBy: 'user-1',
      action: 'restart',
    })
  })

  it('accepts reconcile maintenance actions', async () => {
    const { getUserId } = await import('@/lib/auth/server-utils')
    const { isUserOrgMember } = await import('@/lib/db')
    const { performRuntimeMaintenanceAction } = await import('@/lib/runtimes/maintenance')
    vi.mocked(getUserId).mockResolvedValue('user-1')
    vi.mocked(isUserOrgMember).mockResolvedValue(true)
    vi.mocked(performRuntimeMaintenanceAction).mockResolvedValue({
      ok: true,
      result: {
        success: true,
        action: 'reconcile',
        provider: 'railway',
        status: 'succeeded',
        deploymentId: 'dep-1',
        operationId: null,
        url: 'https://railway.app/x',
        detail: { envSync: { status: 'updated' } },
      },
      state: null,
    } as never)

    const { POST } = await import('../route')
    const res = await POST(
      makeNextRequest('http://localhost/api/runtimes/rt-1/maintenance?org_id=org-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reconcile' }),
      }) as never,
      { params: Promise.resolve({ id: 'rt-1' }) },
    )

    expect(res.status).toBe(200)
    expect(performRuntimeMaintenanceAction).toHaveBeenCalledWith({
      runtimeId: 'rt-1',
      orgId: 'org-1',
      requestedBy: 'user-1',
      action: 'reconcile',
    })
  })

  it('accepts re-home maintenance actions', async () => {
    const { getUserId } = await import('@/lib/auth/server-utils')
    const { isUserOrgMember } = await import('@/lib/db')
    const { performRuntimeMaintenanceAction } = await import('@/lib/runtimes/maintenance')
    vi.mocked(getUserId).mockResolvedValue('user-1')
    vi.mocked(isUserOrgMember).mockResolvedValue(true)
    vi.mocked(performRuntimeMaintenanceAction).mockResolvedValue({
      ok: true,
      result: {
        success: true,
        action: 'rehome',
        provider: 'railway',
        status: 'queued',
        deploymentId: 'dep-new',
        operationId: 'dep-new',
        url: 'https://runtime-new.example.com',
        detail: { mode: 'l2-rehome' },
      },
      state: null,
    } as never)

    const { POST } = await import('../route')
    const res = await POST(
      makeNextRequest('http://localhost/api/runtimes/rt-1/maintenance?org_id=org-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rehome' }),
      }) as never,
      { params: Promise.resolve({ id: 'rt-1' }) },
    )

    expect(res.status).toBe(200)
    expect(performRuntimeMaintenanceAction).toHaveBeenCalledWith({
      runtimeId: 'rt-1',
      orgId: 'org-1',
      requestedBy: 'user-1',
      action: 'rehome',
    })
  })
})
