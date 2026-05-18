import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DefaultWorkerRunExecutor } from '../worker-run-executor.js'

const mockRunAgent = vi.fn()

vi.mock('../../../agent/engines/index.js', () => ({
  runAgent: (...args: unknown[]) => mockRunAgent(...args),
}))

describe('DefaultWorkerRunExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('normalizes engine output into the canonical run result', async () => {
    mockRunAgent.mockResolvedValueOnce({
      text: 'hello',
      usage: {
        promptTokens: 12,
        completionTokens: 8,
      },
      steps: 3,
      toolCallsUsed: 2,
      budgetExhausted: false,
      hasProviderError: true,
      diagnostics: {
        model: 'openai/gpt-4.1',
        durationMs: 321,
        stopReason: 'end_turn',
        capabilitySurface: {
          tools: { selectedCount: 2 },
        },
      },
    })

    const executor = new DefaultWorkerRunExecutor()
    const result = await executor.execute({
      assistant: {
        id: 'assistant-1',
        name: 'Test',
        engine: 'hermes',
        runtime_flavor: 'shared',
        system_prompt: null,
        soul_content: null,
        lucid_model: 'gpt-test',
        temperature: 0,
        max_tokens: 1000,
        memory_enabled: false,
        memory_window_size: 0,
        org_id: null,
        passport_id: null,
        policy_config: null,
        wallet_enabled: false,
      },
      conversationId: 'conversation-1',
      messages: [],
      memories: [],
      userMessage: 'hi',
      budget: {
        maxLlmCalls: 5,
        maxToolCalls: 5,
        maxWallTimeMs: 1000,
      },
      llmConfig: {
        baseUrl: 'https://example.com',
        apiKey: 'test',
      },
    })

    expect(result).toMatchObject({
      text: 'hello',
      usage: {
        promptTokens: 12,
        completionTokens: 8,
        totalTokens: 20,
      },
      steps: 3,
      toolCallsUsed: 2,
      budgetExhausted: false,
      providerError: true,
      source: {
        engine: 'hermes',
        runtimeFlavor: 'shared',
        executionMode: 'engine',
      },
      diagnostics: {
        model: 'openai/gpt-4.1',
        durationMs: 321,
        stopReason: 'end_turn',
        capabilitySurface: {
          tools: { selectedCount: 2 },
        },
      },
      meta: {
        model: 'openai/gpt-4.1',
        durationMs: 321,
        stopReason: 'end_turn',
      },
    })
  })

  it('returns a canonical timeout error when the engine exceeds wall time', async () => {
    vi.useFakeTimers()
    mockRunAgent.mockImplementationOnce(
      () => new Promise(() => {
        // Intentionally never settles.
      }),
    )

    const executor = new DefaultWorkerRunExecutor()
    const run = executor.execute({
      assistant: {
        id: 'assistant-1',
        name: 'Test',
        engine: 'openclaw',
        runtime_flavor: 'shared',
        system_prompt: null,
        soul_content: null,
        lucid_model: 'gpt-test',
        temperature: 0,
        max_tokens: 1000,
        memory_enabled: false,
        memory_window_size: 0,
        org_id: null,
        passport_id: null,
        policy_config: null,
        wallet_enabled: false,
      },
      conversationId: 'conversation-1',
      messages: [],
      memories: [],
      userMessage: 'hi',
      budget: {
        maxLlmCalls: 1,
        maxToolCalls: 1,
        maxWallTimeMs: 50,
      },
      llmConfig: {
        baseUrl: 'https://example.com',
        apiKey: 'test',
      },
    })

    await vi.advanceTimersByTimeAsync(51)
    const result = await run

    expect(result).toMatchObject({
      providerError: true,
      budgetExhausted: true,
      diagnostics: {
        stopReason: 'error',
        error: {
          kind: 'timeout',
          message: 'Agent run exceeded max wall time (50ms)',
        },
      },
    })
  })
})
