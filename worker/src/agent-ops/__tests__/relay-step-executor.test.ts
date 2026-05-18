import { afterEach, describe, expect, it, vi } from 'vitest'

import { AgentOpsRelayStepExecutor } from '../relay-step-executor.js'
import type { Config } from '../../config.js'
import type { WorkerRunExecutor } from '../../core/runtime/worker-run-executor.js'
import type { DataSink, StepRunPacket } from '../../runtime/data-sink.js'

const CONFIG = {
  DEFAULT_MAX_LLM_CALLS: 4,
  DEFAULT_MAX_TOOL_CALLS: 8,
  DEFAULT_MAX_WALL_TIME_MS: 30_000,
  LUCID_API_BASE_URL: 'https://api.lucid.test/v1',
  LUCID_API_KEY: 'test-key',
} as unknown as Config

function makePacket(overrides: Partial<StepRunPacket> = {}): StepRunPacket {
  return {
    stepId: '11111111-1111-4111-8111-111111111111',
    dagId: '22222222-2222-4222-8222-222222222222',
    dagNodeId: '33333333-3333-4333-8333-333333333333',
    stepType: 'scheduled',
    attempt: 0,
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    payload: {
      agent_ops_step: 'scope',
      agent_ops: {
        run_id: '44444444-4444-4444-8444-444444444444',
        workflow_id: 'review',
        workflow_version: '1.0.0',
        step_id: 'scope',
        step_title: 'Load and scope the change',
        scope: { type: 'pull_request', ref: 'pr-7' },
        input: { target: 'pr-7' },
        output_sections: ['Summary', 'Findings', 'Evidence'],
        evidence_types: ['diff', 'test_result'],
      },
    },
    assistantConfig: {
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Reviewer',
      engine: 'openclaw',
      systemPrompt: 'Review carefully.',
      soulContent: null,
      runtimeFlavor: 'c1_managed',
      modelId: 'gpt-4o-mini',
      temperature: 0.2,
      maxTokens: 2048,
      policyConfig: {},
      memoryEnabled: true,
      approvalRequiredTools: [],
      orgId: '66666666-6666-4666-8666-666666666666',
    },
    memoryInjection: ['Prefer small PRs.'],
    boardMemories: ['[architecture] API routes live in app/api.'],
    conversationSummary: null,
    ...overrides,
  }
}

function makeRunExecutor() {
  return {
    execute: vi.fn(async () => ({
      text: 'Scoped the PR and found one risky migration.',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      steps: 1,
      toolCallsUsed: 0,
      budgetExhausted: false,
      providerError: false,
      source: { engine: 'openclaw', runtimeFlavor: 'c1_managed', executionMode: 'engine' },
    })),
  } satisfies WorkerRunExecutor
}

function makeDataSink(overrides: Partial<DataSink> = {}): DataSink {
  return {
    async reportHeartbeat() { return null },
    async reportEvents() {},
    async submitApproval() { return 'approval-1' },
    async pollApprovalResolution() {
      return { decision: 'approved', resolvedAt: '2026-04-28T00:00:00.000Z' }
    },
    async reportHealthScores() {},
    async reportCosts() {},
    ...overrides,
  }
}

