/**
 * Phase 4N-0 — Orphan detector recovers stuck orchestration_steps.
 *
 * Bug history: orchestration_steps could enter `claimed` state and never
 * transition (executor crash, lease expiry, lost lock). The orphan detector
 * already resets stuck inbound/outbound/scheduled rows but had no equivalent
 * for the step ledger, leaving DAG nodes wedged forever. The detector now
 * SELECTs stuck claimed steps (`started_at` < NOW − 2 min), then per-row
 * UPDATEs each back to `pending` with `attempt+1` and emits
 * `lucid.pulse.orphaned_steps`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockPipeline, mockRedis } = vi.hoisted(() => {
  const mockPipeline = {
    get: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  }
  const mockRedis = {
    set: vi.fn().mockResolvedValue('OK'),
    smembers: vi.fn().mockResolvedValue([]),
    srem: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
    expire: vi.fn().mockResolvedValue(true),
    hincrby: vi.fn().mockResolvedValue(1),
    eval: vi.fn().mockResolvedValue(1),
    pipeline: vi.fn(() => ({ ...mockPipeline })),
  }
  return { mockPipeline, mockRedis }
})

vi.mock('../redis.js', () => ({
  getPulseRedis: vi.fn().mockResolvedValue(mockRedis),
}))

vi.mock('../queue.js', () => ({
  PulseQueue: vi.fn().mockImplementation(() => ({
    enqueue: vi.fn().mockResolvedValue(true),
  })),
}))

const incPulseOrphanedStepsMock = vi.fn()
vi.mock('../../observability/metrics.js', () => ({
  incPulseOrphaned: vi.fn(),
  incPulseOrphanedSteps: (...args: unknown[]) => incPulseOrphanedStepsMock(...args),
}))

import { OrphanDetector } from '../orphan-detector.js'
import { PulseQueue } from '../queue.js'

type Call = {
  table: string
  op: 'select' | 'update'
  filters: Record<string, unknown>
  payload?: Record<string, unknown>
}

function buildSupabaseStub(stuckSteps: Array<Record<string, unknown>>) {
  const calls: Call[] = []

  function makeChain(table: string) {
    let op: 'select' | 'update' | null = null
    let payload: Record<string, unknown> | undefined
    const filters: Record<string, unknown> = {}
    let pushed = false

    const push = () => {
      if (pushed) return
      pushed = true
      calls.push({ table, op: op ?? 'select', filters: { ...filters }, payload })
    }

    const resolveValue = () => {
      if (op === 'select' && table === 'orchestration_steps') {
        return { data: stuckSteps, error: null }
      }
      return { data: null, error: null }
    }

    const chain: Record<string, unknown> = {}
    chain.update = vi.fn((row: Record<string, unknown>) => {
      op = 'update'
      payload = row
      return chain
    })
    chain.select = vi.fn(() => {
      if (op === null) op = 'select'
      return chain
    })
    chain.eq = vi.fn((col: string, val: unknown) => {
      filters[`eq:${col}`] = val
      return chain
    })
    chain.in = vi.fn((col: string, val: unknown) => {
      filters[`in:${col}`] = val
      return chain
    })
    chain.lt = vi.fn((col: string, val: unknown) => {
      filters[`lt:${col}`] = val
      return chain
    })
    // Thenable: capture call when awaited so filters reflect the full chain.
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      push()
      return Promise.resolve(resolveValue()).then(resolve, reject)
    }
    return chain
  }

  return {
    supabase: { from: vi.fn((table: string) => makeChain(table)) },
    calls,
  }
}

describe('OrphanDetector — orchestration_steps recovery', () => {
  let detector: OrphanDetector
  let queue: PulseQueue

  beforeEach(() => {
    vi.clearAllMocks()
    incPulseOrphanedStepsMock.mockReset()
    queue = new PulseQueue()
  })

  afterEach(() => {
    detector?.stop()
  })

  it('SELECTs stuck claimed steps then per-row UPDATEs them with attempt+1', async () => {
    const stuck = [
      {
        id: 'step-1',
        run_id: 'run-1',
        event_id: 'evt-1',
        agent_id: 'agent-1',
        org_id: 'org-1',
        dag_node_id: 'node-1',
        attempt: 0,
      },
      {
        id: 'step-2',
        run_id: 'run-2',
        event_id: 'evt-2',
        agent_id: 'agent-1',
        org_id: 'org-1',
        dag_node_id: null,
        attempt: 2,
      },
    ]
    const { supabase, calls } = buildSupabaseStub(stuck)
    detector = new OrphanDetector(queue, supabase as never)

    const result = await detector.detect()
    expect(result.orphansFound).toBe(0)

    const stepCalls = calls.filter((c) => c.table === 'orchestration_steps')
    // Expect: 1 SELECT scan + 2 UPDATEs (one per stuck row)
    const selects = stepCalls.filter((c) => c.op === 'select')
    const updates = stepCalls.filter((c) => c.op === 'update')

    expect(selects).toHaveLength(1)
    expect(selects[0].filters['eq:status']).toBe('claimed')
    expect(typeof selects[0].filters['lt:started_at']).toBe('string')

    expect(updates).toHaveLength(2)
    // Each update bumps attempt and resets to pending with marker.
    expect(updates[0].payload).toEqual({
      status: 'pending',
      attempt: 1, // 0 + 1
      error_message: 'orphaned-by-detector',
    })
    expect(updates[1].payload).toEqual({
      status: 'pending',
      attempt: 3, // 2 + 1
      error_message: 'orphaned-by-detector',
    })
    // Updates target by id and re-check status to avoid clobbering a concurrent transition.
    expect(updates[0].filters['eq:id']).toBe('step-1')
    expect(updates[0].filters['eq:status']).toBe('claimed')
    expect(updates[1].filters['eq:id']).toBe('step-2')

    expect(incPulseOrphanedStepsMock).toHaveBeenCalledWith(2)
  })

  it('does not increment when no stuck steps are returned', async () => {
    const { supabase } = buildSupabaseStub([])
    detector = new OrphanDetector(queue, supabase as never)

    await detector.detect()
    expect(incPulseOrphanedStepsMock).not.toHaveBeenCalled()
  })

  it('skips step recovery entirely when no supabase client is provided', async () => {
    detector = new OrphanDetector(queue)
    const result = await detector.detect()
    expect(result.orphansFound).toBe(0)
    expect(incPulseOrphanedStepsMock).not.toHaveBeenCalled()
  })
})
