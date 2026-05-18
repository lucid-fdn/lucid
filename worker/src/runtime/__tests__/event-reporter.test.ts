import { beforeEach, describe, expect, it, vi } from 'vitest'

import { reportNativeMutationCandidateEvent, reportToolExecutionEvent } from '../event-reporter.js'

describe('reportToolExecutionEvent', () => {
  beforeEach(async () => {
    const mod = await import('../event-reporter.js')
    await mod.flush()
  })

  it('maps tool lifecycle events onto stable feed events with richer payload', async () => {
    const captured: Array<Record<string, unknown>> = []
    const mod = await import('../event-reporter.js')
    mod.initEventReporter({
      reportHeartbeat: vi.fn(),
      reportEvents: vi.fn(async (events) => {
        captured.push(...events as Array<Record<string, unknown>>)
      }),
      submitApproval: vi.fn(),
      pollApprovalResolution: vi.fn(),
      reportHealthScores: vi.fn(),
      reportCosts: vi.fn(),
    })

    reportToolExecutionEvent({
      agentId: 'asst-1',
      runId: 'run-1',
      source: 'shared',
      event: {
        type: 'tool_completed',
        toolName: 'dex_swap',
        toolCallId: 'call-1',
        payload: { outputPreview: 'ok' },
      },
    })

    await mod.flush()
    mod.stopEventReporter()

    expect(captured).toEqual([
      expect.objectContaining({
        agentId: 'asst-1',
        eventType: 'tool_result',
        payload: expect.objectContaining({
          runId: 'run-1',
          source: 'shared',
          toolName: 'dex_swap',
          toolCallId: 'call-1',
          toolEventType: 'tool_completed',
          outputPreview: 'ok',
        }),
      }),
    ])
  })

  it('reports native mutation candidates as feed events', async () => {
    const captured: Array<Record<string, unknown>> = []
    const mod = await import('../event-reporter.js')
    mod.initEventReporter({
      reportHeartbeat: vi.fn(),
      reportEvents: vi.fn(async (events) => {
        captured.push(...events as Array<Record<string, unknown>>)
      }),
      submitApproval: vi.fn(),
      pollApprovalResolution: vi.fn(),
      reportHealthScores: vi.fn(),
      reportCosts: vi.fn(),
    })

    reportNativeMutationCandidateEvent({
      agentId: 'asst-1',
      runId: 'run-2',
      source: 'shared',
      candidate: {
        engine: 'hermes',
        runtimeFlavor: 'shared',
        kind: 'memory_write',
        toolName: 'memory',
        toolArgs: { content: 'remember this' },
        reason: 'Shared candidate path',
      },
    })

    await mod.flush()
    mod.stopEventReporter()

    expect(captured).toEqual([
      expect.objectContaining({
        agentId: 'asst-1',
        eventType: 'native_mutation_candidate',
        payload: expect.objectContaining({
          runId: 'run-2',
          source: 'shared',
          toolName: 'memory',
          toolEventType: 'native_mutation_candidate',
          mutationEngine: 'hermes',
          mutationRuntimeFlavor: 'shared',
          mutationKind: 'memory_write',
          toolArgs: { content: 'remember this' },
          reason: 'Shared candidate path',
        }),
      }),
    ])
  })
})
