/**
 * Tests for runtime drain worker (Redis Streams → Postgres).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @upstash/redis
const mockPipeline = {
  hgetall: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
}

const mockRedis = {
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn().mockResolvedValue(null),
  incr: vi.fn().mockResolvedValue(1),
  del: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  eval: vi.fn().mockResolvedValue(1),
  scan: vi.fn().mockResolvedValue([0, []]),
  xrange: vi.fn().mockResolvedValue([]),
  xdel: vi.fn().mockResolvedValue(0),
  hset: vi.fn().mockResolvedValue(1),
  pipeline: vi.fn().mockReturnValue(mockPipeline),
}

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => mockRedis),
}))

// Set env vars before import
process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io'
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'

// Mock supabase
const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom } as any

function mockUpdate(error: any = null) {
  const chain = {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error }),
      }),
    }),
  }
  return chain
}

function mockInsert(error: any = null) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ error, data: [] }),
    }),
  }
}

function mockUpsert(error: any = null) {
  return {
    upsert: vi.fn().mockResolvedValue({ error }),
  }
}

function mockSelectSingle(data: any = null, error: any = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    }),
  }
}

const { drainRuntimeStreams, __resetRuntimeDrainBackoffForTests } = await import('../runtime-drain.js')

beforeEach(() => {
  vi.clearAllMocks()
  __resetRuntimeDrainBackoffForTests()
  mockRedis.set.mockResolvedValue('OK')
  mockRedis.get.mockResolvedValue(null)
  mockRedis.incr.mockResolvedValue(1)
  mockRedis.scan.mockResolvedValue([0, []])
  mockRedis.xrange.mockResolvedValue([])
})

describe('lock acquisition', () => {
  it('acquires lock and drains', async () => {
    mockRedis.set.mockResolvedValueOnce('OK')
    mockRedis.get.mockResolvedValueOnce('worker-1')

    const result = await drainRuntimeStreams(mockSupabase, 'worker-1')
    expect(result.skipped).toBe(false)
    expect(mockRedis.set).toHaveBeenCalledWith('rt:drain:lock', 'worker-1', { nx: true, ex: 10 })
  })

  it('skips cycle when lock held by another worker', async () => {
    mockRedis.set.mockResolvedValueOnce(null)

    const result = await drainRuntimeStreams(mockSupabase, 'worker-2')
    expect(result.skipped).toBe(true)
    expect(result.heartbeatsUpdated).toBe(0)
  })
})

describe('heartbeat drain', () => {
  it('scans live hashes and updates Postgres', async () => {
    mockRedis.set.mockResolvedValueOnce('OK')
    mockRedis.scan.mockResolvedValueOnce([0, ['rt:r1:live']])

    mockPipeline.exec.mockResolvedValueOnce([
      { cpuPercent: '45', ramPercent: '60', diskPercent: '30', gpuPercent: '', lastSeenAt: '2026-03-29T10:00:00Z', generation: '1' },
    ])

    const updateChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue(updateChain),
    })

    mockRedis.get.mockResolvedValueOnce('worker-1')

    const result = await drainRuntimeStreams(mockSupabase, 'worker-1')
    expect(result.heartbeatsUpdated).toBe(1)
  })

  it('handles empty scan (no active runtimes)', async () => {
    mockRedis.set.mockResolvedValueOnce('OK')
    mockRedis.scan.mockResolvedValueOnce([0, []])
    mockRedis.get.mockResolvedValueOnce('worker-1')

    const result = await drainRuntimeStreams(mockSupabase, 'worker-1')
    expect(result.heartbeatsUpdated).toBe(0)
  })
})

describe('event drain', () => {
  it('reads stream entries and inserts to Postgres with idempotency', async () => {
    mockRedis.set.mockResolvedValueOnce('OK')
    mockRedis.scan.mockResolvedValueOnce([0, []])

    // Return events from xrange
    mockRedis.xrange
      .mockResolvedValueOnce([
        { id: '1000-0', runtime_id: 'r1', org_id: 'org1', agent_id: '', event_type: 'test', severity: 'info', payload: '{}', ingest_event_id: 'r1:1000:0', created_at: '2026-03-29T10:00:00Z' },
      ])
      .mockResolvedValueOnce([]) // costs stream empty

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ error: null, data: [{ id: '1' }] }),
      }),
    })

    mockRedis.get.mockResolvedValueOnce('worker-1')

    const result = await drainRuntimeStreams(mockSupabase, 'worker-1')
    expect(result.eventsDrained).toBe(1)
    expect(mockRedis.xdel).toHaveBeenCalledWith('rt:events', '1000-0')
  })

  it('handles empty event stream', async () => {
    mockRedis.set.mockResolvedValueOnce('OK')
    mockRedis.scan.mockResolvedValueOnce([0, []])
    mockRedis.xrange.mockResolvedValue([])
    mockRedis.get.mockResolvedValueOnce('worker-1')

    const result = await drainRuntimeStreams(mockSupabase, 'worker-1')
    expect(result.eventsDrained).toBe(0)
  })

  it('scopes retry counters to the current event-stream head and resets after head advance', async () => {
    mockRedis.set.mockResolvedValue('OK')
    mockRedis.scan.mockResolvedValue([0, []])
    mockRedis.xrange
      .mockResolvedValueOnce([
        { id: '1000-0', runtime_id: 'r1', org_id: 'org1', agent_id: '', event_type: 'test', severity: 'info', payload: '{}', ingest_event_id: 'r1:1000:0', created_at: '2026-03-29T10:00:00Z' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: '1001-0', runtime_id: 'r1', org_id: 'org1', agent_id: '', event_type: 'test', severity: 'info', payload: '{}', ingest_event_id: 'r1:1001:0', created_at: '2026-03-29T10:00:01Z' },
      ])
      .mockResolvedValueOnce([])

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ error: { message: 'temporary', code: '08006' }, data: [] }),
      }),
    })

    await drainRuntimeStreams(mockSupabase, 'worker-1')
    await drainRuntimeStreams(mockSupabase, 'worker-1')

    expect(mockRedis.incr).toHaveBeenNthCalledWith(1, 'rt:drain:events:retry:1000-0')
    expect(mockRedis.incr).toHaveBeenNthCalledWith(2, 'rt:drain:events:retry:1001-0')
  })
})

describe('cost drain', () => {
  it('reads cost entries and upserts to Postgres', async () => {
    mockRedis.set.mockResolvedValueOnce('OK')
    mockRedis.scan.mockResolvedValueOnce([0, []])
    mockRedis.xrange
      .mockResolvedValueOnce([]) // events empty
      .mockResolvedValueOnce([ // costs
        { id: '2000-0', runtime_id: 'r1', org_id: 'org1', agent_id: 'a1', run_id: 'run1', input_tokens: '100', output_tokens: '50', estimated_cost_usd: '0.01', window_start: '2026-03-29T10:00:00Z', window_end: '2026-03-29T10:01:00Z', cost_seq: '500' },
      ])

    // Mock the select for existing cost + upsert
    const selectChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })

    mockRedis.get.mockResolvedValueOnce('worker-1')

    const result = await drainRuntimeStreams(mockSupabase, 'worker-1')
    expect(result.costsDrained).toBe(1)
    expect(mockRedis.xdel).toHaveBeenCalledWith('rt:costs', '2000-0')
  })
})

describe('error recovery', () => {
  it('returns error but still releases lock', async () => {
    mockRedis.set.mockResolvedValueOnce('OK')
    mockRedis.scan.mockRejectedValueOnce(new Error('Redis timeout'))

    const result = await drainRuntimeStreams(mockSupabase, 'worker-1')
    expect(result.error).toBe('Redis timeout')
    expect(mockRedis.eval).toHaveBeenCalled() // atomic lock release attempted
  })

  it('backs off quietly when Upstash quota is exceeded', async () => {
    mockRedis.set.mockRejectedValueOnce(new Error('ERR max requests limit exceeded. Limit: 500000, Usage: 500001'))

    const first = await drainRuntimeStreams(mockSupabase, 'worker-1')
    const second = await drainRuntimeStreams(mockSupabase, 'worker-1')

    expect(first.skipped).toBe(true)
    expect(first.error).toBeUndefined()
    expect(second.skipped).toBe(true)
    expect(mockRedis.set).toHaveBeenCalledTimes(1)
  })
})

describe('lock renewal', () => {
  it('renews lock mid-drain', async () => {
    mockRedis.set.mockResolvedValueOnce('OK')
    mockRedis.scan.mockResolvedValueOnce([0, ['rt:r1:live']])
    mockPipeline.exec.mockResolvedValueOnce([
      { cpuPercent: '10', ramPercent: '20', diskPercent: '30', gpuPercent: '', lastSeenAt: '2026-03-29T10:00:00Z', generation: '1' },
    ])

    const updateChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue(updateChain),
    })
    mockRedis.get.mockResolvedValueOnce('worker-1')

    await drainRuntimeStreams(mockSupabase, 'worker-1')
    // expire called for lock renewal mid-drain
    expect(mockRedis.expire).toHaveBeenCalledWith('rt:drain:lock', 10)
  })
})

describe('drain metrics recording', () => {
  it('records metrics after successful drain', async () => {
    mockRedis.set.mockResolvedValueOnce('OK')
    mockRedis.scan.mockResolvedValueOnce([0, []])
    mockRedis.get.mockResolvedValueOnce('worker-1')

    await drainRuntimeStreams(mockSupabase, 'worker-1')
    expect(mockRedis.hset).toHaveBeenCalledWith('rt:drain:metrics', expect.objectContaining({
      heartbeatsUpdated: '0',
      eventsDrained: '0',
      costsDrained: '0',
    }))
  })
})
