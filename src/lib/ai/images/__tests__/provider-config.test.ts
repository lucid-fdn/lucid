import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('image provider config', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.IMAGE_PROVIDER
    delete process.env.IMAGE_BASE_URL
    delete process.env.IMAGE_MODEL
    delete process.env.TRUSTGATE_BASE_URL
    delete process.env.TRUSTGATE_API_KEY
    delete process.env.LUCID_API_BASE_URL
    delete process.env.LUCID_API_KEY
    delete process.env.OPENAI_IMAGE_BASE_URL
    delete process.env.OPENAI_IMAGE_API_KEY
    delete process.env.OPENAI_BASE_URL
    delete process.env.OPENAI_API_KEY
    delete process.env.AI_IMAGE_DIRECT_OPENAI_FALLBACK_ENABLED
    delete process.env.AI_IMAGE_STREAMING_MODELS
  })

  it('resolves TrustGate/Lucid before direct OpenAI in auto mode', async () => {
    process.env.TRUSTGATE_BASE_URL = 'https://trustgate.example/v1'
    process.env.TRUSTGATE_API_KEY = 'trustgate-key'
    process.env.LUCID_API_BASE_URL = 'https://lucid.example'
    process.env.LUCID_API_KEY = 'lucid-key'
    process.env.OPENAI_API_KEY = 'openai-key'
    process.env.AI_IMAGE_DIRECT_OPENAI_FALLBACK_ENABLED = 'true'

    const { buildImageProviderCandidates } = await import('../provider-config')
    const candidates = buildImageProviderCandidates()

    expect(candidates.map((candidate) => candidate.provider)).toEqual(['trustgate', 'trustgate', 'openai'])
    expect(candidates[0]).toMatchObject({
      baseUrl: 'https://trustgate.example/v1',
      apiKey: 'trustgate-key',
      model: 'gpt-image-2',
    })
    expect(candidates[1]).toMatchObject({
      baseUrl: 'https://lucid.example',
      apiKey: 'lucid-key',
    })
    expect(candidates[2]).toMatchObject({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'openai-key',
    })
  })

  it('does not cross-pair provider base URLs and API keys', async () => {
    process.env.IMAGE_BASE_URL = 'https://images.gateway.example'
    process.env.TRUSTGATE_API_KEY = 'trustgate-key'
    process.env.OPENAI_IMAGE_BASE_URL = 'https://openai-proxy.example'
    process.env.OPENAI_API_KEY = 'openai-key'
    process.env.AI_IMAGE_DIRECT_OPENAI_FALLBACK_ENABLED = 'true'

    const { buildImageProviderCandidates } = await import('../provider-config')
    const candidates = buildImageProviderCandidates('gpt-image-2')

    expect(candidates).toEqual([
      expect.objectContaining({
        provider: 'trustgate',
        baseUrl: 'https://images.gateway.example',
        apiKey: 'trustgate-key',
      }),
      expect.objectContaining({
        provider: 'openai',
        baseUrl: 'https://openai-proxy.example',
        apiKey: 'openai-key',
      }),
    ])
  })

  it('supports explicit openai mode', async () => {
    process.env.IMAGE_PROVIDER = 'openai'
    process.env.OPENAI_IMAGE_API_KEY = 'openai-image-key'
    process.env.AI_IMAGE_DIRECT_OPENAI_FALLBACK_ENABLED = 'false'

    const { buildImageProviderCandidates } = await import('../provider-config')

    expect(buildImageProviderCandidates()).toEqual([
      expect.objectContaining({
        provider: 'openai',
        apiKey: 'openai-image-key',
        model: 'gpt-image-2',
      }),
    ])
  })

  it('can disable direct OpenAI fallback in auto mode', async () => {
    process.env.TRUSTGATE_BASE_URL = 'https://trustgate.example'
    process.env.TRUSTGATE_API_KEY = 'trustgate-key'
    process.env.OPENAI_API_KEY = 'openai-key'
    process.env.AI_IMAGE_DIRECT_OPENAI_FALLBACK_ENABLED = 'false'

    const { buildImageProviderCandidates } = await import('../provider-config')

    expect(buildImageProviderCandidates().map((candidate) => candidate.provider)).toEqual(['trustgate'])
  })

  it('keeps direct OpenAI fallback disabled by default in auto mode', async () => {
    process.env.TRUSTGATE_BASE_URL = 'https://trustgate.example'
    process.env.TRUSTGATE_API_KEY = 'trustgate-key'
    process.env.OPENAI_API_KEY = 'openai-key'

    const { buildImageProviderCandidates } = await import('../provider-config')

    expect(buildImageProviderCandidates().map((candidate) => candidate.provider)).toEqual(['trustgate'])
  })

  it('enables documented image streaming models and supports explicit additions', async () => {
    const { supportsImageStreaming } = await import('../capabilities')

    expect(supportsImageStreaming('gpt-image-2')).toBe(true)
    expect(supportsImageStreaming('future-image-streaming-model')).toBe(false)

    process.env.AI_IMAGE_STREAMING_MODELS = 'future-image-streaming-model,gpt-image-1'
    expect(supportsImageStreaming('future-image-streaming-model')).toBe(true)
    expect(supportsImageStreaming('gpt-image-1')).toBe(true)
    expect(supportsImageStreaming('gpt-image-2')).toBe(true)
  })
})
