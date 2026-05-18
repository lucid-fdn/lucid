import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenClawAgentParams } from '../../OpenClawAgent.js'

const resolveHermesRuntimeConfig = vi.fn()
const buildPrompt = vi.fn()
const normalizeUsage = vi.fn()
const persistRunUsage = vi.fn()
const buildAgentCapabilitySurface = vi.fn()
const getHermesToolAdapter = vi.fn()
const runHermesWithToolBridge = vi.fn()
const launcherRunPrompt = vi.fn()
const verifyInstalled = vi.fn()

vi.mock('@lucid/hermes-runtime', () => ({
  resolveHermesRuntimeConfig,
  buildPrompt,
}))

vi.mock('../../contracts/governance-runtime.js', () => ({
  defaultAgentGovernanceRuntime: {
    normalizeUsage,
    persistRunUsage,
  },
}))

vi.mock('../../contracts/capability-surface.js', () => ({
  buildAgentCapabilitySurface,
}))

vi.mock('../../adapters/tools/index.js', () => ({
  getHermesToolAdapter,
}))

vi.mock('../hermes-tool-bridge.js', () => ({
  runHermesWithToolBridge,
}))

vi.mock('../hermes/HermesLauncher.js', () => ({
  HermesLauncher: vi.fn().mockImplementation(() => ({
    runPrompt: launcherRunPrompt,
    verifyInstalled,
  })),
}))

