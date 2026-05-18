/**
 * Tests for GET /api/runtimes/config
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock auth
vi.mock('../_auth', () => ({
  authenticateRuntime: vi.fn(),
}))

// Mock _deploy so buildDeployEnvVars returns a predictable set
vi.mock('../_deploy', () => ({
  buildDeployEnvVars: vi.fn(),
  deployRuntimeViaL2: vi.fn(),
  destroyRuntimeViaL2: vi.fn(),
  provisionRuntimeKey: vi.fn(),
}))

// Mock DB client
vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
    })),
  },
}))

// vi.hoisted runs before vi.mock hoisting so we can share this reference
// between the factory and the test body.
const { sharedLimiterCheck } = vi.hoisted(() => ({
  sharedLimiterCheck: vi.fn(() => true),
}))

// Mock rate limiter — factory returns an object with the hoisted check fn
vi.mock('@/lib/utils/rate-limiter', () => ({
  createRateLimiter: vi.fn(() => ({ check: sharedLimiterCheck })),
}))

// Mock error service
vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

vi.mock('@/lib/engines/registry', () => ({
  ENGINE_OPTIONS: [{ key: 'openclaw' }, { key: 'hermes' }, { key: 'lucid' }],
  getEngineDefinition: vi.fn((engine: string) => ({ label: engine === 'hermes' ? 'Hermes' : 'OpenClaw' })),
}))

vi.mock('@lucid/runtime-compat', async () => {
  const actual = await vi.importActual<typeof import('@lucid/runtime-compat')>('@lucid/runtime-compat')
  return {
    ...actual,
    supportsRuntimeFlavor: vi.fn(() => true),
    supportsRuntimeConfiguration: vi.fn(() => true),
  }
})

import { GET } from '../config/route'
import { computeConfigVersion } from '@/lib/runtimes/config-version'
import { authenticateRuntime } from '../_auth'
import { buildDeployEnvVars } from '../_deploy'
import { supabase } from '@/lib/db/client'
import { supportsRuntimeConfiguration, supportsRuntimeFlavor } from '@lucid/runtime-compat'

const mockAuth = vi.mocked(authenticateRuntime)
const mockBuildEnvVars = vi.mocked(buildDeployEnvVars)
const mockSupportsRuntimeFlavor = vi.mocked(supportsRuntimeFlavor)
const mockSupportsRuntimeConfiguration = vi.mocked(supportsRuntimeConfiguration)

function makeRequest(authHeader?: string) {
  return {
    headers: { get: (h: string) => (h === 'authorization' ? (authHeader ?? null) : null) },
  } as unknown as Request
}

const RUNTIME = { id: 'runtime-123', orgId: 'org-abc', generation: 1, status: 'connected' }

beforeEach(() => {
  vi.clearAllMocks()
  sharedLimiterCheck.mockReturnValue(true)
  mockSupportsRuntimeFlavor.mockReturnValue(true)
  mockSupportsRuntimeConfiguration.mockReturnValue(true)
})

describe('GET /api/runtimes/config', () => {
  it('returns 401 without auth', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(makeRequest() as any)
    expect(res.status).toBe(401)
  })

  it('returns 410 for revoked runtime', async () => {
    mockAuth.mockResolvedValue({ ...RUNTIME, status: 'revoked' })
    const res = await GET(makeRequest('Bearer key') as any)
    expect(res.status).toBe(410)
  })

  it('returns 429 when rate limited', async () => {
    mockAuth.mockResolvedValue(RUNTIME)
    sharedLimiterCheck.mockReturnValue(false)
    const res = await GET(makeRequest('Bearer key') as any)
    expect(res.status).toBe(429)
  })

  it('returns envVars and configVersion on success', async () => {
    mockAuth.mockResolvedValue(RUNTIME)
    const mockEnv = { SUPABASE_URL: 'https://db.supabase.co', FEATURE_PULSE: 'false' }
    mockBuildEnvVars.mockReturnValue(mockEnv)

    // Mock supabase chain
    const mockSingle = vi.fn().mockResolvedValue({ data: { channel_mode: 'relay' }, error: null })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    const res = await GET(makeRequest('Bearer key') as any)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.envVars).toEqual(mockEnv)
    expect(typeof body.configVersion).toBe('string')
    expect(body.configVersion).toHaveLength(64) // SHA-256 hex

    // buildDeployEnvVars was called with correct args
    expect(mockBuildEnvVars).toHaveBeenCalledWith(
      RUNTIME.id,
      'relay',
      expect.objectContaining({
        engine: 'openclaw',
        runtimeFlavor: 'c1_managed',
        dedicatedTransportMode: 'relay',
        runtimeProtocol: 'lucid-runtime-v1',
        runtimeBootstrapConfig: null,
      }),
    )
  })

  it('passes null channelMode when runtime has no channel_mode', async () => {
    mockAuth.mockResolvedValue(RUNTIME)
    mockBuildEnvVars.mockReturnValue({})

    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    await GET(makeRequest('Bearer key') as any)
    expect(mockBuildEnvVars).toHaveBeenCalledWith(
      RUNTIME.id,
      null,
      expect.objectContaining({
        engine: 'openclaw',
        runtimeFlavor: 'c1_managed',
        dedicatedTransportMode: 'relay',
        runtimeProtocol: 'lucid-runtime-v1',
        runtimeBootstrapConfig: null,
      }),
    )
  })

  it('returns 409 when engine does not support runtime flavor', async () => {
    mockAuth.mockResolvedValue({ ...RUNTIME, engine: 'lucid', runtimeFlavor: 'c1_managed' })
    mockSupportsRuntimeFlavor.mockReturnValue(false)

    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    const res = await GET(makeRequest('Bearer key') as any)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'OpenClaw does not support c1_managed' })
  })

  it('returns 409 when engine does not support runtime configuration', async () => {
    mockAuth.mockResolvedValue({ ...RUNTIME, engine: 'hermes', runtimeFlavor: 'c2a_autonomous' })
    mockSupportsRuntimeConfiguration.mockReturnValue(false)

    const mockSingle = vi.fn().mockResolvedValue({
      data: { channel_mode: 'native', engine: 'hermes', runtime_flavor: 'c2a_autonomous' },
      error: null,
    })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    const res = await GET(makeRequest('Bearer key') as any)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error: 'Hermes does not support runtime_native for c2a_autonomous',
    })
  })
})

describe('computeConfigVersion', () => {
  it('returns a 64-char SHA-256 hex string', () => {
    const version = computeConfigVersion({ A: '1', B: '2' })
    expect(version).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic — same input produces same output', () => {
    const env = { SUPABASE_URL: 'https://x.supabase.co', FEATURE_PULSE: 'true' }
    expect(computeConfigVersion(env)).toBe(computeConfigVersion(env))
  })

  it('changes when any value changes', () => {
    const v1 = computeConfigVersion({ KEY: 'old' })
    const v2 = computeConfigVersion({ KEY: 'new' })
    expect(v1).not.toBe(v2)
  })

  it('is order-independent — same keys in different order produce same result', () => {
    const v1 = computeConfigVersion({ A: '1', B: '2' })
    const v2 = computeConfigVersion({ B: '2', A: '1' })
    expect(v1).toBe(v2)
  })
})
