import { beforeEach, describe, expect, it, vi } from 'vitest'

const persistAndCheckLimits = vi.fn()
const addUsage = vi.fn()
const waitForApproval = vi.fn()
const emitNotification = vi.fn()

vi.mock('../../cost-tracker.js', () => ({
  CostTracker: vi.fn().mockImplementation(() => ({
    addUsage,
    persistAndCheckLimits,
  })),
}))

vi.mock('../../approval-gate.js', () => ({
  requiresApproval: vi.fn((assistant: { approval_required_tools?: string[] }, toolName: string) =>
    assistant.approval_required_tools?.includes(toolName) ?? false),
  waitForApproval,
}))

vi.mock('../../../notifications/emitter.js', () => ({
  emitNotification,
  ALERTS: {
    approvalExpired: (agentName: string, toolName: string) => ({
      title: 'Approval expired',
      message: `${agentName}:${toolName}`,
      severity: 'warning',
      href: '/mission-control',
    }),
  },
}))

describe('defaultAgentGovernanceRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    persistAndCheckLimits.mockResolvedValue({ exceeded: false })
  })

  it('normalizes provider usage without estimating from text', async () => {
    const { defaultAgentGovernanceRuntime } = await import('../governance-runtime.js')

    const usage = defaultAgentGovernanceRuntime.normalizeUsage({
      model: 'openai/gpt-4.1',
      promptTokens: 120,
      completionTokens: 30,
      source: 'provider',
    })

    expect(usage).toMatchObject({
      inputTokens: 120,
      outputTokens: 30,
      source: 'provider',
    })
    expect(usage.estimatedCostUsd).toBeGreaterThan(0)
  })

  it('falls back to estimated usage from text when explicit tokens are unavailable', async () => {
    const { defaultAgentGovernanceRuntime } = await import('../governance-runtime.js')

    const usage = defaultAgentGovernanceRuntime.normalizeUsage({
      model: 'openai/gpt-4.1-mini',
      promptText: 'hello world',
      responseText: 'done',
    })

    expect(usage.source).toBe('estimated')
    expect(usage.inputTokens).toBeGreaterThan(0)
    expect(usage.outputTokens).toBeGreaterThan(0)
  })

  it('persists normalized run usage through the shared cost tracker path', async () => {
    const { defaultAgentGovernanceRuntime } = await import('../governance-runtime.js')

    await expect(defaultAgentGovernanceRuntime.persistRunUsage({
      assistant: {
        id: 'asst-1',
        name: 'Agent',
        engine: 'hermes',
        system_prompt: null,
        soul_content: null,
        lucid_model: 'openai/gpt-4.1-mini',
        temperature: 0,
        max_tokens: 1024,
        memory_enabled: false,
        memory_window_size: 0,
        org_id: 'org-1',
        passport_id: null,
        policy_config: null,
        wallet_enabled: false,
      },
      supabase: {} as never,
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        estimatedCostUsd: 0.001,
        source: 'estimated',
      },
    })).resolves.toEqual({ exceeded: false })

    expect(addUsage).toHaveBeenCalledWith(10, 5)
    expect(persistAndCheckLimits).toHaveBeenCalledTimes(1)
  })

  it('blocks execution with a structured response when approval is denied', async () => {
    const { defaultAgentGovernanceRuntime } = await import('../governance-runtime.js')
    waitForApproval.mockResolvedValue({ status: 'denied', reason: 'policy' })

    const streamOutput = {
      toolStart: vi.fn(),
      toolError: vi.fn(),
    }

    await expect(defaultAgentGovernanceRuntime.authorizeToolCall({
      supabase: {} as never,
      assistant: {
        id: 'asst-1',
        name: 'Agent',
        engine: 'openclaw',
        system_prompt: null,
        soul_content: null,
        lucid_model: 'openai/gpt-4.1-mini',
        temperature: 0,
        max_tokens: 1024,
        memory_enabled: false,
        memory_window_size: 0,
        org_id: 'org-1',
        passport_id: null,
        policy_config: null,
        wallet_enabled: false,
        approval_required_tools: ['dex_swap'],
      },
      toolCallId: 'call-1',
      toolName: 'dex_swap',
      toolArgs: { amount: 1 },
      streamOutput,
    })).resolves.toEqual({
      status: 'blocked',
      lifecycle: 'denied',
      response: JSON.stringify({
        error: 'Tool "dex_swap" was denied by owner. Reason: policy',
        approval_status: 'denied',
      }),
    })

    expect(streamOutput.toolStart).toHaveBeenCalledWith('call-1', 'awaiting_approval:dex_swap')
    expect(streamOutput.toolError).toHaveBeenCalled()
  })

  it('emits notification when approval expires', async () => {
    const { defaultAgentGovernanceRuntime } = await import('../governance-runtime.js')
    waitForApproval.mockResolvedValue({ status: 'expired' })

    const streamOutput = {
      toolStart: vi.fn(),
      toolError: vi.fn(),
    }

    const result = await defaultAgentGovernanceRuntime.authorizeToolCall({
      supabase: {} as never,
      assistant: {
        id: 'asst-1',
        name: 'Agent',
        engine: 'hermes',
        system_prompt: null,
        soul_content: null,
        lucid_model: 'openai/gpt-4.1-mini',
        temperature: 0,
        max_tokens: 1024,
        memory_enabled: false,
        memory_window_size: 0,
        org_id: 'org-1',
        passport_id: null,
        policy_config: null,
        wallet_enabled: false,
        approval_required_tools: ['hl_place_order'],
      },
      toolCallId: 'call-2',
      toolName: 'hl_place_order',
      toolArgs: { market: 'btc' },
      streamOutput,
    })

    expect(result.status).toBe('blocked')
    expect(result.lifecycle).toBe('expired')
    expect(emitNotification).toHaveBeenCalledTimes(1)
    expect(streamOutput.toolError).toHaveBeenCalledWith(
      'call-2',
      'Approval for "hl_place_order" timed out. The action was not executed.',
    )
  })
})
