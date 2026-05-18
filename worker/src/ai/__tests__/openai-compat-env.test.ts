import { beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

describe('applyOpenAICompatEnv', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_BASE
  })

  it('sets OpenAI compatibility env vars once per process', async () => {
    const { applyOpenAICompatEnv } = await import('../openai-compat-env.js')

    applyOpenAICompatEnv({
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'first-key',
    })
    applyOpenAICompatEnv({
      baseUrl: 'https://other.example.com/v1',
      apiKey: 'second-key',
    })

    expect(process.env.OPENAI_API_BASE).toBe('https://gateway.example.com/v1')
    expect(process.env.OPENAI_API_KEY).toBe('first-key')
  })
})
