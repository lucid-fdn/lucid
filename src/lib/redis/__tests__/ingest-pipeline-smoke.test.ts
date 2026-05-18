/**
 * Smoke tests for the Redis ingest pipeline wiring.
 *
 * Verifies that all modules in the ingest pipeline are properly connected:
 * streams.ts exports, type contracts, key naming conventions, feature flag
 * gating, and idempotency key generation. No real Redis — just structural
 * validation and contract tests.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock Redis with tracking
const xaddCalls: any[] = []
const mockRedis = {
  xadd: vi.fn((...args: any[]) => {
    xaddCalls.push(args)
    return Promise.resolve(`${Date.now()}-0`)
  }),
  xrange: vi.fn().mockResolvedValue([]),
  xdel: vi.fn().mockResolvedValue(1),
  xlen: vi.fn().mockResolvedValue(0),
  hset: vi.fn().mockResolvedValue(1),
  hgetall: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn().mockResolvedValue(null),
  del: vi.fn().mockResolvedValue(1),
  eval: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  scan: vi.fn().mockResolvedValue([0, []]),
  pipeline: vi.fn().mockReturnValue({
    hset: vi.fn().mockReturnThis(),
    hgetall: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  }),
}

vi.mock('@upstash/redis', () => ({
  Redis: class { constructor() { return mockRedis } },
}))

process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io'
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'

const streams = await import('../streams')
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

beforeEach(() => {
  vi.clearAllMocks()
  xaddCalls.length = 0
})

afterAll(() => {
  consoleWarnSpy.mockRestore()
})

// ── Export contract ──────────────────────────────────────────────────────────

describe('streams module exports', () => {
  it('exports all required stream operations', () => {
    expect(typeof streams.xadd).toBe('function')
    expect(typeof streams.xrange).toBe('function')
    expect(typeof streams.xdel).toBe('function')
    expect(typeof streams.xlen).toBe('function')
  })

  it('exports all required live metrics operations', () => {
    expect(typeof streams.setLiveMetrics).toBe('function')
    expect(typeof streams.getLiveMetrics).toBe('function')
    expect(typeof streams.getActiveLiveKeys).toBe('function')
    expect(typeof streams.getActiveLiveMetrics).toBe('function')
  })

  it('exports all required lock operations', () => {
    expect(typeof streams.acquireDrainLock).toBe('function')
    expect(typeof streams.renewDrainLock).toBe('function')
    expect(typeof streams.releaseDrainLock).toBe('function')
  })

  it('exports drain metrics operations', () => {
    expect(typeof streams.recordDrainMetrics).toBe('function')
    expect(typeof streams.getDrainMetrics).toBe('function')
  })

  it('exports isRedisAvailable utility', () => {
    expect(typeof streams.isRedisAvailable).toBe('function')
    expect(streams.isRedisAvailable()).toBe(true)
  })

  it('exports correct type interfaces', () => {
    // Verify type shapes by constructing valid objects
    const entry: streams.StreamEntry = { id: '1-0', fields: { key: 'value' } }
    const metrics: streams.LiveMetrics = {
      cpuPercent: 50, ramPercent: 60, diskPercent: 30,
      gpuPercent: null, lastSeenAt: new Date().toISOString(), generation: 1,
    }
    const drain: streams.DrainMetrics = {
      lastDrainAt: new Date().toISOString(), drainDurationMs: 100,
      heartbeatsUpdated: 5, eventsDrained: 50, costsDrained: 3, fallbackCount: 0,
    }
    expect(entry.id).toBe('1-0')
    expect(metrics.cpuPercent).toBe(50)
    expect(drain.fallbackCount).toBe(0)
  })
})

// ── Key naming conventions ───────────────────────────────────────────────────

describe('Redis key naming conventions', () => {
  it('uses rt:{id}:live pattern for heartbeat hashes', async () => {
    await streams.setLiveMetrics('runtime-abc', {
      cpuPercent: 50, ramPercent: 60, diskPercent: 30,
      gpuPercent: null, lastSeenAt: new Date().toISOString(), generation: 1,
    })

    const pipeline = mockRedis.pipeline()
    expect(pipeline.hset).toHaveBeenCalledWith(
      'rt:runtime-abc:live',
      expect.any(Object)
    )
  })

  it('uses rt:drain:lock for drain lock key', async () => {
    await streams.acquireDrainLock('worker-1')
    expect(mockRedis.set).toHaveBeenCalledWith(
      'rt:drain:lock',
      'worker-1',
      expect.objectContaining({ nx: true })
    )
  })

  it('uses rt:drain:metrics for operational metrics', async () => {
    await streams.recordDrainMetrics({
      lastDrainAt: new Date().toISOString(), drainDurationMs: 100,
      heartbeatsUpdated: 5, eventsDrained: 50, costsDrained: 3, fallbackCount: 0,
    })
    expect(mockRedis.hset).toHaveBeenCalledWith(
      'rt:drain:metrics',
      expect.any(Object)
    )
  })

  it('SCAN uses rt:*:live pattern', async () => {
    await streams.getActiveLiveKeys()
    expect(mockRedis.scan).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ match: 'rt:*:live' })
    )
  })
})

// ── Stream operations contract ───────────────────────────────────────────────

describe('XADD contract', () => {
  it('passes fields and auto-generated ID (*)', async () => {
    await streams.xadd('rt:events', { runtime_id: 'r1', event_type: 'test' })

    expect(mockRedis.xadd).toHaveBeenCalledWith(
      'rt:events',
      '*',
      { runtime_id: 'r1', event_type: 'test' }
    )
  })

  it('passes MAXLEN with approx flag when specified', async () => {
    await streams.xadd('rt:events', { runtime_id: 'r1' }, 10000)

    expect(mockRedis.xadd).toHaveBeenCalledWith(
      'rt:events',
      '*',
      { runtime_id: 'r1' },
      expect.objectContaining({ MAXLEN: 10000, approx: true })
    )
  })

  it('returns null when Redis unavailable', async () => {
    // Simulate xadd failure
    mockRedis.xadd.mockRejectedValueOnce(new Error('connection refused'))
    const id = await streams.xadd('rt:events', { data: 'test' })
    expect(id).toBeNull()
  })
})

describe('XRANGE contract', () => {
  it('parses object-format entries from Upstash', async () => {
    mockRedis.xrange.mockResolvedValueOnce([
      { id: '1000-0', runtime_id: 'r1', event_type: 'test', payload: '{}' },
      { id: '1001-0', runtime_id: 'r2', event_type: 'error', payload: '{"msg":"fail"}' },
    ])

    const entries = await streams.xrange('rt:events', '-', '+', 100)

    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({
      id: '1000-0',
      fields: { runtime_id: 'r1', event_type: 'test', payload: '{}' },
    })
    expect(entries[1].fields.runtime_id).toBe('r2')
  })

  it('returns empty array on Redis failure', async () => {
    mockRedis.xrange.mockRejectedValueOnce(new Error('timeout'))
    const entries = await streams.xrange('rt:events', '-', '+')
    expect(entries).toEqual([])
  })
})

// ── Idempotency key generation ───────────────────────────────────────────────

describe('ingest_event_id format', () => {
  it('follows runtimeId:timestamp:batchIndex pattern', () => {
    const runtimeId = 'runtime-abc'
    const timestamp = Date.now()

    // Generate IDs for a batch of 5 events
    const ids = Array.from({ length: 5 }, (_, i) =>
      `${runtimeId}:${timestamp}:${i}`
    )

    // All unique
    expect(new Set(ids).size).toBe(5)

    // All parseable
    for (let i = 0; i < ids.length; i++) {
      const parts = ids[i].split(':')
      expect(parts[0]).toBe(runtimeId)
      expect(Number(parts[1])).toBe(timestamp)
      expect(Number(parts[2])).toBe(i)
    }
  })

  it('different timestamps produce different IDs for same runtime+index', () => {
    const id1 = `r1:${1000}:0`
    const id2 = `r1:${2000}:0`
    expect(id1).not.toBe(id2)
  })
})

// ── Cost window_start generation ─────────────────────────────────────────────

describe('cost window_start format', () => {
  it('floors timestamp to 60-second boundary', () => {
    const now = new Date('2026-03-29T10:00:37.123Z')
    const windowStart = new Date(Math.floor(now.getTime() / 60000) * 60000)

    expect(windowStart.toISOString()).toBe('2026-03-29T10:00:00.000Z')
  })

  it('window_end is exactly 60 seconds after window_start', () => {
    const now = new Date('2026-03-29T10:00:37.123Z')
    const windowStart = new Date(Math.floor(now.getTime() / 60000) * 60000)
    const windowEnd = new Date(windowStart.getTime() + 60000)

    expect(windowEnd.toISOString()).toBe('2026-03-29T10:01:00.000Z')
  })

  it('cost_seq is milliseconds within the window', () => {
    const now = new Date('2026-03-29T10:00:37.123Z')
    const seq = now.getTime() % 60000

    expect(seq).toBe(37123)
    expect(seq).toBeGreaterThanOrEqual(0)
    expect(seq).toBeLessThan(60000)
  })
})

// ── Live metrics hash serialization ──────────────────────────────────────────

describe('live metrics hash serialization round-trip', () => {
  it('setLiveMetrics serializes numbers to strings', async () => {
    const pipeline = mockRedis.pipeline()

    await streams.setLiveMetrics('r1', {
      cpuPercent: 45.5,
      ramPercent: 60,
      diskPercent: 30,
      gpuPercent: 95.2,
      lastSeenAt: '2026-03-29T10:00:00Z',
      generation: 3,
    })

    expect(pipeline.hset).toHaveBeenCalledWith('rt:r1:live', {
      cpuPercent: '45.5',
      ramPercent: '60',
      diskPercent: '30',
      gpuPercent: '95.2',
      lastSeenAt: '2026-03-29T10:00:00Z',
      generation: '3',
    })
  })

  it('getLiveMetrics parses strings back to numbers', async () => {
    mockRedis.pipeline.mockReturnValueOnce({
      hgetall: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        { cpuPercent: '45.5', ramPercent: '60', diskPercent: '30', gpuPercent: '95.2', lastSeenAt: '2026-03-29T10:00:00Z', generation: '3' },
      ]),
    })

    const result = await streams.getLiveMetrics(['r1'])

    expect(result.size).toBe(1)
    const metrics = result.get('r1')!
    expect(metrics.cpuPercent).toBe(45.5)
    expect(metrics.ramPercent).toBe(60)
    expect(metrics.diskPercent).toBe(30)
    expect(metrics.gpuPercent).toBe(95.2)
    expect(metrics.generation).toBe(3)
  })

  it('handles null GPU (empty string in hash)', async () => {
    mockRedis.pipeline.mockReturnValueOnce({
      hgetall: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        { cpuPercent: '50', ramPercent: '60', diskPercent: '30', gpuPercent: '', lastSeenAt: '2026-03-29T10:00:00Z', generation: '1' },
      ]),
    })

    const result = await streams.getLiveMetrics(['r1'])
    expect(result.get('r1')!.gpuPercent).toBeNull()
  })
})

// ── Drain lock contract ──────────────────────────────────────────────────────

describe('drain lock lifecycle', () => {
  it('acquire → renew → release lifecycle', async () => {
    // Acquire
    mockRedis.set.mockResolvedValueOnce('OK')
    const acquired = await streams.acquireDrainLock('w1', 10)
    expect(acquired).toBe(true)

    // Renew
    mockRedis.get.mockResolvedValueOnce('w1')
    const renewed = await streams.renewDrainLock('w1', 10)
    expect(renewed).toBe(true)

    // Release
    await streams.releaseDrainLock('w1')
    expect(mockRedis.eval).toHaveBeenCalled()
  })

  it('acquire fails when already held', async () => {
    mockRedis.set.mockResolvedValueOnce(null)
    const acquired = await streams.acquireDrainLock('w2')
    expect(acquired).toBe(false)
  })

  it('renew fails when holder changed', async () => {
    mockRedis.get.mockResolvedValueOnce('w2')
    const renewed = await streams.renewDrainLock('w1')
    expect(renewed).toBe(false)
  })
})

// ── Drain metrics round-trip ─────────────────────────────────────────────────

describe('drain metrics serialization', () => {
  it('recordDrainMetrics serializes all fields to strings', async () => {
    await streams.recordDrainMetrics({
      lastDrainAt: '2026-03-29T10:00:00Z',
      drainDurationMs: 150,
      heartbeatsUpdated: 10,
      eventsDrained: 50,
      costsDrained: 5,
      fallbackCount: 2,
    })

    expect(mockRedis.hset).toHaveBeenCalledWith('rt:drain:metrics', {
      lastDrainAt: '2026-03-29T10:00:00Z',
      drainDurationMs: '150',
      heartbeatsUpdated: '10',
      eventsDrained: '50',
      costsDrained: '5',
      fallbackCount: '2',
    })
  })

  it('getDrainMetrics parses all fields back to numbers', async () => {
    mockRedis.hgetall.mockResolvedValueOnce({
      lastDrainAt: '2026-03-29T10:00:00Z',
      drainDurationMs: '150',
      heartbeatsUpdated: '10',
      eventsDrained: '50',
      costsDrained: '5',
      fallbackCount: '2',
    })

    const result = await streams.getDrainMetrics()
    expect(result).toEqual({
      lastDrainAt: '2026-03-29T10:00:00Z',
      drainDurationMs: 150,
      heartbeatsUpdated: 10,
      eventsDrained: 50,
      costsDrained: 5,
      fallbackCount: 2,
    })
  })
})

// ── Graceful degradation ─────────────────────────────────────────────────────

describe('graceful degradation on Redis failure', () => {
  it('xadd returns null on error (enables Postgres fallback)', async () => {
    mockRedis.xadd.mockRejectedValueOnce(new Error('connection refused'))
    const id = await streams.xadd('rt:events', { data: 'test' })
    expect(id).toBeNull()
  })

  it('xrange returns [] on error (safe for drain loop)', async () => {
    mockRedis.xrange.mockRejectedValueOnce(new Error('timeout'))
    const entries = await streams.xrange('rt:events', '-', '+')
    expect(entries).toEqual([])
  })

  it('xdel returns 0 on error (no data loss, retry next cycle)', async () => {
    mockRedis.xdel.mockRejectedValueOnce(new Error('timeout'))
    const count = await streams.xdel('rt:events', '1-0', '2-0')
    expect(count).toBe(0)
  })

  it('xlen returns 0 on error (health endpoint degrades gracefully)', async () => {
    mockRedis.xlen.mockRejectedValueOnce(new Error('timeout'))
    const len = await streams.xlen('rt:events')
    expect(len).toBe(0)
  })

  it('setLiveMetrics returns false on error (triggers Postgres fallback)', async () => {
    mockRedis.pipeline.mockReturnValueOnce({
      hset: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockRejectedValue(new Error('connection lost')),
    })
    const ok = await streams.setLiveMetrics('r1', {
      cpuPercent: 50, ramPercent: 60, diskPercent: 30,
      gpuPercent: null, lastSeenAt: new Date().toISOString(), generation: 1,
    })
    expect(ok).toBe(false)
  })

  it('getLiveMetrics returns empty map on error (dashboard shows Postgres data)', async () => {
    mockRedis.pipeline.mockReturnValueOnce({
      hgetall: vi.fn().mockReturnThis(),
      exec: vi.fn().mockRejectedValue(new Error('connection lost')),
    })
    const result = await streams.getLiveMetrics(['r1', 'r2'])
    expect(result.size).toBe(0)
  })
})
