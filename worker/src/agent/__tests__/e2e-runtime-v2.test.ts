/**
 * E2E smoke tests for FEATURE_RUNTIME_V2 flag.
 *
 * Verifies both the legacy and v2 code paths produce correct results
 * by mocking only the LLM boundary (runEmbeddedPiAgent) while letting
 * the full tool surface assembly, collision guard, deny policy, and
 * routing logic execute for real.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AgentRunResult, AssistantConfig, RunBudget } from '../types.js'

// Mock tracing (passthrough)
vi.mock('../../observability/tracing.js', () => ({
  withSpan: async (_name: string, _attrs: Record<string, unknown>, fn: (span: any) => Promise<any>) =>
    fn({ setAttribute: vi.fn() }),
  withDbSpan: async (_name: string, fn: () => Promise<any>) => fn(),
  createExpressTracingMiddleware: () => (_req: any, _res: any, next: any) => next(),
  initTracing: vi.fn(),
}))

// Mock metrics (no-op)
vi.mock('../../observability/metrics.js', () => ({
  incSubagentSpawned: vi.fn(),
  incSubagentFailed: vi.fn(),
  incSchedulerClaimed: vi.fn(),
  incSchedulerSucceeded: vi.fn(),
  incSchedulerFailed: vi.fn(),
  incSchedulerDeadLettered: vi.fn(),
  incMessagingEnqueued: vi.fn(),
  incMessagingRejected: vi.fn(),
}))

// Mock sentry (no-op)
vi.mock('../../monitoring/sentry.js', () => ({
  initSentry: vi.fn(),
  captureMessage: vi.fn(),
  captureError: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

// Mock fs (no actual disk I/O)
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ mtimeMs: Date.now() }),
  },
}))

// Mock config (avoids requiring SUPABASE_URL etc in test)
vi.mock('../../config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    LUCID_API_BASE_URL: 'http://localhost:3001',
    WORKER_ID: 'test-worker',
    NODE_ENV: 'test',
    FEATURE_RUNTIME_V2: false,
    FEATURE_CONVERSATION_SUMMARY: false,
    FEATURE_TOOL_CACHE: false,
    NANGO_SECRET_KEY: undefined,
    NANGO_HOST: 'https://api.nango.dev',
    PII_REDACT_LOGS: true,
    PORT: 3000,
    FAST_MODEL: 'gpt-4o-mini',
    STRONG_MODEL: 'openai/gpt-4o',
    DEFAULT_MAX_LLM_CALLS: 15,
    DEFAULT_MAX_TOOL_CALLS: 10,
    DEFAULT_MAX_WALL_TIME_MS: 60000,
    AGENT_COMPACTION_THRESHOLD: 50,
    AGENT_KEEP_RECENT: 20,
  }),
  ConfigValidationError: class extends Error { constructor(msg: string) { super(msg) } },
}))

// Mock embedded plugin loader + registry (not needed for agent run)
vi.mock('../embedded-plugin-loader.js', () => ({
  ensureEmbeddedPlugin: vi.fn().mockResolvedValue(undefined),
  isFirstPartyPlugin: vi.fn().mockReturnValue(false),
}))
vi.mock('../embedded-registry.js', () => ({
  callEmbeddedTool: vi.fn(),
}))

// Mock the LLM boundary — this is the only mock that matters
const mockRunAgent = vi.fn()
vi.mock('@lucid/openclaw-runtime', () => ({
  runEmbeddedPiAgent: (...args: any[]) => mockRunAgent(...args),
  setRuntimeConfigSnapshot: vi.fn(),
}))

// Mock usage tracker
vi.mock('../../utils/usage-tracker.js', () => ({
  trackUsage: vi.fn(),
  captureError: vi.fn(),
}))

const TEST_ASSISTANT: AssistantConfig = {
  id: 'test-assistant-001',
  name: 'Test Assistant',
  system_prompt: 'You are a test assistant.',
  lucid_model: 'gpt-4o-mini',
  temperature: 0.7,
  max_tokens: 4096,
  memory_enabled: false,
  memory_window_size: 0,
  org_id: 'test-org-001',
  policy_config: null,
  wallet_enabled: false,
}

const TEST_BUDGET: RunBudget = {
  maxLlmCalls: 10,
  maxToolCalls: 20,
  maxWallTimeMs: 30000,
}

const MOCK_LLM_RESPONSE = {
  payloads: [{ text: 'Hello! I am the test assistant.' }],
  meta: {
    durationMs: 500,
    agentMeta: {
      sessionId: 'test-session',
      provider: 'openai',
      model: 'gpt-4o-mini',
      usage: { input: 100, output: 50 },
    },
    stopReason: 'end_turn',
  },
}

class AgentCardPromptQuery {
  constructor(private readonly table: string) {}
  select() { return this }
  eq() { return this }
  is() { return this }
  order() { return this }
  limit() { return this }
  maybeSingle() { return Promise.resolve({ data: null, error: null }) }
  then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
    if (this.table === 'agent_identity_documents') {
      return Promise.resolve(resolve({
        data: [
          {
            document_type: 'SOUL',
            status: 'active',
            version: 1,
            content: {
              source: 'agent_card',
              summary: 'Name: Runtime Card Agent\nVoice: concise and exact',
              profile: { name: 'Runtime Card Agent' },
            },
          },
          {
            document_type: 'ACCESS_POLICY',
            status: 'active',
            version: 1,
            content: {
              source: 'agent_card',
              summary: '- Never: invent verification evidence',
              guardrails: { never: ['invent verification evidence'] },
            },
          },
        ],
        error: null,
      }))
    }
    if (this.table === 'shared_context_records') {
      return Promise.resolve(resolve({
        data: [
          {
            scope_type: 'workspace',
            scope_id: 'test-org-001',
            record_type: 'policy',
            title: 'Organization Card policy',
            body: 'Use approvals for risky actions.',
            confidence: 0.9,
            status: 'active',
            valid_from: null,
            valid_until: null,
            metadata: { policy: { approvals: true } },
            created_at: new Date(0).toISOString(),
          },
          {
            scope_type: 'project',
            scope_id: 'test-project-001',
            record_type: 'risk',
            title: 'Project Card risk',
            body: 'Smoke before release.',
            confidence: 0.8,
            status: 'active',
            valid_from: null,
            valid_until: null,
            metadata: {},
            created_at: new Date(1).toISOString(),
          },
        ],
        error: null,
      }))
    }
    return Promise.resolve(resolve({ data: [], error: null }))
  }
}

function createAgentCardPromptSupabase() {
  return {
    from(table: string) {
      return new AgentCardPromptQuery(table)
    },
    rpc() {
      return Promise.resolve({ data: null, error: null })
    },
  }
}

describe('E2E: Runtime V2 Smoke Tests', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRunAgent.mockResolvedValue(MOCK_LLM_RESPONSE)
    // Ensure LLM env is set (required by ensureLlmEnv)
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.OPENAI_API_BASE = 'http://localhost:4000'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('Legacy path (FEATURE_RUNTIME_V2=false)', () => {
    beforeEach(() => {
      process.env.FEATURE_RUNTIME_V2 = 'false'
    })

    it('returns AgentRunResult with correct shape', async () => {
      const { runOpenClawAgent } = await import('../OpenClawAgent.js')

      const result: AgentRunResult = await runOpenClawAgent({
        assistant: TEST_ASSISTANT,
        conversationId: 'conv-legacy-001',
        messages: [],
        memories: [],
        userMessage: 'Hello',
        budget: TEST_BUDGET,
        llmConfig: { baseUrl: 'http://localhost:4000', apiKey: 'test-key' },
      })

      expect(result.text).toBe('Hello! I am the test assistant.')
      expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 50 })
      expect(result.toolCallsUsed).toBe(0)
      expect(typeof result.budgetExhausted).toBe('boolean')
      expect(result.budgetExhausted).toBe(false)
    })

    it('calls runEmbeddedPiAgent directly', async () => {
      const { runOpenClawAgent } = await import('../OpenClawAgent.js')

      await runOpenClawAgent({
        assistant: TEST_ASSISTANT,
        conversationId: 'conv-legacy-002',
        messages: [],
        memories: [],
        userMessage: 'Hello',
        budget: TEST_BUDGET,
        llmConfig: { baseUrl: 'http://localhost:4000', apiKey: 'test-key' },
      })

      // In legacy mode, runEmbeddedPiAgent is called directly from OpenClawAgent
      expect(mockRunAgent).toHaveBeenCalledTimes(1)
      const callArgs = mockRunAgent.mock.calls[0][0]
      expect(callArgs.sessionId).toBe('conv-legacy-002')
      expect(callArgs.model).toBe('gpt-4o-mini')
      expect(callArgs.prompt).toBe('Hello')
    })

    it('passes system prompt with memories', async () => {
      const { runOpenClawAgent } = await import('../OpenClawAgent.js')

      await runOpenClawAgent({
        assistant: TEST_ASSISTANT,
        conversationId: 'conv-legacy-003',
        messages: [],
        memories: ['User prefers concise answers', 'User is a developer'],
        userMessage: 'Hello',
        budget: TEST_BUDGET,
        llmConfig: { baseUrl: 'http://localhost:4000', apiKey: 'test-key' },
      })

      const callArgs = mockRunAgent.mock.calls[0][0]
      expect(callArgs.extraSystemPrompt).toContain('You are a test assistant.')
      expect(callArgs.extraSystemPrompt).toContain('## Memories')
      expect(callArgs.extraSystemPrompt).toContain('User prefers concise answers')
    })

    it('includes built-in clientTools', async () => {
      const { runOpenClawAgent } = await import('../OpenClawAgent.js')

      await runOpenClawAgent({
        assistant: TEST_ASSISTANT,
        conversationId: 'conv-legacy-004',
        messages: [],
        memories: [],
        userMessage: 'Hello',
        budget: TEST_BUDGET,
        llmConfig: { baseUrl: 'http://localhost:4000', apiKey: 'test-key' },
      })

      const callArgs = mockRunAgent.mock.calls[0][0]
      // Should have clientTools (built-in tools from CommandsAllowlist)
      expect(callArgs.clientTools).toBeDefined()
      expect(Array.isArray(callArgs.clientTools)).toBe(true)
      // Should include known built-in tool names
      const toolNames = callArgs.clientTools.map((t: any) => t.function.name)
      expect(toolNames).toContain('sessions_spawn')
    })

    it('injects Agent Card summaries during real agent assembly across engines and runtime flavors', async () => {
      const { runOpenClawAgent } = await import('../OpenClawAgent.js')
      const variants = [
        { engine: 'openclaw', runtime_flavor: 'shared' },
        { engine: 'openclaw', runtime_flavor: 'c1_managed' },
        { engine: 'hermes', runtime_flavor: 'shared' },
        { engine: 'hermes', runtime_flavor: 'c2a_autonomous' },
      ] as const

      for (const variant of variants) {
        await runOpenClawAgent({
          assistant: {
            ...TEST_ASSISTANT,
            project_id: 'test-project-001',
            engine: variant.engine,
            runtime_flavor: variant.runtime_flavor,
          },
          conversationId: `conv-agent-card-${variant.engine}-${variant.runtime_flavor}`,
          messages: [],
          memories: [],
          userMessage: 'Hello',
          budget: TEST_BUDGET,
          llmConfig: { baseUrl: 'http://localhost:4000', apiKey: 'test-key' },
          supabase: createAgentCardPromptSupabase() as never,
        })

        const callArgs = mockRunAgent.mock.calls.at(-1)?.[0]
        expect(callArgs.extraSystemPrompt).toContain('## Agent Identity')
        expect(callArgs.extraSystemPrompt).toContain('Name: Runtime Card Agent')
        expect(callArgs.extraSystemPrompt).toContain('Never: invent verification evidence')
        expect(callArgs.extraSystemPrompt).toContain('## Shared Operating Context')
        expect(callArgs.extraSystemPrompt).toContain('Organization Card policy')
        expect(callArgs.extraSystemPrompt).toContain('Project Card risk')
        expect(callArgs.extraSystemPrompt).not.toContain('"profile"')
        expect(callArgs.extraSystemPrompt).not.toContain('"guardrails"')
      }
    })

    it('skips prompt image autodetection when inbound images are already supplied', async () => {
      const { runOpenClawAgent } = await import('../OpenClawAgent.js')

      await runOpenClawAgent({
        assistant: TEST_ASSISTANT,
        conversationId: 'conv-legacy-images-001',
        messages: [],
        memories: [],
        userMessage: 'What is in this image?',
        images: [{ data: 'ZmFrZS1pbWFnZQ==', mimeType: 'image/png' }],
        budget: TEST_BUDGET,
        llmConfig: { baseUrl: 'http://localhost:4000', apiKey: 'test-key' },
      })

      const callArgs = mockRunAgent.mock.calls[0][0]
      expect(callArgs.images).toEqual([
        { type: 'image', data: 'ZmFrZS1pbWFnZQ==', mimeType: 'image/png' },
      ])
      expect(callArgs.skipPromptImageDetection).toBe(true)
      expect(callArgs.config?.tools?.allow).not.toContain('image')
      expect(callArgs.config?.tools?.allow).toContain('pdf')
      expect(callArgs.config?.models?.providers?.openai?.models?.[0]?.input).toEqual([
        'text',
        'image',
      ])
    })

    it('caps OpenAI client tools below the total provider limit', async () => {
      const { runOpenClawAgent } = await import('../OpenClawAgent.js')

      const largePlugin = {
        slug: 'bulk_tools',
        name: 'Bulk Tools',
        tools: Array.from({ length: 140 }, (_, index) => ({
          name: `bulk_tool_${index + 1}`,
          description: `Bulk test tool ${index + 1}`,
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        })),
        config: {},
        kind: 'plugin',
        transport: 'embedded',
        trustLevel: 'internal',
        executionMode: 'in_process',
        authType: 'none',
        authProvider: null,
      } as const

      await runOpenClawAgent({
        assistant: TEST_ASSISTANT,
        conversationId: 'conv-legacy-tool-cap',
        messages: [],
        memories: [],
        userMessage: 'Use bulk tools to audit this batch',
        budget: TEST_BUDGET,
        llmConfig: { baseUrl: 'http://localhost:4000', apiKey: 'test-key' },
        plugins: [largePlugin as any],
      })

      const callArgs = mockRunAgent.mock.calls[0][0]
      const toolNames = callArgs.clientTools.map((t: any) => t.function.name)

      expect(callArgs.clientTools.length).toBeLessThan(128)
      expect(callArgs.clientTools.length).toBeGreaterThan(46)
      expect(toolNames).toContain('sessions_spawn')
      expect(toolNames).toContain('bulk_tools__bulk_tool_1')
      expect(toolNames).not.toContain('bulk_tools__bulk_tool_140')
    })
  })

  describe('V2 path (FEATURE_RUNTIME_V2=true)', () => {
    beforeEach(() => {
      process.env.FEATURE_RUNTIME_V2 = 'true'
    })

    it('returns AgentRunResult with same shape as legacy', async () => {
      const { runOpenClawAgent } = await import('../OpenClawAgent.js')

      const result: AgentRunResult = await runOpenClawAgent({
        assistant: TEST_ASSISTANT,
        conversationId: 'conv-v2-001',
        messages: [],
        memories: [],
        userMessage: 'Hello from v2',
        budget: TEST_BUDGET,
        llmConfig: { baseUrl: 'http://localhost:4000', apiKey: 'test-key' },
      })

      expect(result.text).toBe('Hello! I am the test assistant.')
      expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 50 })
      expect(result.toolCallsUsed).toBe(0)
      expect(typeof result.budgetExhausted).toBe('boolean')
      expect(result.budgetExhausted).toBe(false)
    })

    it('routes through EmbeddedRuntime instead of direct call', async () => {
      const { runOpenClawAgent } = await import('../OpenClawAgent.js')

      await runOpenClawAgent({
        assistant: TEST_ASSISTANT,
        conversationId: 'conv-v2-002',
        messages: [],
        memories: [],
        userMessage: 'Hello from v2',
        budget: TEST_BUDGET,
        llmConfig: { baseUrl: 'http://localhost:4000', apiKey: 'test-key' },
      })

      // V2 path goes through EmbeddedRuntime which also calls runEmbeddedPiAgent
      expect(mockRunAgent).toHaveBeenCalledTimes(1)
      const callArgs = mockRunAgent.mock.calls[0][0]
      expect(callArgs.prompt).toBe('Hello from v2')
      expect(callArgs.model).toBe('gpt-4o-mini')
    })

    it('uses deny policy instead of allow policy', async () => {
      const { runOpenClawAgent } = await import('../OpenClawAgent.js')

      await runOpenClawAgent({
        assistant: TEST_ASSISTANT,
        conversationId: 'conv-v2-003',
        messages: [],
        memories: [],
        userMessage: 'Test deny policy',
        budget: TEST_BUDGET,
        llmConfig: { baseUrl: 'http://localhost:4000', apiKey: 'test-key' },
      })

      const callArgs = mockRunAgent.mock.calls[0][0]
      // V2 uses tools.deny (from buildOpenClawToolPolicy)
      expect(callArgs.config?.tools?.deny).toBeDefined()
      expect(Array.isArray(callArgs.config.tools.deny)).toBe(true)
      // Should deny dangerous tools (OpenClaw native names)
      expect(callArgs.config.tools.deny).toContain('exec')
      expect(callArgs.config.tools.deny).toContain('browser')
      // Should NOT have tools.allow (that's legacy)
      expect(callArgs.config?.tools?.allow).toBeUndefined()
    })

    it('skips prompt image autodetection in v2 when inbound images are already supplied', async () => {
      const { runOpenClawAgent } = await import('../OpenClawAgent.js')

      await runOpenClawAgent({
        assistant: TEST_ASSISTANT,
        conversationId: 'conv-v2-images-001',
        messages: [],
        memories: [],
        userMessage: 'What is in this image?',
        images: [{ data: 'ZmFrZS1pbWFnZQ==', mimeType: 'image/png' }],
        budget: TEST_BUDGET,
        llmConfig: { baseUrl: 'http://localhost:4000', apiKey: 'test-key' },
      })

      const callArgs = mockRunAgent.mock.calls[0][0]
      expect(callArgs.images).toEqual([
        { type: 'image', data: 'ZmFrZS1pbWFnZQ==', mimeType: 'image/png' },
      ])
      expect(callArgs.skipPromptImageDetection).toBe(true)
      expect(callArgs.config?.tools?.deny).toContain('image')
      expect(callArgs.config?.models?.providers?.openai?.models?.[0]?.input).toEqual([
        'text',
        'image',
      ])
    })
  })

  describe('Output parity between paths', () => {
    it('both paths produce identical AgentRunResult for same input', async () => {
      const { runOpenClawAgent } = await import('../OpenClawAgent.js')

      const sharedParams = {
        assistant: TEST_ASSISTANT,
        messages: [],
        memories: ['Test memory'],
        userMessage: 'Hello parity test',
        budget: TEST_BUDGET,
        llmConfig: { baseUrl: 'http://localhost:4000', apiKey: 'test-key' },
      }

      // Legacy
      process.env.FEATURE_RUNTIME_V2 = 'false'
      const legacyResult = await runOpenClawAgent({
        ...sharedParams,
        conversationId: 'conv-parity-legacy',
      })

      // V2
      process.env.FEATURE_RUNTIME_V2 = 'true'
      const v2Result = await runOpenClawAgent({
        ...sharedParams,
        conversationId: 'conv-parity-v2',
      })

      // Core fields must match
      expect(v2Result.text).toBe(legacyResult.text)
      expect(v2Result.usage).toEqual(legacyResult.usage)
      expect(v2Result.budgetExhausted).toBe(legacyResult.budgetExhausted)
    })
  })

  describe('Tool surface assembly (v2 path)', () => {
    beforeEach(() => {
      process.env.FEATURE_RUNTIME_V2 = 'true'
    })

    it('collision guard does not strip built-in tools', async () => {
      const { runOpenClawAgent } = await import('../OpenClawAgent.js')

      await runOpenClawAgent({
        assistant: TEST_ASSISTANT,
        conversationId: 'conv-tools-001',
        messages: [],
        memories: [],
        userMessage: 'Test tools',
        budget: TEST_BUDGET,
        llmConfig: { baseUrl: 'http://localhost:4000', apiKey: 'test-key' },
      })

      const callArgs = mockRunAgent.mock.calls[0][0]
      if (callArgs.clientTools) {
        const toolNames = callArgs.clientTools.map((t: any) => t.function.name)
        // Our built-in tools should survive collision guard
        // (they don't collide with native tools since native dangerous tools are denied)
        expect(toolNames.length).toBeGreaterThan(0)
        // Should NOT contain old aliases (filtered by REVERSE_TOOL_NAME_MAP)
        expect(toolNames).not.toContain('schedule_task')
        expect(toolNames).not.toContain('list_scheduled_tasks')
        expect(toolNames).not.toContain('cancel_scheduled_task')
      }
    })

    it('handles wallet_enabled correctly', async () => {
      const { runOpenClawAgent } = await import('../OpenClawAgent.js')

      const walletAssistant = {
        ...TEST_ASSISTANT,
        wallet_enabled: true,
        agent_wallets: [{
          chain_type: 'solana',
          privy_wallet_id: 'test-wallet',
          address: 'So1ana1111111111111111111111111111111111111',
          status: 'active',
        }],
      }

      await runOpenClawAgent({
        assistant: walletAssistant,
        conversationId: 'conv-wallet-001',
        messages: [],
        memories: [],
        userMessage: 'Test wallet',
        budget: TEST_BUDGET,
        llmConfig: { baseUrl: 'http://localhost:4000', apiKey: 'test-key' },
      })

      const callArgs = mockRunAgent.mock.calls[0][0]
      if (callArgs.clientTools) {
        // Wallet address params should be stripped when wallet_enabled
        const transferTool = callArgs.clientTools.find(
          (t: any) => t.function.name === 'wallet_transfer'
        )
        if (transferTool?.function?.parameters?.properties) {
          expect(transferTool.function.parameters.properties.from_address).toBeUndefined()
        }
      }
    })

    it('handles LLM error (budget exhausted)', async () => {
      mockRunAgent.mockResolvedValueOnce({
        payloads: [{ text: 'Partial response before limit...' }],
        meta: {
          durationMs: 1000,
          agentMeta: { sessionId: 'err', provider: 'openai', model: 'gpt-4o-mini', usage: { input: 500, output: 200 } },
          error: { kind: 'retry_limit', message: 'Max retries exceeded' },
        },
      })

      const { runOpenClawAgent } = await import('../OpenClawAgent.js')

      const result = await runOpenClawAgent({
        assistant: TEST_ASSISTANT,
        conversationId: 'conv-error-001',
        messages: [],
        memories: [],
        userMessage: 'Long task',
        budget: TEST_BUDGET,
        llmConfig: { baseUrl: 'http://localhost:4000', apiKey: 'test-key' },
      })

      expect(result.budgetExhausted).toBe(true)
      expect(result.text).toBe('Partial response before limit...')
    })
  })
})
