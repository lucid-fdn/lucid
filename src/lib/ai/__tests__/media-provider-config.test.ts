import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('media provider config', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.TRUSTGATE_BASE_URL
    delete process.env.LUCID_API_BASE_URL
    delete process.env.OPENAI_BASE_URL
    delete process.env.TRUSTGATE_API_KEY
    delete process.env.MCPGATE_API_KEY
    delete process.env.LUCID_API_KEY
    delete process.env.OPENAI_API_KEY
  })

  it('prefers Lucid gateway credentials while preserving OpenAI fallback', async () => {
    process.env.TRUSTGATE_BASE_URL = 'https://trustgate.example.com'
    process.env.LUCID_API_BASE_URL = 'https://api.lucid.foundation'
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1'
    process.env.TRUSTGATE_API_KEY = 'trustgate-key'
    process.env.MCPGATE_API_KEY = 'mcpgate-key'
    process.env.LUCID_API_KEY = 'lucid-key'
    process.env.OPENAI_API_KEY = 'openai-key'

    const { getMediaProviderConfig } = await import('../media-provider-config')
    const config = getMediaProviderConfig()

    expect(config.gatewayBaseUrls).toEqual([
      'https://trustgate.example.com',
      'https://api.lucid.foundation',
      'https://api.openai.com/v1',
    ])
    expect(config.gatewayApiKeys).toEqual([
      'trustgate-key',
      'mcpgate-key',
      'lucid-key',
      'openai-key',
    ])
    expect(config.preferredGatewayBaseUrl).toBe('https://trustgate.example.com')
    expect(config.preferredGatewayApiKey).toBe('trustgate-key')
  })

  it('filters placeholders and empty values', async () => {
    process.env.LUCID_API_BASE_URL = 'https://api.lucid.foundation'
    process.env.LUCID_API_KEY = 'your-key-here'
    process.env.OPENAI_API_KEY = 'openai-key'

    const { getMediaProviderConfig } = await import('../media-provider-config')
    const config = getMediaProviderConfig()

    expect(config.gatewayBaseUrls).toEqual(['https://api.lucid.foundation'])
    expect(config.gatewayApiKeys).toEqual(['openai-key'])
    expect(config.preferredGatewayBaseUrl).toBe('https://api.lucid.foundation')
    expect(config.preferredGatewayApiKey).toBe('openai-key')
  })
})
