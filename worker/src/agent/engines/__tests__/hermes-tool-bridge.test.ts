import { beforeEach, describe, expect, it, vi } from 'vitest'

const buildPrompt = vi.fn()
const launcherRunPrompt = vi.fn()

vi.mock('@lucid/hermes-runtime', () => ({
  buildPrompt,
}))

vi.mock('../hermes/HermesLauncher.js', () => ({
  HermesLauncher: vi.fn().mockImplementation(() => ({
    runPrompt: launcherRunPrompt,
  })),
}))

describe('runHermesWithToolBridge', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    buildPrompt.mockReturnValue('compiled prompt')
  })

  it('returns the governance error immediately when a tool approval is denied', async () => {
    const executor = vi.fn().mockResolvedValue(
      JSON.stringify({
        error: 'Tool "wallet_send" was denied by owner.',
        approval_status: 'denied',
      }),
    )

    launcherRunPrompt.mockResolvedValueOnce({
      responseText: JSON.stringify({
        type: 'tool_call',
        toolName: 'wallet_send',
        toolArgs: { amount: 1 },
      }),
      tokenUsage: {
        inputTokens: 10,
        outputTokens: 5,
        estimatedCostUsd: 0.001,
      },
    })

    const { runHermesWithToolBridge } = await import('../hermes-tool-bridge.js')
    const result = await runHermesWithToolBridge({
      config: {
        command: 'hermes',
        args: ['chat'],
        bridgeMode: 'observe',
        runtimeId: 'rt-1',
        runtimeKey: 'key',
        controlPlaneUrl: 'http://localhost:3000',
        engineVersion: 'hermes',
        runtimeVersion: 'runtime',
        port: 3000,
        timeoutMs: 60_000,
        toolsets: [],
      },
      input: {
        userMessage: 'send funds',
      },
      toolSurface: {
        clientTools: [],
        executor,
        allowlist: new Set(['wallet_send']),
        openclawToolPolicy: { tools: { deny: [] } },
        toolMeta: new Map(),
        getToolCallCount: () => 1,
      },
      maxToolSteps: 2,
    })

    expect(result.responseText).toBe('Tool "wallet_send" was denied by owner.')
    expect(result.budgetExhausted).toBe(false)
    expect(executor).toHaveBeenCalledWith('wallet_send', { amount: 1 })
  })

  it('marks the run budget exhausted when Hermes exceeds the allowed tool steps', async () => {
    launcherRunPrompt.mockResolvedValue({
      responseText: JSON.stringify({
        type: 'tool_call',
        toolName: 'dex_quote',
        toolArgs: { pair: 'ETH/BTC' },
      }),
      tokenUsage: {
        inputTokens: 10,
        outputTokens: 5,
        estimatedCostUsd: 0.001,
      },
    })

    const executor = vi.fn().mockResolvedValue(JSON.stringify({ ok: true }))

    const { runHermesWithToolBridge } = await import('../hermes-tool-bridge.js')
    const result = await runHermesWithToolBridge({
      config: {
        command: 'hermes',
        args: ['chat'],
        bridgeMode: 'observe',
        runtimeId: 'rt-1',
        runtimeKey: 'key',
        controlPlaneUrl: 'http://localhost:3000',
        engineVersion: 'hermes',
        runtimeVersion: 'runtime',
        port: 3000,
        timeoutMs: 60_000,
        toolsets: [],
      },
      input: {
        userMessage: 'keep checking the quote',
      },
      toolSurface: {
        clientTools: [],
        executor,
        allowlist: new Set(['dex_quote']),
        openclawToolPolicy: { tools: { deny: [] } },
        toolMeta: new Map(),
        getToolCallCount: () => executor.mock.calls.length,
      },
      maxToolSteps: 1,
    })

    expect(result.budgetExhausted).toBe(true)
    expect(result.toolCallsUsed).toBe(2)
    expect(result.responseText).toContain('allowed number of steps')
  })

  it('blocks Hermes-native mutation tools before execution when policy denies them', async () => {
    launcherRunPrompt.mockResolvedValueOnce({
      responseText: JSON.stringify({
        type: 'tool_call',
        toolName: 'memory',
        toolArgs: { content: 'remember this forever' },
      }),
      tokenUsage: {
        inputTokens: 8,
        outputTokens: 4,
        estimatedCostUsd: 0.001,
      },
    })

    const executor = vi.fn().mockResolvedValue(JSON.stringify({ ok: true }))
    const { runHermesWithToolBridge } = await import('../hermes-tool-bridge.js')
    const { getEngineMutationPolicy } = await import('../../contracts/mutation-policy.js')

    const result = await runHermesWithToolBridge({
      config: {
        command: 'hermes',
        args: ['chat'],
        bridgeMode: 'observe',
        runtimeId: 'rt-1',
        runtimeKey: 'key',
        controlPlaneUrl: 'http://localhost:3000',
        engineVersion: 'hermes',
        runtimeVersion: 'runtime',
        port: 3000,
        timeoutMs: 60_000,
        toolsets: [],
      },
      input: {
        userMessage: 'remember this forever',
      },
      toolSurface: {
        clientTools: [],
        executor,
        allowlist: new Set(['memory']),
        openclawToolPolicy: { tools: { deny: [] } },
        toolMeta: new Map(),
        getToolCallCount: () => executor.mock.calls.length,
      },
      mutationPolicy: getEngineMutationPolicy('hermes', 'shared'),
      maxToolSteps: 1,
    })

    expect(executor).not.toHaveBeenCalled()
    expect(result.responseText).toContain('not allowed')
    expect(result.budgetExhausted).toBe(false)
  })

  it('captures native mutation proposals when the policy is candidate-only', async () => {
    launcherRunPrompt.mockResolvedValueOnce({
      responseText: JSON.stringify({
        type: 'tool_call',
        toolName: 'memory',
        toolArgs: { content: 'remember this forever' },
      }),
      tokenUsage: {
        inputTokens: 8,
        outputTokens: 4,
        estimatedCostUsd: 0.001,
      },
    })

    const executor = vi.fn().mockResolvedValue(JSON.stringify({ ok: true }))
    const onNativeMutationCandidate = vi.fn()
    const { runHermesWithToolBridge } = await import('../hermes-tool-bridge.js')
    const candidatePolicy = {
      engine: 'hermes',
      runtimeFlavor: 'shared',
      rules: {
        memory_write: {
          kind: 'memory_write',
          mode: 'candidate_only',
          reason: 'Shared candidate path',
        },
        skill_create: {
          kind: 'skill_create',
          mode: 'deny',
          reason: 'Denied',
        },
        skill_update: {
          kind: 'skill_update',
          mode: 'deny',
          reason: 'Denied',
        },
        skill_delete: {
          kind: 'skill_delete',
          mode: 'deny',
          reason: 'Denied',
        },
      },
    } as const

    const result = await runHermesWithToolBridge({
      config: {
        command: 'hermes',
        args: ['chat'],
        bridgeMode: 'observe',
        runtimeId: 'rt-1',
        runtimeKey: 'key',
        controlPlaneUrl: 'http://localhost:3000',
        engineVersion: 'hermes',
        runtimeVersion: 'runtime',
        port: 3000,
        timeoutMs: 60_000,
        toolsets: [],
      },
      input: {
        userMessage: 'remember this forever',
      },
      toolSurface: {
        clientTools: [],
        executor,
        allowlist: new Set(['memory']),
        openclawToolPolicy: { tools: { deny: [] } },
        toolMeta: new Map(),
        getToolCallCount: () => executor.mock.calls.length,
      },
      mutationPolicy: candidatePolicy,
      onNativeMutationCandidate,
      maxToolSteps: 1,
    })

    expect(executor).not.toHaveBeenCalled()
    expect(onNativeMutationCandidate).toHaveBeenCalledWith({
      engine: 'hermes',
      runtimeFlavor: 'shared',
      kind: 'memory_write',
      toolName: 'memory',
      toolArgs: { content: 'remember this forever' },
      reason: 'Shared candidate path',
    })
    expect(result.nativeMutationCandidates).toEqual([
      {
        engine: 'hermes',
        runtimeFlavor: 'shared',
        kind: 'memory_write',
        toolName: 'memory',
        toolArgs: { content: 'remember this forever' },
        reason: 'Shared candidate path',
      },
    ])
    expect(result.responseText).toContain('native mutation proposals only')
  })

  it('converts unknown clarify tool calls into a direct assistant question', async () => {
    launcherRunPrompt.mockResolvedValueOnce({
      responseText: JSON.stringify({
        type: 'tool_call',
        toolName: 'clarify',
        toolArgs: {
          question: 'Could you type your request as text?',
        },
      }),
      tokenUsage: {
        inputTokens: 8,
        outputTokens: 4,
        estimatedCostUsd: 0.001,
      },
    })

    const executor = vi.fn().mockResolvedValue(JSON.stringify({ ok: true }))

    const { runHermesWithToolBridge } = await import('../hermes-tool-bridge.js')
    const result = await runHermesWithToolBridge({
      config: {
        command: 'hermes',
        args: ['chat'],
        bridgeMode: 'observe',
        runtimeId: 'rt-1',
        runtimeKey: 'key',
        controlPlaneUrl: 'http://localhost:3000',
        engineVersion: 'hermes',
        runtimeVersion: 'runtime',
        port: 3000,
        timeoutMs: 60_000,
        toolsets: [],
      },
      input: {
        userMessage: 'voice note',
      },
      toolSurface: {
        clientTools: [],
        executor,
        allowlist: new Set(['hl_account_info']),
        openclawToolPolicy: { tools: { deny: [] } },
        toolMeta: new Map(),
        getToolCallCount: () => executor.mock.calls.length,
      },
      maxToolSteps: 1,
    })

    expect(executor).not.toHaveBeenCalled()
    expect(result.responseText).toBe('Could you type your request as text?')
    expect(result.budgetExhausted).toBe(false)
  })
})
