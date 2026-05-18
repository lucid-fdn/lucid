/**
 * Pulse E2E Tests — Redis Streams
 *
 * Full lifecycle: enqueue → claim → process → complete.
 * Tests stream-based priority ordering, dedup, and backoff behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Shared Redis State (simulates Redis Streams + SET + STRING + ZSET) ───────

const { mockRedis, clearState } = vi.hoisted(() => {
  // In-memory storage for each Redis data type
  const streams = new Map<string, Array<{ id: string; fields: string[] }>>()
  const keys = new Map<string, string>()
  const sets = new Map<string, Set<string>>()
  const hashes = new Map<string, Map<string, number>>()
  const lists = new Map<string, string[]>()
  const counters = new Map<string, number>()
  const sortedSets = new Map<string, Array<{ score: number; member: string }>>()

  let entryCounter = 0

  function clearState() {
    streams.clear()
    keys.clear()
    sets.clear()
    hashes.clear()
    lists.clear()
    counters.clear()
    sortedSets.clear()
    entryCounter = 0
  }

  const mockRedis: any = {
    // ─── SET with NX support ──────────────────────────────────────────────
    set: vi.fn(async (key: string, value: string, opts?: any) => {
      if (opts?.nx && keys.has(key)) return null
      keys.set(key, value)
      return 'OK'
    }),

    get: vi.fn(async (key: string) => keys.get(key) ?? null),

    del: vi.fn(async (key: string) => {
      const had = keys.has(key)
      keys.delete(key)
      return had ? 1 : 0
    }),

    // ─── XADD — append to stream, return entry ID ────────────────────────
    xadd: vi.fn(async (key: string, _id: string, fieldObj: Record<string, string>, _opts?: any) => {
      if (!streams.has(key)) streams.set(key, [])
      const id = `${Date.now()}-${entryCounter++}`
      // Convert { job: '...' } to flat array ['job', '...']
      const fields: string[] = []
      for (const [k, v] of Object.entries(fieldObj)) {
        fields.push(k, v)
      }
      streams.get(key)!.push({ id, fields })
      return id
    }),

    // ─── XREADGROUP — pop first entry from first non-empty stream ─────────
    xreadgroup: vi.fn(async (
      _group: string,
      _consumer: string,
      streamKeys: string[],
      _ids: string[],
      _opts?: any,
    ) => {
      for (const streamKey of streamKeys) {
        const stream = streams.get(streamKey)
        if (!stream || stream.length === 0) continue
        const entry = stream.shift()!
        return [[streamKey, [[entry.id, entry.fields]]]]
      }
      return null
    }),

    // ─── XACK — always succeeds ──────────────────────────────────────────
    xack: vi.fn(async () => 1),

    // ─── XLEN — stream length ────────────────────────────────────────────
    xlen: vi.fn(async (key: string) => streams.get(key)?.length ?? 0),

    // ─── ZADD — for retry ZSET ───────────────────────────────────────────
    zadd: vi.fn(async (key: string, nxOpts: { nx?: boolean }, scoreOpts: { score: number; member: string }) => {
      if (!sortedSets.has(key)) sortedSets.set(key, [])
      const zset = sortedSets.get(key)!
      if (nxOpts.nx && zset.some(e => e.member === scoreOpts.member)) return 0
      zset.push({ score: scoreOpts.score, member: scoreOpts.member })
      zset.sort((a, b) => a.score - b.score)
      return 1
    }),

    // ─── Eval — Lua scripts ──────────────────────────────────────────────
    eval: vi.fn(async (script: string, luaKeys: string[], args: string[]) => {
      // CONDITIONAL_DEL_LUA — fenced lease release
      if (script.includes('GET') && script.includes('DEL') && script.includes('workerId')) {
        const key = luaKeys[0]
        const val = keys.get(key)
        if (!val) return 0
        try {
          const parsed = JSON.parse(val)
          if (parsed.workerId === args[0]) {
            keys.delete(key)
            return 1
          }
        } catch {
          // not JSON
        }
        return 0
      }
      // FLOOR_DECR_LUA — decrement with floor guard
      if (script.includes('DECR')) {
        const key = luaKeys[0]
        const current = Number(keys.get(key) || '0')
        const next = current - 1
        if (next < 0) { keys.set(key, '0'); return 0 }
        keys.set(key, String(next))
        return next
      }
      // RENEW_LEASE_LUA
      if (script.includes('EXPIRE') && script.includes('workerId')) {
        const key = luaKeys[0]
        const val = keys.get(key)
        if (!val) return 0
        try {
          const parsed = JSON.parse(val)
          if (parsed.workerId === args[0]) return 1
        } catch {
          // no-op
        }
        return 0
      }
      return null
    }),

    // ─── Sets ────────────────────────────────────────────────────────────
    expire: vi.fn(async () => true),
    scard: vi.fn(async (key: string) => sets.get(key)?.size ?? 0),
    sadd: vi.fn(async (key: string, member: string) => {
      if (!sets.has(key)) sets.set(key, new Set())
      sets.get(key)!.add(member)
      return 1
    }),
    srem: vi.fn(async (key: string, member: string) => {
      const s = sets.get(key)
      if (!s) return 0
      return s.delete(member) ? 1 : 0
    }),
    smembers: vi.fn(async (key: string) => [...(sets.get(key) || [])]),

    // ─── Hashes ──────────────────────────────────────────────────────────
    hgetall: vi.fn(async (key: string) => {
      const h = hashes.get(key)
      if (!h) return null
      const obj: Record<string, string> = {}
      for (const [k, v] of h) obj[k] = String(v)
      return obj
    }),
    hincrby: vi.fn(async (key: string, field: string, increment: number) => {
      if (!hashes.has(key)) hashes.set(key, new Map())
      const h = hashes.get(key)!
      const current = h.get(field) || 0
      h.set(field, current + increment)
      return current + increment
    }),

    // ─── Pipeline ────────────────────────────────────────────────────────
    pipeline: vi.fn(),
  }

  mockRedis.pipeline.mockImplementation(() => {
    const ops: Array<() => Promise<any>> = []
    const pipe: any = {
      incr: (key: string) => {
        ops.push(async () => {
          const v = Number(keys.get(key) || '0') + 1
          keys.set(key, String(v))
          return v
        })
        return pipe
      },
      expire: () => { ops.push(async () => true); return pipe },
      set: (key: string, value: string, opts?: any) => {
        ops.push(async () => mockRedis.set(key, value, opts))
        return pipe
      },
      sadd: (key: string, member: string) => {
        ops.push(async () => mockRedis.sadd(key, member))
        return pipe
      },
      srem: (key: string, member: string) => {
        ops.push(async () => mockRedis.srem(key, member))
        return pipe
      },
      hincrby: (key: string, field: string, inc: number) => {
        ops.push(async () => mockRedis.hincrby(key, field, inc))
        return pipe
      },
      rpush: (key: string, value: string) => {
        ops.push(async () => {
          if (!lists.has(key)) lists.set(key, [])
          lists.get(key)!.push(value)
          return lists.get(key)!.length
        })
        return pipe
      },
      ltrim: () => { ops.push(async () => 'OK'); return pipe },
      exec: async () => {
        const results = []
        for (const op of ops) results.push(await op())
        return results
      },
    }
    return pipe
  })

  return { mockRedis, clearState }
})

vi.mock('../redis.js', () => ({
  getPulseRedis: vi.fn().mockResolvedValue(mockRedis),
}))

vi.mock('../../observability/metrics.js', () => ({
  incPulseEnqueued: vi.fn(),
  incPulseClaimed: vi.fn(),
  incPulseCompleted: vi.fn(),
  incPulseFailed: vi.fn(),
  incPulseDlq: vi.fn(),
  recordPulseClaimLatency: vi.fn(),
}))

vi.mock('../../observability/tracing.js', () => ({
  withSpan: async (_name: string, _attrs: Record<string, unknown>, fn: () => Promise<unknown>) => fn(),
}))

vi.mock('../agent-runs.js', () => ({
  recordClaim: vi.fn(),
  recordComplete: vi.fn(),
  recordFail: vi.fn(),
  recordDlq: vi.fn(),
  initAgentRuns: vi.fn(),
}))

import { PulseQueue } from '../queue.js'

describe('Pulse E2E', () => {
  let queue: PulseQueue

  beforeEach(() => {
    clearState()
    vi.clearAllMocks()
    queue = new PulseQueue({ maxConcurrentPerAgent: 3, maxAttempts: 3 })
  })

  it('should process a full lifecycle: enqueue → claim → complete', async () => {
    // Enqueue
    const enqueued = await queue.enqueue({
      eventId: 'evt-1',
      eventType: 'inbound',
      agentId: 'agent-1',
      orgId: 'org-1',
    })
    expect(enqueued).toBe(true)

    // Verify stream has 1 entry (XLEN across all 3 priority streams)
    const depth = await queue.getQueueDepth('inbound')
    expect(depth).toBe(1)

    // Claim
    const job = await queue.claim('inbound', 'worker-1')
    expect(job).not.toBeNull()
    expect(job!.eventId).toBe('evt-1')

    // Queue should be empty after claim (stream entry consumed)
    const depthAfter = await queue.getQueueDepth('inbound')
    expect(depthAfter).toBe(0)

    // Complete
    const completed = await queue.complete(job!, 'worker-1')
    expect(completed).toBe(true)
  })

  it('should respect priority ordering: critical > normal > background', async () => {
    // Enqueue in reverse priority order
    // attempt > 0 forces background priority
    await queue.enqueue({ eventId: 'bg-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1', attempt: 1 })
    await queue.enqueue({ eventId: 'normal-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1', priority: 'normal' })
    await queue.enqueue({ eventId: 'crit-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1', priority: 'critical' })

    // claim() sweeps: critical first, then normal, then background
    const job1 = await queue.claim('inbound', 'worker-1')
    expect(job1!.eventId).toBe('crit-1')

    const job2 = await queue.claim('inbound', 'worker-1')
    expect(job2!.eventId).toBe('normal-1')

    const job3 = await queue.claim('inbound', 'worker-1')
    expect(job3!.eventId).toBe('bg-1')

    // Empty
    const job4 = await queue.claim('inbound', 'worker-1')
    expect(job4).toBeNull()
  })

  it('should handle fail → retry → DLQ lifecycle', async () => {
    await queue.enqueue({ eventId: 'evt-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })

    // Claim and fail (attempt 0 → retry as attempt 1 into retry ZSET)
    const job1 = await queue.claim('inbound', 'worker-1')
    const result1 = await queue.fail(job1!, 'worker-1', 'error 1')
    expect(result1).toBe('retried')

    // fail() uses enqueueRetry() which writes to retry ZSET, not the stream.
    // To simulate RetryDrainer moving it back to stream, we manually re-enqueue.
    // In real usage the RetryDrainer would call reEnqueueRaw().
    // For the test, manually add to stream so claim() can find it:
    const retryJob = { ...job1!, runId: `${job1!.eventId}:1`, attempt: 1, priority: 'background' as const, enqueuedAt: Date.now() }
    const streamKey = `pulse:stream:{inbound}:background`
    await mockRedis.xadd(streamKey, '*', { job: JSON.stringify(retryJob) })

    // Claim retry and fail (attempt 1 → retry as attempt 2)
    const job2 = await queue.claim('inbound', 'worker-1')
    expect(job2).not.toBeNull()
    expect(job2!.attempt).toBe(1)
    const result2 = await queue.fail(job2!, 'worker-1', 'error 2')
    expect(result2).toBe('retried')

    // Re-enqueue attempt 2 into stream (simulating RetryDrainer)
    const retryJob2 = { ...job2!, runId: `${job2!.eventId}:2`, attempt: 2, priority: 'background' as const, enqueuedAt: Date.now() }
    await mockRedis.xadd(streamKey, '*', { job: JSON.stringify(retryJob2) })

    // Claim retry and fail (attempt 2 → DLQ since maxAttempts=3)
    const job3 = await queue.claim('inbound', 'worker-1')
    expect(job3).not.toBeNull()
    expect(job3!.attempt).toBe(2)
    const result3 = await queue.fail(job3!, 'worker-1', 'error 3')
    expect(result3).toBe('dlq')
  })

  it('should enforce per-agent concurrency limit', async () => {
    // Enqueue 4 jobs for the same agent
    for (let i = 0; i < 4; i++) {
      await queue.enqueue({ eventId: `evt-${i}`, eventType: 'inbound', agentId: 'agent-1', orgId: 'org-1' })
    }

    // Claim 3 (limit)
    const job1 = await queue.claim('inbound', 'worker-1')
    const job2 = await queue.claim('inbound', 'worker-1')
    const job3 = await queue.claim('inbound', 'worker-1')
    expect(job1).not.toBeNull()
    expect(job2).not.toBeNull()
    expect(job3).not.toBeNull()

    // 4th should be rejected (re-enqueued via reEnqueueRaw)
    const job4 = await queue.claim('inbound', 'worker-1')
    expect(job4).toBeNull()

    // Complete one → frees a concurrency slot
    await queue.complete(job1!, 'worker-1')

    // Now we can claim another (the re-enqueued 4th job)
    const job5 = await queue.claim('inbound', 'worker-1')
    expect(job5).not.toBeNull()
  })

  it('should deduplicate identical enqueue calls (SET NX)', async () => {
    const first = await queue.enqueue({
      eventId: 'evt-dedup',
      eventType: 'inbound',
      agentId: 'a1',
      orgId: 'o1',
    })
    expect(first).toBe(true)

    // Same eventId + default attempt=0 → dedup key already exists → returns false
    const second = await queue.enqueue({
      eventId: 'evt-dedup',
      eventType: 'inbound',
      agentId: 'a1',
      orgId: 'o1',
    })
    expect(second).toBe(false)

    // Only 1 job in the stream
    const depth = await queue.getQueueDepth('inbound')
    expect(depth).toBe(1)
  })

  it('should track metrics', async () => {
    await queue.enqueue({ eventId: 'evt-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })
    const job = await queue.claim('inbound', 'worker-1')
    await queue.complete(job!, 'worker-1')

    const metrics = await queue.getMetrics()
    expect(metrics.enqueued).toBeGreaterThanOrEqual(1)
    expect(metrics.claimed).toBeGreaterThanOrEqual(1)
    expect(metrics.completed).toBeGreaterThanOrEqual(1)
  })

  it('should return 0 queue depth for empty event types', async () => {
    const depth = await queue.getQueueDepth('outbound')
    expect(depth).toBe(0)
  })

  it('should isolate event types across streams', async () => {
    await queue.enqueue({ eventId: 'in-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })
    await queue.enqueue({ eventId: 'out-1', eventType: 'outbound', agentId: 'a1', orgId: 'o1' })

    expect(await queue.getQueueDepth('inbound')).toBe(1)
    expect(await queue.getQueueDepth('outbound')).toBe(1)

    // Claiming inbound does not affect outbound
    const inJob = await queue.claim('inbound', 'worker-1')
    expect(inJob!.eventId).toBe('in-1')
    expect(await queue.getQueueDepth('outbound')).toBe(1)
  })
})
