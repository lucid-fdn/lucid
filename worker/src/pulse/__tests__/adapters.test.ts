/**
 * Pulse Redis Adapters — Comprehensive Test Suite
 *
 * Tests: adapter interface conformance, pipeline normalization,
 * arg translation, factory selection, lifecycle, e2e simulation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IoredisAdapter, IoredisPipelineAdapter } from '../adapters/ioredis.js'

// ─── Helper: create a mock ioredis client ─────────────────────────────────────

function createMockRedisClient() {
  const mockPipeline = {
    get: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
    srem: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    hincrby: vi.fn().mockReturnThis(),
    rpush: vi.fn().mockReturnThis(),
    ltrim: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([[null, 'v1'], [null, 'v2']]),
  }

  return {
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn().mockResolvedValue('value'),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    decr: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
    sadd: vi.fn().mockResolvedValue(1),
    srem: vi.fn().mockResolvedValue(1),
    smembers: vi.fn().mockResolvedValue(['a', 'b']),
    scard: vi.fn().mockResolvedValue(2),
    zadd: vi.fn().mockResolvedValue(1),
    zcard: vi.fn().mockResolvedValue(5),
    hincrby: vi.fn().mockResolvedValue(3),
    hgetall: vi.fn().mockResolvedValue({ field1: 'val1' }),
    rpush: vi.fn().mockResolvedValue(2),
    ltrim: vi.fn().mockResolvedValue('OK'),
    xpending: vi.fn().mockResolvedValue([2, '1-0', '2-0', [['worker-1', '2']]]),
    xinfo: vi.fn().mockResolvedValue([[
      'name', 'pulse-workers',
      'consumers', 1,
      'pending', 2,
      'last-delivered-id', '2-0',
      'entries-read', 5,
      'lag', 3,
    ]]),
    eval: vi.fn().mockResolvedValue('result'),
    pipeline: vi.fn(() => ({ ...mockPipeline, exec: vi.fn().mockResolvedValue([[null, 'v1'], [null, 'v2']]) })),
    _mockPipeline: mockPipeline,
  }
}

// ─── Factory Tests ────────────────────────────────────────────────────────────

describe('Redis Adapter Factory', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_URL
    delete process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN
    delete process.env.REDIS_URL
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('should return null when no Redis vars are set', async () => {
    const { getPulseRedis, resetPulseRedis } = await import('../redis.js')
    resetPulseRedis()
    expect(await getPulseRedis()).toBeNull()
  })

  it('should prioritize Upstash over REDIS_URL', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token'
    process.env.REDIS_URL = 'redis://localhost:6379'

    vi.doMock('@upstash/redis', () => ({
      Redis: vi.fn().mockImplementation(() => ({ ping: vi.fn().mockResolvedValue('PONG') })),
    }))

    const { getPulseRedis, resetPulseRedis } = await import('../redis.js')
    resetPulseRedis()
    const adapter = await getPulseRedis()
    expect(adapter).not.toBeNull()
    expect(adapter!.ping).toBeDefined()
  })

  it('should accept NEXT_PUBLIC Upstash vars', async () => {
    process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
    process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN = 'upstash-token'

    vi.doMock('@upstash/redis', () => ({
      Redis: vi.fn().mockImplementation(() => ({ ping: vi.fn().mockResolvedValue('PONG') })),
    }))

    const { getPulseRedis, resetPulseRedis } = await import('../redis.js')
    resetPulseRedis()
    expect(await getPulseRedis()).not.toBeNull()
  })

  it('should return null with partial Upstash config (URL only)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
    const { getPulseRedis, resetPulseRedis } = await import('../redis.js')
    resetPulseRedis()
    expect(await getPulseRedis()).toBeNull()
  })

  it('should return null with partial Upstash config (token only)', async () => {
    process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token'
    const { getPulseRedis, resetPulseRedis } = await import('../redis.js')
    resetPulseRedis()
    expect(await getPulseRedis()).toBeNull()
  })

  it('should return cached instance on second call', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token'
    vi.doMock('@upstash/redis', () => ({
      Redis: vi.fn().mockImplementation(() => ({ ping: vi.fn().mockResolvedValue('PONG') })),
    }))

    const { getPulseRedis, resetPulseRedis } = await import('../redis.js')
    resetPulseRedis()
    const first = await getPulseRedis()
    const second = await getPulseRedis()
    expect(first).toBe(second)
  })

  it('should handle ioredis connect failure gracefully', async () => {
    process.env.REDIS_URL = 'redis://nonexistent:6379'
    vi.doMock('../adapters/ioredis.js', () => ({
      IoredisAdapter: vi.fn().mockImplementation(() => ({
        connect: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        quit: vi.fn(),
      })),
    }))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getPulseRedis, resetPulseRedis } = await import('../redis.js')
    resetPulseRedis()
    expect(await getPulseRedis()).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[pulse:redis]'),
      expect.stringContaining('ECONNREFUSED'),
    )
    warnSpy.mockRestore()
  })

  it('shutdownPulseRedis should be idempotent', async () => {
    const { shutdownPulseRedis } = await import('../redis.js')
    await shutdownPulseRedis()
    await shutdownPulseRedis()
    await shutdownPulseRedis()
  })

  it('resetPulseRedis should clear cached instance', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token'
    let callCount = 0
    vi.doMock('@upstash/redis', () => ({
      Redis: vi.fn().mockImplementation(() => { callCount++; return { ping: vi.fn().mockResolvedValue('PONG') } }),
    }))

    const { getPulseRedis, resetPulseRedis } = await import('../redis.js')
    resetPulseRedis()
    await getPulseRedis()
    const countAfterFirst = callCount
    resetPulseRedis()
    await getPulseRedis()
    expect(callCount).toBeGreaterThan(countAfterFirst)
  })
})

// ─── UpstashAdapter Interface Conformance ─────────────────────────────────────

describe('UpstashAdapter', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let adapter: any

  beforeEach(async () => {
    const mockPipeline = {
      get: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(), incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(), sadd: vi.fn().mockReturnThis(),
      srem: vi.fn().mockReturnThis(), zcard: vi.fn().mockReturnThis(),
      hincrby: vi.fn().mockReturnThis(), rpush: vi.fn().mockReturnThis(),
      ltrim: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(['val1', 'val2']),
    }

    mockClient = {
      ping: vi.fn().mockResolvedValue('PONG'),
      get: vi.fn().mockResolvedValue('value'),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      incr: vi.fn().mockResolvedValue(1),
      decr: vi.fn().mockResolvedValue(0),
      expire: vi.fn().mockResolvedValue(true),
      sadd: vi.fn().mockResolvedValue(1),
      srem: vi.fn().mockResolvedValue(1),
      smembers: vi.fn().mockResolvedValue(['a', 'b']),
      scard: vi.fn().mockResolvedValue(2),
      zadd: vi.fn().mockResolvedValue(1),
      zcard: vi.fn().mockResolvedValue(5),
      hincrby: vi.fn().mockResolvedValue(3),
      hgetall: vi.fn().mockResolvedValue({ field1: 'val1' }),
      rpush: vi.fn().mockResolvedValue(2),
      ltrim: vi.fn().mockResolvedValue('OK'),
      eval: vi.fn().mockResolvedValue('result'),
      pipeline: vi.fn(() => ({ ...mockPipeline, exec: vi.fn().mockResolvedValue(['val1', 'val2']) })),
    }

    const { UpstashAdapter } = await import('../adapters/upstash.js')
    adapter = new UpstashAdapter(mockClient)
  })

  it('should implement all IPulseRedisAdapter methods', () => {
    const requiredMethods = [
      'ping', 'get', 'set', 'del', 'incr', 'decr', 'expire',
      'sadd', 'srem', 'smembers', 'scard', 'zadd', 'zcard',
      'hincrby', 'hgetall', 'rpush', 'ltrim', 'eval', 'pipeline',
    ]
    for (const m of requiredMethods) expect(typeof adapter[m]).toBe('function')
  })

  it('should pass through ping', async () => {
    expect(await adapter.ping()).toBe('PONG')
    expect(mockClient.ping).toHaveBeenCalled()
  })

  it('should pass through get/set', async () => {
    await adapter.get('key')
    expect(mockClient.get).toHaveBeenCalledWith('key')
    await adapter.set('key', 'val', { nx: true, ex: 60 })
    expect(mockClient.set).toHaveBeenCalledWith('key', 'val', expect.anything())
  })

  it('should normalize expire return to number', async () => {
    mockClient.expire.mockResolvedValue(true)
    expect(await adapter.expire('key', 300)).toBe(1)
    mockClient.expire.mockResolvedValue(false)
    expect(await adapter.expire('key', 300)).toBe(0)
  })

  it('should normalize hgetall empty to null', async () => {
    mockClient.hgetall.mockResolvedValue({})
    expect(await adapter.hgetall('key')).toBeNull()
  })

  it('should normalize hgetall null to null', async () => {
    mockClient.hgetall.mockResolvedValue(null)
    expect(await adapter.hgetall('key')).toBeNull()
  })

  it('should return hgetall data when present', async () => {
    mockClient.hgetall.mockResolvedValue({ a: '1', b: '2' })
    expect(await adapter.hgetall('key')).toEqual({ a: '1', b: '2' })
  })

  it('should pass through eval', async () => {
    await adapter.eval('return 1', ['k1', 'k2'], ['a1'])
    expect(mockClient.eval).toHaveBeenCalledWith('return 1', ['k1', 'k2'], ['a1'])
  })

  it('should create pipeline that returns raw values', async () => {
    const pipeline = adapter.pipeline()
    expect(pipeline.get).toBeDefined()
    const chained = pipeline.get('k').incr('k2').expire('k', 60)
    expect(chained).toBe(pipeline)
  })
})

// ─── IoredisAdapter Interface Conformance (via _fromClient) ───────────────────

describe('IoredisAdapter', () => {
  let mockClient: ReturnType<typeof createMockRedisClient>
  let adapter: IoredisAdapter

  beforeEach(() => {
    mockClient = createMockRedisClient()
    adapter = IoredisAdapter._fromClient(mockClient)
  })

  it('should implement all IPulseRedisAdapter methods', () => {
    const requiredMethods = [
      'ping', 'get', 'set', 'del', 'incr', 'decr', 'expire',
      'sadd', 'srem', 'smembers', 'scard', 'zadd', 'zcard',
      'hincrby', 'hgetall', 'rpush', 'ltrim', 'xpending', 'xinfoGroups',
      'eval', 'pipeline', 'connect', 'quit',
    ]
    for (const m of requiredMethods) {
      expect(typeof (adapter as Record<string, unknown>)[m]).toBe('function')
    }
  })

  it('should connect only once', async () => {
    await adapter.connect()
    await adapter.connect()
    expect(mockClient.connect).toHaveBeenCalledTimes(1)
  })

  it('should translate set with EX and NX args', async () => {
    await adapter.set('key', 'val', { ex: 60, nx: true })
    expect(mockClient.set).toHaveBeenCalledWith('key', 'val', 'EX', 60, 'NX')
  })

  it('should translate set without options', async () => {
    await adapter.set('key', 'val')
    expect(mockClient.set).toHaveBeenCalledWith('key', 'val')
  })

  it('should translate set with only EX', async () => {
    await adapter.set('key', 'val', { ex: 30 })
    expect(mockClient.set).toHaveBeenCalledWith('key', 'val', 'EX', 30)
  })

  it('should translate set with only NX', async () => {
    await adapter.set('key', 'val', { nx: true })
    expect(mockClient.set).toHaveBeenCalledWith('key', 'val', 'NX')
  })

  it('should translate zadd with NX flag', async () => {
    await adapter.zadd('zset', { nx: true }, { score: 1, member: 'a' }, { score: 2, member: 'b' })
    expect(mockClient.zadd).toHaveBeenCalledWith('zset', 'NX', 1, 'a', 2, 'b')
  })

  it('should translate zadd without NX', async () => {
    await adapter.zadd('zset', {}, { score: 1, member: 'a' })
    expect(mockClient.zadd).toHaveBeenCalledWith('zset', 1, 'a')
  })

  it('should translate eval with key count', async () => {
    await adapter.eval('return 1', ['k1', 'k2'], ['a1'])
    expect(mockClient.eval).toHaveBeenCalledWith('return 1', 2, 'k1', 'k2', 'a1')
  })

  it('should translate eval with empty keys and args', async () => {
    await adapter.eval('return 1', [], [])
    expect(mockClient.eval).toHaveBeenCalledWith('return 1', 0)
  })

  it('should normalize hgetall empty object to null', async () => {
    mockClient.hgetall.mockResolvedValue({})
    expect(await adapter.hgetall('key')).toBeNull()
  })

  it('should normalize hgetall null to null', async () => {
    mockClient.hgetall.mockResolvedValue(null)
    expect(await adapter.hgetall('key')).toBeNull()
  })

  it('should return hgetall data when present', async () => {
    mockClient.hgetall.mockResolvedValue({ a: '1', b: '2' })
    expect(await adapter.hgetall('key')).toEqual({ a: '1', b: '2' })
  })

  it('should normalize XPENDING summaries', async () => {
    const summary = await adapter.xpending('stream', 'pulse-workers')
    expect(mockClient.xpending).toHaveBeenCalledWith('stream', 'pulse-workers')
    expect(summary).toEqual({
      pending: 2,
      minId: '1-0',
      maxId: '2-0',
      consumers: [{ name: 'worker-1', pending: 2 }],
    })
  })

  it('should normalize XINFO GROUPS output', async () => {
    const groups = await adapter.xinfoGroups('stream')
    expect(mockClient.xinfo).toHaveBeenCalledWith('GROUPS', 'stream')
    expect(groups).toEqual([{
      name: 'pulse-workers',
      consumers: 1,
      pending: 2,
      lastDeliveredId: '2-0',
      entriesRead: 5,
      lag: 3,
    }])
  })

  it('should handle quit gracefully', async () => {
    await adapter.connect()
    await adapter.quit()
    expect(mockClient.quit).toHaveBeenCalled()
  })

  it('should handle quit when never connected', async () => {
    await adapter.quit() // Should not throw
  })

  it('should handle quit failure gracefully', async () => {
    mockClient.quit.mockRejectedValueOnce(new Error('Already disconnected'))
    await adapter.connect()
    await adapter.quit() // Should not throw
  })
})

// ─── IoredisPipelineAdapter Normalization ─────────────────────────────────────

describe('IoredisPipelineAdapter', () => {
  it('should normalize ioredis pipeline tuples to raw values', async () => {
    const mockP = {
      get: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 'val1'],
        [null, 42],
        [null, 'OK'],
      ]),
    }

    const pipeline = new IoredisPipelineAdapter(mockP)
    const results = await pipeline.exec()
    expect(results).toEqual(['val1', 42, 'OK'])
  })

  it('should return empty array when exec returns null', async () => {
    const mockP = { exec: vi.fn().mockResolvedValue(null) }
    const pipeline = new IoredisPipelineAdapter(mockP)
    expect(await pipeline.exec()).toEqual([])
  })

  it('should throw on pipeline command errors', async () => {
    const mockP = {
      exec: vi.fn().mockResolvedValue([
        [null, 'val1'],
        [new Error('READONLY'), null],
        [null, 'val3'],
      ]),
    }
    const pipeline = new IoredisPipelineAdapter(mockP)
    await expect(pipeline.exec()).rejects.toThrow('Pipeline command 1 failed: READONLY')
  })

  it('should support all pipeline chaining methods', () => {
    const mockP = {
      get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(),
      expire: vi.fn(), sadd: vi.fn(), srem: vi.fn(), zcard: vi.fn(),
      hincrby: vi.fn(), rpush: vi.fn(), ltrim: vi.fn(),
    }
    const pipeline = new IoredisPipelineAdapter(mockP)

    const result = pipeline
      .get('k1')
      .set('k2', 'v2')
      .del('k3')
      .incr('k4')
      .expire('k5', 300)
      .sadd('s', 'member')
      .srem('s', 'member')
      .zcard('z')
      .hincrby('h', 'f', 1)
      .rpush('l', 'item')
      .ltrim('l', 0, 99)

    expect(result).toBe(pipeline)
  })

  it('should handle mixed results with nulls', async () => {
    const mockP = {
      exec: vi.fn().mockResolvedValue([
        [null, 'hello'],
        [null, 5],
        [null, null],
        [null, 'OK'],
      ]),
    }
    const pipeline = new IoredisPipelineAdapter(mockP)
    expect(await pipeline.exec()).toEqual(['hello', 5, null, 'OK'])
  })

  it('should throw on first error in pipeline', async () => {
    const mockP = {
      exec: vi.fn().mockResolvedValue([
        [null, 'val1'],
        [new Error('ERR1'), null],
        [new Error('ERR2'), null],
      ]),
    }
    const pipeline = new IoredisPipelineAdapter(mockP)
    await expect(pipeline.exec()).rejects.toThrow('Pipeline command 1 failed: ERR1')
  })

  it('pipeline set should translate EX/NX args', () => {
    const mockP = { set: vi.fn() }
    const pipeline = new IoredisPipelineAdapter(mockP)

    pipeline.set('k', 'v', { ex: 60, nx: true })
    expect(mockP.set).toHaveBeenCalledWith('k', 'v', 'EX', 60, 'NX')
  })

  it('pipeline set should handle no options', () => {
    const mockP = { set: vi.fn() }
    const pipeline = new IoredisPipelineAdapter(mockP)

    pipeline.set('k', 'v')
    expect(mockP.set).toHaveBeenCalledWith('k', 'v')
  })
})

// ─── E2E Simulation ───────────────────────────────────────────────────────────

describe('Adapter E2E Simulation', () => {
  it('should support full enqueue → claim → complete flow', async () => {
    const storage = new Map<string, string>()
    const sets = new Map<string, Set<string>>()
    const zsets = new Map<string, Map<string, number>>()

    const mockAdapter = {
      get: vi.fn((k: string) => Promise.resolve(storage.get(k) ?? null)),
      set: vi.fn((k: string, v: string) => { storage.set(k, v); return Promise.resolve('OK') }),
      del: vi.fn((...keys: string[]) => {
        let n = 0; for (const k of keys) if (storage.delete(k)) n++
        return Promise.resolve(n)
      }),
      incr: vi.fn((k: string) => {
        const v = parseInt(storage.get(k) || '0') + 1; storage.set(k, String(v))
        return Promise.resolve(v)
      }),
      decr: vi.fn((k: string) => {
        const v = Math.max(0, parseInt(storage.get(k) || '0') - 1); storage.set(k, String(v))
        return Promise.resolve(v)
      }),
      sadd: vi.fn((k: string, ...ms: string[]) => {
        if (!sets.has(k)) sets.set(k, new Set())
        let n = 0; for (const m of ms) if (!sets.get(k)!.has(m)) { sets.get(k)!.add(m); n++ }
        return Promise.resolve(n)
      }),
      srem: vi.fn((k: string, ...ms: string[]) => {
        if (!sets.has(k)) return Promise.resolve(0)
        let n = 0; for (const m of ms) if (sets.get(k)!.delete(m)) n++
        return Promise.resolve(n)
      }),
      scard: vi.fn((k: string) => Promise.resolve(sets.has(k) ? sets.get(k)!.size : 0)),
      zadd: vi.fn((k: string, _o: object, ...items: { score: number; member: string }[]) => {
        if (!zsets.has(k)) zsets.set(k, new Map())
        let n = 0; for (const i of items) if (!zsets.get(k)!.has(i.member)) { zsets.get(k)!.set(i.member, i.score); n++ }
        return Promise.resolve(n)
      }),
      zcard: vi.fn((k: string) => Promise.resolve(zsets.has(k) ? zsets.get(k)!.size : 0)),
    }

    // Enqueue
    const job = JSON.stringify({ eventId: 'evt-001', eventType: 'inbound', agentId: 'a1' })
    expect(await mockAdapter.zadd('pulse:{inbound}:normal', { nx: true }, { score: Date.now(), member: job })).toBe(1)
    expect(await mockAdapter.zcard('pulse:{inbound}:normal')).toBe(1)

    // Claim
    await mockAdapter.set('pulse:lease:run-1', JSON.stringify({ workerId: 'w1' }))
    await mockAdapter.sadd('pulse:active', 'run-1')
    expect(await mockAdapter.scard('pulse:active')).toBe(1)
    expect(await mockAdapter.incr('pulse:agent:a1:inflight')).toBe(1)

    // Complete
    await mockAdapter.del('pulse:lease:run-1')
    await mockAdapter.srem('pulse:active', 'run-1')
    expect(await mockAdapter.decr('pulse:agent:a1:inflight')).toBe(0)
    expect(await mockAdapter.get('pulse:lease:run-1')).toBeNull()
    expect(await mockAdapter.scard('pulse:active')).toBe(0)
  })

  it('should support multi-priority enqueue', async () => {
    const zsets = new Map<string, Map<string, number>>()
    const zadd = (k: string, _o: object, ...items: { score: number; member: string }[]) => {
      if (!zsets.has(k)) zsets.set(k, new Map())
      for (const i of items) zsets.get(k)!.set(i.member, i.score)
      return items.length
    }
    const zcard = (k: string) => zsets.has(k) ? zsets.get(k)!.size : 0

    zadd('pulse:{inbound}:critical', {}, { score: 100, member: 'j1' })
    zadd('pulse:{inbound}:normal', {}, { score: 50, member: 'j2' })
    zadd('pulse:{inbound}:background', {}, { score: 200, member: 'j3' })

    expect(zcard('pulse:{inbound}:critical')).toBe(1)
    expect(zcard('pulse:{inbound}:normal')).toBe(1)
    expect(zcard('pulse:{inbound}:background')).toBe(1)
  })
})

// ─── Smoke Tests ──────────────────────────────────────────────────────────────

describe('Adapter Smoke Tests', () => {
  it('types.ts should export cleanly', async () => {
    const types = await import('../adapters/types.js')
    expect(types).toBeDefined()
  })

  it('index.ts barrel should re-export adapters', async () => {
    const barrel = await import('../adapters/index.js')
    expect(barrel.UpstashAdapter).toBeDefined()
    expect(barrel.IoredisAdapter).toBeDefined()
  })

  it('pulse index.ts should export core functions', async () => {
    const pulse = await import('../index.js')
    expect(pulse.PulseQueue).toBeDefined()
    expect(pulse.getPulseRedis).toBeDefined()
    expect(pulse.shutdownPulseRedis).toBeDefined()
  })

  it('IoredisAdapter._fromClient should create valid adapter', () => {
    const mock = createMockRedisClient()
    const adapter = IoredisAdapter._fromClient(mock)
    expect(adapter.ping).toBeDefined()
    expect(adapter.pipeline).toBeDefined()
    expect(adapter.connect).toBeDefined()
    expect(adapter.quit).toBeDefined()
  })
})
