import { beforeEach, describe, expect, it, vi } from 'vitest'

const BASE_ENV = {
  SUPABASE_URL: 'https://db.example.com',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  LUCID_API_BASE_URL: 'https://api.example.com',
}

function applyEnv(extra: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...extra })) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

describe('worker dedicated transport config validation', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.VITEST = '1'
    process.env.NODE_ENV = 'test'
    applyEnv({
      LUCID_RUNTIME_ID: undefined,
      LUCID_RUNTIME_KEY: undefined,
      LUCID_CONTROL_PLANE_URL: undefined,
      FEATURE_REST_MESSAGE_RELAY: undefined,
      FEATURE_PULSE: undefined,
      LUCID_DEDICATED_TRANSPORT_MODE: undefined,
    })
  })

  it('rejects native_pulse when FEATURE_PULSE is disabled', async () => {
    applyEnv({
      LUCID_RUNTIME_ID: '550e8400-e29b-41d4-a716-446655440000',
      LUCID_RUNTIME_KEY: 'runtime-key',
      LUCID_CONTROL_PLANE_URL: 'https://control.example.com',
      LUCID_DEDICATED_TRANSPORT_MODE: 'native_pulse',
      FEATURE_PULSE: undefined,
      FEATURE_REST_MESSAGE_RELAY: 'false',
    })

    const { getConfig } = await import('../config.js')
    expect(() => getConfig()).toThrow(
      'LUCID_DEDICATED_TRANSPORT_MODE=native_pulse requires: FEATURE_PULSE=true',
    )
  })

  it('accepts native_pulse when runtime credentials and FEATURE_PULSE are present', async () => {
    applyEnv({
      LUCID_RUNTIME_ID: '550e8400-e29b-41d4-a716-446655440000',
      LUCID_RUNTIME_KEY: 'runtime-key',
      LUCID_CONTROL_PLANE_URL: 'https://control.example.com',
      LUCID_DEDICATED_TRANSPORT_MODE: 'native_pulse',
      FEATURE_PULSE: 'true',
      FEATURE_REST_MESSAGE_RELAY: 'false',
    })

    const { getConfig } = await import('../config.js')
    const config = getConfig()
    expect(config.LUCID_DEDICATED_TRANSPORT_MODE).toBe('native_pulse')
    expect(config.FEATURE_PULSE).toBe(true)
  })
})
