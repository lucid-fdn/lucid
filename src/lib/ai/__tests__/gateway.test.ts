import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('server-only', () => ({}))

const aiGenerateTextMock = vi.fn()
const aiStreamTextMock = vi.fn()
const aiGenerateObjectMock = vi.fn()
const generateEmbeddingMock = vi.fn()
const generateEmbeddingsMock = vi.fn()
const runImageGenerationMock = vi.fn()
const createOpenAIMock = vi.fn()
const chatMock = vi.fn()

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => aiGenerateTextMock(...args),
  streamText: (...args: unknown[]) => aiStreamTextMock(...args),
  generateObject: (...args: unknown[]) => aiGenerateObjectMock(...args),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: (...args: unknown[]) => createOpenAIMock(...args),
}))

vi.mock('../embeddings', () => ({
  generateEmbedding: (...args: unknown[]) => generateEmbeddingMock(...args),
  generateEmbeddings: (...args: unknown[]) => generateEmbeddingsMock(...args),
}))

vi.mock('../images/provider', () => ({
  runImageGeneration: (...args: unknown[]) => runImageGenerationMock(...args),
}))

describe('ai gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AI_PROVIDER = 'auto'
    process.env.LUCID_API_BASE_URL = 'https://api.lucid.foundation'
    process.env.LUCID_API_KEY = 'lucid-key'
    delete process.env.TRUSTGATE_BASE_URL
    delete process.env.TRUSTGATE_API_KEY
    delete process.env.OPENAI_BASE_URL
    delete process.env.OPENAI_API_KEY

    chatMock.mockReturnValue({ kind: 'language-model' })
    createOpenAIMock.mockReturnValue({
      chat: chatMock,
    })
    aiGenerateTextMock.mockResolvedValue({ text: 'ok' })
    aiGenerateObjectMock.mockResolvedValue({ object: { ok: true } })
    aiStreamTextMock.mockReturnValue({ stream: true })
    generateEmbeddingMock.mockResolvedValue({ embedding: [1, 2, 3], usage: { tokens: 3 } })
    generateEmbeddingsMock.mockResolvedValue({ embeddings: [[1, 2, 3]], usage: { tokens: 3 } })
    runImageGenerationMock.mockResolvedValue({
      provider: 'trustgate',
      model: 'gpt-image-2',
      imageBytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/webp',
      receipt: { latencyMs: 1 },
    })
  })

  it('routes text generation through TrustGate by default when configured', async () => {
    const gateway = await import('../gateway')

    await gateway.generateText({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: 'lucid-key',
      baseURL: 'https://api.lucid.foundation/v1',
    })
    expect(chatMock).toHaveBeenCalledWith('gpt-4.1-mini')
    expect(aiGenerateTextMock).toHaveBeenCalled()
  })

  it('supports explicit OpenAI override for text/object/stream', async () => {
    process.env.OPENAI_API_KEY = 'openai-key'
    const gateway = await import('../gateway')

    await gateway.generateObject({
      model: 'gpt-4.1-mini',
      provider: 'openai',
      schema: z.object({ ok: z.boolean() }),
      messages: [{ role: 'user', content: 'hello' }],
    })
    gateway.streamText({
      model: 'gpt-4.1-mini',
      provider: 'openai',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: 'openai-key',
      baseURL: 'https://api.openai.com/v1',
    })
    expect(aiGenerateObjectMock).toHaveBeenCalled()
    expect(aiStreamTextMock).toHaveBeenCalled()
  })

  it('passes experimental telemetry through the shared gateway wrappers', async () => {
    const gateway = await import('../gateway')

    await gateway.generateObject({
      model: 'gpt-4.1-mini',
      schema: z.object({ ok: z.boolean() }),
      messages: [{ role: 'user', content: 'hello' }],
      experimentalTelemetry: { isEnabled: true, functionId: 'ai.test' },
    })

    expect(aiGenerateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        experimental_telemetry: { isEnabled: true, functionId: 'ai.test' },
      }),
    )
  })

  it('wraps existing embeddings and image helpers', async () => {
    const gateway = await import('../gateway')

    const embedResult = await gateway.embed({ value: 'hello' })
    const embedManyResult = await gateway.embedMany({ values: ['a'] })
    const imageResult = await gateway.generateImage({
      purpose: 'generic-image',
      mode: 'generate',
      prompt: 'draw a fox',
    })

    expect(generateEmbeddingMock).toHaveBeenCalledWith('hello', undefined)
    expect(generateEmbeddingsMock).toHaveBeenCalledWith(['a'], undefined)
    expect(embedResult.embedding).toEqual([1, 2, 3])
    expect(embedManyResult.embeddings).toEqual([[1, 2, 3]])
    expect(runImageGenerationMock).toHaveBeenCalledWith({
      purpose: 'generic-image',
      mode: 'generate',
      prompt: 'draw a fox',
    })
    expect(imageResult.model).toBe('gpt-image-2')
  })
})