describe('HermesEngineRunner', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.STRONG_MODEL = 'openai/gpt-4.1'
    process.env.FAST_MODEL = 'openai/gpt-4.1-mini'
    resolveHermesRuntimeConfig.mockReturnValue({
      command: 'hermes',
      args: ['chat'],
      bridgeMode: 'observe',
      runtimeId: 'rt-hermes',
      runtimeKey: 'key',
      controlPlaneUrl: 'http://localhost:3000',
      engineVersion: 'hermes',
      runtimeVersion: 'lucid-hermes-runtime/0.1.0',
      port: 3000,
      toolsets: [],
    })
    buildPrompt.mockReturnValue('compiled prompt')
    launcherRunPrompt.mockResolvedValue({
      responseText: 'Hermes response',
      tokenUsage: {
        inputTokens: 123,
        outputTokens: 45,
        estimatedCostUsd: 0.001,
      },
    })
    buildAgentCapabilitySurface.mockResolvedValue({
      tools: {
        clientTools: [],
        executor: vi.fn(),
        getToolCallCount: () => 0,
      },
      skills: {
        rows: [],
        promptSection: 'Mounted skill prompt',
        snapshot: { prompt: '', skills: [], resolvedSkills: [] },
      },
      awarenessPrompt: 'Mounted skill prompt\n\nTool awareness prompt',
    })
    normalizeUsage.mockImplementation(({ promptTokens, completionTokens }: { promptTokens: number; completionTokens: number }) => ({
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      estimatedCostUsd: 0.001,
      source: 'estimated',
    }))
    persistRunUsage.mockResolvedValue({ exceeded: false })
    getHermesToolAdapter.mockReturnValue({
      mount: vi.fn(() => ({ toolPrompt: 'Tool awareness prompt' })),
    })
    runHermesWithToolBridge.mockResolvedValue({
      responseText: 'Hermes bridged response',
      tokenUsage: {
        inputTokens: 222,
        outputTokens: 33,
        estimatedCostUsd: 0.002,
      },
      toolCallsUsed: 1,
      steps: 2,
      budgetExhausted: false,
    })
  })

  afterEach(() => {
    delete process.env.STRONG_MODEL
    delete process.env.FAST_MODEL
    delete process.env.LUCID_RUNTIME_ID
  })

  it('builds a direct prompt when no structured tool surface is available', async () => {
    const { HermesEngineRunner } = await import('../HermesEngineRunner.js')
    const append = vi.fn().mockResolvedValue(undefined)
    process.env.LUCID_RUNTIME_ID = '550e8400-e29b-41d4-a716-446655440000'

    const params = {
      assistant: {
        id: 'asst-1',
        name: 'Hermes Agent',
        engine: 'hermes',
        system_prompt: 'Be concise',
        soul_content: null,
        lucid_model: 'openai/gpt-4.1',
        temperature: 0.2,
        max_tokens: 4096,
        memory_enabled: true,
        memory_window_size: 20,
        org_id: 'org-1',
        passport_id: null,
        policy_config: null,
        wallet_enabled: false,
        trading_enabled: false,
      },
      conversationId: 'conv-1',
      messages: [
        { role: 'user', content: 'Earlier question' },
        { role: 'assistant', content: 'Earlier answer' },
      ],
      memories: ['remember this'],
      userMessage: 'What should I do next?',
      budget: {
        maxLlmCalls: 8,
        maxToolCalls: 4,
        maxWallTimeMs: 60_000,
      },
      supabase: {} as never,
      output: { append } as unknown,
      boardMemories: ['Org fact'],
      summary: 'Conversation summary',
    } satisfies Partial<OpenClawAgentParams> as OpenClawAgentParams

    const runner = new HermesEngineRunner()
    const result = await runner.run(params)

    expect(resolveHermesRuntimeConfig).not.toHaveBeenCalled()
    expect(buildAgentCapabilitySurface).toHaveBeenCalledWith(
      expect.objectContaining({
        assistant: expect.objectContaining({ id: 'asst-1' }),
        engine: 'hermes',
        runtimeFlavor: 'shared',
        channelOwnership: 'lucid_relay',
      }),
    )
    expect(buildPrompt).toHaveBeenCalledWith({
      assistantName: 'Hermes Agent',
      systemPrompt: `Be concise

Runtime mutation policy:
- This Hermes run is on shared multi-tenant compute.
- Hermes-native durable memory writes and skill_manage mutations are denied in this runtime flavor.
- Do not assume Hermes-native memory or skill mutations are durably persisted here.
- A future candidate-only promotion path may exist, but it is not enabled in shared today.
- Use mounted memory and catalog/imported skills as runtime inputs, not as proof of durable local Hermes state.`,
      recentMessages: [
        { role: 'user', content: 'Earlier question' },
        { role: 'assistant', content: 'Earlier answer' },
      ],
      memoryInjection: ['remember this'],
      boardMemories: ['Org fact'],
      conversationSummary: 'Conversation summary',
      skillPrompt: 'Mounted skill prompt',
      toolPrompt: 'Tool awareness prompt',
      userMessage: 'What should I do next?',
    })
    expect(getHermesToolAdapter().mount).toHaveBeenCalledWith(
      expect.objectContaining({
        assistant: expect.objectContaining({ id: 'asst-1' }),
        surface: expect.objectContaining({
          clientTools: [],
        }),
      }),
    )
    expect(launcherRunPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'hermes',
        runtimeId: '550e8400-e29b-41d4-a716-446655440000',
        runtimeKey: 'shared-hermes-runtime-key',
        runtimeVersion: 'lucid-hermes-runtime/shared',
      }),
      'compiled prompt',
      expect.objectContaining({ timeoutMs: 60_000 }),
    )
    expect(normalizeUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-4.1',
        promptTokens: 123,
        completionTokens: 45,
        source: 'estimated',
      }),
    )
    expect(persistRunUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        assistant: expect.objectContaining({ id: 'asst-1' }),
        supabase: params.supabase,
      }),
    )
    expect(append).toHaveBeenCalledWith('Hermes response')
    expect(result).toEqual({
      text: 'Hermes response',
      usage: {
        promptTokens: 123,
        completionTokens: 45,
      },
      steps: 1,
      toolCallsUsed: 0,
      budgetExhausted: false,
      diagnostics: {
        model: 'openai/gpt-4.1',
        capabilitySurface: undefined,
      },
    })
  })

  it('routes lucid-auto to a concrete model before invoking Hermes', async () => {
    const { HermesEngineRunner } = await import('../HermesEngineRunner.js')

    const params = {
      assistant: {
        id: 'asst-1',
        name: 'Hermes Agent',
        engine: 'hermes',
        system_prompt: 'Be concise',
        soul_content: null,
        lucid_model: 'lucid-auto',
        temperature: 0.2,
        max_tokens: 4096,
        memory_enabled: true,
        memory_window_size: 20,
        org_id: 'org-1',
        passport_id: null,
        policy_config: null,
        wallet_enabled: false,
        trading_enabled: false,
      },
      conversationId: 'conv-1',
      messages: [],
      memories: [],
      userMessage: 'What is SOL?',
      budget: {
        maxLlmCalls: 8,
        maxToolCalls: 4,
        maxWallTimeMs: 60_000,
      },
      supabase: {} as never,
    } satisfies Partial<OpenClawAgentParams> as OpenClawAgentParams

    const runner = new HermesEngineRunner()
    await runner.run(params)

    expect(launcherRunPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-4.1-mini',
      }),
      expect.any(String),
      expect.any(Object),
    )
    expect(normalizeUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-4.1-mini',
      }),
    )
  })

  it('ignores dedicated-style runtime env when the assistant runtime flavor is shared', async () => {
    const { HermesEngineRunner } = await import('../HermesEngineRunner.js')

    process.env.LUCID_RUNTIME_ID = 'dedicated-looking-runtime'
    process.env.LUCID_RUNTIME_KEY = 'dedicated-looking-key'
    process.env.LUCID_CONTROL_PLANE_URL = 'https://control.example.com'
    process.env.WORKER_TRIGGER_SECRET = 'shared-secret'

    const params = {
      assistant: {
        id: 'asst-shared',
        name: 'Hermes Shared Agent',
        engine: 'hermes',
        runtime_flavor: 'shared',
        system_prompt: 'Be concise',
        soul_content: null,
        lucid_model: 'openai/gpt-4.1',
        temperature: 0.2,
        max_tokens: 4096,
        memory_enabled: true,
        memory_window_size: 20,
        org_id: 'org-1',
        passport_id: null,
        policy_config: null,
        wallet_enabled: false,
        trading_enabled: false,
      },
      conversationId: 'conv-shared',
      messages: [],
      memories: [],
      userMessage: 'Say OK.',
      budget: {
        maxLlmCalls: 8,
        maxToolCalls: 4,
        maxWallTimeMs: 60_000,
      },
      supabase: {} as never,
    } satisfies Partial<OpenClawAgentParams> as OpenClawAgentParams

    const runner = new HermesEngineRunner()
    await runner.run(params)

    expect(resolveHermesRuntimeConfig).not.toHaveBeenCalled()
    expect(launcherRunPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeId: 'dedicated-looking-runtime',
        runtimeKey: 'dedicated-looking-key',
        controlPlaneUrl: 'https://control.example.com',
        workerTriggerSecret: 'shared-secret',
        runtimeVersion: 'lucid-hermes-runtime/shared',
      }),
      expect.any(String),
      expect.any(Object),
    )
  })

  it('uses the structured Hermes tool bridge when Lucid tools are mounted', async () => {
    const { HermesEngineRunner } = await import('../HermesEngineRunner.js')
    const append = vi.fn().mockResolvedValue(undefined)
    buildAgentCapabilitySurface.mockResolvedValue({
      tools: {
        clientTools: [
          {
            type: 'function',
            function: { name: 'dex_swap', description: 'Swap tokens' },
          },
        ],
        executor: vi.fn(),
        getToolCallCount: () => 1,
      },
      skills: {
        rows: [],
        promptSection: 'Mounted skill prompt',
        snapshot: { prompt: '', skills: [], resolvedSkills: [] },
      },
      awarenessPrompt: 'Mounted skill prompt\n\nTool awareness prompt',
    })

    const params = {
      assistant: {
        id: 'asst-1',
        name: 'Hermes Agent',
        engine: 'hermes',
        system_prompt: 'Be concise',
        soul_content: null,
        lucid_model: 'openai/gpt-4.1',
        temperature: 0.2,
        max_tokens: 4096,
        memory_enabled: true,
        memory_window_size: 20,
        org_id: 'org-1',
        passport_id: null,
        policy_config: null,
        wallet_enabled: false,
        trading_enabled: false,
      },
      conversationId: 'conv-1',
      messages: [],
      memories: [],
      userMessage: 'Swap into BTC if needed',
      budget: {
        maxLlmCalls: 8,
        maxToolCalls: 4,
        maxWallTimeMs: 60_000,
      },
      supabase: {} as never,
      output: { append } as unknown,
    } satisfies Partial<OpenClawAgentParams> as OpenClawAgentParams

    const runner = new HermesEngineRunner()
    const result = await runner.run(params)

    expect(runHermesWithToolBridge).toHaveBeenCalledWith(expect.objectContaining({
      toolSurface: expect.objectContaining({
        clientTools: expect.arrayContaining([
          expect.objectContaining({
            function: expect.objectContaining({ name: 'dex_swap' }),
          }),
        ]),
      }),
      maxToolSteps: 4,
    }))
    expect(launcherRunPrompt).not.toHaveBeenCalled()
    expect(append).toHaveBeenCalledWith('Hermes bridged response')
    expect(result.toolCallsUsed).toBe(1)
    expect(result.steps).toBe(2)
    expect(result.budgetExhausted).toBe(false)
  })
})
