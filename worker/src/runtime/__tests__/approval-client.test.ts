import { describe, expect, it, vi } from 'vitest'

import { requestApproval } from '../approval-client.js'
import type { DataSink } from '../data-sink.js'

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

describe('requestApproval', () => {
  it('polls immediately and keeps client-only polling options out of the approval payload', async () => {
    const submitApproval = vi.fn(async () => 'approval-1')
    const pollApprovalResolution = vi.fn(async () => ({
      decision: 'approved' as const,
      resolvedAt: '2026-04-28T00:00:00.000Z',
    }))
    const sink = makeDataSink({ submitApproval, pollApprovalResolution })

    const result = await requestApproval(sink, {
      agentId: 'agent-1',
      toolName: 'agent_ops.ship.approval',
      toolArgs: { step_id: 'approval' },
      runId: 'run-1',
      timeoutMs: 1_000,
      pollIntervalMs: 1,
    })

    expect(result).toEqual({
      decision: 'approved',
      resolvedAt: '2026-04-28T00:00:00.000Z',
    })
    expect(pollApprovalResolution).toHaveBeenCalledOnce()
    expect(submitApproval).toHaveBeenCalledWith({
      agentId: 'agent-1',
      toolName: 'agent_ops.ship.approval',
      toolArgs: { step_id: 'approval' },
      runId: 'run-1',
      timeoutMs: 1_000,
    })
  })
})
