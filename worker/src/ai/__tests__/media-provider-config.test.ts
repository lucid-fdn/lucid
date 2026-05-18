import { afterEach, describe, expect, it } from 'vitest'

import { getWorkerMediaProviderConfig } from '../media-provider-config.js'

const ORIGINAL_ENV = { ...process.env }

function resetProviderEnv() {
  process.env.TRUSTGATE_BASE_URL = undefined
  process.env.TRUSTGATE_API_KEY = undefined
  process.env.MCPGATE_API_KEY = undefined
  process.env.OPENAI_BASE_URL = undefined
  process.env.OPENAI_API_KEY = undefined
  process.env.LUCID_API_BASE_URL = undefined
  process.env.LUCID_API_KEY = undefined
}

describe('getWorkerMediaProviderConfig', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    resetProviderEnv()
  })

  it('returns gateway-only credentials without mixing in raw OpenAI provider settings', () => {
    process.env.TRUSTGATE_BASE_URL = 'https://trustgate.example.com/v1'
    process.env.TRUSTGATE_API_KEY = 'trustgate-key'
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1'
    process.env.OPENAI_API_KEY = 'openai-key'

    const result = getWorkerMediaProviderConfig({
      LUCID_API_BASE_URL: 'https://lucid-config.example.com/v1',
      LUCID_API_KEY: 'lucid-config-key',
    })

    expect(result).toEqual({
      gatewayEndpoints: [
        { baseUrl: 'https://trustgate.example.com/v1', apiKey: 'trustgate-key' },
      ],
      gatewayBaseUrls: [
        'https://trustgate.example.com/v1',
      ],
      gatewayApiKeys: [
        'trustgate-key',
      ],
      preferredGatewayBaseUrl: 'https://trustgate.example.com/v1',
      preferredGatewayApiKey: 'trustgate-key',
    })
  })

  it('deduplicates secrets and keeps MCPGATE as a fallback credential', () => {
    process.env.MCPGATE_API_KEY = 'mcpgate-key'
    process.env.OPENAI_API_KEY = 'openai-key'

    const result = getWorkerMediaProviderConfig({
      LUCID_API_BASE_URL: 'https://lucid-config.example.com/v1/',
      LUCID_API_KEY: 'openai-key',
    })

    expect(result).toEqual({
      gatewayEndpoints: [
        { baseUrl: 'https://lucid-config.example.com/v1', apiKey: 'mcpgate-key' },
        { baseUrl: 'https://lucid-config.example.com/v1', apiKey: 'openai-key' },
      ],
      gatewayBaseUrls: ['https://lucid-config.example.com/v1'],
      gatewayApiKeys: ['mcpgate-key', 'openai-key'],
      preferredGatewayBaseUrl: 'https://lucid-config.example.com/v1',
      preferredGatewayApiKey: 'mcpgate-key',
    })
  })
})
