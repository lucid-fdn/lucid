import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  isUserOrgMember: vi.fn(),
}))

vi.mock('@/lib/auth/csrf', () => ({
  withCSRF: (handler: typeof import('../route').POST) => handler,
}))

vi.mock('@/lib/mission-control/plan-check', () => ({
  canUseManagedRuntime: vi.fn(),
}))

vi.mock('@/lib/db/mission-control', () => ({
  createRuntime: vi.fn(),
  getRuntimeByRequestId: vi.fn(),
  revokeRuntime: vi.fn(),
  updateAgentRuntime: vi.fn(),
  updateRuntimeL2Status: vi.fn(),
  updateRuntimeStatus: vi.fn(),
}))

const {
  mockProvisionRuntimeKey,
  mockDeployRuntimeViaL2,
  mockRuntimeUpdate,
} = vi.hoisted(() => ({
  mockProvisionRuntimeKey: vi.fn(),
  mockDeployRuntimeViaL2: vi.fn(),
  mockRuntimeUpdate: vi.fn(),
}))

vi.mock('../../_deploy', () => ({
  provisionRuntimeKey: mockProvisionRuntimeKey,
  deployRuntimeViaL2: mockDeployRuntimeViaL2,
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

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: mockRuntimeUpdate,
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: {
                id: '11111111-1111-4111-8111-111111111111',
                name: 'Agent One',
                runtime_id: null,
                engine: 'hermes',
              },
              error: null,
            }),
          })),
        })),
      })),
    })),
  },
}))

import { POST } from '../route'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { canUseManagedRuntime } from '@/lib/mission-control/plan-check'
import { createRuntime } from '@/lib/db/mission-control'
import { getRuntimeImageConfigurationError } from '@/lib/engines/image-resolution'
import { getEngineDeployReadiness } from '@/lib/engines/deploy-readiness'

const mockGetUserId = vi.mocked(getUserId)
const mockIsUserOrgMember = vi.mocked(isUserOrgMember)
const mockCanUseManagedRuntime = vi.mocked(canUseManagedRuntime)
const mockCreateRuntime = vi.mocked(createRuntime)
const mockGetRuntimeImageConfigurationError = vi.mocked(getRuntimeImageConfigurationError)
const mockGetEngineDeployReadiness = vi.mocked(getEngineDeployReadiness)

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/runtimes/deploy-for-agent?org_id=org-1', {
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
  mockCreateRuntime.mockResolvedValue({ id: 'runtime-1' })
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
  mockProvisionRuntimeKey.mockResolvedValue({ apiKey: 'key', envVars: { A: '1' } })
  mockDeployRuntimeViaL2.mockResolvedValue(null)
  mockRuntimeUpdate.mockReturnValue({
    eq: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  })
})

describe('POST /api/runtimes/deploy-for-agent', () => {
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
        requestId: 'e190f486-a615-4649-8fa7-8f8f3762c0da',
        agentId: '11111111-1111-4111-8111-111111111111',
        provider: 'railway',
        engine: 'hermes',
        runtimeFlavor: 'c1_managed',
      }),
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'No Hermes runtime image configured for c1_managed.',
    })
    expect(mockCreateRuntime).not.toHaveBeenCalled()
  })

  it('marks successful L2 launches as connected dedicated runtimes', async () => {
    mockDeployRuntimeViaL2.mockResolvedValue({
      deploymentId: 'l2-dep-1',
      deploymentUrl: 'https://runtime.example',
      passportId: 'passport-1',
      passportOwner: 'owner-1',
      ownerMode: 'workspace_custody',
      claimStatus: 'claimable',
    })

    const res = await POST(
      makeRequest({
        requestId: 'e190f486-a615-4649-8fa7-8f8f3762c0db',
        agentId: '11111111-1111-4111-8111-111111111111',
        provider: 'railway',
        engine: 'hermes',
        runtimeFlavor: 'c1_managed',
      }),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      runtimeId: 'runtime-1',
      status: 'connected',
      deploymentUrl: 'https://runtime.example',
    })
    expect(mockCreateRuntime).toHaveBeenCalledWith(expect.objectContaining({
      runtimeTier: 'dedicated',
    }))
    expect(mockRuntimeUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'connected',
      runtime_tier: 'dedicated',
      deployment_url: 'https://runtime.example',
      last_l2_status: 'running',
      managed_by_lucid: true,
    }))
  })
})
