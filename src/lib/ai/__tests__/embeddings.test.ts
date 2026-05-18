import { beforeEach, describe, expect, it, vi } from 'vitest'

const embedMock = vi.fn()
const openAITextEmbeddingModelMock = vi.fn((modelId: string) => ({ modelId, provider: 'openai' }))

vi.mock('server-only', () => ({}))

vi.mock('ai', () => ({
  embed: (...args: unknown[]) => embedMock(...args),
  embedMany: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    textEmbeddingModel: openAITextEmbeddingModelMock,
  })),
}))

vi.mock('../providers', () => ({
  lucid: {
    textEmbeddingModel: (modelId: string) => ({ modelId }),
  },
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
  },
}))

describe('embeddings', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    delete process.env.KNOWLEDGE_E2E_FAKE_EMBEDDINGS
    delete process.env.LUCID_EMBEDDING_CACHE_TTL_MS
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_BASE_URL
    delete process.env.AI_EMBEDDING_PROVIDER
    delete process.env.KNOWLEDGE_EMBEDDING_PROVIDER
    delete process.env.EMBEDDING_PROVIDER
    delete process.env.AI_PROVIDER
    process.env.NODE_ENV = 'test'
    embedMock.mockResolvedValue({ embedding: [0.1, 0.2, 0.3], usage: { tokens: 3 } })
  })

  it('coalesces repeated single embedding requests by model and text', async () => {
    const { generateEmbedding } = await import('../embeddings')

    const [first, second] = await Promise.all([
      generateEmbedding('same query', 'text-embedding-3-small'),
      generateEmbedding('same query', 'text-embedding-3-small'),
    ])
    const third = await generateEmbedding('same query', 'text-embedding-3-small')

    expect(first.embedding).toEqual([0.1, 0.2, 0.3])
    expect(second.embedding).toEqual([0.1, 0.2, 0.3])
    expect(third.embedding).toEqual([0.1, 0.2, 0.3])
    expect(embedMock).toHaveBeenCalledTimes(1)
  })

  it('can disable the embedding cache for diagnostics', async () => {
    process.env.LUCID_EMBEDDING_CACHE_TTL_MS = '0'
    const { generateEmbedding } = await import('../embeddings')

    await generateEmbedding('same query')
    await generateEmbedding('same query')

    expect(embedMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to OpenAI embeddings when the Lucid-compatible provider is unavailable in auto mode', async () => {
    process.env.OPENAI_API_KEY = 'openai-key'
    embedMock
      .mockRejectedValueOnce(new Error('Unauthorized'))
      .mockResolvedValueOnce({ embedding: [0.4, 0.5, 0.6], usage: { tokens: 4 } })
    const { generateEmbedding } = await import('../embeddings')

    const result = await generateEmbedding('fallback query')

    expect(result.embedding).toEqual([0.4, 0.5, 0.6])
    expect(embedMock).toHaveBeenCalledTimes(2)
    expect(openAITextEmbeddingModelMock).toHaveBeenCalledWith('text-embedding-3-small')
  })
})
