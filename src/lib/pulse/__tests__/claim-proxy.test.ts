import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONDITIONAL_DEL_LUA,
  FLOOR_DECR_LUA,
  PulseKeys,
  type PulseJob,
} from '@contracts/pulse'

vi.mock('server-only', () => ({}))

const mockSupabaseBuilder = {
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  then: vi.fn().mockImplementation((cb: (value: { error: null }) => void) => {
    cb({ error: null })
    return { catch: vi.fn() }
  }),
}

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue(mockSupabaseBuilder),
  },
}))

const mockPipeline = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  sadd: vi.fn().mockReturnThis(),
  srem: vi.fn().mockReturnThis(),
  hincrby: vi.fn().mockReturnThis(),
  exec: vi.fn(),
}

const mockRedis = {
  xreadgroup: vi.fn(),
  xack: vi.fn(),
  xadd: vi.fn(),
  eval: vi.fn(),
  pipeline: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  srem: vi.fn(),
  sadd: vi.fn(),
}

vi.mock('../redis-client', () => ({
  getPulseRedis: vi.fn(async () => mockRedis),
}))

function makeJob(overrides?: Partial<PulseJob>): PulseJob {
  return {
    runId: 'evt-123:0',
    eventId: 'evt-123',
    eventType: 'inbound',
    agentId: 'agent-1',
    orgId: 'org-1',
    priority: 'normal',
    attempt: 0,
    enqueuedAt: 1000,
    ...overrides,
  }
}

function streamEntry(job: PulseJob): Array<[string, Array<[string, string[]]>]> {
  return [[PulseKeys.stream(job.eventType, job.priority), [['1710000000000-0', ['job', JSON.stringify(job)]]]]]
}

