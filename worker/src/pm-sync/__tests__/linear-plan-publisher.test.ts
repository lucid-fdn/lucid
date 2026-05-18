/**
 * Linear Plan Publisher — Unit Tests.
 *
 * Verifies DAG node → Linear plan step mapping, initial plan publishing,
 * and progress updates on node completion.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  dagNodesToLinearPlan,
  publishDagPlanToLinear,
  updateDagPlanProgress,
} from '../adapters/linear/plan-publisher.js'
import type { LinearAgentClient } from '../adapters/linear/agent-client.js'

// ─── Mock agent client ──────────────────────────────────────────────────────

function createMockClient() {
  return {
    publishPlan: vi.fn().mockResolvedValue(undefined),
    emitThought: vi.fn(),
    emitAction: vi.fn(),
    emitElicitation: vi.fn(),
    emitResponse: vi.fn(),
    emitError: vi.fn(),
    setExternalUrl: vi.fn(),
    updateSessionStatus: vi.fn(),
  } as unknown as LinearAgentClient & { publishPlan: ReturnType<typeof vi.fn> }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('dagNodesToLinearPlan', () => {
  it('maps pending and ready statuses to pending', () => {
    const result = dagNodesToLinearPlan([
      { id: 'n1', name: 'Step 1', status: 'pending' },
      { id: 'n2', name: 'Step 2', status: 'ready' },
    ])
    expect(result).toEqual([
      { content: 'Step 1', status: 'pending' },
      { content: 'Step 2', status: 'pending' },
    ])
  })

  it('maps running/claimed/in_progress to inProgress', () => {
    const result = dagNodesToLinearPlan([
      { id: 'n1', name: 'Run', status: 'running' },
      { id: 'n2', name: 'Claim', status: 'claimed' },
      { id: 'n3', name: 'Progress', status: 'in_progress' },
    ])
    expect(result.every((s) => s.status === 'inProgress')).toBe(true)
  })

  it('maps complete/done/completed to completed', () => {
    const result = dagNodesToLinearPlan([
      { id: 'n1', name: 'A', status: 'complete' },
      { id: 'n2', name: 'B', status: 'done' },
      { id: 'n3', name: 'C', status: 'completed' },
    ])
    expect(result.every((s) => s.status === 'completed')).toBe(true)
  })

  it('maps failed/cancelled/skipped/error to canceled', () => {
    const result = dagNodesToLinearPlan([
      { id: 'n1', name: 'A', status: 'failed' },
      { id: 'n2', name: 'B', status: 'cancelled' },
      { id: 'n3', name: 'C', status: 'skipped' },
      { id: 'n4', name: 'D', status: 'error' },
    ])
    expect(result.every((s) => s.status === 'canceled')).toBe(true)
  })

  it('falls back to pending for unknown statuses', () => {
    const result = dagNodesToLinearPlan([
      { id: 'n1', name: 'X', status: 'something_else' },
    ])
    expect(result[0].status).toBe('pending')
  })

  it('uses label > name > id for content', () => {
    const result = dagNodesToLinearPlan([
      { id: 'n1', label: 'My Label', name: 'My Name', status: 'pending' },
      { id: 'n2', name: 'My Name', status: 'pending' },
      { id: 'n3', status: 'pending' },
    ])
    expect(result[0].content).toBe('My Label')
    expect(result[1].content).toBe('My Name')
    expect(result[2].content).toBe('n3')
  })
})

describe('publishDagPlanToLinear', () => {
  it('calls agentClient.publishPlan with correct steps', async () => {
    const client = createMockClient()
    const nodes = [
      { id: 'n1', name: 'Research', status: 'pending' },
      { id: 'n2', name: 'Analyze', status: 'running' },
      { id: 'n3', name: 'Report', status: 'completed' },
    ]

    await publishDagPlanToLinear(client, 'session-1', nodes)

    expect(client.publishPlan).toHaveBeenCalledOnce()
    const [sessionId, steps] = client.publishPlan.mock.calls[0]
    expect(sessionId).toBe('session-1')
    expect(steps).toHaveLength(3)
    expect(steps[0]).toEqual({ title: 'Research', status: 'pending' })
    expect(steps[1]).toEqual({ title: 'Analyze', status: 'in_progress' })
    expect(steps[2]).toEqual({ title: 'Report', status: 'completed' })
  })

  it('catches and warns on failure', async () => {
    const client = createMockClient()
    client.publishPlan.mockRejectedValueOnce(new Error('API down'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await publishDagPlanToLinear(client, 'session-1', [
      { id: 'n1', name: 'Step', status: 'pending' },
    ])

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[plan-publisher] Failed to publish'),
      'API down',
    )
    warnSpy.mockRestore()
  })
})

describe('updateDagPlanProgress', () => {
  it('marks the completed node and updates the plan', async () => {
    const client = createMockClient()
    const nodes = [
      { id: 'n1', name: 'Step A', status: 'running' },
      { id: 'n2', name: 'Step B', status: 'pending' },
    ]

    await updateDagPlanProgress(client, 'session-1', nodes, 'n1')

    expect(client.publishPlan).toHaveBeenCalledOnce()
    const [, steps] = client.publishPlan.mock.calls[0]
    // n1 should be overridden to completed
    expect(steps[0]).toEqual({ title: 'Step A', status: 'completed' })
    // n2 stays pending
    expect(steps[1]).toEqual({ title: 'Step B', status: 'pending' })
  })

  it('catches and warns on failure', async () => {
    const client = createMockClient()
    client.publishPlan.mockRejectedValueOnce(new Error('Timeout'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await updateDagPlanProgress(client, 'session-1', [
      { id: 'n1', name: 'X', status: 'running' },
    ], 'n1')

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[plan-publisher] Failed to update'),
      'Timeout',
    )
    warnSpy.mockRestore()
  })
})
