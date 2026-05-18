import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  isUserOrgMember: vi.fn(),
}))

vi.mock('@/lib/runtimes/maintenance', () => ({
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

describe('/api/runtimes/[id]/maintenance/rehome', () => {
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

    const { POST } = await import('../route')
    const res = await POST(
      makeNextRequest('http://localhost/api/runtimes/rt-1/maintenance/rehome?org_id=org-1', {
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ id: 'rt-1' }) },
    )

    expect(res.status).toBe(401)
  })

  it('dispatches re-home through the runtime maintenance service', async () => {
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
      state: {
        runtimeId: '00000000-0000-4000-8000-000000000001',
        managedByLucid: true,
        maintenanceChannel: 'stable',
        autoUpdatePolicy: 'manual',
        currentImageRef: 'ghcr.io/internal/worker:sha',
        currentImageDigest: null,
        targetImageRef: 'ghcr.io/internal/worker:sha',
        lastSuccessfulImageRef: 'ghcr.io/internal/worker:sha',
        lastMaintenanceAction: 'rehome',
        lastMaintenanceAt: '2026-05-07T19:00:00Z',
        lastMaintenanceError: 'Railway source deploy failed: Not Authorized',
        jobs: [
          {
            id: '00000000-0000-4000-8000-000000000002',
            runtimeId: '00000000-0000-4000-8000-000000000001',
            orgId: '00000000-0000-4000-8000-000000000003',
            provider: 'railway',
            action: 'rehome',
            status: 'succeeded',
            targetImageRef: 'ghcr.io/internal/worker:sha',
            targetImageDigest: null,
            providerOperationId: 'provider-op',
            providerDeploymentId: 'provider-dep',
            requestedBy: 'user-1',
            resultPayload: { providerResult: { error: 'Not Authorized' } },
            error: 'Railway source deploy failed: Not Authorized',
            startedAt: null,
            completedAt: null,
            createdAt: '2026-05-07T19:00:00Z',
          },
        ],
      },
    } as never)

    const { POST } = await import('../route')
    const res = await POST(
      makeNextRequest('http://localhost/api/runtimes/rt-1/maintenance/rehome?org_id=org-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetImageRef: 'ghcr.io/internal/worker:sha' }),
      }) as never,
      { params: Promise.resolve({ id: 'rt-1' }) },
    )

    const body = await res.json()
    expect(res.status).toBe(200)
    expect(performRuntimeMaintenanceAction).toHaveBeenCalledWith({
      runtimeId: 'rt-1',
      orgId: 'org-1',
      requestedBy: 'user-1',
      action: 'rehome',
      targetImageRef: 'ghcr.io/internal/worker:sha',
    })
    expect(JSON.stringify(body.maintenance)).not.toContain('Railway')
    expect(JSON.stringify(body.maintenance)).not.toContain('ghcr.io')
    expect(body.maintenance).toEqual(expect.objectContaining({
      currentImageRef: null,
      targetImageRef: null,
      lastSuccessfulImageRef: null,
      lastMaintenanceError: 'Lucid provider diagnostics are being reviewed by Lucid operators.',
    }))
  })
})
