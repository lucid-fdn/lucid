/**
 * Pulse Queue — Unit Tests (Streams API)
 *
 * Tests: enqueue (SET NX dedup + XADD), claim flow (XREADGROUP + postClaimFlow),
 * complete fencing, fail + retry, DLQ, per-agent concurrency, lease renewal, metrics.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Redis Mock ──────────────────────────────────────────────────────────────

const { mockPipeline, mockRedis } = vi.hoisted(() => {
  const mockPipeline = {
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
    srem: vi.fn().mockReturnThis(),
    hincrby: vi.fn().mockReturnThis(),
    rpush: vi.fn().mockReturnThis(),
    ltrim: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([1, true]),
  }

  const mockRedis = {
    set: vi.fn().mockResolvedValue('OK'),
    xadd: vi.fn().mockResolvedValue('1234567890-0'),
    xreadgroup: vi.fn().mockResolvedValue(null),
    xack: vi.fn().mockResolvedValue(1),
    xlen: vi.fn().mockResolvedValue(0),
    xpending: vi.fn().mockResolvedValue({ pending: 0, minId: null, maxId: null, consumers: [] }),
    xinfoGroups: vi.fn().mockResolvedValue([{ name: 'pulse-workers', consumers: 0, pending: 0, lastDeliveredId: null, entriesRead: null, lag: 0 }]),
    zadd: vi.fn().mockResolvedValue(1),
    eval: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
    expire: vi.fn().mockResolvedValue(true),
    srem: vi.fn().mockResolvedValue(1),
    scard: vi.fn().mockResolvedValue(0),
    hincrby: vi.fn().mockResolvedValue(1),
    hgetall: vi.fn().mockResolvedValue(null),
    pipeline: vi.fn(() => ({ ...mockPipeline, exec: vi.fn().mockResolvedValue([1, true]) })),
  }

  return { mockPipeline, mockRedis }
})

vi.mock('../redis.js', () => ({
  getPulseRedis: vi.fn().mockResolvedValue(mockRedis),
}))

import { PulseQueue } from '../queue.js'
import { PulseKeys } from '../types.js'

describe('PulseQueue', () => {
  let queue: PulseQueue

  beforeEach(() => {
    vi.clearAllMocks()
    // Re-apply default implementations cleared by test-local mockImplementation overrides
    mockRedis.set.mockResolvedValue('OK')
    mockRedis.xadd.mockResolvedValue('1234567890-0')
    mockRedis.xreadgroup.mockResolvedValue(null)
    mockRedis.xack.mockResolvedValue(1)
    mockRedis.xlen.mockResolvedValue(0)
    mockRedis.xpending.mockResolvedValue({ pending: 0, minId: null, maxId: null, consumers: [] })
    mockRedis.xinfoGroups.mockResolvedValue([{ name: 'pulse-workers', consumers: 0, pending: 0, lastDeliveredId: null, entriesRead: null, lag: 0 }])
    mockRedis.zadd.mockResolvedValue(1)
    mockRedis.eval.mockResolvedValue(null)
    mockRedis.del.mockResolvedValue(1)
    mockRedis.get.mockResolvedValue(null)
    mockRedis.expire.mockResolvedValue(true)
    mockRedis.srem.mockResolvedValue(1)
    mockRedis.scard.mockResolvedValue(0)
    mockRedis.hincrby.mockResolvedValue(1)
    mockRedis.hgetall.mockResolvedValue(null)
    mockRedis.pipeline.mockImplementation(() => ({ ...mockPipeline, exec: vi.fn().mockResolvedValue([1, true]) }))
    mockPipeline.incr.mockReturnThis()
    mockPipeline.expire.mockReturnThis()
    mockPipeline.set.mockReturnThis()
    mockPipeline.sadd.mockReturnThis()
    mockPipeline.srem.mockReturnThis()
    mockPipeline.hincrby.mockReturnThis()
    mockPipeline.rpush.mockReturnThis()
    mockPipeline.ltrim.mockReturnThis()
    queue = new PulseQueue({ maxConcurrentPerAgent: 3, maxAttempts: 3 })
  })

  // ─── Enqueue ───────────────────────────────────────────────────────────

  describe('enqueue', () => {
    it('should dedup via SET NX and XADD to the correct stream', async () => {
      const result = await queue.enqueue({
        eventId: 'evt-1',
        eventType: 'inbound',
        agentId: 'agent-1',
        orgId: 'org-1',
        priority: 'normal',
      })

      expect(result).toBe(true)
      // Dedup: SET NX with 5-minute TTL
      expect(mockRedis.set).toHaveBeenCalledWith(
        'pulse:dedup:evt-1:0',
        '1',
        { nx: true, ex: 300 },
      )
      // XADD to stream
      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'pulse:stream:{inbound}:normal',
        '*',
        { job: expect.any(String) },
        { maxlen: 10_000, approximate: true },
      )
    })

    it('should return false when dedup check fails (already enqueued)', async () => {
      mockRedis.set.mockResolvedValueOnce(null) // NX fails — already exists

      const result = await queue.enqueue({
        eventId: 'evt-1',
        eventType: 'inbound',
        agentId: 'agent-1',
        orgId: 'org-1',
      })

      expect(result).toBe(false)
      // Should NOT call XADD when dedup fails
      expect(mockRedis.xadd).not.toHaveBeenCalled()
    })

    it('should classify retries as background priority via enqueueRetry (ZADD to retry ZSET)', async () => {
      // enqueueRetry is private, tested indirectly through fail() path
      // Direct enqueue with attempt > 0 goes to background stream
      await queue.enqueue({
        eventId: 'evt-1',
        eventType: 'inbound',
        agentId: 'agent-1',
        orgId: 'org-1',
        priority: 'critical',
        attempt: 2,
      })

      // Retries via enqueue() go to background stream (not retry ZSET)
      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'pulse:stream:{inbound}:background',
        '*',
        expect.anything(),
        expect.anything(),
      )
    })

    it('should default to normal priority', async () => {
      await queue.enqueue({
        eventId: 'evt-1',
        eventType: 'outbound',
        agentId: 'agent-1',
        orgId: 'org-1',
      })

      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'pulse:stream:{outbound}:normal',
        '*',
        expect.anything(),
        expect.anything(),
      )
    })

    it('should return false when Redis is unavailable', async () => {
      const { getPulseRedis } = await import('../redis.js')
      vi.mocked(getPulseRedis).mockResolvedValueOnce(null)

      const result = await queue.enqueue({
        eventId: 'evt-1',
        eventType: 'inbound',
        agentId: 'agent-1',
        orgId: 'org-1',
      })

      expect(result).toBe(false)
    })
  })

  // ─── Enqueue Retry (via fail path) ──────────────────────────────────────

  describe('enqueueRetry (via fail)', () => {
    it('should use ZADD to retry ZSET with delayed score', async () => {
      mockRedis.eval
        .mockResolvedValueOnce(1) // conditional-del
        .mockResolvedValueOnce(0) // floor-decr
      mockRedis.set.mockResolvedValue('OK') // dedup for retry
      mockRedis.zadd.mockResolvedValue(1) // retry ZADD

      const job = {
        runId: 'run-1',
        eventId: 'evt-1',
        eventType: 'inbound' as const,
        agentId: 'agent-1',
        orgId: 'org-1',
        priority: 'normal' as const,
        attempt: 0,
        enqueuedAt: Date.now(),
      }

      await queue.fail(job, 'worker-1', 'test error')

      // Should ZADD to retry ZSET with delayed score
      expect(mockRedis.zadd).toHaveBeenCalledWith(
        'pulse:retry:{inbound}',
        { nx: true },
        expect.objectContaining({
          score: expect.any(Number),
          member: expect.any(String),
        }),
      )

      // Verify delayed score: attempt 1 * 5000ms base delay
      const zaddCall = mockRedis.zadd.mock.calls[0]
      const score = zaddCall[2].score
      expect(score).toBeGreaterThan(Date.now() + 4000) // 1 * 5000ms delay minus test drift
    })

    it('should dedup retry via SET NX before ZADD', async () => {
      mockRedis.eval
        .mockResolvedValueOnce(1) // conditional-del
        .mockResolvedValueOnce(0) // floor-decr

      const job = {
        runId: 'run-1',
        eventId: 'evt-1',
        eventType: 'inbound' as const,
        agentId: 'agent-1',
        orgId: 'org-1',
        priority: 'normal' as const,
        attempt: 0,
        enqueuedAt: Date.now(),
      }

      await queue.fail(job, 'worker-1', 'test error')

      // Should SET NX dedup key for retry attempt
      expect(mockRedis.set).toHaveBeenCalledWith(
        'pulse:dedup:evt-1:1', // eventId:nextAttempt
        '1',
        { nx: true, ex: 300 },
      )
    })
  })

  // ─── Claim ─────────────────────────────────────────────────────────────

  describe('claim', () => {
    it('should return null when queue is empty (xreadgroup returns null)', async () => {
      mockRedis.xreadgroup.mockResolvedValue(null)

      const result = await queue.claim('inbound', 'worker-1')
      expect(result).toBeNull()
    })

    it('should claim a job and set up lease via postClaimFlow', async () => {
      const job = {
        runId: 'evt-1:0',
        eventId: 'evt-1',
        eventType: 'inbound',
        agentId: 'agent-1',
        orgId: 'org-1',
        priority: 'normal',
        attempt: 0,
        enqueuedAt: Date.now(),
      }

      // claimNonBlocking tries critical first, then normal, then background
      // Return null for critical, valid entry for normal
      mockRedis.xreadgroup
        .mockResolvedValueOnce(null) // critical — empty
        .mockResolvedValueOnce([    // normal — has a job
          ['pulse:stream:{inbound}:normal', [['1234567890-0', ['job', JSON.stringify(job)]]]],
        ])

      // Pipeline for INCR + EXPIRE returns [1, true] (inflight = 1, under limit)
      const pipeExec1 = vi.fn().mockResolvedValue([1, true])
      // Pipeline for SET lease NX + SADD returns ['OK', 1]
      const pipeExec2 = vi.fn().mockResolvedValue(['OK', 1])
      // Pipeline for metrics hincrby + expire
      const pipeExec3 = vi.fn().mockResolvedValue([1, true])

      let pipeCallCount = 0
      mockRedis.pipeline.mockImplementation(() => {
        pipeCallCount++
        return {
          incr: vi.fn().mockReturnThis(),
          expire: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          sadd: vi.fn().mockReturnThis(),
          hincrby: vi.fn().mockReturnThis(),
          exec: pipeCallCount === 1 ? pipeExec1 : pipeCallCount === 2 ? pipeExec2 : pipeExec3,
        }
      })

      const result = await queue.claim('inbound', 'worker-1')
      expect(result).toMatchObject(job)
      expect(result?.streamEntry).toEqual({
        streamKey: 'pulse:stream:{inbound}:normal',
        entryId: '1234567890-0',
      })
      // Should XACK only after postClaimFlow acquired the lease.
      expect(mockRedis.xack).toHaveBeenCalledWith(
        'pulse:stream:{inbound}:normal',
        'pulse-workers',
        '1234567890-0',
      )
    })

    it('should reject claim when agent is at concurrency limit', async () => {
      const job = {
        runId: 'evt-1:0',
        eventId: 'evt-1',
        eventType: 'inbound',
        agentId: 'agent-1',
        orgId: 'org-1',
        priority: 'normal',
        attempt: 0,
        enqueuedAt: Date.now(),
      }

      // Return a valid job from critical stream
      mockRedis.xreadgroup.mockResolvedValueOnce([
        ['pulse:stream:{inbound}:critical', [['1234567890-0', ['job', JSON.stringify(job)]]]],
      ])

      // floor-decr for over-limit rollback
      mockRedis.eval.mockResolvedValueOnce(0)

      // Pipeline returns inflight = 4 (> limit of 3)
      const pipeExec = vi.fn().mockResolvedValue([4, true])
      mockRedis.pipeline.mockImplementation(() => ({
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: pipeExec,
      }))

      const result = await queue.claim('inbound', 'worker-1')
      expect(result).toBeNull()
      // Should have called floor-DECR to rollback inflight counter
      expect(mockRedis.eval).toHaveBeenCalledTimes(1)
    })

    it('should sweep all 3 priority streams in order', async () => {
      // All streams empty
      mockRedis.xreadgroup
        .mockResolvedValueOnce(null) // critical
        .mockResolvedValueOnce(null) // normal
        .mockResolvedValueOnce(null) // background

      await queue.claim('inbound', 'worker-1')

      // Should have called xreadgroup 3 times for priority sweep
      expect(mockRedis.xreadgroup).toHaveBeenCalledTimes(3)
      expect(mockRedis.xreadgroup).toHaveBeenNthCalledWith(
        1, 'pulse-workers', 'worker-1',
        ['pulse:stream:{inbound}:critical'], ['>'],
        { count: 1 },
      )
      expect(mockRedis.xreadgroup).toHaveBeenNthCalledWith(
        2, 'pulse-workers', 'worker-1',
        ['pulse:stream:{inbound}:normal'], ['>'],
        { count: 1 },
      )
      expect(mockRedis.xreadgroup).toHaveBeenNthCalledWith(
        3, 'pulse-workers', 'worker-1',
        ['pulse:stream:{inbound}:background'], ['>'],
        { count: 1 },
      )
    })
  })

  // ─── claimNonBlocking ─────────────────────────────────────────────────

  describe('claimNonBlocking', () => {
    it('should return null when xreadgroup returns null', async () => {
      mockRedis.xreadgroup.mockResolvedValueOnce(null)

      const result = await queue.claimNonBlocking('inbound', 'worker-1', 'normal')
      expect(result).toBeNull()
    })

    it('should return null when xreadgroup returns empty array', async () => {
      mockRedis.xreadgroup.mockResolvedValueOnce([])

      const result = await queue.claimNonBlocking('inbound', 'worker-1', 'normal')
      expect(result).toBeNull()
    })

    it('should parse stream entry and defer XACK metadata until lease setup', async () => {
      const job = {
        runId: 'evt-1:0',
        eventId: 'evt-1',
        eventType: 'inbound',
        agentId: 'agent-1',
        orgId: 'org-1',
        priority: 'normal',
        attempt: 0,
        enqueuedAt: Date.now(),
      }

      mockRedis.xreadgroup.mockResolvedValueOnce([
        ['pulse:stream:{inbound}:normal', [['9999-0', ['job', JSON.stringify(job)]]]],
      ])

      const result = await queue.claimNonBlocking('inbound', 'worker-1', 'normal')
      expect(result).toMatchObject(job)
      expect(result?.streamEntry).toEqual({
        streamKey: 'pulse:stream:{inbound}:normal',
        entryId: '9999-0',
      })
      expect(mockRedis.xack).not.toHaveBeenCalled()
    })
  })

  // ─── Complete ──────────────────────────────────────────────────────────

  describe('complete', () => {
    it('should complete a job with fenced lease release', async () => {
      mockRedis.eval
        .mockResolvedValueOnce(1) // conditional-del returns 1 (success)
        .mockResolvedValueOnce(0) // floor-decr

      const job = {
        runId: 'run-1',
        eventId: 'evt-1',
        eventType: 'inbound' as const,
        agentId: 'agent-1',
        orgId: 'org-1',
        priority: 'normal' as const,
        attempt: 0,
        enqueuedAt: Date.now(),
      }

      const result = await queue.complete(job, 'worker-1')
      expect(result).toBe(true)
      // Should SREM active set before DECR (prevents orphan double-DECR race)
      expect(mockRedis.srem).toHaveBeenCalledWith('pulse:active', 'run-1')
      expect(mockRedis.eval).toHaveBeenCalledTimes(2) // conditional-del + floor-decr
    })

    it('should return false for stale worker', async () => {
      mockRedis.eval.mockResolvedValueOnce(0) // conditional-del returns 0 (stale)

      const job = {
        runId: 'run-1',
        eventId: 'evt-1',
        eventType: 'inbound' as const,
        agentId: 'agent-1',
        orgId: 'org-1',
        priority: 'normal' as const,
        attempt: 0,
        enqueuedAt: Date.now(),
      }

      const result = await queue.complete(job, 'stale-worker')
      expect(result).toBe(false)
      // Should NOT call srem or floor-decr for stale worker
      expect(mockRedis.srem).not.toHaveBeenCalled()
    })
  })

  // ─── Fail ──────────────────────────────────────────────────────────────

  describe('fail', () => {
    it('should retry when under max attempts', async () => {
      mockRedis.eval
        .mockResolvedValueOnce(1) // conditional-del
        .mockResolvedValueOnce(0) // floor-decr
      mockRedis.set.mockResolvedValue('OK') // dedup for retry
      mockRedis.zadd.mockResolvedValue(1) // retry ZADD

      const job = {
        runId: 'run-1',
        eventId: 'evt-1',
        eventType: 'inbound' as const,
        agentId: 'agent-1',
        orgId: 'org-1',
        priority: 'normal' as const,
        attempt: 0,
        enqueuedAt: Date.now(),
      }

      const result = await queue.fail(job, 'worker-1', 'test error')
      expect(result).toBe('retried')
      // Should SREM before DECR
      expect(mockRedis.srem).toHaveBeenCalledWith('pulse:active', 'run-1')
      // Should ZADD to retry ZSET (not XADD to stream)
      expect(mockRedis.zadd).toHaveBeenCalledWith(
        'pulse:retry:{inbound}',
        { nx: true },
        expect.objectContaining({ score: expect.any(Number), member: expect.any(String) }),
      )
    })

    it('should DLQ when max attempts exceeded', async () => {
      mockRedis.eval
        .mockResolvedValueOnce(1) // conditional-del
        .mockResolvedValueOnce(0) // floor-decr

      const job = {
        runId: 'run-1',
        eventId: 'evt-1',
        eventType: 'inbound' as const,
        agentId: 'agent-1',
        orgId: 'org-1',
        priority: 'normal' as const,
        attempt: 2, // maxAttempts is 3, so attempt 2 + 1 = 3 >= 3
        enqueuedAt: Date.now(),
      }

      const result = await queue.fail(job, 'worker-1', 'final failure')
      expect(result).toBe('dlq')
    })

    it('should return stale for fenced failure', async () => {
      mockRedis.eval.mockResolvedValueOnce(0) // conditional-del returns 0

      const job = {
        runId: 'run-1',
        eventId: 'evt-1',
        eventType: 'inbound' as const,
        agentId: 'agent-1',
        orgId: 'org-1',
        priority: 'normal' as const,
        attempt: 0,
        enqueuedAt: Date.now(),
      }

      const result = await queue.fail(job, 'stale-worker')
      expect(result).toBe('stale')
      expect(mockRedis.srem).not.toHaveBeenCalled()
    })
  })

  // ─── Lease Renewal ─────────────────────────────────────────────────────

  describe('renewLease', () => {
    it('should renew if owned by worker (atomic Lua)', async () => {
      // RENEW_LEASE_LUA returns 1 on success
      mockRedis.eval.mockResolvedValueOnce(1)

      const result = await queue.renewLease('run-1', 'worker-1')
      expect(result).toBe(true)
      // Should use eval with RENEW_LEASE_LUA, lease key, workerId, TTL
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('EXPIRE'),
        ['pulse:lease:run-1'],
        ['worker-1', '60'],
      )
    })

    it('should reject renewal for different worker', async () => {
      // RENEW_LEASE_LUA returns 0 when workerId doesn't match
      mockRedis.eval.mockResolvedValueOnce(0)

      const result = await queue.renewLease('run-1', 'worker-2')
      expect(result).toBe(false)
    })

    it('should return false for expired lease', async () => {
      // RENEW_LEASE_LUA returns 0 when key doesn't exist
      mockRedis.eval.mockResolvedValueOnce(0)

      const result = await queue.renewLease('run-1', 'worker-1')
      expect(result).toBe(false)
    })
  })

  // ─── Queue Depth ───────────────────────────────────────────────────────

  describe('getQueueDepth', () => {
    it('should sum XLEN across all priority streams', async () => {
      mockRedis.xlen
        .mockResolvedValueOnce(5)   // critical
        .mockResolvedValueOnce(10)  // normal
        .mockResolvedValueOnce(2)   // background

      const depth = await queue.getQueueDepth('inbound')
      expect(depth).toBe(17)
      // Should call XLEN on each priority stream
      expect(mockRedis.xlen).toHaveBeenCalledWith('pulse:stream:{inbound}:critical')
      expect(mockRedis.xlen).toHaveBeenCalledWith('pulse:stream:{inbound}:normal')
      expect(mockRedis.xlen).toHaveBeenCalledWith('pulse:stream:{inbound}:background')
    })

    it('should return 0 when Redis is unavailable', async () => {
      const { getPulseRedis } = await import('../redis.js')
      vi.mocked(getPulseRedis).mockResolvedValueOnce(null)

      const depth = await queue.getQueueDepth('inbound')
      expect(depth).toBe(0)
    })
  })

  describe('getQueueBacklog', () => {
    it('should expose stream length, pending, lag, and active backlog separately', async () => {
      mockRedis.xlen
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(25)
      mockRedis.xpending
        .mockResolvedValueOnce({ pending: 2, minId: '1-0', maxId: '2-0', consumers: [{ name: 'w1', pending: 2 }] })
        .mockResolvedValueOnce({ pending: 1, minId: '3-0', maxId: '3-0', consumers: [{ name: 'w2', pending: 1 }] })
        .mockResolvedValueOnce({ pending: 0, minId: null, maxId: null, consumers: [] })
      mockRedis.xinfoGroups
        .mockResolvedValueOnce([{ name: 'pulse-workers', consumers: 1, pending: 2, lastDeliveredId: '100-0', entriesRead: 100, lag: 4 }])
        .mockResolvedValueOnce([{ name: 'pulse-workers', consumers: 2, pending: 1, lastDeliveredId: '50-0', entriesRead: 50, lag: 3 }])
        .mockResolvedValueOnce([{ name: 'pulse-workers', consumers: 0, pending: 0, lastDeliveredId: '25-0', entriesRead: 25, lag: 0 }])

      const metrics = await queue.getQueueBacklog('inbound')

      expect(metrics.streamLength).toBe(175)
      expect(metrics.pending).toBe(3)
      expect(metrics.lag).toBe(7)
      expect(metrics.backlog).toBe(10)
      expect(metrics.consumers).toBe(3)
      expect(metrics.groupMissingStreams).toBe(0)
      expect(metrics.priorities.critical.backlog).toBe(6)
      expect(metrics.priorities.normal.backlog).toBe(4)
      expect(metrics.priorities.background.backlog).toBe(0)
    })

    it('should treat missing consumer groups as backlog when streams contain history', async () => {
      mockRedis.xlen
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
      mockRedis.xpending.mockRejectedValue(new Error('NOGROUP No such key'))
      mockRedis.xinfoGroups.mockRejectedValue(new Error('NOGROUP No such key'))

      const metrics = await queue.getQueueBacklog('outbound')

      expect(metrics.streamLength).toBe(2)
      expect(metrics.pending).toBe(0)
      expect(metrics.lag).toBeNull()
      expect(metrics.backlog).toBe(2)
      expect(metrics.groupMissingStreams).toBe(1)
    })

    it('should return empty backlog when Redis is unavailable', async () => {
      const { getPulseRedis } = await import('../redis.js')
      vi.mocked(getPulseRedis).mockResolvedValueOnce(null)

      const metrics = await queue.getQueueBacklog('scheduled')
      expect(metrics.backlog).toBe(0)
      expect(metrics.streamLength).toBe(0)
      expect(metrics.priorities.critical.pending).toBe(0)
    })
  })

  // ─── Keys ──────────────────────────────────────────────────────────────

  describe('PulseKeys', () => {
    it('should generate stream keys', () => {
      expect(PulseKeys.stream('inbound', 'critical')).toBe('pulse:stream:{inbound}:critical')
      expect(PulseKeys.stream('outbound', 'normal')).toBe('pulse:stream:{outbound}:normal')
      expect(PulseKeys.stream('scheduled', 'background')).toBe('pulse:stream:{scheduled}:background')
    })

    it('should generate retry ZSET keys', () => {
      expect(PulseKeys.retry('inbound')).toBe('pulse:retry:{inbound}')
      expect(PulseKeys.retry('outbound')).toBe('pulse:retry:{outbound}')
    })

    it('should generate dedup keys', () => {
      expect(PulseKeys.dedup('evt-123', 0)).toBe('pulse:dedup:evt-123:0')
      expect(PulseKeys.dedup('evt-123', 2)).toBe('pulse:dedup:evt-123:2')
    })

    it('should generate legacy queue keys (deprecated)', () => {
      expect(PulseKeys.queue('inbound', 'critical')).toBe('pulse:{inbound}:critical')
      expect(PulseKeys.queue('outbound', 'normal')).toBe('pulse:{outbound}:normal')
    })

    it('should generate lease keys', () => {
      expect(PulseKeys.lease('run-123')).toBe('pulse:lease:run-123')
    })

    it('should generate daily metrics keys', () => {
      const key = PulseKeys.metrics('2026-04-03')
      expect(key).toBe('pulse:metrics:2026-04-03')
    })

    it('should generate agent inflight keys', () => {
      expect(PulseKeys.agentInflight('agent-1')).toBe('pulse:agent:agent-1:inflight')
    })
  })
})
