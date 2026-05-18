import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('WORKER_MODE config', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    delete process.env.WORKER_ID
    delete process.env.K_REVISION
  })

  it('defaults to "all" when WORKER_MODE is not set', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    delete process.env.WORKER_MODE

    const { getConfig } = await import('../config.js')
    const config = getConfig()
    expect(config.WORKER_MODE).toBe('all')
  })

  it('accepts "worker" mode', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    vi.stubEnv('WORKER_MODE', 'worker')

    const { getConfig } = await import('../config.js')
    expect(getConfig().WORKER_MODE).toBe('worker')
  })

  it('accepts "discord" mode', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    vi.stubEnv('WORKER_MODE', 'discord')

    const { getConfig } = await import('../config.js')
    expect(getConfig().WORKER_MODE).toBe('discord')
  })

  it('accepts "channels" mode for combined socket gateways', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    vi.stubEnv('WORKER_MODE', 'channels')

    const { getConfig } = await import('../config.js')
    expect(getConfig().WORKER_MODE).toBe('channels')
  })

  it('accepts "browser" mode for isolated Browser QA gateways', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    vi.stubEnv('WORKER_MODE', 'browser')

    const { getConfig } = await import('../config.js')
    expect(getConfig().WORKER_MODE).toBe('browser')
  })

  it('defaults WORKER_ROLE to "all"', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    delete process.env.WORKER_ROLE

    const { getConfig } = await import('../config.js')
    expect(getConfig().WORKER_ROLE).toBe('all')
  })

  it('accepts "interactive" worker role', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    vi.stubEnv('WORKER_ROLE', 'interactive')

    const { getConfig } = await import('../config.js')
    expect(getConfig().WORKER_ROLE).toBe('interactive')
  })

  it('uses K_REVISION in WORKER_ID when available', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    vi.stubEnv('K_REVISION', 'lucid-worker-00042-abc')
    delete process.env.WORKER_ID

    const { getConfig } = await import('../config.js')
    const config = getConfig()
    expect(config.WORKER_ID).toContain('lucid-worker-00042-abc')
    expect(config.WORKER_ID).toContain(String(process.pid))
  })

  it('uses default WORKER_ID when K_REVISION is not set', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    delete process.env.K_REVISION
    delete process.env.WORKER_ID

    const { getConfig } = await import('../config.js')
    const config = getConfig()
    expect(config.WORKER_ID).toMatch(/^worker-\d+$/)
  })
})