describe('AgentOpsRelayStepExecutor', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('runs Agent Ops step packets through the shared worker run executor', async () => {
    const runExecutor = makeRunExecutor()
    const executor = new AgentOpsRelayStepExecutor({ config: CONFIG, runExecutor })

    const result = await executor.execute(makePacket())

    expect(result).toEqual({
      ok: true,
      output: 'Scoped the PR and found one risky migration.',
      durationMs: expect.any(Number),
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
    })
    expect(runExecutor.execute).toHaveBeenCalledOnce()
    const request = runExecutor.execute.mock.calls[0][0]
    expect(request.assistant).toMatchObject({
      id: '55555555-5555-4555-8555-555555555555',
      engine: 'openclaw',
      lucid_model: 'gpt-4o-mini',
      org_id: '66666666-6666-4666-8666-666666666666',
    })
    expect(request.memories).toEqual(['Prefer small PRs.'])
    expect(request.boardMemories).toEqual(['[architecture] API routes live in app/api.'])
    expect(request.userMessage).toContain('Workflow: review (1.0.0)')
    expect(request.userMessage).toContain('Step: scope - Load and scope the change')
    expect(request.userMessage).toContain('Return ONLY valid JSON')
    expect(request.userMessage).toContain('"target": "pr-7"')
  })

  it('requests Mission Control approval for Agent Ops approval steps', async () => {
    const runExecutor = makeRunExecutor()
    const dataSink = makeDataSink({
      submitApproval: vi.fn(async () => 'approval-1'),
      pollApprovalResolution: vi.fn(async () => ({
        decision: 'approved',
        resolvedAt: '2026-04-28T00:00:00.000Z',
      })),
    })
    const executor = new AgentOpsRelayStepExecutor({ config: CONFIG, runExecutor, dataSink })

    const result = await executor.execute(makePacket({
      stepType: 'approval',
      payload: {
        agent_ops_step: 'approval',
        agent_ops: {
          run_id: '44444444-4444-4444-8444-444444444444',
          workflow_id: 'ship',
          workflow_version: '1.0.0',
          step_id: 'approval',
          step_title: 'Request release approval',
          scope: { type: 'branch', ref: 'main' },
          input: { target: 'main' },
        },
      },
    }))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(JSON.parse(result.output ?? '{}')).toMatchObject({
        summary: 'Approval granted for Request release approval.',
        evidence: [expect.objectContaining({ type: 'approval' })],
      })
    }
    expect(dataSink.submitApproval).toHaveBeenCalledWith(expect.objectContaining({
      agentId: '55555555-5555-4555-8555-555555555555',
      toolName: 'agent_ops.ship.approval',
      runId: '44444444-4444-4444-8444-444444444444',
    }))
    expect(runExecutor.execute).not.toHaveBeenCalled()
  })

  it('adds browser QA operating instructions for browser-backed workflows', async () => {
    const runExecutor = makeRunExecutor()
    const executor = new AgentOpsRelayStepExecutor({ config: CONFIG, runExecutor })

    await executor.execute(makePacket({
      payload: {
        agent_ops_step: 'verify',
        agent_ops: {
          run_id: '44444444-4444-4444-8444-444444444444',
          workflow_id: 'qa',
          workflow_version: '1.0.0',
          step_id: 'verify',
          step_title: 'Verify behavior and collect evidence',
          scope: { type: 'url', ref: 'https://app.example.com/dashboard' },
          input: {
            target: 'https://app.example.com/dashboard',
            scenario: 'Log in and open the dashboard.',
          },
          evidence_types: ['screenshot', 'console_log', 'network_log', 'perf_metric'],
        },
      },
    }))

    const request = runExecutor.execute.mock.calls[0][0]
    expect(request.userMessage).toContain('Browser Operator instructions:')
    expect(request.userMessage).toContain('Target: https://app.example.com/dashboard')
    expect(request.userMessage).toContain('content.browser_available=false')
    expect(request.userMessage).toContain('failed 4xx/5xx requests')
  })

  it('runs browser-backed Agent Ops QA steps through the browser control executor when configured', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const json = (body: unknown) => new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

      expect(init?.headers).toEqual(expect.any(Headers))
      expect((init?.headers as Headers).get('Authorization')).toBe('Bearer browser-token')

      if (url.pathname === '/') return json({ running: true })
      if (url.pathname === '/tabs/open') {
        return json({ targetId: 'tab-1', url: 'https://app.example.com/dashboard' })
      }
      if (url.pathname === '/navigate') {
        return json({ ok: true, targetId: 'tab-1', url: 'https://app.example.com/dashboard' })
      }
      if (url.pathname === '/act') {
        return json({ ok: true, targetId: 'tab-1', result: '{"navigation":{"duration":42},"paint":[]}' })
      }
      if (url.pathname === '/snapshot') {
        return json({
          ok: true,
          targetId: 'tab-1',
          url: 'https://app.example.com/dashboard',
          snapshot: '- heading Dashboard',
          stats: { lines: 1 },
        })
      }
      if (url.pathname === '/screenshot') {
        return json({
          ok: true,
          targetId: 'tab-1',
          url: 'https://app.example.com/dashboard',
          path: '/tmp/browser-shot.png',
        })
      }
      if (url.pathname === '/console') return json({ ok: true, targetId: 'tab-1', messages: [] })
      if (url.pathname === '/errors') return json({ ok: true, targetId: 'tab-1', errors: [] })
      if (url.pathname === '/requests') {
        return json({ ok: true, targetId: 'tab-1', requests: [{ url: 'https://app.example.com/api', status: 200 }] })
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const runExecutor = makeRunExecutor()
    const executor = new AgentOpsRelayStepExecutor({
      config: {
        ...CONFIG,
        BROWSER_QA_CONTROL_URL: 'http://browser.test',
        BROWSER_QA_CONTROL_TOKEN: 'browser-token',
        BROWSER_QA_TIMEOUT_MS: 30_000,
      } as unknown as Config,
      runExecutor,
    })

    const result = await executor.execute(makePacket({
      payload: {
        agent_ops_step: 'verify',
        agent_ops: {
          run_id: '44444444-4444-4444-8444-444444444444',
          workflow_id: 'qa',
          workflow_version: '1.0.0',
          step_id: 'verify',
          step_title: 'Verify behavior and collect evidence',
          scope: { type: 'url', ref: 'https://app.example.com/dashboard' },
          input: { target: 'https://app.example.com/dashboard' },
          evidence_types: ['screenshot', 'console_log', 'network_log', 'perf_metric'],
        },
      },
    }))

    expect(result.ok).toBe(true)
    expect(runExecutor.execute).not.toHaveBeenCalled()
    if (result.ok) {
      const output = JSON.parse(result.output ?? '{}')
      expect(output.summary).toContain('Browser QA completed')
      expect(JSON.stringify(output)).not.toContain('OpenClaw browser control')
      expect(JSON.stringify(output)).toContain('configured browser control endpoint')
      expect(output.evidence).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'test_result' }),
        expect.objectContaining({ type: 'screenshot', uri: '/tmp/browser-shot.png' }),
        expect.objectContaining({ type: 'console_log' }),
        expect.objectContaining({ type: 'network_log' }),
        expect.objectContaining({ type: 'perf_metric' }),
      ]))
      expect(output.evidence[0].content.browser_available).toBe(true)
    }
  })

  it('runs Browser QA through the Steel provider when selected', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const json = (body: unknown) => new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

      expect(init?.headers).toEqual(expect.any(Headers))
      expect((init?.headers as Headers).get('Authorization')).toBe('Bearer steel-key')

      if (url.pathname === '/v1/sessions') {
        return json({ id: 'steel-session-1' })
      }
      if (url.pathname === '/v1/scrape') {
        return json({ markdown: '# Dashboard\nEverything loaded.' })
      }
      if (url.pathname === '/v1/screenshot') {
        return json({ url: 'https://steel.internal/artifacts/shot.png' })
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const runExecutor = makeRunExecutor()
    const executor = new AgentOpsRelayStepExecutor({
      config: {
        ...CONFIG,
        BROWSER_QA_PROVIDER: 'steel',
        STEEL_BROWSER_URL: 'https://steel.internal',
        STEEL_API_KEY: 'steel-key',
        BROWSER_QA_TIMEOUT_MS: 30_000,
      } as unknown as Config,
      runExecutor,
    })

    const result = await executor.execute(makePacket({
      payload: {
        agent_ops_step: 'verify',
        agent_ops: {
          run_id: '44444444-4444-4444-8444-444444444444',
          workflow_id: 'qa',
          workflow_version: '1.0.0',
          step_id: 'verify',
          step_title: 'Verify behavior and collect evidence',
          scope: { type: 'url', ref: 'https://app.example.com/dashboard' },
          input: { target: 'https://app.example.com/dashboard' },
          evidence_types: ['screenshot', 'console_log', 'network_log', 'perf_metric'],
        },
      },
    }))

    expect(result.ok).toBe(true)
    expect(runExecutor.execute).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://steel.internal/v1/sessions',
      expect.any(Object),
    )
    if (result.ok) {
      const output = JSON.parse(result.output ?? '{}')
      expect(output.evidence[0].content.provider).toBe('steel')
      expect(output.evidence).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'screenshot',
          uri: 'https://steel.internal/artifacts/shot.png',
        }),
        expect.objectContaining({
          type: 'browser_snapshot',
        }),
      ]))
    }
  })

  it('fails denied Agent Ops approval steps as non-retryable', async () => {
    const dataSink = makeDataSink({
      submitApproval: vi.fn(async () => 'approval-1'),
      pollApprovalResolution: vi.fn(async () => ({
        decision: 'denied',
        resolvedAt: '2026-04-28T00:00:00.000Z',
      })),
    })
    const executor = new AgentOpsRelayStepExecutor({
      config: CONFIG,
      runExecutor: makeRunExecutor(),
      dataSink,
    })

    const result = await executor.execute(makePacket({ stepType: 'approval' }))

    expect(result).toEqual({
      ok: false,
      errorMessage: 'Agent Ops approval denied: Load and scope the change',
      retryable: false,
    })
  })

  it('fails Agent Ops packets without assistant context as non-retryable', async () => {
    const runExecutor = makeRunExecutor()
    const executor = new AgentOpsRelayStepExecutor({ config: CONFIG, runExecutor })

    const result = await executor.execute(makePacket({ assistantConfig: undefined }))

    expect(result).toEqual({
      ok: false,
      errorMessage: 'Agent Ops step is missing assistantConfig',
      retryable: false,
    })
    expect(runExecutor.execute).not.toHaveBeenCalled()
  })

  it('keeps non-Agent-Ops DAG steps on the safe fallback path', async () => {
    const runExecutor = makeRunExecutor()
    const executor = new AgentOpsRelayStepExecutor({ config: CONFIG, runExecutor })

    const result = await executor.execute(makePacket({ payload: { hello: 'world' } }))

    expect(result).toEqual({
      ok: true,
      output: '[relay-step] no Agent Ops context; step acknowledged by fallback executor',
    })
    expect(runExecutor.execute).not.toHaveBeenCalled()
  })
})
