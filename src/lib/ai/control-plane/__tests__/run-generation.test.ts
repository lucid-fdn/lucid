import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const writeAIGenerationEventMock = vi.fn()

vi.mock('../events', () => ({
  writeAIGenerationEvent: (...args: unknown[]) => writeAIGenerationEventMock(...args),
}))

describe('runAIGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    delete process.env.AI_GENERATION_CONTROL_PLANE_ENABLED
    delete process.env.AI_GENERATION_IMAGE_ENABLED
    delete process.env.AI_GENERATION_AGENT_AVATAR_ENABLED
    writeAIGenerationEventMock.mockResolvedValue('evt-1')
  })

  it('runs the adapter and records a success event with provider receipt metadata', async () => {
    const { runAIGeneration } = await import('../run-generation')
    const adapter = vi.fn().mockResolvedValue({
      provider: 'trustgate',
      model: 'gpt-image-2',
      usage: { totalTokens: 42 },
      receipt: { latencyMs: 123 },
      imageBytes: new Uint8Array([1]),
      mimeType: 'image/webp',
    })

    const result = await runAIGeneration({
      context: { userId: 'user-1', orgId: 'org-1', assistantId: 'assistant-1' },
      feature: 'agent-avatar-generation',
      modality: 'image',
      prompt: 'avatar prompt',
      input: { prompt: 'avatar prompt' },
      metadata: { promptVersion: 'agent-avatar-v1' },
      adapter,
    })

    expect(adapter).toHaveBeenCalledWith({ prompt: 'avatar prompt' })
    expect(result.generationEventId).toBe('evt-1')
    expect(writeAIGenerationEventMock).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      feature: 'agent-avatar-generation',
      modality: 'image',
      provider: 'trustgate',
      model: 'gpt-image-2',
      usage: { totalTokens: 42 },
    }))
  })

  it('records a failure event when the adapter throws', async () => {
    const { runAIGeneration } = await import('../run-generation')
    const adapter = vi.fn().mockRejectedValue(new Error('provider down'))

    await expect(runAIGeneration({
      context: { userId: 'user-1', orgId: 'org-1' },
      feature: 'generic-image-generation',
      modality: 'image',
      prompt: 'image prompt',
      input: { prompt: 'image prompt' },
      adapter,
    })).rejects.toThrow('provider down')

    expect(writeAIGenerationEventMock).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'provider down',
    }))
  })

  it('requires org context for org-scoped generation', async () => {
    const { runAIGeneration } = await import('../run-generation')

    await expect(runAIGeneration({
      context: { userId: 'user-1' },
      feature: 'agent-avatar-generation',
      modality: 'image',
      prompt: 'avatar prompt',
      input: { prompt: 'avatar prompt' },
      adapter: vi.fn(),
    })).rejects.toThrow('requires an organization context')
  })

  it('blocks generation when the image rollout flag is disabled', async () => {
    process.env.AI_GENERATION_IMAGE_ENABLED = 'false'
    const { runAIGeneration } = await import('../run-generation')
    const adapter = vi.fn()

    await expect(runAIGeneration({
      context: { userId: 'user-1', orgId: 'org-1' },
      feature: 'generic-image-generation',
      modality: 'image',
      prompt: 'image prompt',
      input: { prompt: 'image prompt' },
      adapter,
    })).rejects.toMatchObject({
      name: 'AIGenerationFeatureDisabledError',
      flag: 'AI_GENERATION_IMAGE_ENABLED',
    })

    expect(adapter).not.toHaveBeenCalled()
    expect(writeAIGenerationEventMock).not.toHaveBeenCalled()
  })
})
