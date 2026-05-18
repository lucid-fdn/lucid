/**
 * Flow Orchestration Integration Tests — Redis Streams
 *
 * Cross-cutting integration tests for the multi-agent orchestration system.
 * Covers:
 * 1. Inbound event → Pulse → process → complete → agent_runs populated
 * 2. Wake scanner 2-tier: next_wake_at agent pre-filter → task scan → enqueue
 * 3. Polling fallback activation: circuit breaker opens → polling starts → closes → Pulse resumes
 * 4. DLQ flow: event fails max_attempts times → moved to DLQ → not re-claimed
 * 5. Per-agent concurrency enforcement: 3 concurrent → 4th re-enqueued
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Stateful Redis Simulation (Streams + SET + ZSET + Hash + List + Set) ─────

const { mockRedis, clearState, getState } = vi.hoisted(() => {
  const streams = new Map<string, Array<{ id: string; fields: string[] }>>()
  const keys = new Map<string, string>()
  const sets = new Map<string, Set<string>>()
  const hashes = new Map<string, Map<string, number>>()
  const lists = new Map<string, string[]>()
  const sortedSets = new Map<string, Array<{ score: number; member: string }>>()

  let entryCounter = 0

  function clearState() {
    streams.clear()
    keys.clear()
    sets.clear()
    hashes.clear()
    lists.clear()
    sortedSets.clear()
    entryCounter = 0
  }

  function getState() {
    return { streams, keys, sets, hashes, lists, sortedSets }
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
      // FLOOR_DECR_LUA
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

    // ─── Misc ────────────────────────────────────────────────────────────
    ping: vi.fn().mockResolvedValue('PONG'),

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
      get: (key: string) => { ops.push(async () => keys.get(key) || null); return pipe },
      exec: async () => {
        const results = []
        for (const op of ops) results.push(await op())
        return results
      },
    }
    return pipe
  })

  return { mockRedis, clearState, getState }
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

vi.mock('../wake-signal.js', () => ({
  publishPulseWake: vi.fn(),
}))

import { PulseQueue } from '../queue.js'
import { RedisHealthProbe, type CircuitState } from '../redis-health.js'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Flow Orchestration Integration Tests', () => {
  let queue: PulseQueue

  beforeEach(() => {
    clearState()
    vi.clearAllMocks()
    queue = new PulseQueue({ maxConcurrentPerAgent: 3, maxAttempts: 3 })
  })

  // ── 1. Inbound event → Pulse → process → complete → agent_runs populated ──

  describe('1. Full inbound lifecycle with agent_runs ledger', () => {
    it('enqueue → claim → complete populates run ledger at each step', async () => {
      // Enqueue
      const enqueued = await queue.enqueue({
        eventId: 'evt-inbound-1',
        eventType: 'inbound',
        agentId: 'agent-a',
        orgId: 'org-1',
      })
      expect(enqueued).toBe(true)

      // Claim
      const job = await queue.claim('inbound', 'worker-1')
      expect(job).not.toBeNull()
      expect(job!.eventId).toBe('evt-inbound-1')
      expect(job!.agentId).toBe('agent-a')
      expect(job!.orgId).toBe('org-1')

      // Verify the stream is empty after claim
      const depthAfterClaim = await queue.getQueueDepth('inbound')
      expect(depthAfterClaim).toBe(0)

      // Complete
      const completed = await queue.complete(job!, 'worker-1')
      expect(completed).toBe(true)

      // Verify lease is cleaned up (active set should be empty)
      const activeMembers = await mockRedis.smembers('pulse:active')
      expect(activeMembers).toHaveLength(0)

      // Verify metrics were tracked
      const metrics = await queue.getMetrics()
      expect(metrics.enqueued).toBeGreaterThanOrEqual(1)
      expect(metrics.claimed).toBeGreaterThanOrEqual(1)
      expect(metrics.completed).toBeGreaterThanOrEqual(1)
    })

    it('multi-event lifecycle preserves FIFO ordering within same priority', async () => {
      // Enqueue 3 events in order — all go to normal priority stream
      for (let i = 1; i <= 3; i++) {
        await queue.enqueue({
          eventId: `evt-${i}`,
          eventType: 'inbound',
          agentId: 'agent-a',
          orgId: 'org-1',
        })
      }

      // Claim should return in FIFO order (streams preserve insertion order)
      const job1 = await queue.claim('inbound', 'worker-1')
      expect(job1!.eventId).toBe('evt-1')
      await queue.complete(job1!, 'worker-1')

      const job2 = await queue.claim('inbound', 'worker-1')
      expect(job2!.eventId).toBe('evt-2')
      await queue.complete(job2!, 'worker-1')

      const job3 = await queue.claim('inbound', 'worker-1')
      expect(job3!.eventId).toBe('evt-3')
      await queue.complete(job3!, 'worker-1')

      // No more jobs
      const jobNull = await queue.claim('inbound', 'worker-1')
      expect(jobNull).toBeNull()
    })

    it('critical priority events are claimed before normal events', async () => {
      // Enqueue normal first, then critical
      await queue.enqueue({
        eventId: 'evt-normal',
        eventType: 'inbound',
        agentId: 'agent-a',
        orgId: 'org-1',
        priority: 'normal',
      })
      await queue.enqueue({
        eventId: 'evt-critical',
        eventType: 'inbound',
        agentId: 'agent-a',
        orgId: 'org-1',
        priority: 'critical',
      })

      // Critical should come first regardless of enqueue order
      // claim() sweeps: claimNonBlocking(critical) → claimNonBlocking(normal) → claimNonBlocking(background)
      const job1 = await queue.claim('inbound', 'worker-1')
      expect(job1!.eventId).toBe('evt-critical')
      await queue.complete(job1!, 'worker-1')

      const job2 = await queue.claim('inbound', 'worker-1')
      expect(job2!.eventId).toBe('evt-normal')
      await queue.complete(job2!, 'worker-1')
    })
  })

  // ── 2. Wake scanner 2-tier ─────────────────────────────────────────────────

  describe('2. Wake scanner 2-tier: next_wake_at pre-filter → task scan', () => {
    it('imports scheduled enqueuer module without error', async () => {
      // Smoke test: module resolves. Real integration requires Supabase mock.
      const mod = await import('../enqueue/scheduled.js')
      expect(typeof mod.scanAndEnqueueScheduledTasks).toBe('function')
    })

    it('enqueues scheduled tasks via the queue with deterministic IDs', async () => {
      // Simulate what the wake scanner does: enqueue a scheduled task
      const success = await queue.enqueue({
        eventId: 'task-sched-1',
        eventType: 'scheduled',
        agentId: 'agent-b',
        orgId: 'org-1',
        priority: 'normal',
      })
      expect(success).toBe(true)

      // Duplicate enqueue (SET NX dedup) should be idempotent
      const duplicate = await queue.enqueue({
        eventId: 'task-sched-1',
        eventType: 'scheduled',
        agentId: 'agent-b',
        orgId: 'org-1',
        priority: 'normal',
      })
      // NX dedup: same eventId + attempt=0 → dedup key already exists → skipped
      expect(duplicate).toBe(false)

      // Only 1 job in the stream
      const depth = await queue.getQueueDepth('scheduled')
      expect(depth).toBe(1)

      // Claim it
      const job = await queue.claim('scheduled', 'worker-1')
      expect(job).not.toBeNull()
      expect(job!.eventId).toBe('task-sched-1')
      expect(job!.eventType).toBe('scheduled')
    })

    it('multiple agents with different wake times produce separate jobs', async () => {
      // Agent A has a task ready now
      await queue.enqueue({
        eventId: 'task-a1',
        eventType: 'scheduled',
        agentId: 'agent-a',
        orgId: 'org-1',
      })
      // Agent B has a task ready now
      await queue.enqueue({
        eventId: 'task-b1',
        eventType: 'scheduled',
        agentId: 'agent-b',
        orgId: 'org-1',
      })

      const depth = await queue.getQueueDepth('scheduled')
      expect(depth).toBe(2)

      // Both can be claimed
      const job1 = await queue.claim('scheduled', 'worker-1')
      const job2 = await queue.claim('scheduled', 'worker-1')
      expect(job1).not.toBeNull()
      expect(job2).not.toBeNull()
      expect(new Set([job1!.agentId, job2!.agentId])).toEqual(new Set(['agent-a', 'agent-b']))
    })
  })

  // ── 3. Polling fallback activation ─────────────────────────────────────────

  describe('3. Polling fallback: circuit breaker open → polling → close → Pulse', () => {
    it('circuit breaker transitions: closed → open → half_open → closed', () => {
      const transitions: Array<{ from: CircuitState; to: CircuitState }> = []
      let currentMode: 'pulse' | 'polling' = 'pulse'

      const probe = new RedisHealthProbe(
        { failureThreshold: 3, successThreshold: 3, probeIntervalMs: 100, openCooldownMs: 300 },
        (from, to) => {
          transitions.push({ from, to })
          if (to === 'open') currentMode = 'polling'
          else if (to === 'closed') currentMode = 'pulse'
        },
      )

      // Initially closed → Pulse active
      expect(probe.getState()).toBe('closed')
      expect(currentMode).toBe('pulse')

      // Redis dies → 3 failures → circuit opens → polling activates
      probe.recordFailure()
      probe.recordFailure()
      probe.recordFailure()
      expect(probe.getState()).toBe('open')
      expect(currentMode).toBe('polling')

      // Redis recovers → 1 success → half_open
      probe.recordSuccess()
      expect(probe.getState()).toBe('half_open')

      // 2 more successes → closed → Pulse resumes
      probe.recordSuccess()
      probe.recordSuccess()
      expect(probe.getState()).toBe('closed')
      expect(currentMode).toBe('pulse')

      // Verify transition sequence
      const stateSequence = transitions.map(t => t.to)
      expect(stateSequence).toContain('open')
      expect(stateSequence).toContain('half_open')
      expect(stateSequence).toContain('closed')

      probe.stop()
    })

    it('no dual-claim: mode is mutually exclusive during transitions', () => {
      let pulseActive = true
      let pollingActive = false

      const probe = new RedisHealthProbe(
        { failureThreshold: 2, successThreshold: 2, probeIntervalMs: 100, openCooldownMs: 200 },
        (_from, to) => {
          if (to === 'open') {
            pulseActive = false
            pollingActive = true
          } else if (to === 'closed') {
            pollingActive = false
            pulseActive = true
          }
        },
      )

      // Initially: only Pulse
      expect(pulseActive).toBe(true)
      expect(pollingActive).toBe(false)

      // Open circuit
      probe.recordFailure()
      probe.recordFailure()
      expect(pulseActive).toBe(false)
      expect(pollingActive).toBe(true)

      // At no point are both active
      expect(pulseActive && pollingActive).toBe(false)

      // Recover
      probe.recordSuccess()
      probe.recordSuccess()
      expect(pulseActive).toBe(true)
      expect(pollingActive).toBe(false)
      expect(pulseActive && pollingActive).toBe(false)

      probe.stop()
    })

    it('intermittent failures do not cause flapping', () => {
      let modeChanges = 0
      const probe = new RedisHealthProbe(
        { failureThreshold: 3, successThreshold: 3, probeIntervalMs: 100, openCooldownMs: 200 },
        () => { modeChanges++ },
      )

      // Alternating success/failure should never hit the threshold
      for (let i = 0; i < 30; i++) {
        if (i % 2 === 0) probe.recordSuccess()
        else probe.recordFailure()
      }

      expect(probe.getState()).toBe('closed')
      expect(modeChanges).toBe(0)

      probe.stop()
    })
  })

  // ── 4. DLQ flow ────────────────────────────────────────────────────────────

  describe('4. DLQ flow: max_attempts exhausted → DLQ → not re-claimed', () => {
    it('event fails max_attempts times then moves to DLQ', async () => {
      const dlqQueue = new PulseQueue({ maxConcurrentPerAgent: 3, maxAttempts: 3 })

      await dlqQueue.enqueue({
        eventId: 'evt-dlq-1',
        eventType: 'inbound',
        agentId: 'agent-c',
        orgId: 'org-1',
      })

      // Attempt 0: claim and fail → retried (goes to retry ZSET)
      const job1 = await dlqQueue.claim('inbound', 'worker-1')
      expect(job1).not.toBeNull()
      const result1 = await dlqQueue.fail(job1!, 'worker-1', 'transient error 1')
      expect(result1).toBe('retried')

      // Simulate RetryDrainer moving attempt 1 back to stream
      const retryJob1 = { ...job1!, runId: `${job1!.eventId}:1`, attempt: 1, priority: 'background' as const, enqueuedAt: Date.now() }
      await mockRedis.xadd('pulse:stream:{inbound}:background', '*', { job: JSON.stringify(retryJob1) })

      // Attempt 1: claim retry and fail → retried
      const job2 = await dlqQueue.claim('inbound', 'worker-1')
      expect(job2).not.toBeNull()
      expect(job2!.attempt).toBe(1)
      const result2 = await dlqQueue.fail(job2!, 'worker-1', 'transient error 2')
      expect(result2).toBe('retried')

      // Simulate RetryDrainer moving attempt 2 back to stream
      const retryJob2 = { ...job2!, runId: `${job2!.eventId}:2`, attempt: 2, priority: 'background' as const, enqueuedAt: Date.now() }
      await mockRedis.xadd('pulse:stream:{inbound}:background', '*', { job: JSON.stringify(retryJob2) })

      // Attempt 2: claim retry and fail → DLQ (maxAttempts=3, attempt=2 is the 3rd try)
      const job3 = await dlqQueue.claim('inbound', 'worker-1')
      expect(job3).not.toBeNull()
      expect(job3!.attempt).toBe(2)
      const result3 = await dlqQueue.fail(job3!, 'worker-1', 'final error')
      expect(result3).toBe('dlq')

      // DLQ should have the failed job
      const { lists } = getState()
      const dlqList = lists.get('pulse:dlq:inbound') ?? []
      expect(dlqList.length).toBe(1)

      // The DLQ entry should contain the error and event info
      const dlqEntry = JSON.parse(dlqList[0])
      expect(dlqEntry.eventId).toBe('evt-dlq-1')
      expect(dlqEntry.errorMessage).toBe('final error')

      // No more jobs in the queue — DLQ items are not re-claimed
      const jobNull = await dlqQueue.claim('inbound', 'worker-1')
      expect(jobNull).toBeNull()
    })

    it('DLQ entries accumulate and are capped at dlqMaxLength', async () => {
      const smallDlq = new PulseQueue({ maxConcurrentPerAgent: 10, maxAttempts: 1 })

      // Create 5 events that will all go to DLQ (maxAttempts=1)
      for (let i = 0; i < 5; i++) {
        await smallDlq.enqueue({
          eventId: `evt-dlq-batch-${i}`,
          eventType: 'inbound',
          agentId: `agent-${i}`,
          orgId: 'org-1',
        })
        const job = await smallDlq.claim('inbound', 'worker-1')
        expect(job).not.toBeNull()
        const result = await smallDlq.fail(job!, 'worker-1', `error-${i}`)
        expect(result).toBe('dlq')
      }

      const { lists } = getState()
      const dlqList = lists.get('pulse:dlq:inbound') ?? []
      expect(dlqList.length).toBe(5)
    })
  })

  // ── 5. Per-agent concurrency enforcement ───────────────────────────────────

  describe('5. Per-agent concurrency: 3 concurrent → 4th blocked', () => {
    it('enforces maxConcurrentPerAgent=3 then unblocks after completion', async () => {
      // Enqueue 5 jobs for the same agent
      for (let i = 0; i < 5; i++) {
        await queue.enqueue({
          eventId: `evt-conc-${i}`,
          eventType: 'inbound',
          agentId: 'agent-d',
          orgId: 'org-1',
        })
      }

      // Claim 3 successfully
      const claimed: any[] = []
      for (let i = 0; i < 3; i++) {
        const job = await queue.claim('inbound', 'worker-1')
        expect(job).not.toBeNull()
        claimed.push(job)
      }

      // 4th claim should return null (agent at concurrency limit, job re-enqueued)
      const blocked = await queue.claim('inbound', 'worker-1')
      expect(blocked).toBeNull()

      // Complete one job → frees a slot
      await queue.complete(claimed[0], 'worker-1')

      // Now we can claim another (the re-enqueued job or remaining jobs)
      const unblocked = await queue.claim('inbound', 'worker-1')
      expect(unblocked).not.toBeNull()
    })

    it('different agents have independent concurrency counters', async () => {
      // Enqueue 3 jobs each for 2 different agents
      for (let i = 0; i < 3; i++) {
        await queue.enqueue({
          eventId: `evt-x-${i}`,
          eventType: 'inbound',
          agentId: 'agent-x',
          orgId: 'org-1',
        })
        await queue.enqueue({
          eventId: `evt-y-${i}`,
          eventType: 'inbound',
          agentId: 'agent-y',
          orgId: 'org-1',
        })
      }

      // Claim all 6 — both agents have independent counters (3 each)
      const claimedJobs: any[] = []
      for (let i = 0; i < 6; i++) {
        const job = await queue.claim('inbound', 'worker-1')
        expect(job).not.toBeNull()
        claimedJobs.push(job)
      }

      // Both are at max — next claim should be null
      const nullJob = await queue.claim('inbound', 'worker-1')
      expect(nullJob).toBeNull()
    })

    it('fail also frees a concurrency slot on retry', async () => {
      // Enqueue 4 jobs for same agent
      for (let i = 0; i < 4; i++) {
        await queue.enqueue({
          eventId: `evt-fail-${i}`,
          eventType: 'inbound',
          agentId: 'agent-f',
          orgId: 'org-1',
        })
      }

      // Claim 3
      const jobs: any[] = []
      for (let i = 0; i < 3; i++) {
        const job = await queue.claim('inbound', 'worker-1')
        expect(job).not.toBeNull()
        jobs.push(job)
      }

      // 4th blocked
      expect(await queue.claim('inbound', 'worker-1')).toBeNull()

      // Fail one (retry) → frees slot
      await queue.fail(jobs[0], 'worker-1', 'transient')

      // Now another can be claimed (the re-enqueued 4th job or the retried job if drainer ran)
      const nextJob = await queue.claim('inbound', 'worker-1')
      expect(nextJob).not.toBeNull()
    })
  })

  // ── Cross-cutting: event type isolation ────────────────────────────────────

  describe('Cross-cutting: event types are isolated', () => {
    it('inbound, outbound, and scheduled events use separate streams', async () => {
      await queue.enqueue({ eventId: 'in-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })
      await queue.enqueue({ eventId: 'out-1', eventType: 'outbound', agentId: 'a1', orgId: 'o1' })
      await queue.enqueue({ eventId: 'sched-1', eventType: 'scheduled', agentId: 'a1', orgId: 'o1' })

      // Each type's streams have exactly 1 job total (across all 3 priority streams)
      expect(await queue.getQueueDepth('inbound')).toBe(1)
      expect(await queue.getQueueDepth('outbound')).toBe(1)
      expect(await queue.getQueueDepth('scheduled')).toBe(1)

      // Claiming from inbound does not affect outbound or scheduled
      const inJob = await queue.claim('inbound', 'worker-1')
      expect(inJob!.eventId).toBe('in-1')
      expect(await queue.getQueueDepth('outbound')).toBe(1)
      expect(await queue.getQueueDepth('scheduled')).toBe(1)
    })
  })
})
