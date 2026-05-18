import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  completeRuntimeMaintenanceJob: vi.fn(),
  createRuntimeMaintenanceJob: vi.fn(),
  failRuntimeMaintenanceJob: vi.fn(),
  getRuntimeById: vi.fn(),
  getRuntimeMaintenanceState: vi.fn(),
  markRuntimeMaintenanceJobRunning: vi.fn(),
  updateRuntimeImageTracking: vi.fn(),
  updateRuntimeMaintenanceJobProgress: vi.fn(),
  updateRuntimeApiKeyHash: vi.fn(),
  updateRuntimeEnvSnapshot: vi.fn(),
  updateRuntimeL2Deployment: vi.fn(),
  updateRuntimeL2Status: vi.fn(),
  buildManagedRuntimeEnvVars: vi.fn(),
  buildRuntimeEnvSnapshot: vi.fn(),
  generateApiKey: vi.fn(),
  hashApiKey: vi.fn(),
  launchRuntimeViaL2: vi.fn(),
  isL2DeployError: vi.fn(),
}))

vi.mock('@/lib/db/mission-control', () => ({
  completeRuntimeMaintenanceJob: mocks.completeRuntimeMaintenanceJob,
  createRuntimeMaintenanceJob: mocks.createRuntimeMaintenanceJob,
  failRuntimeMaintenanceJob: mocks.failRuntimeMaintenanceJob,
  getRuntimeById: mocks.getRuntimeById,
  getRuntimeMaintenanceState: mocks.getRuntimeMaintenanceState,
  markRuntimeMaintenanceJobRunning: mocks.markRuntimeMaintenanceJobRunning,
  updateRuntimeImageTracking: mocks.updateRuntimeImageTracking,
  updateRuntimeMaintenanceJobProgress: mocks.updateRuntimeMaintenanceJobProgress,
  updateRuntimeApiKeyHash: mocks.updateRuntimeApiKeyHash,
  updateRuntimeEnvSnapshot: mocks.updateRuntimeEnvSnapshot,
  updateRuntimeL2Deployment: mocks.updateRuntimeL2Deployment,
  updateRuntimeL2Status: mocks.updateRuntimeL2Status,
}))

vi.mock('@/lib/runtimes/managed-env', () => ({
  buildManagedRuntimeEnvVars: mocks.buildManagedRuntimeEnvVars,
}))

vi.mock('@/lib/runtimes/env-snapshot', () => ({
  buildRuntimeEnvSnapshot: mocks.buildRuntimeEnvSnapshot,
}))

vi.mock('@/app/api/runtimes/_auth', () => ({
  generateApiKey: mocks.generateApiKey,
  hashApiKey: mocks.hashApiKey,
}))

vi.mock('@/app/api/runtimes/_deploy', () => ({
  launchRuntimeViaL2: mocks.launchRuntimeViaL2,
  isL2DeployError: mocks.isL2DeployError,
}))

function makeRuntime() {
  return {
    id: 'rt-hermes',
    displayName: 'Hermes dedicated',
    description: null,
    provider: 'railway',
    status: 'connected',
    runtimeTier: 'dedicated',
    runtimeFlavor: 'c1_managed',
    channelOwnership: 'lucid_relay',
    runtimeProtocol: 'lucid-runtime-v1',
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
    deploymentUrl: 'https://runtime.example.com',
    l2DeploymentId: 'old-dep',
    l2PassportId: 'passport_old',
    lastL2Status: null,
    lastL2Error: null,
    lastL2CheckedAt: null,
    managedByLucid: true,
    maintenanceChannel: 'stable',
    autoUpdatePolicy: 'manual',
    currentImageRef: 'ghcr.io/daishizensensei/worker:old',
    currentImageDigest: null,
    targetImageRef: 'ghcr.io/daishizensensei/worker:old',
    lastSuccessfulImageRef: 'ghcr.io/daishizensensei/worker:old',
    lastMaintenanceAction: null,
    lastMaintenanceAt: null,
    lastMaintenanceError: null,
    createdAt: '2026-05-07T00:00:00Z',
    engine: 'hermes',
    channelMode: 'relay',
    dedicatedTransportMode: 'relay',
  }
}

describe('performRuntimeMaintenanceAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRuntimeById.mockResolvedValue(makeRuntime())
    mocks.createRuntimeMaintenanceJob.mockResolvedValue({
      id: 'job-rehome',
      runtimeId: 'rt-hermes',
      orgId: 'org-1',
      provider: 'railway',
      action: 'rehome',
      status: 'queued',
      targetImageRef: null,
      targetImageDigest: null,
      providerOperationId: null,
      providerDeploymentId: null,
      requestedBy: 'user-1',
      resultPayload: {},
      error: null,
      startedAt: null,
      completedAt: null,
      createdAt: '2026-05-07T19:00:00Z',
    })
    mocks.generateApiKey.mockReturnValue('runtime-key')
    mocks.hashApiKey.mockReturnValue('runtime-key-hash')
    mocks.buildManagedRuntimeEnvVars.mockReturnValue({ LUCID_RUNTIME_ID: 'rt-hermes' })
    mocks.buildRuntimeEnvSnapshot.mockReturnValue({ keys: ['LUCID_RUNTIME_ID'] })
    mocks.launchRuntimeViaL2.mockResolvedValue({
      image: 'ghcr.io/daishizensensei/worker:latest',
      result: {
        deploymentId: 'new-dep',
        deploymentUrl: 'https://new-runtime.example.com',
        passportId: 'passport_new',
        passportOwner: 'lucid',
        ownerMode: 'lucid-managed',
        claimStatus: 'claimed',
      },
    })
    mocks.isL2DeployError.mockReturnValue(false)
    mocks.getRuntimeMaintenanceState.mockResolvedValue(null)
  })

  it('persists re-home as a first-class maintenance job action', async () => {
    const { performRuntimeMaintenanceAction } = await import('./index')

    const result = await performRuntimeMaintenanceAction({
      runtimeId: 'rt-hermes',
      orgId: 'org-1',
      requestedBy: 'user-1',
      action: 'rehome',
    })

    expect(result.ok).toBe(true)
    expect(mocks.createRuntimeMaintenanceJob).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeId: 'rt-hermes',
        orgId: 'org-1',
        action: 'rehome',
      }),
    )
    expect(mocks.completeRuntimeMaintenanceJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-rehome',
        runtimeId: 'rt-hermes',
        orgId: 'org-1',
        action: 'rehome',
        resultPayload: expect.objectContaining({ mode: 'l2-rehome' }),
      }),
    )
  })
})
