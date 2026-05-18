/**
 * Tests for worker/src/config-bootstrap.ts
 *
 * bootstrapRuntimeConfig() fetches env vars from the control plane on startup
 * and merges them into process.env before getConfig() is called.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We need to test the bootstrap in isolation without calling process.exit.
// Capture exit calls instead.
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Import AFTER stubs are in place
const { bootstrapRuntimeConfig } = await import('../config-bootstrap.js')

const RUNTIME_ENV = {
  LUCID_RUNTIME_ID: 'rt-0000-0000-0000-0000',
  LUCID_RUNTIME_KEY: 'deadbeef01234567890abcdef',
  LUCID_CONTROL_PLANE_URL: 'https://lucid.test',
}

function withEnv(overrides: Record<string, string | undefined>, fn: () => Promise<void>) {
  const saved: Record<string, string | undefined> = {}
  return async () => {
    // Apply overrides
    for (const [k, v] of Object.entries(RUNTIME_ENV)) {
      saved[k] = process.env[k]
      process.env[k] = v
    }
    for (const [k, v] of Object.entries(overrides)) {
      saved[k] = process.env[k]
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    try {
      await fn()
    } finally {
      // Restore
      for (const k of Object.keys({ ...RUNTIME_ENV, ...overrides })) {
        if (saved[k] === undefined) delete process.env[k]
        else process.env[k] = saved[k]
      }
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockExit.mockClear()
  // Remove runtime env vars (each test sets them via withEnv)
  delete process.env.LUCID_RUNTIME_ID
  delete process.env.LUCID_RUNTIME_KEY
  delete process.env.LUCID_CONTROL_PLANE_URL
  delete process.env.LUCID_CONFIG_VERSION
})

afterEach(() => {
  delete process.env.LUCID_RUNTIME_ID
  delete process.env.LUCID_RUNTIME_KEY
  delete process.env.LUCID_CONTROL_PLANE_URL
  delete process.env.LUCID_CONFIG_VERSION
})

describe('bootstrapRuntimeConfig', () => {
  it('is a no-op when LUCID_RUNTIME_ID is absent', async () => {
    await bootstrapRuntimeConfig()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockExit).not.toHaveBeenCalled()
  })

  it('is a no-op when LUCID_CONTROL_PLANE_URL is absent', async () => {
    process.env.LUCID_RUNTIME_ID = 'rt-123'
    process.env.LUCID_RUNTIME_KEY = 'key-abc'
    // No LUCID_CONTROL_PLANE_URL
    await bootstrapRuntimeConfig()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches config and merges vars into process.env', async () => {
    process.env.LUCID_RUNTIME_ID = RUNTIME_ENV.LUCID_RUNTIME_ID
    process.env.LUCID_RUNTIME_KEY = RUNTIME_ENV.LUCID_RUNTIME_KEY
    process.env.LUCID_CONTROL_PLANE_URL = RUNTIME_ENV.LUCID_CONTROL_PLANE_URL

    const envVars = { SUPABASE_URL: 'https://db.supabase.co', FEATURE_PULSE: 'true' }
    const configVersion = 'abc123def456'

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ envVars, configVersion }),
    })

    await bootstrapRuntimeConfig()

    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockFetch).toHaveBeenCalledWith(
      'https://lucid.test/api/runtimes/config',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${RUNTIME_ENV.LUCID_RUNTIME_KEY}`,
        }),
      }),
    )

    expect(process.env.SUPABASE_URL).toBe('https://db.supabase.co')
    expect(process.env.FEATURE_PULSE).toBe('true')
    expect(process.env.LUCID_CONFIG_VERSION).toBe('abc123def456')

    // Cleanup
    delete process.env.SUPABASE_URL
    delete process.env.FEATURE_PULSE
  })

  it('overwrites managed env vars from the control plane', async () => {
    process.env.LUCID_RUNTIME_ID = RUNTIME_ENV.LUCID_RUNTIME_ID
    process.env.LUCID_RUNTIME_KEY = RUNTIME_ENV.LUCID_RUNTIME_KEY
    process.env.LUCID_CONTROL_PLANE_URL = RUNTIME_ENV.LUCID_CONTROL_PLANE_URL
    process.env.SUPABASE_URL = 'https://existing.supabase.co'

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        envVars: { SUPABASE_URL: 'https://new.supabase.co', NEW_VAR: 'new-value' },
        configVersion: 'v1',
      }),
    })

    await bootstrapRuntimeConfig()

    // Control-plane value wins for managed keys
    expect(process.env.SUPABASE_URL).toBe('https://new.supabase.co')
    // New var is added
    expect(process.env.NEW_VAR).toBe('new-value')

    // Cleanup
    delete process.env.SUPABASE_URL
    delete process.env.NEW_VAR
  })

  it('exits with code 1 on HTTP 410 (revoked runtime)', async () => {
    process.env.LUCID_RUNTIME_ID = RUNTIME_ENV.LUCID_RUNTIME_ID
    process.env.LUCID_RUNTIME_KEY = RUNTIME_ENV.LUCID_RUNTIME_KEY
    process.env.LUCID_CONTROL_PLANE_URL = RUNTIME_ENV.LUCID_CONTROL_PLANE_URL

    mockFetch.mockResolvedValueOnce({ ok: false, status: 410, text: async () => 'revoked' })

    await bootstrapRuntimeConfig()
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('retries on transient failure then succeeds', async () => {
    process.env.LUCID_RUNTIME_ID = RUNTIME_ENV.LUCID_RUNTIME_ID
    process.env.LUCID_RUNTIME_KEY = RUNTIME_ENV.LUCID_RUNTIME_KEY
    process.env.LUCID_CONTROL_PLANE_URL = RUNTIME_ENV.LUCID_CONTROL_PLANE_URL

    // First call fails, second succeeds
    mockFetch
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ envVars: { RETRY_VAR: 'yes' }, configVersion: 'v2' }),
      })

    // Patch setTimeout to avoid test delay
    const origSetTimeout = global.setTimeout
    vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => { fn(); return 0 as any })

    await bootstrapRuntimeConfig()

    global.setTimeout = origSetTimeout

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(process.env.RETRY_VAR).toBe('yes')

    delete process.env.RETRY_VAR
  })

  it('continues gracefully when all retries fail and SUPABASE_URL exists', async () => {
    process.env.LUCID_RUNTIME_ID = RUNTIME_ENV.LUCID_RUNTIME_ID
    process.env.LUCID_RUNTIME_KEY = RUNTIME_ENV.LUCID_RUNTIME_KEY
    process.env.LUCID_CONTROL_PLANE_URL = RUNTIME_ENV.LUCID_CONTROL_PLANE_URL
    process.env.SUPABASE_URL = 'https://fallback.supabase.co'

    mockFetch.mockRejectedValue(new Error('fetch failed'))

    vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => { fn(); return 0 as any })

    await bootstrapRuntimeConfig()

    expect(mockExit).not.toHaveBeenCalled()

    delete process.env.SUPABASE_URL
  })

  it('exits when all retries fail and no SUPABASE_URL set', async () => {
    process.env.LUCID_RUNTIME_ID = RUNTIME_ENV.LUCID_RUNTIME_ID
    process.env.LUCID_RUNTIME_KEY = RUNTIME_ENV.LUCID_RUNTIME_KEY
    process.env.LUCID_CONTROL_PLANE_URL = RUNTIME_ENV.LUCID_CONTROL_PLANE_URL
    delete process.env.SUPABASE_URL

    mockFetch.mockRejectedValue(new Error('fetch failed'))

    vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => { fn(); return 0 as any })

    await bootstrapRuntimeConfig()

    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('strips trailing slashes from LUCID_CONTROL_PLANE_URL', async () => {
    process.env.LUCID_RUNTIME_ID = RUNTIME_ENV.LUCID_RUNTIME_ID
    process.env.LUCID_RUNTIME_KEY = RUNTIME_ENV.LUCID_RUNTIME_KEY
    process.env.LUCID_CONTROL_PLANE_URL = 'https://lucid.test///'

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ envVars: {}, configVersion: 'v1' }),
    })

    await bootstrapRuntimeConfig()

    const calledUrl = mockFetch.mock.calls[0][0]
    expect(calledUrl).toBe('https://lucid.test/api/runtimes/config')
  })
})
