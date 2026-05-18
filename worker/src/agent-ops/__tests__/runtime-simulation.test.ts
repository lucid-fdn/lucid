import { describe, expect, it, vi } from 'vitest'

import { AgentOpsRelayStepExecutor } from '../relay-step-executor.js'
import type { Config } from '../../config.js'
import type { WorkerRunExecutor } from '../../core/runtime/worker-run-executor.js'
import type { StepRunPacket } from '../../runtime/data-sink.js'

const CONFIG = {
  DEFAULT_MAX_LLM_CALLS: 4,
  DEFAULT_MAX_TOOL_CALLS: 8,
  DEFAULT_MAX_WALL_TIME_MS: 30_000,
  LUCID_API_BASE_URL: 'https://api.lucid.test/v1',
  LUCID_API_KEY: 'test-key',
} as unknown as Config

const runtimeMatrix = [
  { engine: 'openclaw', runtimeFlavor: 'shared' },
  { engine: 'openclaw', runtimeFlavor: 'c1_managed' },
  { engine: 'openclaw', runtimeFlavor: 'c2a_autonomous' },
  { engine: 'hermes', runtimeFlavor: 'shared' },
  { engine: 'hermes', runtimeFlavor: 'c1_managed' },
  { engine: 'hermes', runtimeFlavor: 'c2a_autonomous' },
] as const

describe('Agent Ops runtime simulation matrix', () => {
  it('executes Agent Ops relay steps across shared and dedicated engine/runtime flavors', async () => {
    for (const target of runtimeMatrix) {
      const runExecutor = makeRunExecutor()
      const executor = new AgentOpsRelayStepExecutor({ config: CONFIG, runExecutor })
      const packet = makePacket({
        assistantConfig: {
          ...makePacket().assistantConfig!,
          engine: target.engine,
          runtimeFlavor: target.runtimeFlavor,
        },
      })

      const result = await executor.execute(packet)

      expect(result).toMatchObject({
        ok: true,
        output: `simulated ${target.engine}/${target.runtimeFlavor} result`,
        inputTokens: 11,
        outputTokens: 17,
        totalTokens: 28,
      })
      expect(runExecutor.execute).toHaveBeenCalledOnce()
      const request = runExecutor.execute.mock.calls[0][0]
      expect(request.assistant).toMatchObject({
        engine: target.engine,
        runtime_flavor: target.runtimeFlavor,
        org_id: '66666666-6666-4666-8666-666666666666',
      })
      expect(request.memories).toEqual(['E2E prefers evidence-backed findings.'])
      expect(request.boardMemories).toEqual(['[runtime] Keep Agent Ops engine neutral.'])
      expect(request.userMessage).toContain('Workflow: review (1.0.0)')
      expect(request.userMessage).toContain('Return ONLY valid JSON')
    }
  })

  it('returns retryable failures consistently across runtime flavors', async () => {
    const runExecutor = {
      execute: vi.fn(async () => {
        throw new Error('simulated runtime outage')
      }),
    } satisfies WorkerRunExecutor
    const executor = new AgentOpsRelayStepExecutor({ config: CONFIG, runExecutor })

    const result = await executor.execute(makePacket({
      assistantConfig: {
        ...makePacket().assistantConfig!,
        engine: 'hermes',
        runtimeFlavor: 'c2a_autonomous',
      },
    }))

    expect(result).toEqual({
      ok: false,
      errorMessage: 'simulated runtime outage',
      retryable: true,
    })
  })
})

function makeRunExecutor() {
  return {
    execute: vi.fn(async (request) => ({
      text: `simulated ${request.assistant.engine}/${request.assistant.runtime_flavor} result`,
      usage: { promptTokens: 11, completionTokens: 17, totalTokens: 28 },
      steps: 1,
      toolCallsUsed: 0,
      budgetExhausted: false,
      providerError: false,
      source: {
        engine: request.assistant.engine,
        runtimeFlavor: request.assistant.runtime_flavor,
        executionMode: 'engine',
      },
    })),
  } satisfies WorkerRunExecutor
}

function makePacket(overrides: Partial<StepRunPacket> = {}): StepRunPacket {
  return {
    stepId: '11111111-1111-4111-8111-111111111111',
    dagId: '22222222-2222-4222-8222-222222222222',
    dagNodeId: '33333333-3333-4333-8333-333333333333',
    stepType: 'scheduled',
    attempt: 0,
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    payload: {
      agent_ops_step: 'correctness',
      agent_ops: {
        run_id: '44444444-4444-4444-8444-444444444444',
        workflow_id: 'review',
        workflow_version: '1.0.0',
        step_id: 'correctness',
        step_title: 'Review correctness and regressions',
        scope: { type: 'pull_request', ref: 'pr-42' },
        input: { target: 'pr-42' },
        output_sections: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
        evidence_types: ['diff', 'review_finding', 'test_result'],
      },
    },
    assistantConfig: {
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Runtime Matrix Agent',
      engine: 'openclaw',
      systemPrompt: 'Execute Agent Ops steps.',
      soulContent: null,
      runtimeFlavor: 'shared',
      modelId: 'gpt-4o-mini',
      temperature: 0.2,
      maxTokens: 2048,
      policyConfig: {},
      memoryEnabled: true,
      approvalRequiredTools: [],
      orgId: '66666666-6666-4666-8666-666666666666',
    },
    memoryInjection: ['E2E prefers evidence-backed findings.'],
    boardMemories: ['[runtime] Keep Agent Ops engine neutral.'],
    conversationSummary: null,
    ...overrides,
  }
}
