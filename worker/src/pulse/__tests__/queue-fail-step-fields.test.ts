/**
 * Regression test — PulseQueue.fail() must preserve step + DAG fields on retry.
 *
 * Bug history (Phase 4N-0): the retry path in fail() called enqueue() with a
 * narrowed shape that dropped stepType, stepId, webhookUrl, webhookPayload,
 * approvalConfig, dagId, and dagNodeId — silently breaking step executors
 * on every retry. The fix spreads the original PulseJob via enqueueRetry().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Redis Mock ──────────────────────────────────────────────────────────────

const { mockPipeline, mockRedis, capturedZaddMembers } = vi.hoisted(() => {
  const capturedZaddMembers: Array<{ key: string; member: string; score: number }> = []

  const mockPipeline = {
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
    srem: vi.fn().mockReturnThis(),
    hincrby: vi.fn().mockReturnThis(),
    rpush: vi.fn().mockReturnThis(),
    ltrim: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    xack: vi.fn().mockReturnThis(),
    xadd: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([1, true]),
  }

  const mockRedis = {
    zadd: vi.fn(async (key: string, _opts: unknown, entry: { score: number; member: string }) => {
      capturedZaddMembers.push({ key, member: entry.member, score: entry.score })
      return 1
    }),
    set: vi.fn().mockResolvedValue('OK'),
    xadd: vi.fn().mockResolvedValue('1234567890-0'),
    xreadgroup: vi.fn().mockResolvedValue(null),
    xack: vi.fn().mockResolvedValue(1),
    del: vi.fn().mockResolvedValue(1),
    // eval is used for fenced lease release (CONDITIONAL_DEL_LUA → 1) and floor decr.
    eval: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
    expire: vi.fn().mockResolvedValue(true),
    srem: vi.fn().mockResolvedValue(1),
    hincrby: vi.fn().mockResolvedValue(1),
    scard: vi.fn().mockResolvedValue(0),
    hgetall: vi.fn().mockResolvedValue(null),
    pipeline: vi.fn(() => ({ ...mockPipeline, exec: vi.fn().mockResolvedValue([1, true]) })),
  }

  return { mockPipeline, mockRedis, capturedZaddMembers }
})

vi.mock('../redis.js', () => ({
  getPulseRedis: vi.fn().mockResolvedValue(mockRedis),
}))

vi.mock('../agent-runs.js', () => ({
  recordDlq: vi.fn(),
  recordComplete: vi.fn(),
  recordClaim: vi.fn(),
  recordFail: vi.fn(),
}))

import { PulseQueue } from '../queue.js'
import type { PulseJob } from '../types.js'

describe('PulseQueue.fail() — step + DAG field preservation on retry', () => {
  let queue: PulseQueue

  beforeEach(() => {
    vi.clearAllMocks()
    capturedZaddMembers.length = 0
    mockRedis.zadd.mockImplementation(async (key: string, _opts: unknown, entry: { score: number; member: string }) => {
      capturedZaddMembers.push({ key, member: entry.member, score: entry.score })
      return 1
    })
    mockRedis.eval.mockResolvedValue(1)
    mockRedis.srem.mockResolvedValue(1)
    mockRedis.set.mockResolvedValue('OK')
    queue = new PulseQueue({ maxConcurrentPerAgent: 3, maxAttempts: 5 })
  })

  it('preserves webhook step fields (stepType, stepId, webhookUrl, webhookPayload) and DAG fields on retry', async () => {
    const job: PulseJob = {
      runId: 'evt-webhook-1:0',
      eventId: 'evt-webhook-1',
      eventType: 'inbound',
      agentId: 'agent-1',
      orgId: 'org-1',
      priority: 'normal',
      attempt: 0,
      enqueuedAt: Date.now(),
      stepType: 'webhook',
      stepId: 'step-uuid-1',
      webhookUrl: 'https://example.com/hook',
      webhookPayload: JSON.stringify({ foo: 'bar', n: 42 }),
      dagId: 'dag-uuid-1',
      dagNodeId: 'dag-node-uuid-1',
    }

    const outcome = await queue.fail(job, 'worker-1', 'transient failure')

    expect(outcome).toBe('retried')
    // Retry goes to retry ZSET via enqueueRetry()
    expect(capturedZaddMembers).toHaveLength(1)

    const retried = JSON.parse(capturedZaddMembers[0].member) as PulseJob
    expect(retried.attempt).toBe(1)
    expect(retried.runId).toBe('evt-webhook-1:1')
    expect(retried.eventId).toBe('evt-webhook-1')
    expect(retried.eventType).toBe('inbound')
    expect(retried.agentId).toBe('agent-1')
    expect(retried.orgId).toBe('org-1')

    // Step fields preserved
    expect(retried.stepType).toBe('webhook')
    expect(retried.stepId).toBe('step-uuid-1')
    expect(retried.webhookUrl).toBe('https://example.com/hook')
    expect(retried.webhookPayload).toBe(JSON.stringify({ foo: 'bar', n: 42 }))

    // DAG fields preserved (Phase 4N-0 contract extension)
    expect(retried.dagId).toBe('dag-uuid-1')
    expect(retried.dagNodeId).toBe('dag-node-uuid-1')
  })

  it('preserves approvalConfig on retry', async () => {
    const job: PulseJob = {
      runId: 'evt-approval-1:1',
      eventId: 'evt-approval-1',
      eventType: 'inbound',
      agentId: 'agent-1',
      orgId: 'org-1',
      priority: 'critical',
      attempt: 1,
      enqueuedAt: Date.now(),
      stepType: 'approval',
      stepId: 'step-uuid-2',
      approvalConfig: {
        toolName: 'wallet_transfer',
        toolArgs: { to: '0xabc', amount: '100' },
        timeoutSeconds: 300,
      },
      dagId: 'dag-uuid-2',
      dagNodeId: 'dag-node-uuid-2',
    }

    const outcome = await queue.fail(job, 'worker-2', 'approval timeout')

    expect(outcome).toBe('retried')
    expect(capturedZaddMembers).toHaveLength(1)

    const retried = JSON.parse(capturedZaddMembers[0].member) as PulseJob
    expect(retried.attempt).toBe(2)
    expect(retried.runId).toBe('evt-approval-1:2')
    expect(retried.stepType).toBe('approval')
    expect(retried.stepId).toBe('step-uuid-2')
    expect(retried.approvalConfig).toEqual({
      toolName: 'wallet_transfer',
      toolArgs: { to: '0xabc', amount: '100' },
      timeoutSeconds: 300,
    })
    expect(retried.dagId).toBe('dag-uuid-2')
    expect(retried.dagNodeId).toBe('dag-node-uuid-2')
  })

  it('preserves step + DAG fields on claim() over-limit re-enqueue (without consuming a retry)', async () => {
    const claimedJob: PulseJob = {
      runId: 'evt-overlimit-1:0',
      eventId: 'evt-overlimit-1',
      eventType: 'inbound',
      agentId: 'agent-overlimit',
      orgId: 'org-1',
      priority: 'normal',
      attempt: 0,
      enqueuedAt: Date.now(),
      stepType: 'webhook',
      stepId: 'step-uuid-overlimit',
      webhookUrl: 'https://example.com/over',
      webhookPayload: JSON.stringify({ k: 'v' }),
      dagId: 'dag-uuid-overlimit',
      dagNodeId: 'dag-node-uuid-overlimit',
    }

    // XREADGROUP returns the job from the normal stream
    mockRedis.xreadgroup.mockResolvedValueOnce([
      ['pulse:stream:{inbound}:normal', [['1234567890-0', ['job', JSON.stringify(claimedJob)]]]],
    ])
    // Critical stream returns null
    mockRedis.xreadgroup.mockResolvedValueOnce(null)

    // eval: FLOOR_DECR_LUA returns 0
    mockRedis.eval.mockResolvedValue(0)

    // Pipeline INCR returns inflight = 4 (over the maxConcurrentPerAgent=3 limit)
    mockRedis.pipeline.mockImplementation(() => ({
      ...mockPipeline,
      exec: vi.fn().mockResolvedValue([4, true]),
    }))

    const result = await queue.claim('inbound', 'worker-overlimit')

    // Over-limit path returns null (job re-enqueued, not claimed)
    expect(result).toBeNull()

    // Raw XADD for the over-limit re-enqueue (bypasses dedup)
    expect(mockRedis.xadd).toHaveBeenCalled()
    const xaddCall = mockRedis.xadd.mock.calls[0]
    const reenqueued = JSON.parse(xaddCall[2].job) as PulseJob

    // Same attempt — over-limit must NOT consume a retry slot
    expect(reenqueued.attempt).toBe(0)

    // Step + DAG fields preserved
    expect(reenqueued.stepType).toBe('webhook')
    expect(reenqueued.stepId).toBe('step-uuid-overlimit')
    expect(reenqueued.webhookUrl).toBe('https://example.com/over')
    expect(reenqueued.webhookPayload).toBe(JSON.stringify({ k: 'v' }))
    expect(reenqueued.dagId).toBe('dag-uuid-overlimit')
    expect(reenqueued.dagNodeId).toBe('dag-node-uuid-overlimit')

    // Re-enqueued to the normal stream (same priority, not background)
    expect(xaddCall[0]).toBe('pulse:stream:{inbound}:normal')
  })

  it('routes retry to background priority lane', async () => {
    const job: PulseJob = {
      runId: 'evt-3:0',
      eventId: 'evt-3',
      eventType: 'inbound',
      agentId: 'agent-3',
      orgId: 'org-3',
      priority: 'normal',
      attempt: 0,
      enqueuedAt: Date.now(),
      stepType: 'webhook',
      webhookUrl: 'https://example.com/x',
    }

    await queue.fail(job, 'worker-3', 'err')

    expect(capturedZaddMembers).toHaveLength(1)
    // Retry goes to background retry ZSET
    expect(capturedZaddMembers[0].key).toBe('pulse:retry:{inbound}')

    // Parse the member to verify background priority
    const retried = JSON.parse(capturedZaddMembers[0].member) as PulseJob
    expect(retried.priority).toBe('background')
  })
})