describe('Pulse claim proxy', () => {
  let claimForRuntime: typeof import('../claim-proxy').claimForRuntime
  let completeForRuntime: typeof import('../claim-proxy').completeForRuntime
  let failForRuntime: typeof import('../claim-proxy').failForRuntime
  let enqueueAndClaimSelf: typeof import('../claim-proxy').enqueueAndClaimSelf
  let isPulseAvailable: typeof import('../claim-proxy').isPulseAvailable

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379')

    mockRedis.pipeline.mockReturnValue(mockPipeline)
    mockPipeline.exec.mockResolvedValue([1, 1])
    mockRedis.set.mockResolvedValue('OK')
    mockRedis.xack.mockResolvedValue(1)
    mockRedis.del.mockResolvedValue(1)
    mockRedis.srem.mockResolvedValue(1)
    mockRedis.sadd.mockResolvedValue(1)

    const mod = await import('../claim-proxy')
    claimForRuntime = mod.claimForRuntime
    completeForRuntime = mod.completeForRuntime
    failForRuntime = mod.failForRuntime
    enqueueAndClaimSelf = mod.enqueueAndClaimSelf
    isPulseAvailable = mod.isPulseAvailable
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reports Pulse availability from REDIS_URL', () => {
    expect(isPulseAvailable()).toBe(true)
  })

  it('claims with priority sweep and blocking fallback', async () => {
    const job = makeJob()
    mockRedis.eval.mockResolvedValueOnce(1) // rate limit count
    mockRedis.xreadgroup
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(streamEntry(job))
    mockPipeline.exec
      .mockResolvedValueOnce([1, 1]) // inflight
      .mockResolvedValueOnce(['OK', 1]) // lease + active
      .mockResolvedValueOnce([1, 1]) // metrics

    const result = await claimForRuntime('inbound', 'runtime-1', { waitMs: 15000 })

    expect(result).not.toBeNull()
    expect(result?.leaseToken).toBe('relay-runtime-1')
    expect(mockRedis.xreadgroup).toHaveBeenNthCalledWith(
      1,
      'pulse-workers',
      'relay-runtime-1',
      [PulseKeys.stream('inbound', 'critical')],
      ['>'],
      { count: 1 },
    )
    expect(mockRedis.xreadgroup).toHaveBeenNthCalledWith(
      3,
      'pulse-workers',
      'relay-runtime-1',
      [
        PulseKeys.stream('inbound', 'critical'),
        PulseKeys.stream('inbound', 'normal'),
        PulseKeys.stream('inbound', 'background'),
      ],
      ['>', '>', '>'],
      { count: 1, block: 15000 },
    )
    expect(mockRedis.xack).toHaveBeenCalledWith(
      PulseKeys.stream('inbound', 'normal'),
      'pulse-workers',
      '1710000000000-0',
    )
  })

  it('re-enqueues when over concurrency limit', async () => {
    const job = makeJob()
    mockRedis.eval
      .mockResolvedValueOnce(1) // rate limit
      .mockResolvedValueOnce(0) // floor decr
    mockRedis.xreadgroup
      .mockResolvedValueOnce(streamEntry(job))
    mockPipeline.exec.mockResolvedValueOnce([4, 1]) // inflight over limit

    const result = await claimForRuntime('inbound', 'runtime-1', { waitMs: 0 })

    expect(result).toBeNull()
    expect(mockRedis.eval).toHaveBeenLastCalledWith(FLOOR_DECR_LUA, [PulseKeys.agentInflight('agent-1')], [])
    expect(mockRedis.del).toHaveBeenCalledWith(PulseKeys.dedup('evt-123', 0))
    expect(mockRedis.xadd).toHaveBeenCalled()
  })

  it('returns null when lease acquisition fails', async () => {
    const job = makeJob()
    mockRedis.eval.mockResolvedValueOnce(1)
    mockRedis.xreadgroup.mockResolvedValueOnce(streamEntry(job))
    mockPipeline.exec
      .mockResolvedValueOnce([1, 1])
      .mockResolvedValueOnce([null, 1])

    const result = await claimForRuntime('inbound', 'runtime-1', { waitMs: 0 })

    expect(result).toBeNull()
    expect(mockRedis.srem).toHaveBeenCalledWith(PulseKeys.active(), job.runId)
  })

  it('completes with fenced lease release', async () => {
    const job = makeJob()
    mockRedis.eval
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
    mockPipeline.exec.mockResolvedValueOnce([1, 1])

    const result = await completeForRuntime(job, 'relay-runtime-1')

    expect(result).toBe(true)
    expect(mockRedis.eval).toHaveBeenNthCalledWith(
      1,
      CONDITIONAL_DEL_LUA,
      [PulseKeys.lease(job.runId)],
      ['relay-runtime-1'],
    )
    expect(mockRedis.srem).toHaveBeenCalledWith(PulseKeys.active(), job.runId)
  })

  it('fails with fenced lease release', async () => {
    const job = makeJob()
    mockRedis.eval
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
    mockPipeline.exec.mockResolvedValueOnce([1, 1])

    const result = await failForRuntime(job, 'relay-runtime-1')

    expect(result).toBe(true)
    expect(mockPipeline.hincrby).toHaveBeenCalledWith(expect.stringContaining('pulse:metrics:'), 'failed', 1)
  })

  it('enqueues and claims self with native worker id', async () => {
    mockRedis.eval.mockResolvedValueOnce(1)
    mockPipeline.exec
      .mockResolvedValueOnce([1, 1])
      .mockResolvedValueOnce(['OK', 1])
      .mockResolvedValueOnce([1, 1])

    const result = await enqueueAndClaimSelf({
      eventId: 'evt-abc',
      eventType: 'inbound',
      agentId: 'agent-1',
      orgId: 'org-1',
      runtimeId: 'runtime-c2a',
    })

    expect(result).not.toBeNull()
    expect(result?.leaseToken).toBe('native-runtime-c2a')
    expect(mockRedis.xadd).toHaveBeenCalledWith(
      PulseKeys.stream('inbound', 'normal'),
      '*',
      expect.objectContaining({ job: expect.any(String) }),
      expect.objectContaining({ maxlen: 10000, approximate: true }),
    )
  })
})
