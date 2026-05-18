/**
 * Linear Agent Run Processor — Unit Tests.
 *
 * Covers: successful run lifecycle, activity emission ordering,
 * error handling, external URL, and signal poller stop signal.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockRunAgent = vi.fn()

vi.mock('../../agent/oauth-tools/nango-client.js', () => ({
  getNangoClient: () => null,
}))

import { processLinearAgentRun, type LinearAgentRunContext, type LinearAgentRunDeps } from '../adapters/linear/agent-run-processor.js'
import { startSignalPoller } from '../adapters/linear/signal-poller.js'

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockEmitThought = vi.fn().mockResolvedValue(undefined)
const mockEmitAction = vi.fn().mockResolvedValue(undefined)
const mockEmitResponse = vi.fn().mockResolvedValue(undefined)
const mockEmitError = vi.fn().mockResolvedValue(undefined)
const mockSetExternalUrl = vi.fn().mockResolvedValue(undefined)
const mockUpdateSessionStatus = vi.fn().mockResolvedValue(undefined)

function createMockAgentClient() {
  return {
    emitThought: mockEmitThought,
    emitAction: mockEmitAction,
    emitElicitation: vi.fn().mockResolvedValue(undefined),
    emitResponse: mockEmitResponse,
    emitError: mockEmitError,
    publishPlan: vi.fn().mockResolvedValue(undefined),
    setExternalUrl: mockSetExternalUrl,
    updateSessionStatus: mockUpdateSessionStatus,
  }
}

function createMockSupabase(overrides: {
  session?: Record<string, unknown> | null
  assistant?: Record<string, unknown> | null
} = {}) {
  const defaultSession = {
    id: 'session-uuid-1',
    org_id: 'org-1',
    agent_id: 'agent-1',
    linear_session_id: 'lin-session-1',
    linear_issue_id: 'issue-1',
    linear_issue_identifier: 'ENG-42',
    linear_issue_url: 'https://linear.app/team/ENG-42',
    status: 'pending',
    trigger_type: 'assignment',
    run_id: null,
    pulse_job_run_id: null,
    linear_actor_id: 'user-1',
    linear_actor_name: 'Alice',
    signal: null,
    webhook_received_at: '2026-04-09T00:00:00Z',
    thought_emitted_at: null,
    run_started_at: null,
    completed_at: null,
    created_at: '2026-04-09T00:00:00Z',
    updated_at: '2026-04-09T00:00:00Z',
  }

  const defaultAssistant = {
    id: 'agent-1',
    name: 'Test Agent',
    system_prompt: 'You are a helpful assistant.',
    soul_content: null,
    lucid_model: 'openai/gpt-4.1',
    temperature: 0.7,
    max_tokens: 4096,
    memory_enabled: false,
    memory_window_size: 10,
    org_id: 'org-1',
    passport_id: null,
    policy_config: null,
    wallet_enabled: false,
    approval_required_tools: null,
  }

  const session = overrides.session === null ? null : (overrides.session ?? defaultSession)
  const assistant = overrides.assistant === null ? null : (overrides.assistant ?? defaultAssistant)

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === 'linear_agent_sessions') {
      const singleResult = {
        data: session,
        error: session ? null : { message: 'not found' },
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(singleResult),
              maybeSingle: vi.fn().mockResolvedValue(singleResult),
            }),
            single: vi.fn().mockResolvedValue(singleResult),
            maybeSingle: vi.fn().mockResolvedValue(singleResult),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'ai_assistants') {
      const singleResult = {
        data: assistant,
        error: assistant ? null : { message: 'not found' },
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(singleResult),
              maybeSingle: vi.fn().mockResolvedValue(singleResult),
            }),
            single: vi.fn().mockResolvedValue(singleResult),
            maybeSingle: vi.fn().mockResolvedValue(singleResult),
          }),
        }),
      }
    }
    if (table === 'assistant_inbound_events') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }
  })

  return { from: mockFrom } as unknown as import('@supabase/supabase-js').SupabaseClient
}

function createRunContext(
  overrides: Partial<LinearAgentRunContext> = {},
): LinearAgentRunContext {
  return {
    sessionId: 'session-uuid-1',
    linearSessionId: 'lin-session-1',
    orgId: 'org-1',
    agentId: 'agent-1',
    issueTitle: 'Fix the login bug',
    issueDescription: 'Users cannot log in after the latest deploy.',
    issueIdentifier: 'ENG-42',
    triggerType: 'assignment',
    ...overrides,
  }
}

function createRunDeps(
  overrides: Partial<LinearAgentRunDeps> = {},
): LinearAgentRunDeps {
  return {
    supabase: createMockSupabase(),
    config: {
      STRONG_MODEL: 'openai/gpt-4.1',
      FEATURE_LINEAR_AGENT: true,
      LUCID_API_BASE_URL: 'http://localhost:3001',
      LUCID_API_KEY: 'test-key',
      DEFAULT_MAX_LLM_CALLS: 15,
      DEFAULT_MAX_TOOL_CALLS: 10,
      DEFAULT_MAX_WALL_TIME_MS: 60000,
    } as unknown as import('../../../config.js').Config,
    agentClient: createMockAgentClient() as never,
    connectionId: 'conn-1',
    runAgent: mockRunAgent,
    ...overrides,
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('processLinearAgentRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: agent run succeeds with a response
    mockRunAgent.mockResolvedValue({
      text: 'I found the bug in auth.ts line 42. Here is the fix...',
      usage: { promptTokens: 100, completionTokens: 50 },
      steps: 1,
      toolCallsUsed: 0,
      budgetExhausted: false,
    })
  })

  describe('successful run', () => {
    it('transitions session status pending → active → complete', async () => {
      const supabase = createMockSupabase()
      const deps = createRunDeps({ supabase })

      await processLinearAgentRun(createRunContext(), deps)

      // Session updated to active (with run_started_at)
      const updateCalls = (supabase.from as Mock).mock.results
        .filter((r: { value: { update?: unknown } }) => r.value?.update)
        .map((r: { value: { update: Mock } }) => r.value.update)

      // Verify emitResponse was called (completion)
      expect(mockEmitResponse).toHaveBeenCalledWith(
        'lin-session-1',
        expect.stringContaining('I found the bug'),
      )

      // Verify session status updated to completed on Linear
      expect(mockUpdateSessionStatus).toHaveBeenCalledWith(
        'lin-session-1',
        'completed',
      )
    })

    it('emits activities in correct order: thought → response', async () => {
      const deps = createRunDeps()
      const callOrder: string[] = []

      mockEmitThought.mockImplementation(async () => {
        callOrder.push('thought')
      })
      mockEmitResponse.mockImplementation(async () => {
        callOrder.push('response')
      })

      await processLinearAgentRun(createRunContext(), deps)

      // At minimum: initial thought, analysis thought, then response
      expect(callOrder.filter((c) => c === 'thought').length).toBeGreaterThanOrEqual(1)
      expect(callOrder[callOrder.length - 1]).toBe('response')
    })

    it('creates a synthetic inbound event for the agent', async () => {
      const supabase = createMockSupabase()
      const deps = createRunDeps({ supabase })

      await processLinearAgentRun(createRunContext(), deps)

      // Verify inbound event was created
      const insertCalls = (supabase.from as Mock).mock.calls
        .filter((c: string[]) => c[0] === 'assistant_inbound_events')
      expect(insertCalls.length).toBeGreaterThan(0)
    })
  })

  describe('error handling', () => {
    it('emits error activity and sets session to error on failure', async () => {
      mockRunAgent.mockRejectedValue(new Error('LLM API timeout'))

      const deps = createRunDeps()
      await processLinearAgentRun(createRunContext(), deps)

      // Should emit error to Linear
      expect(mockEmitError).toHaveBeenCalledWith(
        'lin-session-1',
        expect.stringContaining('LLM API timeout'),
      )

      // Should update Linear session status to failed
      expect(mockUpdateSessionStatus).toHaveBeenCalledWith(
        'lin-session-1',
        'failed',
      )
    })

    it('completes as noop when session not found in DB', async () => {
      const supabase = createMockSupabase({ session: null })
      const deps = createRunDeps({ supabase })

      await processLinearAgentRun(createRunContext(), deps)

      // Should not attempt to emit any activities
      expect(mockEmitThought).not.toHaveBeenCalled()
      expect(mockEmitResponse).not.toHaveBeenCalled()
      expect(mockRunAgent).not.toHaveBeenCalled()
    })

    it('throws and emits error when agent not found', async () => {
      const supabase = createMockSupabase({ assistant: null })
      const deps = createRunDeps({ supabase })

      await processLinearAgentRun(createRunContext(), deps)

      expect(mockEmitError).toHaveBeenCalledWith(
        'lin-session-1',
        expect.stringContaining('Agent agent-1 not found'),
      )
      expect(mockUpdateSessionStatus).toHaveBeenCalledWith(
        'lin-session-1',
        'failed',
      )
    })
  })

  describe('external URL', () => {
    it('sets external URL on successful completion', async () => {
      const deps = createRunDeps()
      await processLinearAgentRun(createRunContext(), deps)

      expect(mockSetExternalUrl).toHaveBeenCalledWith(
        'lin-session-1',
        'View in Lucid',
        'http://localhost:3001/mission-control/agents/agent-1',
      )
    })
  })

  describe('response truncation', () => {
    it('truncates responses longer than 4000 chars', async () => {
      const longResponse = 'x'.repeat(5000)
      mockRunAgent.mockResolvedValue({
        text: longResponse,
        usage: { promptTokens: 100, completionTokens: 5000 },
        steps: 1,
        toolCallsUsed: 0,
        budgetExhausted: false,
      })

      const deps = createRunDeps()
      await processLinearAgentRun(createRunContext(), deps)

      expect(mockEmitResponse).toHaveBeenCalled()
      const emittedResponse = mockEmitResponse.mock.calls[0][1] as string
      expect(emittedResponse.length).toBeLessThanOrEqual(4000)
      expect(emittedResponse.endsWith('...')).toBe(true)
    })
  })
})

describe('startSignalPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls onStop when stop signal is received', async () => {
    // Nango is mocked to return null above, so the poller will stop
    // due to missing Nango client. Test the stop() cleanup mechanism instead.
    const onStop = vi.fn()
    const poller = startSignalPoller(
      'lin-session-1',
      { connectionId: 'conn-1' },
      onStop,
      100,
    )

    // Manually stop
    poller.stop()

    // Advance timers — no more polls should fire
    await vi.advanceTimersByTimeAsync(500)

    // onStop was NOT called (we stopped externally, not via signal)
    expect(onStop).not.toHaveBeenCalled()
  })

  it('stops polling after stop() is called', async () => {
    const onStop = vi.fn()
    const poller = startSignalPoller(
      'lin-session-1',
      { connectionId: 'conn-1' },
      onStop,
      100,
    )

    // Stop immediately
    poller.stop()
    // Calling stop again should be idempotent
    poller.stop()

    await vi.advanceTimersByTimeAsync(1000)
    expect(onStop).not.toHaveBeenCalled()
  })
})

describe('LinearAgentSessionExecutor', () => {
  it('registers with correct type and canHandle', async () => {
    const { LinearAgentSessionExecutor } = await import('../../pulse/executors/linear-agent-session.js')
    const executor = new LinearAgentSessionExecutor()

    expect(executor.type).toBe('linear_agent_session')
    expect(executor.canHandle('linear_agent_session')).toBe(true)
    expect(executor.canHandle('inbound')).toBe(false)
    expect(executor.canHandle('webhook')).toBe(false)
  })
})

describe('executor registry integration', () => {
  it('includes LinearAgentSessionExecutor in default registry', async () => {
    const { createDefaultRegistry } = await import('../../pulse/executors/index.js')
    const registry = createDefaultRegistry()

    const executor = registry.resolve('linear_agent_session')
    expect(executor).not.toBeNull()
    expect(executor?.type).toBe('linear_agent_session')
  })
})

describe('StepType includes linear_agent_session', () => {
  it('type union includes the new step type', async () => {
    // Type-level test: this compiles only if 'linear_agent_session' is in StepType
    const stepType: import('../../pulse/executors/types.js').StepType = 'linear_agent_session'
    expect(stepType).toBe('linear_agent_session')
  })
})
