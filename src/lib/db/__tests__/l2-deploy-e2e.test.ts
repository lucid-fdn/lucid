/**
 * L2 Deploy Integration — E2E Tests
 *
 * Tests the full deploy → status → destroy flow with mocked L2 Gateway.
 * Validates:
 * - deployRuntimeViaL2 stores passport_id from L2 response
 * - destroyRuntimeViaL2 prefers passport-based terminate route
 * - destroyRuntimeViaL2 falls back to deployment-based DELETE
 * - L2 status proxy persists snapshot to DB
 * - Railway-style deploy simulation (deploying → running → connected)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolvePassportOwner } from '@/lib/ai/passports'

vi.mock('server-only', () => ({}))

// ─── Mock setup ───

const mockSupabaseUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: (r: (v: unknown) => void) => { r({ data: null, error: null }); return {} },
  }),
})

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      update: (...args: unknown[]) => mockSupabaseUpdate(...args),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            neq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
        }),
      }),
    }),
    rpc: vi.fn(),
  },
  ErrorService: { captureException: vi.fn() },
}))

vi.mock('@/lib/ai/passports', () => ({
  resolvePassportOwner: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
let consoleErrorSpy: ReturnType<typeof vi.spyOn>
const mockResolvePassportOwner = vi.mocked(resolvePassportOwner)

const originalEnv = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  mockFetch.mockReset()
  mockSupabaseUpdate.mockClear()
  mockResolvePassportOwner.mockResolvedValue('0xOwnerWallet')
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.LUCID_L2_API_URL = 'https://l2.lucid.foundation/api'
  process.env.LUCID_L2_ADMIN_KEY = 'test-api-key'
  process.env.NEXT_PUBLIC_L2_AVAILABLE = 'true'
  process.env.LUCID_HERMES_IMAGE = 'ghcr.io/daishizensensei/worker:latest'
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
  process.env = { ...originalEnv }
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── deployRuntimeViaL2 ───

describe('deployRuntimeViaL2', () => {
  it('uses the Hermes managed image for C1 deploys when configured', async () => {
    process.env.LUCID_HERMES_C1_MANAGED_IMAGE = 'ghcr.io/lucid/hermes-c1:latest'
    mockFetch.mockResolvedValueOnce(jsonResponse({
      deployment_id: 'dep-hermes-c1',
      deployment_url: 'https://hermes-c1.railway.app',
    }))

    const { deployRuntimeViaL2 } = await import('@/app/api/runtimes/_deploy')
    await deployRuntimeViaL2({
      runtimeId: 'rt-hermes-c1',
      orgId: 'org-1',
      provider: 'railway',
      displayName: 'hermes-c1',
      engine: 'hermes',
      runtimeFlavor: 'c1_managed',
      channelOwnership: 'lucid_relay',
      runtimeProtocol: 'lucid-runtime-v2',
      envVars: { LUCID_RUNTIME_ID: 'rt-hermes-c1' },
    })

    const payload = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(payload.image).toBe('ghcr.io/lucid/hermes-c1:latest')
    expect(payload.metadata).toEqual({
      runtime_id: 'rt-hermes-c1',
      engine: 'hermes',
      runtime_flavor: 'c1_managed',
      channel_ownership: 'lucid_relay',
      runtime_protocol: 'lucid-runtime-v2',
      dedicated_transport_mode: null,
      owner_resolution: 'workspace_wallet',
      owner_mode: 'workspace_custody',
    })
  })

  it('parses passport_id from L2 launch response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      deployment_id: 'railway-dep-123',
      deployment_url: 'https://worker.railway.app',
      passport_id: 'passport-xyz',
    }))

    const { deployRuntimeViaL2 } = await import('@/app/api/runtimes/_deploy')
    const result = await deployRuntimeViaL2({
      runtimeId: 'rt-1',
      orgId: 'org-1',
      provider: 'railway',
      displayName: 'test-worker',
      engine: 'hermes',
      runtimeFlavor: 'c2a_autonomous',
      channelOwnership: 'lucid_relay',
      runtimeProtocol: 'lucid-runtime-v2',
      envVars: { LUCID_RUNTIME_ID: 'rt-1' },
    })

    expect(result).not.toBeNull()
    expect(result!.passportId).toBe('passport-xyz')
    expect(result!.deploymentId).toBe('railway-dep-123')
    expect(result!.deploymentUrl).toBe('https://worker.railway.app')
    expect(result!.ownerMode).toBe('workspace_custody')
    expect(result!.claimStatus).toBe('claimable')
  })

  it('handles L2 response without passport_id (backward compat)', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      deployment_id: 'railway-dep-456',
      deployment_url: 'https://worker.railway.app',
      // No passport_id in response
    }))

    const { deployRuntimeViaL2 } = await import('@/app/api/runtimes/_deploy')
    const result = await deployRuntimeViaL2({
      runtimeId: 'rt-2',
      orgId: 'org-1',
      provider: 'railway',
      displayName: 'old-worker',
      envVars: {},
    })

    expect(result).not.toBeNull()
    expect(result!.passportId).toBeNull()
    expect(result!.passportOwner).toBe('0xOwnerWallet')
  })

  it('calls L2 launch at correct URL (strips /api suffix)', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      deployment_id: 'dep-1',
      deployment_url: '',
    }))

    const { deployRuntimeViaL2 } = await import('@/app/api/runtimes/_deploy')
    await deployRuntimeViaL2({
      runtimeId: 'rt-3',
      orgId: 'org-1',
      provider: 'railway',
      displayName: 'test',
      engine: 'openclaw',
      runtimeFlavor: 'c1_managed',
      channelOwnership: 'lucid_relay',
      runtimeProtocol: 'lucid-runtime-v1',
      envVars: {},
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://l2.lucid.foundation/v1/agents/launch',
      expect.objectContaining({ method: 'POST' })
    )
    const payload = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    const { resolveRuntimeImage } = await import('@/lib/engines/image-resolution')
    expect(payload.image).toBe(resolveRuntimeImage('openclaw', 'c1_managed'))
    expect(payload.metadata).toEqual({
      runtime_id: 'rt-3',
      engine: 'openclaw',
      runtime_flavor: 'c1_managed',
      channel_ownership: 'lucid_relay',
      runtime_protocol: 'lucid-runtime-v1',
      dedicated_transport_mode: null,
      owner_resolution: 'workspace_wallet',
      owner_mode: 'workspace_custody',
    })
  })

  it('omits owner and lets L2 apply its default when no workspace wallet exists', async () => {
    mockResolvePassportOwner.mockResolvedValueOnce(null)
    mockFetch.mockResolvedValueOnce(jsonResponse({
      deployment_id: 'dep-no-owner',
      deployment_url: 'https://worker.railway.app',
    }))

    const { deployRuntimeViaL2 } = await import('@/app/api/runtimes/_deploy')
    const result = await deployRuntimeViaL2({
      runtimeId: 'rt-no-owner',
      orgId: 'org-without-wallet',
      provider: 'railway',
      displayName: 'no-owner-worker',
      engine: 'openclaw',
      runtimeFlavor: 'c2a_autonomous',
      channelOwnership: 'runtime_native',
      dedicatedTransportMode: 'native_pulse',
      runtimeProtocol: 'lucid-runtime-v1',
      envVars: {},
    })

    expect(result).toEqual({
      deploymentId: 'dep-no-owner',
      deploymentUrl: 'https://worker.railway.app',
      passportId: null,
      passportOwner: null,
      ownerMode: 'platform_default',
      claimStatus: 'claimable',
    })
    const payload = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(payload.owner).toBeUndefined()
    expect(payload.owner_mode).toBe('platform_default')
    expect(payload.metadata.owner_resolution).toBe('l2_default')
    expect(payload.metadata.owner_mode).toBe('platform_default')
  })

  it('returns null for manual provider', async () => {
    const { deployRuntimeViaL2 } = await import('@/app/api/runtimes/_deploy')
    const result = await deployRuntimeViaL2({
      runtimeId: 'rt-4',
      orgId: 'org-1',
      provider: 'manual',
      displayName: 'manual-worker',
      envVars: {},
    })

    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns a structured error when L2 returns error', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Provider unavailable' }, 503))

    const { deployRuntimeViaL2 } = await import('@/app/api/runtimes/_deploy')
    const result = await deployRuntimeViaL2({
      runtimeId: 'rt-5',
      orgId: 'org-1',
      provider: 'akash',
      displayName: 'akash-worker',
      envVars: {},
    })

    expect(result).toEqual({
      error: '{"error":"Provider unavailable"}',
      code: 'launch_failed',
      status: 503,
    })
  })

  it('returns a structured error when L2 is unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const { deployRuntimeViaL2 } = await import('@/app/api/runtimes/_deploy')
    const result = await deployRuntimeViaL2({
      runtimeId: 'rt-6',
      orgId: 'org-1',
      provider: 'railway',
      displayName: 'test',
      envVars: {},
    })

    expect(result).toEqual({
      error: 'L2 Gateway unreachable: ECONNREFUSED',
      code: 'unreachable',
    })
  })
}, 20_000)

describe('buildDeployEnvVars', () => {
  it('sets Hermes C1 bridge mode to full', async () => {
    const { buildDeployEnvVars } = await import('@/app/api/runtimes/_deploy')
    const envVars = buildDeployEnvVars('rt-hermes-c1', 'relay', {
      engine: 'hermes',
      runtimeFlavor: 'c1_managed',
      runtimeProtocol: 'lucid-runtime-v2',
    })

    expect(envVars.LUCID_ENGINE).toBe('hermes')
    expect(envVars.LUCID_RUNTIME_FLAVOR).toBe('c1_managed')
    expect(envVars.LUCID_BRIDGE_MODE).toBe('full')
  })

  it('disables Pulse and native channels for relay runtimes', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.lucid.foundation\n'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
    process.env.LUCID_API_BASE_URL = 'https://api.lucid.foundation\n'
    process.env.LUCID_API_KEY = 'key-with-newline\n'
    process.env.FEATURE_PULSE = 'true'
    process.env.REDIS_URL = 'redis://example'

    const { buildDeployEnvVars } = await import('@/app/api/runtimes/_deploy')
    const envVars = buildDeployEnvVars('rt-relay-1', 'relay', {
      engine: 'openclaw',
      runtimeFlavor: 'c1_managed',
      runtimeProtocol: 'lucid-runtime-v2',
      dedicatedTransportMode: 'relay',
    })

    expect(envVars.WORKER_MODE).toBe('worker')
    expect(envVars.FEATURE_PULSE).toBe('false')
    expect(envVars.FEATURE_NATIVE_CHANNELS).toBe('false')
    expect(envVars.FEATURE_REST_MESSAGE_RELAY).toBe('true')
    expect(envVars.LUCID_CONTROL_PLANE_URL).toBe('https://www.lucid.foundation')
    expect(envVars.LUCID_API_BASE_URL).toBe('https://api.lucid.foundation')
    expect(envVars.LUCID_API_KEY).toBe('key-with-newline')
    expect('REDIS_URL' in envVars).toBe(false)
  })

  it('forwards engine-neutral Browser QA endpoint settings to dedicated runtimes', async () => {
    process.env.BROWSER_QA_PROVIDER = 'steel\n'
    process.env.BROWSER_QA_CONTROL_URL = 'https://browser-runtime.internal\n'
    process.env.BROWSER_QA_CONTROL_TOKEN = 'browser-token\n'
    process.env.BROWSER_QA_CONTROL_PASSWORD = 'browser-password\n'
    process.env.BROWSER_QA_PROFILE = 'qa-profile\n'
    process.env.BROWSER_QA_TIMEOUT_MS = '45000\n'
    process.env.BROWSER_QA_MAX_CONCURRENCY = '7\n'
    process.env.BROWSER_QA_SESSION_TTL_SECONDS = '1200\n'
    process.env.BROWSER_QA_MAX_SESSIONS_PER_RUN = '40\n'
    process.env.BROWSER_QA_MAX_SCREENSHOTS_PER_RUN = '120\n'
    process.env.BROWSER_QA_GATEWAY_TOKEN = 'gateway-token\n'
    process.env.BROWSER_QA_HEADLESS = 'true\n'
    process.env.BROWSER_QA_ALLOW_PRIVATE_NETWORK = 'false\n'
    process.env.BROWSER_QA_MAX_SCREENSHOT_BYTES = '1048576\n'
    process.env.BROWSER_QA_ARTIFACT_STORE = 'supabase\n'
    process.env.BROWSER_QA_ARTIFACT_BUCKET = 'browser-qa-artifacts\n'
    process.env.BROWSER_QA_ARTIFACT_DIR = '/var/lucid/browser-artifacts\n'
    process.env.BROWSER_QA_ARTIFACT_RETENTION_DAYS = '14\n'
    process.env.BROWSER_QA_PUBLIC_BASE_URL = 'https://browser-gateway.internal\n'
    process.env.STEEL_BROWSER_URL = 'https://steel.internal\n'
    process.env.STEEL_API_KEY = 'steel-key\n'
    process.env.BROWSERLESS_WS_URL = 'wss://browserless.internal\n'
    process.env.BROWSERLESS_TOKEN = 'browserless-token\n'
    process.env.STAGEHAND_API_KEY = 'stagehand-key\n'

    const { buildDeployEnvVars } = await import('@/app/api/runtimes/_deploy')
    const envVars = buildDeployEnvVars('rt-hermes-browser', 'relay', {
      engine: 'hermes',
      runtimeFlavor: 'c1_managed',
      runtimeProtocol: 'lucid-runtime-v2',
    })

    expect(envVars.LUCID_ENGINE).toBe('hermes')
    expect(envVars.BROWSER_QA_PROVIDER).toBe('steel')
    expect(envVars.BROWSER_QA_CONTROL_URL).toBe('https://browser-runtime.internal')
    expect(envVars.BROWSER_QA_CONTROL_TOKEN).toBe('browser-token')
    expect(envVars.BROWSER_QA_CONTROL_PASSWORD).toBe('browser-password')
    expect(envVars.BROWSER_QA_PROFILE).toBe('qa-profile')
    expect(envVars.BROWSER_QA_TIMEOUT_MS).toBe('45000')
    expect(envVars.BROWSER_QA_MAX_CONCURRENCY).toBe('7')
    expect(envVars.BROWSER_QA_SESSION_TTL_SECONDS).toBe('1200')
    expect(envVars.BROWSER_QA_MAX_SESSIONS_PER_RUN).toBe('40')
    expect(envVars.BROWSER_QA_MAX_SCREENSHOTS_PER_RUN).toBe('120')
    expect(envVars.BROWSER_QA_GATEWAY_TOKEN).toBe('gateway-token')
    expect(envVars.BROWSER_QA_HEADLESS).toBe('true')
    expect(envVars.BROWSER_QA_ALLOW_PRIVATE_NETWORK).toBe('false')
    expect(envVars.BROWSER_QA_MAX_SCREENSHOT_BYTES).toBe('1048576')
    expect(envVars.BROWSER_QA_ARTIFACT_STORE).toBe('supabase')
    expect(envVars.BROWSER_QA_ARTIFACT_BUCKET).toBe('browser-qa-artifacts')
    expect(envVars.BROWSER_QA_ARTIFACT_DIR).toBe('/var/lucid/browser-artifacts')
    expect(envVars.BROWSER_QA_ARTIFACT_RETENTION_DAYS).toBe('14')
    expect(envVars.BROWSER_QA_PUBLIC_BASE_URL).toBe('https://browser-gateway.internal')
    expect(envVars.STEEL_BROWSER_URL).toBe('https://steel.internal')
    expect(envVars.STEEL_API_KEY).toBe('steel-key')
    expect(envVars.BROWSERLESS_WS_URL).toBe('wss://browserless.internal')
    expect(envVars.BROWSERLESS_TOKEN).toBe('browserless-token')
    expect(envVars.STAGEHAND_API_KEY).toBe('stagehand-key')
  })
}, 20_000)

// ─── destroyRuntimeViaL2 ───

describe('destroyRuntimeViaL2', () => {
  it('uses passport-based POST /terminate when passportId available', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))

    const { destroyRuntimeViaL2 } = await import('@/app/api/runtimes/_deploy')
    const result = await destroyRuntimeViaL2('l2-dep-1', 'rt-1', 'passport-abc')

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://l2.lucid.foundation/v1/agents/passport-abc/terminate',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('falls back to DELETE /deployments when no passportId', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))

    const { destroyRuntimeViaL2 } = await import('@/app/api/runtimes/_deploy')
    const result = await destroyRuntimeViaL2('l2-dep-1', 'rt-1')

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://l2.lucid.foundation/v1/agents/deployments/l2-dep-1',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('falls back to DELETE when passportId is null', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))

    const { destroyRuntimeViaL2 } = await import('@/app/api/runtimes/_deploy')
    const result = await destroyRuntimeViaL2('l2-dep-1', 'rt-1', null)

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/deployments/l2-dep-1'),
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('returns false when both IDs are empty', async () => {
    const { destroyRuntimeViaL2 } = await import('@/app/api/runtimes/_deploy')
    const result = await destroyRuntimeViaL2('', undefined, null)

    expect(result).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns false when L2 returns error', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Not found' }, 404))

    const { destroyRuntimeViaL2 } = await import('@/app/api/runtimes/_deploy')
    const result = await destroyRuntimeViaL2('l2-dep-1', 'rt-1', 'passport-abc')

    expect(result).toBe(false)
  })

  it('sends Authorization header with API key', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))

    const { destroyRuntimeViaL2 } = await import('@/app/api/runtimes/_deploy')
    await destroyRuntimeViaL2('l2-dep-1', 'rt-1', 'passport-abc')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
        }),
      })
    )
  })
}, 20_000)

// ─── Railway simulation ───

describe('Railway deploy simulation', () => {
  it('full lifecycle: launch → passport stored → terminate via passport', async () => {
    // Step 1: Launch returns passport_id
    mockFetch.mockResolvedValueOnce(jsonResponse({
      deployment_id: 'railway-svc-abc',
      deployment_url: 'https://worker-abc.up.railway.app',
      passport_id: 'passport-railway-1',
    }))

    const deploy = await import('@/app/api/runtimes/_deploy')
    const launchResult = await deploy.deployRuntimeViaL2({
      runtimeId: 'rt-railway-1',
      orgId: 'org-1',
      provider: 'railway',
      displayName: 'railway-prod',
      envVars: { LUCID_RUNTIME_ID: 'rt-railway-1' },
    })

    expect(launchResult).not.toBeNull()
    expect(launchResult!.passportId).toBe('passport-railway-1')
    expect(launchResult!.deploymentUrl).toBe('https://worker-abc.up.railway.app')

    // Step 2: Terminate via passport route
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))

    const destroyResult = await deploy.destroyRuntimeViaL2(
      launchResult!.deploymentId,
      'rt-railway-1',
      launchResult!.passportId
    )

    expect(destroyResult).toBe(true)
    // Verify it used the passport-based route, not the deployment-based one
    const terminateCall = mockFetch.mock.calls[1]
    expect(terminateCall[0]).toBe('https://l2.lucid.foundation/v1/agents/passport-railway-1/terminate')
    expect(terminateCall[1].method).toBe('POST')
  })
}, 20_000)
