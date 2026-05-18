import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('lucid provider config', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.TRUSTGATE_BASE_URL
    delete process.env.LUCID_API_BASE_URL
    delete process.env.TRUSTGATE_API_KEY
    delete process.env.LUCID_API_KEY
  })

  it('prefers TrustGate values over legacy Lucid values', async () => {
    process.env.TRUSTGATE_BASE_URL = 'https://trustgate.example.com'
    process.env.LUCID_API_BASE_URL = 'https://api.lucid.foundation'
    process.env.TRUSTGATE_API_KEY = 'trustgate-key'
    process.env.LUCID_API_KEY = 'lucid-key'

    const { getLucidProviderConfig } = await import('../lucid-provider-config')
    const config = getLucidProviderConfig()

    expect(config.baseUrl).toBe('https://trustgate.example.com')
    expect(config.apiKey).toBe('trustgate-key')
    expect(config.isConfigured).toBe(true)
  })

  it('filters placeholder keys and falls back to default base url', async () => {
    process.env.LUCID_API_KEY = 'your-key-here'

    const { getLucidProviderConfig } = await import('../lucid-provider-config')
    const config = getLucidProviderConfig()

    expect(config.baseUrl).toBe('https://api.lucid.foundation')
    expect(config.apiKey).toBeUndefined()
    expect(config.isConfigured).toBe(false)
  })
})
