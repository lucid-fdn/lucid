import { afterEach, describe, expect, it } from 'vitest'

import { getWorkerLlmConfig, getWorkerLucidProviderConfig } from '../lucid-provider-config.js'

const ORIGINAL_ENV = { ...process.env }

function resetProviderEnv() {
  process.env.TRUSTGATE_BASE_URL = undefined
  process.env.TRUSTGATE_API_KEY = undefined
  process.env.LUCID_API_BASE_URL = undefined
  process.env.LUCID_API_KEY = undefined
  process.env.AI_GENERATION_DIRECT_OPENAI_FALLBACK_ENABLED = undefined
  process.env.AI_TEXT_DIRECT_OPENAI_FALLBACK_ENABLED = undefined
  process.env.AI_MEDIA_DIRECT_OPENAI_FALLBACK_ENABLED = undefined
}

describe('getWorkerLucidProviderConfig', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    resetProviderEnv()
  })

  it('prefers TrustGate env values over worker config and Lucid env values', () => {
    process.env.TRUSTGATE_BASE_URL = 'https://trustgate.example.com/v1/'
    process.env.TRUSTGATE_API_KEY = 'trustgate-key'
    process.env.LUCID_API_BASE_URL = 'https://lucid-env.example.com/v1'
    process.env.LUCID_API_KEY = 'lucid-env-key'

    const result = getWorkerLucidProviderConfig({
      LUCID_API_BASE_URL: 'https://lucid-config.example.com/v1',
      LUCID_API_KEY: 'lucid-config-key',
    })

    expect(result).toEqual({
      baseUrl: 'https://trustgate.example.com/v1',
      apiKey: 'trustgate-key',
      isConfigured: true,
    })
  })

  it('falls back to worker config when TrustGate env is not configured', () => {
    const result = getWorkerLucidProviderConfig({
      LUCID_API_BASE_URL: 'https://lucid-config.example.com/v1/',
      LUCID_API_KEY: 'lucid-config-key',
    })

    expect(result).toEqual({
      baseUrl: 'https://lucid-config.example.com/v1',
      apiKey: 'lucid-config-key',
      isConfigured: true,
    })
  })

  it('filters placeholder secrets and marks incomplete config as not configured', () => {
    process.env.TRUSTGATE_BASE_URL = 'https://trustgate.example.com/v1'
    process.env.TRUSTGATE_API_KEY = 'your-key-here'

    const result = getWorkerLucidProviderConfig()

    expect(result).toEqual({
      baseUrl: 'https://trustgate.example.com/v1',
      isConfigured: false,
    })
  })

  it('blocks direct OpenAI worker inference unless fallback is explicitly enabled', () => {
    const blocked = getWorkerLucidProviderConfig({
      LUCID_API_BASE_URL: 'https://api.openai.com/v1',
      LUCID_API_KEY: 'openai-key',
    })

    expect(blocked).toEqual({ isConfigured: false })
    expect(() => getWorkerLlmConfig({
      LUCID_API_BASE_URL: 'https://api.openai.com/v1',
      LUCID_API_KEY: 'openai-key',
    })).toThrow('Direct OpenAI worker inference is disabled')

    process.env.AI_GENERATION_DIRECT_OPENAI_FALLBACK_ENABLED = 'true'
    expect(getWorkerLlmConfig({
      LUCID_API_BASE_URL: 'https://api.openai.com/v1',
      LUCID_API_KEY: 'openai-key',
    })).toEqual({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'openai-key',
    })
  })
})
