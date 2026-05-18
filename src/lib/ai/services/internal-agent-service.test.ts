import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const runInternalWorkerAgent = vi.fn()
const getBYOKModel = vi.fn()
const gatewayGenerateText = vi.fn()
const aiGenerateText = vi.fn()

vi.mock('@/lib/ai/platform/agent-runtime/internal-agent-client', () => ({
  runInternalWorkerAgent,
}))

vi.mock('@/lib/ai/byok-provider', () => ({
  getBYOKModel,
}))

vi.mock('@/lib/ai/gateway', () => ({
  generateText: gatewayGenerateText,
}))

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    generateText: aiGenerateText,
  }
})

vi.mock('@/lib/ai/providers', () => ({
  isLucidConfigured: () => true,
}))

describe('runInternalTextAgent', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    delete process.env.LUCID_INTERNAL_BUILDER_BACKEND
    getBYOKModel.mockResolvedValue({ model: { provider: 'mock' } })
  })

  it('uses the worker-backed internal profile for builder planning', async () => {
    process.env.LUCID_INTERNAL_BUILDER_BACKEND = 'worker-agent'
    runInternalWorkerAgent.mockResolvedValue({
      text: 'planned',
      usage: { promptTokens: 1, completionTokens: 1 },
      steps: 1,
      toolCallsUsed: 0,
      budgetExhausted: false,
      hasProviderError: false,
    })

    const { runInternalTextAgent } = await import('./internal-agent-service')

    const result = await runInternalTextAgent({
      profile: 'builder-planner',
      orgId: 'org-1',
      systemPrompt: 'system',
      prompt: 'plan this',
      requestedModelId: 'openai/gpt-4.1',
    })

    expect(result.backend).toBe('worker-agent')
    expect(runInternalWorkerAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: {
          allowBuiltInSkills: false,
          allowedTools: [],
        },
        budget: expect.objectContaining({
          maxToolCalls: 0,
          maxLlmCalls: 4,
        }),
      }),
    )
  })

  it('falls back to local orchestration when the worker-backed call fails', async () => {
    process.env.LUCID_INTERNAL_BUILDER_BACKEND = 'worker-agent'
    runInternalWorkerAgent.mockRejectedValue(new Error('worker down'))
    aiGenerateText.mockResolvedValue({ text: 'local fallback' })

    const { runInternalTextAgent } = await import('./internal-agent-service')

    const result = await runInternalTextAgent({
      profile: 'builder-planner',
      orgId: 'org-1',
      systemPrompt: 'system',
      prompt: 'plan this',
      requestedModelId: 'openai/gpt-4.1',
    })

    expect(result.backend).toBe('local-orchestrator')
    expect(aiGenerateText).toHaveBeenCalled()
    expect(result.text).toBe('local fallback')
  })
})
