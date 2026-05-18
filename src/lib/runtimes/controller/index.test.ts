import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockGetRuntimeById = vi.fn()
const mockGetRuntimeMaintenanceState = vi.fn()
const mockListManagedRuntimes = vi.fn()
const mockUpdateRuntimeImageTracking = vi.fn()
const mockPerformRuntimeMaintenanceAction = vi.fn()
const mockWithInternalJobLock = vi.fn()

vi.mock('@/lib/db/mission-control', () => ({
  getRuntimeById: mockGetRuntimeById,
  getRuntimeMaintenanceState: mockGetRuntimeMaintenanceState,
  listManagedRuntimes: mockListManagedRuntimes,
  updateRuntimeImageTracking: mockUpdateRuntimeImageTracking,
}))

vi.mock('@/lib/runtimes/maintenance', () => ({
  performRuntimeMaintenanceAction: mockPerformRuntimeMaintenanceAction,
}))

vi.mock('@/lib/locks/internal-job-lock', () => ({
  InternalJobLockError: class InternalJobLockError extends Error {},
  withInternalJobLock: mockWithInternalJobLock,
}))

function makeRuntime(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rt-1',
    orgId: 'org-1',
    displayName: 'Runtime 1',
    description: null,
    engine: 'openclaw',
    provider: 'railway',
    status: 'connected',
    runtimeTier: 'dedicated',
    runtimeFlavor: 'c1_managed',
    channelOwnership: 'lucid_relay',
    runtimeProtocol: 'lucid-runtime-v2',
    lastSeenAt: null,
    openclawVersion: null,
    engineVersion: null,
    runtimeVersion: null,
    cpuPercent: null,
    ramPercent: null,
    diskPercent: null,
    gpuPercent: null,
    workerPendingEvents: 0,
    workerDeadLetters: 0,
    agentCount: 1,
    deploymentUrl: null,
    l2DeploymentId: 'dep-1',
    l2PassportId: 'passport_abc',
    lastL2Status: null,
    lastL2Error: null,
    lastL2CheckedAt: null,
    managedByLucid: true,
    maintenanceChannel: 'stable',
    autoUpdatePolicy: 'full_auto',
    currentImageRef: 'ghcr.io/daishizensensei/worker:old',
    currentImageDigest: null,
    targetImageRef: 'ghcr.io/daishizensensei/worker:old',
    lastSuccessfulImageRef: 'ghcr.io/daishizensensei/worker:old',
    lastMaintenanceAction: null,
    lastMaintenanceAt: null,
    lastMaintenanceError: null,
    createdAt: '2026-04-16T00:00:00.000Z',
    ...overrides,
  }
}

describe('managed runtime controller', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockWithInternalJobLock.mockImplementation(async (_key, fn) => await fn())
  })

  it('finalizes image tracking when heartbeat confirms convergence', async () => {
    const runtime = makeRuntime({
      currentImageRef: 'ghcr.io/daishizensensei/worker:old',
      targetImageRef: 'ghcr.io/daishizensensei/worker:new',
    })
    mockGetRuntimeById.mockResolvedValue(runtime)
    mockGetRuntimeMaintenanceState.mockResolvedValue(null)

    const { syncManagedRuntimeOnHeartbeat } = await import('./index')
    const result = await syncManagedRuntimeOnHeartbeat('rt-1', 'org-1', 'connected')

    expect(result.plan.kind).toBe('reconcile_image_tracking')
    expect(result.executed).toBe(true)
    expect(mockUpdateRuntimeImageTracking).toHaveBeenCalledWith('rt-1', 'org-1', {
      currentImageRef: 'ghcr.io/daishizensensei/worker:new',
      lastSuccessfulImageRef: 'ghcr.io/daishizensensei/worker:new',
    })
    expect(mockPerformRuntimeMaintenanceAction).not.toHaveBeenCalled()
  })

  it('runs a bounded fleet sweep and counts executed redeploys', async () => {
    const runtimeA = makeRuntime({ id: 'rt-a', orgId: 'org-1' })
    const { resolveDesiredRuntimeImageRef } = await import('./planner')
    const desiredImageRef = resolveDesiredRuntimeImageRef(runtimeA)
    const runtimeB = makeRuntime({
      id: 'rt-b',
      orgId: 'org-2',
      currentImageRef: desiredImageRef,
      targetImageRef: desiredImageRef,
    })

    mockListManagedRuntimes.mockResolvedValue([runtimeA, runtimeB])
    mockGetRuntimeById.mockImplementation(async (id: string) => (id === 'rt-a' ? runtimeA : runtimeB))
    mockGetRuntimeMaintenanceState.mockResolvedValue(null)
    mockPerformRuntimeMaintenanceAction.mockResolvedValue({ ok: true })

    const { runManagedRuntimeControllerSweep } = await import('./index')
    const result = await runManagedRuntimeControllerSweep({ limit: 10 })

    expect(result.checked).toBe(2)
    expect(result.executed).toBe(1)
    expect(result.redeploysQueued).toBe(1)
    expect(result.noop).toBe(1)
    expect(result.errors).toEqual([])
    expect(mockPerformRuntimeMaintenanceAction).toHaveBeenCalledWith({
      runtimeId: 'rt-a',
      orgId: 'org-1',
      requestedBy: null,
      action: 'redeploy',
      targetImageRef: expect.any(String),
    })
  })
})
