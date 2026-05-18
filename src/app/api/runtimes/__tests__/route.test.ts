import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  isUserOrgMember: vi.fn(),
}))

vi.mock('@/lib/db/mission-control', () => ({
  createRuntime: vi.fn(),
  getRuntimes: vi.fn(),
  revokeRuntime: vi.fn(),
  updateRuntimeL2Status: vi.fn(),
}))

vi.mock('@/lib/mission-control/plan-check', () => ({
  canUseManagedRuntime: vi.fn(),
  canUseByo: vi.fn(),
  canUseNativeRuntimeChannels: vi.fn(),
  canUseRuntimeCustomLimits: vi.fn(),
  canUseRuntimeFullAutoUpdates: vi.fn(),
  canUseRuntimeMaintenance: vi.fn(),
  canUseRuntimeNetworkControls: vi.fn(),
}))

vi.mock('../_deploy', () => ({
  provisionRuntimeKey: vi.fn(),
  deployRuntimeViaL2: vi.fn(),
  isL2DeployError: vi.fn((value: unknown) => !!value && typeof value === 'object' && 'error' in (value as Record<string, unknown>)),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

vi.mock('@/lib/engines/bridges', () => ({
  getRuntimeBridge: vi.fn(() => ({ runtimeProtocol: 'lucid-runtime-v2' })),
}))

vi.mock('@/lib/engines/registry', () => ({
  ENGINE_OPTIONS: [{ key: 'openclaw' }, { key: 'hermes' }],
  getEngineDefinition: vi.fn(() => ({ label: 'Hermes' })),
  isEngineAvailable: vi.fn(() => true),
}))

vi.mock('@/lib/engines/image-resolution', () => ({
  getRuntimeImageConfigurationError: vi.fn(),
}))

vi.mock('@/lib/engines/deploy-readiness', () => ({
  getEngineDeployReadiness: vi.fn(() => ({
    ready: true,
    imageConfigured: true,
    l2Configured: true,
    blockerLabel: null,
    error: null,
    note: null,
  })),
}))

vi.mock('@/lib/runtimes/bootstrap', () => ({
  normalizeRuntimeBootstrapConfig: vi.fn(() => null),
}))

vi.mock('@/lib/runtimes/dedicated-transport', () => ({
  isDedicatedNativePulseAllowed: vi.fn(() => true),
}))

vi.mock('@lucid/runtime-compat', async () => {
  const actual = await vi.importActual<typeof import('@lucid/runtime-compat')>('@lucid/runtime-compat')
  return {
    ...actual,
    supportsChannelOwnership: vi.fn(() => true),
    supportsDedicatedTransportMode: vi.fn(() => true),
    supportsRuntimeConfiguration: vi.fn(() => true),
    supportsRuntimeFlavor: vi.fn(() => true),
  }
})

import { POST } from '../route'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { createRuntime, revokeRuntime } from '@/lib/db/mission-control'
import {
  canUseByo,
  canUseManagedRuntime,
  canUseNativeRuntimeChannels,
  canUseRuntimeCustomLimits,
  canUseRuntimeFullAutoUpdates,
  canUseRuntimeMaintenance,
  canUseRuntimeNetworkControls,
} from '@/lib/mission-control/plan-check'
import { deployRuntimeViaL2, provisionRuntimeKey } from '../_deploy'
import { getRuntimeImageConfigurationError } from '@/lib/engines/image-resolution'
import { getEngineDeployReadiness } from '@/lib/engines/deploy-readiness'

const mockGetUserId = vi.mocked(getUserId)
const mockIsUserOrgMember = vi.mocked(isUserOrgMember)
const mockCreateRuntime = vi.mocked(createRuntime)
const mockRevokeRuntime = vi.mocked(revokeRuntime)
const mockCanUseManagedRuntime = vi.mocked(canUseManagedRuntime)
const mockCanUseByo = vi.mocked(canUseByo)
const mockCanUseNativeRuntimeChannels = vi.mocked(canUseNativeRuntimeChannels)
const mockCanUseRuntimeCustomLimits = vi.mocked(canUseRuntimeCustomLimits)
const mockCanUseRuntimeFullAutoUpdates = vi.mocked(canUseRuntimeFullAutoUpdates)
const mockCanUseRuntimeMaintenance = vi.mocked(canUseRuntimeMaintenance)
const mockCanUseRuntimeNetworkControls = vi.mocked(canUseRuntimeNetworkControls)
const mockProvisionRuntimeKey = vi.mocked(provisionRuntimeKey)
const mockDeployRuntimeViaL2 = vi.mocked(deployRuntimeViaL2)
const mockGetRuntimeImageConfigurationError = vi.mocked(getRuntimeImageConfigurationError)
const mockGetEngineDeployReadiness = vi.mocked(getEngineDeployReadiness)

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/runtimes?org_id=org-1', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUserId.mockResolvedValue('user-1')
  mockIsUserOrgMember.mockResolvedValue(true)
  mockCanUseManagedRuntime.mockResolvedValue(true)
  mockCanUseByo.mockResolvedValue(true)
  mockCanUseNativeRuntimeChannels.mockResolvedValue(true)
  mockCanUseRuntimeCustomLimits.mockResolvedValue(true)
  mockCanUseRuntimeFullAutoUpdates.mockResolvedValue(true)
  mockCanUseRuntimeMaintenance.mockResolvedValue(true)
  mockCanUseRuntimeNetworkControls.mockResolvedValue(true)
  mockCreateRuntime.mockResolvedValue({ id: 'runtime-1' })
  mockProvisionRuntimeKey.mockResolvedValue({ apiKey: 'key', envVars: { A: '1' } })
  mockDeployRuntimeViaL2.mockResolvedValue({
    deploymentId: 'dep-1',
    deploymentUrl: 'https://x',
    passportId: null,
    passportOwner: null,
    ownerMode: 'platform_default',
    claimStatus: 'claimable',
  })
  mockGetRuntimeImageConfigurationError.mockReturnValue(null)
  mockGetEngineDeployReadiness.mockReturnValue({
    ready: true,
    imageConfigured: true,
    l2Configured: true,
    blockerLabel: null,
    error: null,
    note: null,
    engine: 'hermes',
    runtimeFlavor: 'c1_managed',
    provider: 'railway',
  })
})

describe('POST /api/runtimes', () => {
  it('rejects Hermes managed runtime when no image is configured', async () => {
    mockGetRuntimeImageConfigurationError.mockReturnValue(
      'No Hermes runtime image configured for c1_managed.',
    )
    mockGetEngineDeployReadiness.mockReturnValue({
      ready: false,
      imageConfigured: false,
      l2Configured: true,
      blockerLabel: 'Not configured',
      error: 'No Hermes runtime image configured for c1_managed.',
      note: 'Experimental • Relay only',
      engine: 'hermes',
      runtimeFlavor: 'c1_managed',
      provider: 'railway',
    })

    const res = await POST(
      makeRequest({
        displayName: 'Hermes test',
        provider: 'railway',
        engine: 'hermes',
        runtimeTier: 'dedicated',
        runtimeFlavor: 'c1_managed',
      }),
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'No Hermes runtime image configured for c1_managed.',
    })
    expect(mockCreateRuntime).not.toHaveBeenCalled()
  })

  it('revokes the runtime when launch fails after creation', async () => {
    mockDeployRuntimeViaL2.mockResolvedValue(null)

    const res = await POST(
      makeRequest({
        displayName: 'OpenClaw test',
        provider: 'railway',
        engine: 'openclaw',
        runtimeTier: 'dedicated',
        runtimeFlavor: 'c1_managed',
      }),
    )

    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to deploy runtime. Runtime launch was rejected before infrastructure was created.',
    })
    expect(mockRevokeRuntime).toHaveBeenCalledWith('runtime-1', 'org-1')
  })

  it('surfaces the exact L2 launch error when available', async () => {
    mockDeployRuntimeViaL2.mockResolvedValue({
      error: 'L2 Gateway unreachable: ECONNREFUSED',
      code: 'unreachable',
    })

    const res = await POST(
      makeRequest({
        displayName: 'Hermes test',
        provider: 'railway',
        engine: 'hermes',
        runtimeTier: 'dedicated',
        runtimeFlavor: 'c1_managed',
      }),
    )

    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toEqual({
      error: 'L2 Gateway unreachable: ECONNREFUSED',
    })
    expect(mockRevokeRuntime).toHaveBeenCalledWith('runtime-1', 'org-1')
  })
})
