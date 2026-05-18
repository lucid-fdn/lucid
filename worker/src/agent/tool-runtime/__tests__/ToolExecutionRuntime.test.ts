import { beforeEach, describe, expect, it, vi } from 'vitest'

const executeBuiltInTool = vi.fn()
const isBuiltInTool = vi.fn()
const executePluginTool = vi.fn()
const parseWireToolName = vi.fn()
const authorizeToolCall = vi.fn()
const requiresApproval = vi.fn()
const emitNotification = vi.fn()
const recordProofAnchor = vi.fn()
const fetchPolicySnapshot = vi.fn()

vi.mock('../../BuiltInToolExecutor.js', () => ({
  executeBuiltInTool,
  isBuiltInTool,
}))

vi.mock('../../PluginBridge.js', () => ({
  executePluginTool,
}))

vi.mock('../../plugin-types.js', () => ({
  parseWireToolName,
}))

vi.mock('../../contracts/governance-runtime.js', () => ({
  defaultAgentGovernanceRuntime: {
    requiresApproval,
    authorizeToolCall,
  },
}))

vi.mock('../../../notifications/emitter.js', () => ({
  emitNotification,
  ALERTS: {
    loopDetected: (agentName: string, toolName: string) => ({
      title: 'Loop detected',
      message: `${agentName}:${toolName}`,
      severity: 'warning',
      href: '/mission-control',
    }),
  },
}))

vi.mock('../../proof-anchor.js', () => ({
  isProofEligibleTool: vi.fn(() => false),
  recordProofAnchor,
  fetchPolicySnapshot,
}))

describe('ToolExecutionRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isBuiltInTool.mockReturnValue(false)
    requiresApproval.mockReturnValue(false)
    authorizeToolCall.mockResolvedValue({ status: 'proceed', lifecycle: 'not_required' })
    parseWireToolName.mockReturnValue({ pluginSlug: 'research', toolName: 'lookup' })
    executePluginTool.mockResolvedValue(JSON.stringify({ ok: true }))
  })

  it('routes plugin tools through the shared runtime contract', async () => {
    const { createToolExecutionRuntime } = await import('../ToolExecutionRuntime.js')
    const onEvent = vi.fn()
    const streamOutput = {
      toolStart: vi.fn(),
      toolResult: vi.fn(),
      toolError: vi.fn(),
    }

    const runtime = createToolExecutionRuntime({
      pluginCtxMap: new Map([
        ['research__lookup', { pluginSlug: 'research' } as never],
      ]),
      streamOutput: streamOutput as never,
      onEvent,
    })

    const result = await runtime.execute('research__lookup', { q: 'btc' })

    expect(result).toBe(JSON.stringify({ ok: true }))
    expect(runtime.toolCallCount).toBe(1)
    expect(executePluginTool).toHaveBeenCalledWith('research', 'lookup', { q: 'btc' }, expect.anything())
    expect(streamOutput.toolStart).toHaveBeenCalledWith(expect.any(String), 'research:lookup')
    expect(streamOutput.toolResult).toHaveBeenCalled()
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'tool_requested', toolName: 'research__lookup' }))
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'tool_started', toolName: 'research__lookup' }))
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'tool_completed', toolName: 'research__lookup' }))
  })

  it('blocks tool execution when governance denies the call', async () => {
    const { createToolExecutionRuntime } = await import('../ToolExecutionRuntime.js')
    isBuiltInTool.mockReturnValue(true)
    requiresApproval.mockReturnValue(true)
    authorizeToolCall.mockResolvedValue({
      status: 'blocked',
      lifecycle: 'denied',
      response: JSON.stringify({ error: 'denied' }),
    })

    const runtime = createToolExecutionRuntime({
      pluginCtxMap: new Map(),
      builtInParams: {
        supabase: {} as never,
        userId: 'user-1',
        assistant: {
          id: 'asst-1',
          name: 'Agent',
          org_id: 'org-1',
        } as never,
      },
    })

    const result = await runtime.execute('dex_swap', { amount: 1 })

    expect(result).toBe(JSON.stringify({ error: 'denied' }))
    expect(executeBuiltInTool).not.toHaveBeenCalled()
    expect(executePluginTool).not.toHaveBeenCalled()
  })
})
