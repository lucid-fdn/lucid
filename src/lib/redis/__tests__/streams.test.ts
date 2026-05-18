/**
 * Tests for Redis Streams ingest buffer operations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock @upstash/redis
const mockPipeline = {
  hset: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  hgetall: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
}

const mockRedis = {
  xadd: vi.fn().mockResolvedValue('1234567890-0'),
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
  pipeline: vi.fn().mockReturnValue(mockPipeline),
}

vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    constructor() {
      return mockRedis
    }
  },
}))

// Set env vars before importing
process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io'
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'

// Must import after mocks
const streams = await import('../streams')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('xadd', () => {
  it('adds entry to stream and returns ID', async () => {
    const id = await streams.xadd('rt:events', { runtime_id: 'r1', event_type: 'test' })
    expect(id).toBe('1234567890-0')
    expect(mockRedis.xadd).toHaveBeenCalledWith(
      'rt:events',
      '*',
      { runtime_id: 'r1', event_type: 'test' },
    )
  })

  it('passes MAXLEN when specified', async () => {
    await streams.xadd('rt:events', { runtime_id: 'r1' }, 10000)
    expect(mockRedis.xadd).toHaveBeenCalledWith(
      'rt:events',
      '*',
      { runtime_id: 'r1' },
      expect.objectContaining({ MAXLEN: 10000 })
    )
  })
})

describe('xrange', () => {
  it('returns parsed stream entries (object format)', async () => {
    mockRedis.xrange.mockResolvedValueOnce([
      { id: '1-0', runtime_id: 'r1', event_type: 'test' },
    ])
    const entries = await streams.xrange('rt:events', '-', '+', 10)
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('1-0')
    expect(entries[0].fields.runtime_id).toBe('r1')
  })

  it('returns empty array when no entries', async () => {
    mockRedis.xrange.mockResolvedValueOnce([])
    const entries = await streams.xrange('rt:events', '-', '+')
    expect(entries).toEqual([])
  })
})

describe('xdel', () => {
  it('deletes entries by ID', async () => {
    mockRedis.xdel.mockResolvedValueOnce(2)
    const count = await streams.xdel('rt:events', '1-0', '2-0')
    expect(count).toBe(2)
  })

  it('returns 0 for empty id list', async () => {
    const count = await streams.xdel('rt:events')
    expect(count).toBe(0)
  })
})

describe('xlen', () => {
  it('returns stream length', async () => {
    mockRedis.xlen.mockResolvedValueOnce(42)
    const len = await streams.xlen('rt:events')
    expect(len).toBe(42)
  })
})

describe('setLiveMetrics', () => {
  it('sets hash with TTL via pipeline', async () => {
    mockPipeline.exec.mockResolvedValueOnce([1, 1])
    const result = await streams.setLiveMetrics('runtime-1', {
      cpuPercent: 45,
      ramPercent: 60,
      diskPercent: 30,
      gpuPercent: null,
      lastSeenAt: '2026-03-29T10:00:00Z',
      generation: 1,
    })
    expect(result).toBe(true)
    expect(mockPipeline.hset).toHaveBeenCalledWith('rt:runtime-1:live', expect.objectContaining({
      cpuPercent: '45',
      ramPercent: '60',
    }))
    expect(mockPipeline.expire).toHaveBeenCalledWith('rt:runtime-1:live', 300)
  })
})

describe('getLiveMetrics', () => {
  it('returns metrics for multiple runtimes via pipeline', async () => {
    mockPipeline.exec.mockResolvedValueOnce([
      { cpuPercent: '45', ramPercent: '60', diskPercent: '30', gpuPercent: '', lastSeenAt: '2026-03-29T10:00:00Z', generation: '1' },
      null,
    ])

    const result = await streams.getLiveMetrics(['r1', 'r2'])
    expect(result.size).toBe(1)
    expect(result.get('r1')?.cpuPercent).toBe(45)
    expect(result.has('r2')).toBe(false)
  })

  it('returns empty map for empty input', async () => {
    const result = await streams.getLiveMetrics([])
    expect(result.size).toBe(0)
  })
})

describe('acquireDrainLock', () => {
  it('returns true when lock acquired', async () => {
    mockRedis.set.mockResolvedValueOnce('OK')
    const acquired = await streams.acquireDrainLock('worker-1')
    expect(acquired).toBe(true)
    expect(mockRedis.set).toHaveBeenCalledWith('rt:drain:lock', 'worker-1', { nx: true, ex: 10 })
  })

  it('returns false when lock already held', async () => {
    mockRedis.set.mockResolvedValueOnce(null)
    const acquired = await streams.acquireDrainLock('worker-2')
    expect(acquired).toBe(false)
  })
})

describe('renewDrainLock', () => {
  it('renews when value matches', async () => {
    mockRedis.get.mockResolvedValueOnce('worker-1')
    mockRedis.expire.mockResolvedValueOnce(1)
    const renewed = await streams.renewDrainLock('worker-1')
    expect(renewed).toBe(true)
  })

  it('fails when different holder', async () => {
    mockRedis.get.mockResolvedValueOnce('worker-2')
    const renewed = await streams.renewDrainLock('worker-1')
    expect(renewed).toBe(false)
  })
})

describe('releaseDrainLock', () => {
  it('uses atomic Lua eval to release lock', async () => {
    await streams.releaseDrainLock('worker-1')
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("GET"'),
      ['rt:drain:lock'],
      ['worker-1']
    )
  })

  it('falls back to get+del when eval fails', async () => {
    mockRedis.eval.mockRejectedValueOnce(new Error('NOSCRIPT'))
    mockRedis.get.mockResolvedValueOnce('worker-1')
    await streams.releaseDrainLock('worker-1')
    expect(mockRedis.del).toHaveBeenCalledWith('rt:drain:lock')
  })

  it('does not delete in fallback when different holder', async () => {
    mockRedis.eval.mockRejectedValueOnce(new Error('NOSCRIPT'))
    mockRedis.get.mockResolvedValueOnce('worker-2')
    await streams.releaseDrainLock('worker-1')
    expect(mockRedis.del).not.toHaveBeenCalled()
  })
})

describe('drainMetrics', () => {
  it('records and retrieves drain metrics', async () => {
    const metrics: streams.DrainMetrics = {
      lastDrainAt: '2026-03-29T10:00:00Z',
      drainDurationMs: 150,
      heartbeatsUpdated: 10,
      eventsDrained: 50,
      costsDrained: 5,
      fallbackCount: 0,
    }
    await streams.recordDrainMetrics(metrics)
    expect(mockRedis.hset).toHaveBeenCalledWith('rt:drain:metrics', expect.objectContaining({
      lastDrainAt: '2026-03-29T10:00:00Z',
      drainDurationMs: '150',
    }))
  })

  it('returns null when no metrics exist', async () => {
    mockRedis.hgetall.mockResolvedValueOnce(null)
    const result = await streams.getDrainMetrics()
    expect(result).toBeNull()
  })

  it('parses stored metrics', async () => {
    mockRedis.hgetall.mockResolvedValueOnce({
      lastDrainAt: '2026-03-29T10:00:00Z',
      drainDurationMs: '150',
      heartbeatsUpdated: '10',
      eventsDrained: '50',
      costsDrained: '5',
      fallbackCount: '0',
    })
    const result = await streams.getDrainMetrics()
    expect(result).not.toBeNull()
    expect(result!.drainDurationMs).toBe(150)
    expect(result!.eventsDrained).toBe(50)
  })
})

describe('isRedisAvailable', () => {
  it('returns true when env vars set', () => {
    expect(streams.isRedisAvailable()).toBe(true)
  })
})
