import { afterEach, describe, expect, it } from 'vitest'

describe('worker config boolean parsing', () => {
  afterEach(() => {
    delete process.env.FEATURE_PULSE
    delete process.env.FEATURE_NATIVE_CHANNELS
    delete process.env.FEATURE_REST_MESSAGE_RELAY
    delete process.env.WORKER_MODE
    delete process.env.LUCID_RUNTIME_ID
    delete process.env.LUCID_RUNTIME_KEY
    delete process.env.LUCID_CONTROL_PLANE_URL
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.LUCID_PLATFORM_WALLET
    delete process.env.PLATFORM_OWNER_ADDRESS
    delete process.env.VITEST
  })

  it('treats string false as false for dedicated relay flags', async () => {
    process.env.VITEST = '1'
    process.env.FEATURE_PULSE = 'false'
    process.env.FEATURE_NATIVE_CHANNELS = 'false'
    process.env.FEATURE_REST_MESSAGE_RELAY = 'true'
    process.env.LUCID_RUNTIME_ID = '4dced755-aec7-4f63-9bbb-5b1c687649a0'
    process.env.LUCID_RUNTIME_KEY = 'runtime-key'
    process.env.LUCID_CONTROL_PLANE_URL = 'https://www.lucid.foundation'
    process.env.SUPABASE_URL = 'https://db.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'

    const { refreshConfigFromEnv } = await import('../config.js')
    const config = refreshConfigFromEnv()

    expect(config.FEATURE_PULSE).toBe(false)
    expect(config.FEATURE_NATIVE_CHANNELS).toBe(false)
    expect(config.FEATURE_REST_MESSAGE_RELAY).toBe(true)
  })

  it('uses only the canonical platform wallet name', async () => {
    process.env.VITEST = '1'
    process.env.SUPABASE_URL = 'https://db.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
    process.env.LUCID_PLATFORM_WALLET = 'owner-wallet'
    process.env.PLATFORM_OWNER_ADDRESS = 'legacy-owner-wallet'

    const { refreshConfigFromEnv } = await import('../config.js')
    const config = refreshConfigFromEnv()

    expect(config.LUCID_PLATFORM_WALLET).toBe('owner-wallet')
  })
})
