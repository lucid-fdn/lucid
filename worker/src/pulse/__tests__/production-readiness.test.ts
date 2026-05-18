/**
 * Pulse Production Readiness Tests
 *
 * Comprehensive E2E, smoke, and simulation tests that verify Pulse is
 * production-ready. Covers:
 * - Smoke: config defaults, key generation, type safety
 * - E2E: full lifecycle, concurrent workers, crash + recovery
 * - Simulation: high-volume multi-worker, priority under load, Redis failure graceful degradation
 * - Edge cases: stale worker fencing, DLQ overflow, lease expiry mid-run
 *
 * Updated for Pulse v2: Redis Streams + XREADGROUP (replaces ZSET + Lua ZPOPMIN).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Stateful Redis Simulation ──────────────────────────────────────────────
// Full in-memory simulation of Redis data structures, shared across all tests.
// Supports Streams (XADD/XREADGROUP/XACK/XLEN), sorted sets (retry ZSET),
// dedup keys (SET NX), leases, active set, inflight counters, metrics, DLQ.

const { mockRedis, clearState, getState } = vi.hoisted(() => {
  const zsets = new Map<string, Map<string, number>>()
  const strings = new Map<string, string>()
  const sets = new Map<string, Set<string>>()
  const hashes = new Map<string, Map<string, number>>()
  const lists = new Map<string, string[]>()
  const streams = new Map<string, Array<{ id: string; fields: Record<string, string> }>>()
  let streamIdCounter = 0

  function clearState() {
    zsets.clear()
    strings.clear()
    sets.clear()
    hashes.clear()
    lists.clear()
    streams.clear()
    streamIdCounter = 0
  }

  function getState() {
    return { zsets, strings, sets, hashes, lists, streams }
  }

  const mockRedis: any = {
    zadd: vi.fn(async (key: string, nxOpts: { nx?: boolean }, ...items: { score: number; member: string }[]) => {
      if (!zsets.has(key)) zsets.set(key, new Map())
      const zset = zsets.get(key)!
      let added = 0
      for (const item of items) {
        if (nxOpts.nx && zset.has(item.member)) continue
        zset.set(item.member, item.score)
        added++
      }
      return added
    }),

    // ─── Stream operations ────────────────────────────────────────────────────
    xadd: vi.fn(async (key: string, _id: string, fields: Record<string, string>, _opts?: any) => {
      if (!streams.has(key)) streams.set(key, [])
      streamIdCounter++
      const entryId = `${Date.now()}-${streamIdCounter}`
      streams.get(key)!.push({ id: entryId, fields })
      return entryId
    }),

    xreadgroup: vi.fn(async (
      _group: string,
      _consumer: string,
      streamKeys: string[],
      _ids: string[],
      _opts?: { count?: number; block?: number },
    ) => {
      // Try each stream key in order, pop first entry from first non-empty stream
      for (const streamKey of streamKeys) {
        const stream = streams.get(streamKey)
        if (stream && stream.length > 0) {
          const entry = stream.shift()!
          // Return format: [[streamKey, [[entryId, [field, value, field, value, ...]]]]]
          const fieldArray: string[] = []
          for (const [k, v] of Object.entries(entry.fields)) {
            fieldArray.push(k, v)
          }
          return [[streamKey, [[entry.id, fieldArray]]]]
        }
      }
      return null
    }),

    xack: vi.fn(async () => 1),

    xlen: vi.fn(async (key: string) => {
      return streams.get(key)?.length ?? 0
    }),

    xgroupCreate: vi.fn(async () => 'OK'),

    // ─── Standard operations ──────────────────────────────────────────────────
    eval: vi.fn(async (script: string, keys: string[], args: string[]) => {
      // CONDITIONAL_DEL_LUA — fenced lease release
      if (script.includes('GET') && script.includes('DEL') && !script.includes('DECR')) {
        const key = keys[0]
        const val = strings.get(key)
        if (!val) return 0
        const pattern = `"workerId":"${args[0]}"`
        if (val.includes(pattern)) {
          strings.delete(key)
          return 1
        }
        return 0
      }
      // FLOOR_DECR_LUA
      if (script.includes('DECR')) {
        const key = keys[0]
        const current = Number(strings.get(key) || '0')
        const next = current - 1
        if (next < 0) { strings.set(key, '0'); return 0 }
        strings.set(key, String(next))
        return next
      }
      // RESET_INFLIGHT_LUA — atomic compare-and-set for inflight counter
      if (script.includes('current > expected')) {
        const key = keys[0]
        const current = Number(strings.get(key) || '0')
        const expected = Number(args[0])
        if (current > expected) {
          strings.set(key, args[0])
          return 1
        }
        return 0
      }
      // RENEW_LEASE_LUA
      if (script.includes('EXPIRE') && !script.includes('DECR') && !script.includes('DEL')) {
        const key = keys[0]
        const val = strings.get(key)
        if (!val) return 0
        const pattern = `"workerId":"${args[0]}"`
        if (val.includes(pattern)) return 1
        return 0
      }
      return null
    }),
    get: vi.fn(async (key: string) => strings.get(key) || null),
    set: vi.fn(async (key: string, value: string, _opts?: any) => {
      if (_opts?.nx && strings.has(key)) return null
      strings.set(key, value)
      return 'OK'
    }),
    del: vi.fn(async (...keys: string[]) => {
      let deleted = 0
      for (const key of keys) {
        if (strings.has(key)) {
          strings.delete(key)
          deleted++
        }
      }
      return deleted
    }),
    expire: vi.fn(async () => true),
    scard: vi.fn(async (key: string) => sets.get(key)?.size ?? 0),
    sadd: vi.fn(async (key: string, ...members: string[]) => {
      if (!sets.has(key)) sets.set(key, new Set())
      let added = 0
      for (const m of members) {
        if (!sets.get(key)!.has(m)) added++
        sets.get(key)!.add(m)
      }
      return added
    }),
    srem: vi.fn(async (key: string, ...members: string[]) => {
      const s = sets.get(key)
      if (!s) return 0
      let removed = 0
      for (const m of members) {
        if (s.delete(m)) removed++
      }
      return removed
    }),
    smembers: vi.fn(async (key: string) => [...(sets.get(key) || [])]),
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
    pipeline: vi.fn(),
  }

  mockRedis.pipeline.mockImplementation(() => {
    const ops: Array<() => Promise<any>> = []
    const pipe: any = {
      incr: (key: string) => {
        ops.push(async () => {
          const v = Number(strings.get(key) || '0') + 1
          strings.set(key, String(v))
          return v
        })
        return pipe
      },
      expire: () => { ops.push(async () => true); return pipe },
      set: (key: string, value: string, opts?: any) => {
        ops.push(async () => mockRedis.set(key, value, opts))
        return pipe
      },
      sadd: (key: string, ...members: string[]) => {
        ops.push(async () => mockRedis.sadd(key, ...members))
        return pipe
      },
      srem: (key: string, ...members: string[]) => {
        ops.push(async () => mockRedis.srem(key, ...members))
        return pipe
      },
      hincrby: (key: string, field: string, inc: number) => {
        ops.push(async () => mockRedis.hincrby(key, field, inc))
        return pipe
      },
      rpush: (key: string, ...values: string[]) => {
        ops.push(async () => {
          if (!lists.has(key)) lists.set(key, [])
          for (const v of values) lists.get(key)!.push(v)
          return lists.get(key)!.length
        })
        return pipe
      },
      ltrim: (_key: string, _start: number, _stop: number) => {
        ops.push(async () => 'OK')
        return pipe
      },
      zcard: (key: string) => {
        ops.push(async () => zsets.get(key)?.size ?? 0)
        return pipe
      },
      get: (key: string) => {
        ops.push(async () => strings.get(key) || null)
        return pipe
      },
      del: (...keys: string[]) => {
        ops.push(async () => mockRedis.del(...keys))
        return pipe
      },
      xack: (key: string, group: string, ...ids: string[]) => {
        ops.push(async () => 1)
        return pipe
      },
      xadd: (key: string, id: string, ...fieldsAndValues: string[]) => {
        ops.push(async () => {
          // Convert flat field/value pairs into a Record
          const fields: Record<string, string> = {}
          for (let i = 0; i < fieldsAndValues.length; i += 2) {
            fields[fieldsAndValues[i]] = fieldsAndValues[i + 1]
          }
          return mockRedis.xadd(key, id, fields)
        })
        return pipe
      },
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

import { PulseQueue } from '../queue.js'
import { PulseKeys, DEFAULT_PULSE_CONFIG } from '../types.js'
import type { PulseJob } from '../types.js'
import { OrphanDetector } from '../orphan-detector.js'
import { CLAIM_LUA, CONDITIONAL_DEL_LUA, FLOOR_DECR_LUA, RENEW_LEASE_LUA } from '../lua-scripts.js'

// ─── Smoke Tests ──────────────────────────────────────────────────────────────

describe('Smoke: Config & Types', () => {
  it('should have sane defaults', () => {
    expect(DEFAULT_PULSE_CONFIG.leaseTtlSeconds).toBe(60)
    expect(DEFAULT_PULSE_CONFIG.maxConcurrentPerAgent).toBe(3)
    expect(DEFAULT_PULSE_CONFIG.maxAttempts).toBe(5)
    expect(DEFAULT_PULSE_CONFIG.retryBaseDelayMs).toBe(5000)
    expect(DEFAULT_PULSE_CONFIG.dlqMaxLength).toBe(1000)
    expect(DEFAULT_PULSE_CONFIG.orphanDetectorIntervalMs).toBe(60_000)
    expect(DEFAULT_PULSE_CONFIG.sweepIntervalMs).toBe(30_000)
    expect(DEFAULT_PULSE_CONFIG.wakeScannerIntervalMs).toBe(10_000)
  })

  it('should generate stream keys with hash tags for CROSSSLOT safety', () => {
    expect(PulseKeys.stream('inbound', 'critical')).toBe('pulse:stream:{inbound}:critical')
    expect(PulseKeys.stream('inbound', 'normal')).toBe('pulse:stream:{inbound}:normal')
    expect(PulseKeys.stream('inbound', 'background')).toBe('pulse:stream:{inbound}:background')
    // All 3 keys share hash tag {inbound} → same cluster slot
    const tag1 = PulseKeys.stream('inbound', 'critical').match(/\{([^}]+)\}/)![1]
    const tag2 = PulseKeys.stream('inbound', 'normal').match(/\{([^}]+)\}/)![1]
    const tag3 = PulseKeys.stream('inbound', 'background').match(/\{([^}]+)\}/)![1]
    expect(tag1).toBe(tag2)
    expect(tag2).toBe(tag3)
  })

  it('should generate correct stream key patterns for all types', () => {
    for (const type of ['inbound', 'outbound', 'scheduled'] as const) {
      for (const priority of ['critical', 'normal', 'background'] as const) {
        const key = PulseKeys.stream(type, priority)
        expect(key).toContain(`{${type}}`)
        expect(key).toContain(priority)
      }
    }
  })

  it('should generate dedup keys for event:attempt pairs', () => {
    expect(PulseKeys.dedup('evt-1', 0)).toBe('pulse:dedup:evt-1:0')
    expect(PulseKeys.dedup('evt-1', 1)).toBe('pulse:dedup:evt-1:1')
    expect(PulseKeys.dedup('evt-1', 0)).not.toBe(PulseKeys.dedup('evt-1', 1))
  })

  it('should generate retry ZSET keys per event type', () => {
    expect(PulseKeys.retry('inbound')).toBe('pulse:retry:{inbound}')
    expect(PulseKeys.retry('outbound')).toBe('pulse:retry:{outbound}')
  })

  it('should generate unique lease keys per run', () => {
    expect(PulseKeys.lease('run-1')).not.toBe(PulseKeys.lease('run-2'))
    expect(PulseKeys.lease('run-1')).toBe('pulse:lease:run-1')
  })

  it('should generate daily metrics keys', () => {
    const key = PulseKeys.metrics('2026-04-03')
    expect(key).toBe('pulse:metrics:2026-04-03')
    // Without date should use today
    const todayKey = PulseKeys.metrics()
    expect(todayKey).toMatch(/^pulse:metrics:\d{4}-\d{2}-\d{2}$/)
  })

  it('should construct queue with partial config override', () => {
    const q = new PulseQueue({ leaseTtlSeconds: 120 })
    expect(q).toBeInstanceOf(PulseQueue)
  })
})

describe('Smoke: Lua Scripts', () => {
  it('CLAIM_LUA should be deprecated (empty string)', () => {
    expect(CLAIM_LUA).toBe('')
  })

  it('CONDITIONAL_DEL_LUA should do fenced delete', () => {
    expect(CONDITIONAL_DEL_LUA).toContain('GET')
    expect(CONDITIONAL_DEL_LUA).toContain('DEL')
    expect(CONDITIONAL_DEL_LUA).toContain('string.find')
    expect(CONDITIONAL_DEL_LUA).toContain('true') // plain mode flag
  })

  it('FLOOR_DECR_LUA should prevent negative counters', () => {
    expect(FLOOR_DECR_LUA).toContain('DECR')
    expect(FLOOR_DECR_LUA).toContain('v < 0')
    expect(FLOOR_DECR_LUA).toContain('SET')
  })

  it('RENEW_LEASE_LUA should check ownership before EXPIRE', () => {
    expect(RENEW_LEASE_LUA).toContain('GET')
    expect(RENEW_LEASE_LUA).toContain('EXPIRE')
    expect(RENEW_LEASE_LUA).toContain('string.find')
    expect(RENEW_LEASE_LUA).toContain('true') // plain mode
    expect(RENEW_LEASE_LUA).toContain('workerId')
  })
})

// ─── E2E: Concurrent Workers ──────────────────────────────────────────────────

describe('E2E: Concurrent Workers Competing', () => {
  let queue: PulseQueue

  beforeEach(() => {
    clearState()
    vi.clearAllMocks()
    queue = new PulseQueue({ maxConcurrentPerAgent: 3, maxAttempts: 3 })
  })

  it('two workers should never claim the same job', async () => {
    // Enqueue 1 job
    await queue.enqueue({
      eventId: 'evt-1',
      eventType: 'inbound',
      agentId: 'agent-1',
      orgId: 'org-1',
    })

    // Both workers claim concurrently
    const [job1, job2] = await Promise.all([
      queue.claim('inbound', 'worker-1'),
      queue.claim('inbound', 'worker-2'),
    ])

    // Exactly one should get the job, the other null
    const claimed = [job1, job2].filter(j => j !== null)
    expect(claimed).toHaveLength(1)
    expect(claimed[0]!.eventId).toBe('evt-1')
  })

  it('multiple workers should distribute jobs across themselves', async () => {
    // Enqueue 6 jobs for 2 different agents
    for (let i = 0; i < 3; i++) {
      await queue.enqueue({ eventId: `evt-a-${i}`, eventType: 'inbound', agentId: 'agent-1', orgId: 'org-1' })
      await queue.enqueue({ eventId: `evt-b-${i}`, eventType: 'inbound', agentId: 'agent-2', orgId: 'org-1' })
    }

    const w1Jobs: PulseJob[] = []
    const w2Jobs: PulseJob[] = []

    // Alternate claiming between workers
    for (let i = 0; i < 6; i++) {
      const worker = i % 2 === 0 ? 'worker-1' : 'worker-2'
      const job = await queue.claim('inbound', worker)
      if (job) {
        if (worker === 'worker-1') w1Jobs.push(job)
        else w2Jobs.push(job)
      }
    }

    // All 6 jobs should be claimed total (no duplicates)
    const allJobs = [...w1Jobs, ...w2Jobs]
    expect(allJobs).toHaveLength(6)
    const uniqueIds = new Set(allJobs.map(j => j.eventId))
    expect(uniqueIds.size).toBe(6)
  })

  it('only the original worker can complete a job (fencing)', async () => {
    await queue.enqueue({ eventId: 'evt-1', eventType: 'inbound', agentId: 'agent-1', orgId: 'org-1' })

    const job = await queue.claim('inbound', 'worker-1')
    expect(job).not.toBeNull()

    // Wrong worker tries to complete → rejected
    const staleResult = await queue.complete(job!, 'worker-2')
    expect(staleResult).toBe(false)

    // Original worker completes → success
    const ownerResult = await queue.complete(job!, 'worker-1')
    expect(ownerResult).toBe(true)
  })

  it('only the original worker can fail a job (fencing)', async () => {
    await queue.enqueue({ eventId: 'evt-1', eventType: 'inbound', agentId: 'agent-1', orgId: 'org-1' })

    const job = await queue.claim('inbound', 'worker-1')
    expect(job).not.toBeNull()

    // Wrong worker tries to fail → stale
    const staleResult = await queue.fail(job!, 'worker-2', 'should not work')
    expect(staleResult).toBe('stale')

    // Original worker fails → retried
    const ownerResult = await queue.fail(job!, 'worker-1', 'real error')
    expect(ownerResult).toBe('retried')
  })
})

// ─── E2E: Worker Crash + Orphan Recovery ──────────────────────────────────────

describe('E2E: Worker Crash + Orphan Recovery', () => {
  let queue: PulseQueue

  beforeEach(() => {
    clearState()
    vi.clearAllMocks()
    queue = new PulseQueue({ maxConcurrentPerAgent: 5, maxAttempts: 3 })
  })

  it('orphan detector should find runs with expired leases', async () => {
    // Simulate: job claimed, lease set, then worker crashes (lease not renewed → TTL expires)
    const { sets, strings } = getState()

    // Manually add a run to active set (simulating a claimed job)
    if (!sets.has('pulse:active')) sets.set('pulse:active', new Set())
    sets.get('pulse:active')!.add('orphaned-run-1')
    sets.get('pulse:active')!.add('healthy-run-2')

    // healthy-run-2 has a valid lease, orphaned-run-1 does not (TTL expired)
    strings.set(
      'pulse:lease:healthy-run-2',
      JSON.stringify({ workerId: 'w1', agentId: 'a1', eventId: 'e1', eventType: 'inbound', attempt: 0, claimedAt: new Date().toISOString() }),
    )
    // orphaned-run-1 has NO lease key (expired)

    // Set inflight counter for agent
    strings.set('pulse:agent:a1:inflight', '2')

    const detector = new OrphanDetector(queue)
    const result = await detector.detect()

    expect(result.orphansFound).toBe(1)
    // orphaned-run-1 should be removed from active set
    expect(sets.get('pulse:active')!.has('orphaned-run-1')).toBe(false)
    // healthy-run-2 should still be in active set
    expect(sets.get('pulse:active')!.has('healthy-run-2')).toBe(true)

    detector.stop()
  })

  it('orphan detector should reset inflated inflight counters', async () => {
    const { sets, strings } = getState()

    // Agent has 1 active run but inflight counter says 5 (stale from crashes)
    if (!sets.has('pulse:active')) sets.set('pulse:active', new Set())
    sets.get('pulse:active')!.add('run-1')

    strings.set(
      'pulse:lease:run-1',
      JSON.stringify({ workerId: 'w1', agentId: 'agent-x', eventId: 'e1', eventType: 'inbound', attempt: 0, claimedAt: new Date().toISOString() }),
    )
    strings.set('pulse:agent:agent-x:inflight', '5')

    const detector = new OrphanDetector(queue)
    const result = await detector.detect()

    expect(result.counterResets).toBe(1)
    // Counter should be reset to actual active count (1)
    expect(strings.get('pulse:agent:agent-x:inflight')).toBe('1')

    detector.stop()
  })

  it('orphan detector should not trigger when lock is held', async () => {
    const { strings } = getState()

    // Another detector process holds the lock
    strings.set('pulse:orphan:lock', 'detector-other')

    const detector = new OrphanDetector(queue)
    const result = await detector.detect()

    // Should skip silently
    expect(result.orphansFound).toBe(0)
    expect(result.counterResets).toBe(0)

    detector.stop()
  })
})

// ─── E2E: Lease Renewal ──────────────────────────────────────────────────────

describe('E2E: Lease Renewal', () => {
  let queue: PulseQueue

  beforeEach(() => {
    clearState()
    vi.clearAllMocks()
    queue = new PulseQueue({ maxConcurrentPerAgent: 5, maxAttempts: 3 })
  })

  it('owner can renew lease', async () => {
    await queue.enqueue({ eventId: 'evt-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })
    const job = await queue.claim('inbound', 'worker-1')
    expect(job).not.toBeNull()

    // Renew by owner → success
    const renewed = await queue.renewLease(job!.runId, 'worker-1')
    expect(renewed).toBe(true)
  })

  it('non-owner cannot renew lease', async () => {
    await queue.enqueue({ eventId: 'evt-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })
    const job = await queue.claim('inbound', 'worker-1')
    expect(job).not.toBeNull()

    // Renew by different worker → fail
    const renewed = await queue.renewLease(job!.runId, 'worker-2')
    expect(renewed).toBe(false)
  })

  it('cannot renew expired lease (key deleted)', async () => {
    // Renew a lease that never existed
    const renewed = await queue.renewLease('nonexistent-run', 'worker-1')
    expect(renewed).toBe(false)
  })

  it('lease should survive through claim → renew → complete cycle', async () => {
    await queue.enqueue({ eventId: 'evt-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })
    const job = await queue.claim('inbound', 'worker-1')

    // Renew multiple times (simulating 15s interval renewals)
    for (let i = 0; i < 3; i++) {
      const renewed = await queue.renewLease(job!.runId, 'worker-1')
      expect(renewed).toBe(true)
    }

    // Complete should still work after renewals
    const completed = await queue.complete(job!, 'worker-1')
    expect(completed).toBe(true)
  })
})

// ─── E2E: DLQ Behavior ───────────────────────────────────────────────────────

describe('E2E: Dead Letter Queue', () => {
  let queue: PulseQueue

  beforeEach(() => {
    clearState()
    vi.clearAllMocks()
    queue = new PulseQueue({ maxConcurrentPerAgent: 10, maxAttempts: 2 })
  })

  it('should DLQ after maxAttempts exhausted', async () => {
    await queue.enqueue({ eventId: 'evt-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })

    // First attempt: claim and fail → retried (enqueueRetry adds to retry ZSET)
    const job1 = await queue.claim('inbound', 'worker-1')
    const r1 = await queue.fail(job1!, 'worker-1', 'error 1')
    expect(r1).toBe('retried')

    // The retry goes to the retry ZSET, not the stream directly.
    // For the test, we simulate the RetryDrainer moving it to stream via reEnqueueRaw.
    // Check the retry ZSET has the job
    const { zsets } = getState()
    const retryZset = zsets.get('pulse:retry:{inbound}')
    expect(retryZset).toBeDefined()
    expect(retryZset!.size).toBe(1)

    // Simulate RetryDrainer: move from retry ZSET to stream
    const retryMember = [...retryZset!.keys()][0]
    const retryJob = JSON.parse(retryMember) as PulseJob
    retryZset!.delete(retryMember)
    await queue.reEnqueueRaw(retryJob)

    // Second attempt (attempt=1): claim and fail → DLQ (maxAttempts=2, so attempt 1+1=2 >= 2)
    const job2 = await queue.claim('inbound', 'worker-1')
    expect(job2).not.toBeNull()
    const r2 = await queue.fail(job2!, 'worker-1', 'final error')
    expect(r2).toBe('dlq')

    // DLQ should have the failed job
    const { lists } = getState()
    const dlq = lists.get('pulse:dlq:inbound')
    expect(dlq).toBeDefined()
    expect(dlq!.length).toBe(1)
    const dlqEntry = JSON.parse(dlq![0])
    expect(dlqEntry.eventId).toBe('evt-1')
    expect(dlqEntry.errorMessage).toBe('final error')
  })

  it('should not claim from queue after DLQ (no stream entries remain)', async () => {
    await queue.enqueue({ eventId: 'evt-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })

    // First attempt: claim + fail → retried to retry ZSET
    const job1 = await queue.claim('inbound', 'worker-1')
    await queue.fail(job1!, 'worker-1', 'e1')

    // Simulate drainer: move retry to stream
    const { zsets } = getState()
    const retryZset = zsets.get('pulse:retry:{inbound}')!
    const retryMember = [...retryZset.keys()][0]
    const retryJob = JSON.parse(retryMember) as PulseJob
    retryZset.delete(retryMember)
    await queue.reEnqueueRaw(retryJob)

    // Second attempt: claim + fail → DLQ
    const job2 = await queue.claim('inbound', 'worker-1')
    await queue.fail(job2!, 'worker-1', 'e2')

    // Queue should be empty now (DLQ'd, not re-enqueued)
    const job3 = await queue.claim('inbound', 'worker-1')
    expect(job3).toBeNull()
  })
})

// ─── E2E: Redis Failure Graceful Degradation ──────────────────────────────────

describe('E2E: Redis Failure Graceful Degradation', () => {
  let queue: PulseQueue

  beforeEach(() => {
    clearState()
    vi.clearAllMocks()
    queue = new PulseQueue({ maxConcurrentPerAgent: 3, maxAttempts: 3 })
  })

  it('enqueue should return false when Redis is null', async () => {
    const { getPulseRedis } = await import('../redis.js')
    vi.mocked(getPulseRedis).mockResolvedValueOnce(null)

    const result = await queue.enqueue({
      eventId: 'evt-1',
      eventType: 'inbound',
      agentId: 'a1',
      orgId: 'o1',
    })
    expect(result).toBe(false)
  })

  it('claim should return null when Redis is null', async () => {
    const { getPulseRedis } = await import('../redis.js')
    vi.mocked(getPulseRedis).mockResolvedValueOnce(null)

    const result = await queue.claim('inbound', 'worker-1')
    expect(result).toBeNull()
  })

  it('complete should return false when Redis is null', async () => {
    const { getPulseRedis } = await import('../redis.js')
    vi.mocked(getPulseRedis).mockResolvedValueOnce(null)

    const job: PulseJob = {
      runId: 'run-1', eventId: 'evt-1', eventType: 'inbound',
      agentId: 'a1', orgId: 'o1', priority: 'normal', attempt: 0, enqueuedAt: Date.now(),
    }
    const result = await queue.complete(job, 'worker-1')
    expect(result).toBe(false)
  })

  it('fail should return stale when Redis is null', async () => {
    const { getPulseRedis } = await import('../redis.js')
    vi.mocked(getPulseRedis).mockResolvedValueOnce(null)

    const job: PulseJob = {
      runId: 'run-1', eventId: 'evt-1', eventType: 'inbound',
      agentId: 'a1', orgId: 'o1', priority: 'normal', attempt: 0, enqueuedAt: Date.now(),
    }
    const result = await queue.fail(job, 'worker-1', 'error')
    expect(result).toBe('stale')
  })

  it('renewLease should return false when Redis is null', async () => {
    const { getPulseRedis } = await import('../redis.js')
    vi.mocked(getPulseRedis).mockResolvedValueOnce(null)

    const result = await queue.renewLease('run-1', 'worker-1')
    expect(result).toBe(false)
  })

  it('getQueueDepth should return 0 when Redis is null', async () => {
    const { getPulseRedis } = await import('../redis.js')
    vi.mocked(getPulseRedis).mockResolvedValueOnce(null)

    const depth = await queue.getQueueDepth('inbound')
    expect(depth).toBe(0)
  })

  it('getActiveRunCount should return 0 when Redis is null', async () => {
    const { getPulseRedis } = await import('../redis.js')
    vi.mocked(getPulseRedis).mockResolvedValueOnce(null)

    const count = await queue.getActiveRunCount()
    expect(count).toBe(0)
  })
})

// ─── Simulation: High-Volume Multi-Worker ───────────────────────────────────

describe('Simulation: High-Volume Processing', () => {
  let queue: PulseQueue

  beforeEach(() => {
    clearState()
    vi.clearAllMocks()
    queue = new PulseQueue({ maxConcurrentPerAgent: 50, maxAttempts: 3 })
  })

  it('should process 100 events with no loss or duplication', async () => {
    const NUM_EVENTS = 100

    // Enqueue 100 events across 10 agents
    for (let i = 0; i < NUM_EVENTS; i++) {
      const agentId = `agent-${i % 10}`
      await queue.enqueue({
        eventId: `evt-${i}`,
        eventType: 'inbound',
        agentId,
        orgId: 'org-1',
      })
    }

    // Verify queue depth (across all 3 priority streams via XLEN)
    const depth = await queue.getQueueDepth('inbound')
    expect(depth).toBe(NUM_EVENTS)

    // Claim all with 3 workers
    const claimed: PulseJob[] = []
    const workers = ['worker-1', 'worker-2', 'worker-3']
    let workerIdx = 0

    for (let i = 0; i < NUM_EVENTS + 5; i++) {
      const worker = workers[workerIdx % workers.length]
      workerIdx++
      const job = await queue.claim('inbound', worker)
      if (job) claimed.push(job)
    }

    // All 100 should be claimed
    expect(claimed).toHaveLength(NUM_EVENTS)

    // No duplicates
    const uniqueEventIds = new Set(claimed.map(j => j.eventId))
    expect(uniqueEventIds.size).toBe(NUM_EVENTS)

    // Complete all
    for (const job of claimed) {
      // Determine which worker claimed it (doesn't matter since we own the lease by claim order)
      const completed = await queue.complete(job, workers[claimed.indexOf(job) % workers.length])
      expect(completed).toBe(true)
    }

    // Queue should be empty
    const finalDepth = await queue.getQueueDepth('inbound')
    expect(finalDepth).toBe(0)
  })

  it('should maintain priority ordering under load', async () => {
    // Enqueue mixed priorities: 20 background, 30 normal, 10 critical
    for (let i = 0; i < 20; i++) {
      await queue.enqueue({
        eventId: `bg-${i}`, eventType: 'inbound', agentId: `a-${i}`, orgId: 'o1',
        attempt: 1, // Forces background
      })
    }
    for (let i = 0; i < 30; i++) {
      await queue.enqueue({
        eventId: `normal-${i}`, eventType: 'inbound', agentId: `a-${i}`, orgId: 'o1',
        priority: 'normal',
      })
    }
    for (let i = 0; i < 10; i++) {
      await queue.enqueue({
        eventId: `crit-${i}`, eventType: 'inbound', agentId: `a-${i}`, orgId: 'o1',
        priority: 'critical',
      })
    }

    // Claim all — claim() tries critical, then normal, then background (non-blocking)
    const claimed: PulseJob[] = []
    for (let i = 0; i < 65; i++) {
      const job = await queue.claim('inbound', 'worker-1')
      if (job) claimed.push(job)
    }

    expect(claimed).toHaveLength(60)

    // First 10 should be critical (claim() checks critical stream first)
    const first10 = claimed.slice(0, 10)
    expect(first10.every(j => j.eventId.startsWith('crit-'))).toBe(true)

    // Next 30 should be normal
    const next30 = claimed.slice(10, 40)
    expect(next30.every(j => j.eventId.startsWith('normal-'))).toBe(true)

    // Last 20 should be background
    const last20 = claimed.slice(40, 60)
    expect(last20.every(j => j.eventId.startsWith('bg-'))).toBe(true)
  })

  it('should handle interleaved enqueue + claim without loss', async () => {
    const processed: string[] = []

    // Simulate: enqueue → claim → enqueue → claim → ...
    for (let i = 0; i < 50; i++) {
      await queue.enqueue({
        eventId: `evt-${i}`, eventType: 'inbound', agentId: `a-${i % 5}`, orgId: 'o1',
      })

      // Try to claim after each enqueue
      const job = await queue.claim('inbound', 'worker-1')
      if (job) {
        processed.push(job.eventId)
        await queue.complete(job, 'worker-1')
      }
    }

    // Drain remaining
    let job
    while ((job = await queue.claim('inbound', 'worker-1')) !== null) {
      processed.push(job.eventId)
      await queue.complete(job, 'worker-1')
    }

    // All 50 should be processed exactly once
    expect(processed).toHaveLength(50)
    expect(new Set(processed).size).toBe(50)
  })
})

// ─── Simulation: Per-Agent Concurrency Under Load ───────────────────────────

describe('Simulation: Per-Agent Concurrency', () => {
  let queue: PulseQueue

  beforeEach(() => {
    clearState()
    vi.clearAllMocks()
    queue = new PulseQueue({ maxConcurrentPerAgent: 3, maxAttempts: 3 })
  })

  it('should enforce per-agent limit while other agents flow freely', async () => {
    // Enqueue 5 for agent-1
    for (let i = 0; i < 5; i++) {
      await queue.enqueue({ eventId: `a1-${i}`, eventType: 'inbound', agentId: 'agent-1', orgId: 'o1' })
    }

    // Claim first 3 (at limit)
    const claimed: PulseJob[] = []
    for (let i = 0; i < 3; i++) {
      const job = await queue.claim('inbound', 'worker-1')
      expect(job).not.toBeNull()
      claimed.push(job!)
    }
    expect(claimed).toHaveLength(3)

    // 4th claim should return null (over limit, job re-enqueued via XADD)
    const blocked = await queue.claim('inbound', 'worker-1')
    expect(blocked).toBeNull()

    // Complete one job → counter goes from 3 to 2
    await queue.complete(claimed[0], 'worker-1')

    // Now should be able to claim the re-enqueued job
    const unblocked = await queue.claim('inbound', 'worker-1')
    expect(unblocked).not.toBeNull()
  })

  it('inflight counter should not go negative after complete', async () => {
    await queue.enqueue({ eventId: 'evt-1', eventType: 'inbound', agentId: 'agent-1', orgId: 'o1' })
    const job = await queue.claim('inbound', 'worker-1')
    await queue.complete(job!, 'worker-1')

    // Counter should be 0, not negative
    const { strings } = getState()
    const counter = Number(strings.get('pulse:agent:agent-1:inflight') || '0')
    expect(counter).toBeGreaterThanOrEqual(0)
  })
})

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  let queue: PulseQueue

  beforeEach(() => {
    clearState()
    vi.clearAllMocks()
    queue = new PulseQueue({ maxConcurrentPerAgent: 3, maxAttempts: 3 })
  })

  it('double-complete by same worker should be safe (fencing)', async () => {
    await queue.enqueue({ eventId: 'evt-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })
    const job = await queue.claim('inbound', 'worker-1')

    const r1 = await queue.complete(job!, 'worker-1')
    expect(r1).toBe(true)

    // Second complete: lease is gone, so conditional-del returns 0
    const r2 = await queue.complete(job!, 'worker-1')
    expect(r2).toBe(false)
  })

  it('complete after fail should be rejected (fencing)', async () => {
    await queue.enqueue({ eventId: 'evt-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })
    const job = await queue.claim('inbound', 'worker-1')

    // Fail first
    await queue.fail(job!, 'worker-1', 'error')

    // Then try to complete — lease was already DEL'd by fail
    const r = await queue.complete(job!, 'worker-1')
    expect(r).toBe(false)
  })

  it('claim on empty queue returns null', async () => {
    const job = await queue.claim('inbound', 'worker-1')
    expect(job).toBeNull()
  })

  it('claim on empty queue for all event types returns null', async () => {
    for (const type of ['inbound', 'outbound', 'scheduled'] as const) {
      const job = await queue.claim(type, 'worker-1')
      expect(job).toBeNull()
    }
  })

  it('enqueue is idempotent (SET NX dedup)', async () => {
    const r1 = await queue.enqueue({ eventId: 'evt-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })
    expect(r1).toBe(true)

    // Second enqueue with same eventId:attempt should be deduped
    const r2 = await queue.enqueue({ eventId: 'evt-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })
    expect(r2).toBe(false)

    // Depth should be exactly 1
    const depth = await queue.getQueueDepth('inbound')
    expect(depth).toBe(1)
  })

  it('retry should go to retry ZSET with delayed score', async () => {
    // Enqueue and claim a job
    await queue.enqueue({ eventId: 'retry-evt', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })
    const job = await queue.claim('inbound', 'worker-1')
    expect(job).not.toBeNull()

    // Fail it → triggers enqueueRetry to retry ZSET
    const result = await queue.fail(job!, 'worker-1', 'transient error')
    expect(result).toBe('retried')

    // Verify the retry ZSET has the job with a future score
    const { zsets } = getState()
    const retryZset = zsets.get('pulse:retry:{inbound}')
    expect(retryZset).toBeDefined()
    expect(retryZset!.size).toBe(1)

    for (const [, score] of retryZset!) {
      // Score should be now + 5000ms (attempt 1 * 5000ms base)
      expect(score).toBeGreaterThan(Date.now() + 3000)
    }
  })

  it('getMetrics should return cumulative counts', async () => {
    // Process 3 jobs
    for (let i = 0; i < 3; i++) {
      await queue.enqueue({ eventId: `evt-${i}`, eventType: 'inbound', agentId: `a-${i}`, orgId: 'o1' })
      const job = await queue.claim('inbound', 'worker-1')
      if (job) await queue.complete(job, 'worker-1')
    }

    const metrics = await queue.getMetrics()
    expect(Number(metrics.enqueued)).toBeGreaterThanOrEqual(3)
    expect(Number(metrics.claimed)).toBeGreaterThanOrEqual(3)
    expect(Number(metrics.completed)).toBeGreaterThanOrEqual(3)
  })

  it('getActiveRunCount should reflect in-flight jobs', async () => {
    await queue.enqueue({ eventId: 'evt-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })
    await queue.enqueue({ eventId: 'evt-2', eventType: 'inbound', agentId: 'a2', orgId: 'o1' })

    const job1 = await queue.claim('inbound', 'worker-1')
    const job2 = await queue.claim('inbound', 'worker-1')

    const activeCount = await queue.getActiveRunCount()
    expect(activeCount).toBe(2)

    // Complete one
    await queue.complete(job1!, 'worker-1')
    const afterComplete = await queue.getActiveRunCount()
    expect(afterComplete).toBe(1)

    // Complete the other
    await queue.complete(job2!, 'worker-1')
    const final = await queue.getActiveRunCount()
    expect(final).toBe(0)
  })
})

// ─── Cross-Event-Type Isolation ──────────────────────────────────────────────

describe('Cross-Event-Type Isolation', () => {
  let queue: PulseQueue

  beforeEach(() => {
    clearState()
    vi.clearAllMocks()
    queue = new PulseQueue({ maxConcurrentPerAgent: 10, maxAttempts: 3 })
  })

  it('different event types should not interfere', async () => {
    await queue.enqueue({ eventId: 'in-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })
    await queue.enqueue({ eventId: 'out-1', eventType: 'outbound', agentId: 'a1', orgId: 'o1' })
    await queue.enqueue({ eventId: 'sched-1', eventType: 'scheduled', agentId: 'a1', orgId: 'o1' })

    // Each type should have exactly 1 (via XLEN)
    expect(await queue.getQueueDepth('inbound')).toBe(1)
    expect(await queue.getQueueDepth('outbound')).toBe(1)
    expect(await queue.getQueueDepth('scheduled')).toBe(1)

    // Claim from inbound only
    const inJob = await queue.claim('inbound', 'worker-1')
    expect(inJob!.eventId).toBe('in-1')

    // Inbound empty, outbound/scheduled untouched
    expect(await queue.getQueueDepth('inbound')).toBe(0)
    expect(await queue.getQueueDepth('outbound')).toBe(1)
    expect(await queue.getQueueDepth('scheduled')).toBe(1)

    // Claim from outbound
    const outJob = await queue.claim('outbound', 'worker-1')
    expect(outJob!.eventId).toBe('out-1')

    // Claim from scheduled
    const schedJob = await queue.claim('scheduled', 'worker-1')
    expect(schedJob!.eventId).toBe('sched-1')
  })
})

// ─── Enqueue Sweep Integration ──────────────────────────────────────────────

describe('Enqueue: Sweep Safety Net Integration', () => {
  let queue: PulseQueue

  beforeEach(() => {
    clearState()
    vi.clearAllMocks()
    queue = new PulseQueue({ maxConcurrentPerAgent: 10, maxAttempts: 3 })
  })

  it('sweep should enqueue pending events and they should be claimable', async () => {
    const { sweepPendingInboundEvents } = await import('../enqueue/inbound.js')

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'assistant_inbound_events') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({
                        data: [
                          { id: 'evt-1', assistant_id: 'agent-1' },
                          { id: 'evt-2', assistant_id: 'agent-2' },
                          { id: 'evt-3', assistant_id: 'agent-1', external_message_id: 'agent-msg:run-1:tool-1' },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                { id: 'agent-1', org_id: 'org-1' },
                { id: 'agent-2', org_id: 'org-1' },
              ],
              error: null,
            }),
          }),
        }
      }),
    }

    const count = await sweepPendingInboundEvents(queue, mockSupabase as any)
    expect(count).toBe(3)

    // All 3 should be claimable (via XLEN across streams)
    const depth = await queue.getQueueDepth('inbound')
    expect(depth).toBe(3)

    // Cross-agent message (evt-3) should be in critical lane → claimed first
    // claim() checks critical stream first via claimNonBlocking
    const firstJob = await queue.claim('inbound', 'worker-1')
    expect(firstJob!.eventId).toBe('evt-3')
    expect(firstJob!.priority).toBe('critical')
  })

  it('outbound sweep should handle missing org_id gracefully', async () => {
    const { sweepPendingOutboundEvents } = await import('../enqueue/outbound.js')

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [
                        { id: 'out-1', channel_id: 'ch-1' },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
          }),
        }),
      }),
    }

    const count = await sweepPendingOutboundEvents(queue, mockSupabase as any)
    expect(count).toBe(1)

    // Job should be claimable with orgId='sweep' (placeholder)
    const job = await queue.claim('outbound', 'worker-1')
    expect(job).not.toBeNull()
    expect(job!.orgId).toBe('sweep')
  })

  it('scheduled scanner should mark tasks as claimed after enqueue', async () => {
    const { scanAndEnqueueScheduledTasks } = await import('../enqueue/scheduled.js')

    let updateCalled = false
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'ai_assistants') {
          // Tier 1: agent-level pre-filter via next_wake_at
          return {
            select: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [{ id: 'agent-1' }],
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'agent_scheduled_tasks') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({
                        data: [
                          { id: 'task-1', assistant_id: 'agent-1', org_id: 'org-1', next_run_at: new Date().toISOString() },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockImplementation(() => {
                  updateCalled = true
                  return Promise.resolve({ data: null, error: null })
                }),
              }),
            }),
          }
        }
        return {}
      }),
    }

    await scanAndEnqueueScheduledTasks(queue, mockSupabase as any)
    expect(updateCalled).toBe(true)
  })
})

// ─── Orphan Detector + DB Reset Integration ─────────────────────────────────

describe('Orphan Detector: DB Reset', () => {
  let queue: PulseQueue

  beforeEach(() => {
    clearState()
    vi.clearAllMocks()
    queue = new PulseQueue()
  })

  it('should reset stuck DB events when Supabase is provided', async () => {
    const { sets } = getState()
    if (!sets.has('pulse:active')) sets.set('pulse:active', new Set())
    sets.get('pulse:active')!.add('orphan-1')
    // No lease for orphan-1 (expired)

    let resetCalls = 0
    // Thenable chain stub: counts each terminal await across all chain shapes
    // (inbound/outbound: .update().in().lt(); scheduled: .update().eq().lt();
    // orchestration_steps: .from().select().eq().lt() then per-row .update().eq().eq()).
    const makeChain = (table: string) => {
      let op: 'select' | 'update' | null = null
      const chain: Record<string, unknown> = {}
      chain.update = vi.fn(() => { op = 'update'; return chain })
      chain.select = vi.fn(() => { if (op === null) op = 'select'; return chain })
      chain.eq = vi.fn(() => chain)
      chain.in = vi.fn(() => chain)
      chain.lt = vi.fn(() => chain)
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        resetCalls++
        const value = (table === 'orchestration_steps' && op === 'select')
          ? { data: [], error: null }
          : { data: null, error: null }
        return Promise.resolve(value).then(resolve, reject)
      }
      return chain
    }
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => makeChain(table)),
    }

    const detector = new OrphanDetector(queue, mockSupabase as any)
    const result = await detector.detect()

    expect(result.orphansFound).toBe(1)
    // Should have reset inbound, outbound, scheduled tasks, AND orchestration_steps
    expect(resetCalls).toBe(4)

    detector.stop()
  })

  it('should handle DB reset failure gracefully', async () => {
    const { sets } = getState()
    if (!sets.has('pulse:active')) sets.set('pulse:active', new Set())
    sets.get('pulse:active')!.add('orphan-1')

    const mockLtErr = vi.fn().mockRejectedValue(new Error('DB connection refused'))
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            lt: mockLtErr,
          }),
          eq: vi.fn().mockReturnValue({
            lt: mockLtErr,
          }),
        }),
      }),
    }

    const detector = new OrphanDetector(queue, mockSupabase as any)
    // Should not throw
    const result = await detector.detect()
    expect(result.orphansFound).toBe(1)

    detector.stop()
  })
})

// ─── Full Lifecycle Simulation ──────────────────────────────────────────────

describe('Simulation: Full Lifecycle (enqueue → claim → complete/fail → DLQ)', () => {
  let queue: PulseQueue

  beforeEach(() => {
    clearState()
    vi.clearAllMocks()
    queue = new PulseQueue({ maxConcurrentPerAgent: 10, maxAttempts: 3 })
  })

  it('should handle mixed success/failure outcomes correctly', async () => {
    // Enqueue 6 events (3 will succeed, 3 will always fail)
    for (let i = 0; i < 6; i++) {
      await queue.enqueue({
        eventId: `evt-${i}`, eventType: 'inbound', agentId: `a-${i % 3}`, orgId: 'o1',
      })
    }

    let completed = 0
    let retried = 0
    let dlqd = 0

    // Process: even events succeed, odd events always fail
    // maxAttempts=3, so odd events need 3 fail cycles to DLQ
    // After each fail(retried), the retry goes to retry ZSET.
    // We simulate the RetryDrainer by moving entries from retry ZSET to stream.
    for (let round = 0; round < 50; round++) {
      // First, check for retry ZSET entries and move them to stream (simulate RetryDrainer)
      const { zsets } = getState()
      const retryZset = zsets.get('pulse:retry:{inbound}')
      if (retryZset && retryZset.size > 0) {
        const entries = [...retryZset.entries()]
        for (const [member] of entries) {
          const retryJob = JSON.parse(member) as PulseJob
          retryZset.delete(member)
          await queue.reEnqueueRaw(retryJob)
        }
      }

      const job = await queue.claim('inbound', 'worker-1')
      if (!job) break

      const idx = parseInt(job.eventId.split('-')[1])
      if (idx % 2 === 0) {
        await queue.complete(job, 'worker-1')
        completed++
      } else {
        const result = await queue.fail(job, 'worker-1', `error for ${job.eventId}`)
        if (result === 'retried') retried++
        else if (result === 'dlq') dlqd++
      }
    }

    // 3 even events should complete
    expect(completed).toBe(3)
    // 3 odd events × 3 attempts = 6 retries + 3 DLQ
    expect(retried).toBeGreaterThanOrEqual(3) // At least the first round of retries
    expect(dlqd).toBe(3) // All 3 odd events should DLQ

    // Check DLQ
    const { lists } = getState()
    const dlq = lists.get('pulse:dlq:inbound') || []
    expect(dlq.length).toBe(3)
    for (const entry of dlq) {
      const parsed = JSON.parse(entry)
      expect(parsed.eventId).toBeDefined()
      expect(parsed.errorMessage).toBeDefined()
      expect(parsed.dlqAt).toBeDefined()
    }
  })

  it('metrics should accurately reflect all operations', async () => {
    await queue.enqueue({ eventId: 'evt-1', eventType: 'inbound', agentId: 'a1', orgId: 'o1' })
    await queue.enqueue({ eventId: 'evt-2', eventType: 'inbound', agentId: 'a2', orgId: 'o1' })

    const job1 = await queue.claim('inbound', 'worker-1')
    const job2 = await queue.claim('inbound', 'worker-1')

    await queue.complete(job1!, 'worker-1')
    await queue.fail(job2!, 'worker-1', 'error')

    const metrics = await queue.getMetrics()
    expect(Number(metrics.enqueued)).toBeGreaterThanOrEqual(2)
    expect(Number(metrics.claimed)).toBeGreaterThanOrEqual(2)
    expect(Number(metrics.completed)).toBeGreaterThanOrEqual(1)
    expect(Number(metrics.failed)).toBeGreaterThanOrEqual(1)
  })
})
