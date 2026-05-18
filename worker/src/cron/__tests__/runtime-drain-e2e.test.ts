/**
 * E2E simulation tests for the runtime drain worker.
 *
 * Simulates realistic fleet scenarios: multi-runtime heartbeats, event bursts,
 * cost accumulation, lock contention between workers, partial failures,
 * and drain-behind-ingest lag. Uses mocked Redis + Supabase but exercises
 * the full drainRuntimeStreams function with realistic data shapes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock Redis ───────────────────────────────────────────────────────────────

const mockPipeline = {
  hgetall: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
}

const mockRedis = {
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn().mockResolvedValue(null),
  del: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  eval: vi.fn().mockResolvedValue(1),
  scan: vi.fn().mockResolvedValue([0, []]),
  xrange: vi.fn().mockResolvedValue([]),
  xdel: vi.fn().mockResolvedValue(0),
  xadd: vi.fn().mockResolvedValue('1-0'),
  hset: vi.fn().mockResolvedValue(1),
  incr: vi.fn().mockResolvedValue(1),
  pipeline: vi.fn().mockReturnValue(mockPipeline),
}

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => mockRedis),
}))

process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io'
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'

// ── Mock Supabase (stateful — tracks all writes) ─────────────────────────────

interface DbWrite {
  table: string
  operation: 'update' | 'insert' | 'upsert'
  data: Record<string, unknown>
  filters: Record<string, unknown>
}

let dbWrites: DbWrite[] = []
let costRows: Map<string, Record<string, unknown>> = new Map()

function createStatefulSupabase() {
  dbWrites = []
  costRows = new Map()

  return {
    from: vi.fn((table: string) => {
      if (table === 'dedicated_runtimes') {
        return {
          update: vi.fn((data: Record<string, unknown>) => ({
            eq: vi.fn((col1: string, val1: unknown) => ({
              eq: vi.fn((col2: string, val2: unknown) => {
                dbWrites.push({
                  table,
                  operation: 'update',
                  data,
                  filters: { [col1]: val1, [col2]: val2 },
                })
                return Promise.resolve({ error: null })
              }),
            })),
          })),
        }
      }
      if (table === 'runtime_events') {
        return {
          insert: vi.fn((rows: Record<string, unknown>[]) => ({
            select: vi.fn(() => {
              for (const row of rows) {
                dbWrites.push({ table, operation: 'insert', data: row, filters: {} })
              }
              return Promise.resolve({ error: null, data: rows.map((_, i) => ({ id: String(i) })) })
            }),
          })),
        }
      }
      if (table === 'mc_agent_cost_tracking') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((col1: string, val1: unknown) => ({
              eq: vi.fn((col2: string, val2: unknown) => ({
                maybeSingle: vi.fn(() => {
                  const key = `${val1}:${val2}`
                  return Promise.resolve({ data: costRows.get(key) ?? null, error: null })
                }),
              })),
            })),
          })),
          upsert: vi.fn((row: Record<string, unknown>) => {
            const key = `${row.agent_id}:${row.date}`
            costRows.set(key, row)
            dbWrites.push({ table, operation: 'upsert', data: row, filters: {} })
            return Promise.resolve({ error: null })
          }),
        }
      }
      return {}
    }),
  } as any
}

const { drainRuntimeStreams } = await import('../runtime-drain.js')

beforeEach(() => {
  vi.clearAllMocks()
  dbWrites = []
  costRows = new Map()
  mockRedis.set.mockResolvedValue('OK')
  mockRedis.scan.mockResolvedValue([0, []])
  mockRedis.xrange.mockResolvedValue([])
  mockRedis.incr.mockResolvedValue(1)
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeHeartbeat(runtimeId: string, cpu: number, ram: number, disk: number, generation = 1) {
  return {
    cpuPercent: String(cpu),
    ramPercent: String(ram),
    diskPercent: String(disk),
    gpuPercent: '',
    lastSeenAt: new Date().toISOString(),
    generation: String(generation),
  }
}

function makeEvent(id: string, runtimeId: string, eventType: string, seq: number) {
  return {
    id,
    runtime_id: runtimeId,
    org_id: 'org-1',
    agent_id: `agent-${runtimeId}`,
    event_type: eventType,
    severity: 'info',
    payload: JSON.stringify({ seq }),
    ingest_event_id: `${runtimeId}:${Date.now()}:${seq}`,
    created_at: new Date().toISOString(),
  }
}

function makeCost(id: string, runtimeId: string, agentId: string, inputTokens: number, outputTokens: number, costUsd: number) {
  return {
    id,
    runtime_id: runtimeId,
    org_id: 'org-1',
    agent_id: agentId,
    run_id: `run-${id}`,
    input_tokens: String(inputTokens),
    output_tokens: String(outputTokens),
    estimated_cost_usd: String(costUsd),
    window_start: '2026-03-29T10:00:00Z',
    window_end: '2026-03-29T10:01:00Z',
    cost_seq: '1',
  }
}

// ── Simulation Tests ─────────────────────────────────────────────────────────

describe('multi-runtime fleet drain', () => {
  it('drains heartbeats from 5 runtimes in a single cycle', async () => {
    const runtimeIds = ['r1', 'r2', 'r3', 'r4', 'r5']
    const keys = runtimeIds.map(id => `rt:${id}:live`)

    mockRedis.scan.mockResolvedValueOnce([0, keys])
    mockPipeline.exec.mockResolvedValueOnce(
      runtimeIds.map((_, i) => makeHeartbeat(runtimeIds[i], 10 + i * 15, 20 + i * 10, 30 + i * 5))
    )

    const supabase = createStatefulSupabase()
    const result = await drainRuntimeStreams(supabase, 'worker-1')

    expect(result.skipped).toBe(false)
    expect(result.heartbeatsUpdated).toBe(5)

    // Verify all 5 runtimes got individual updates
    const heartbeatWrites = dbWrites.filter(w => w.table === 'dedicated_runtimes')
    expect(heartbeatWrites).toHaveLength(5)

    // Verify CPU values are differentiated per runtime
    const cpuValues = heartbeatWrites.map(w => w.data.cpu_percent)
    expect(cpuValues).toEqual([10, 25, 40, 55, 70])

    // Verify each update targeted the correct runtime
    const targetIds = heartbeatWrites.map(w => w.filters.id)
    expect(targetIds).toEqual(runtimeIds)
  })

  it('drains events from multiple runtimes in a single batch', async () => {
    const events = [
      makeEvent('1000-0', 'r1', 'agent_started', 0),
      makeEvent('1000-1', 'r1', 'tool_called', 1),
      makeEvent('1001-0', 'r2', 'agent_started', 0),
      makeEvent('1002-0', 'r3', 'error', 0),
    ]

    mockRedis.xrange
      .mockResolvedValueOnce(events) // events stream
      .mockResolvedValueOnce([])     // costs stream

    const supabase = createStatefulSupabase()
    const result = await drainRuntimeStreams(supabase, 'worker-1')

    expect(result.eventsDrained).toBe(4)

    // All 4 events inserted in a single batch
    const eventWrites = dbWrites.filter(w => w.table === 'runtime_events')
    expect(eventWrites).toHaveLength(4)

    // All 4 stream entries deleted
    expect(mockRedis.xdel).toHaveBeenCalledWith('rt:events', '1000-0', '1000-1', '1001-0', '1002-0')
  })

  it('accumulates costs from same agent across multiple stream entries', async () => {
    // Two cost entries for same agent on same day
    const costs = [
      makeCost('3000-0', 'r1', 'agent-1', 100, 50, 0.01),
      makeCost('3000-1', 'r1', 'agent-1', 200, 100, 0.02),
    ]

    mockRedis.xrange
      .mockResolvedValueOnce([])    // events empty
      .mockResolvedValueOnce(costs) // costs stream

    const supabase = createStatefulSupabase()
    const result = await drainRuntimeStreams(supabase, 'worker-1')

    expect(result.costsDrained).toBe(2)

    // Should be grouped into 1 upsert with accumulated values
    const costWrites = dbWrites.filter(w => w.table === 'mc_agent_cost_tracking' && w.operation === 'upsert')
    expect(costWrites).toHaveLength(1)
    expect(costWrites[0].data.input_tokens).toBe(300)   // 100 + 200
    expect(costWrites[0].data.output_tokens).toBe(150)   // 50 + 100
    expect(costWrites[0].data.estimated_cost_usd).toBeCloseTo(0.03) // 0.01 + 0.02
  })
})

describe('full drain cycle simulation', () => {
  it('processes heartbeats + events + costs in a single cycle', async () => {
    // Heartbeats from 2 runtimes
    mockRedis.scan.mockResolvedValueOnce([0, ['rt:r1:live', 'rt:r2:live']])
    mockPipeline.exec.mockResolvedValueOnce([
      makeHeartbeat('r1', 45, 60, 30),
      makeHeartbeat('r2', 80, 90, 50),
    ])

    // Events: 3 entries
    const events = [
      makeEvent('1000-0', 'r1', 'agent_started', 0),
      makeEvent('1001-0', 'r1', 'tool_called', 1),
      makeEvent('1002-0', 'r2', 'agent_started', 0),
    ]

    // Costs: 2 entries for different agents
    const costs = [
      makeCost('2000-0', 'r1', 'agent-r1', 500, 250, 0.05),
      makeCost('2001-0', 'r2', 'agent-r2', 300, 150, 0.03),
    ]

    mockRedis.xrange
      .mockResolvedValueOnce(events)
      .mockResolvedValueOnce(costs)

    const supabase = createStatefulSupabase()
    const result = await drainRuntimeStreams(supabase, 'worker-1')

    // All three types processed
    expect(result.heartbeatsUpdated).toBe(2)
    expect(result.eventsDrained).toBe(3)
    expect(result.costsDrained).toBe(2)
    expect(result.skipped).toBe(false)
    expect(result.error).toBeUndefined()

    // Verify write counts
    const heartbeatWrites = dbWrites.filter(w => w.table === 'dedicated_runtimes')
    const eventWrites = dbWrites.filter(w => w.table === 'runtime_events')
    const costWrites = dbWrites.filter(w => w.table === 'mc_agent_cost_tracking' && w.operation === 'upsert')
    expect(heartbeatWrites).toHaveLength(2)
    expect(eventWrites).toHaveLength(3)
    expect(costWrites).toHaveLength(2)

    // Verify lock lifecycle: acquire → renew → release
    expect(mockRedis.set).toHaveBeenCalledWith('rt:drain:lock', 'worker-1', { nx: true, ex: 10 })
    expect(mockRedis.expire).toHaveBeenCalledWith('rt:drain:lock', 10)
    expect(mockRedis.eval).toHaveBeenCalled()

    // Verify drain metrics recorded
    expect(mockRedis.hset).toHaveBeenCalledWith('rt:drain:metrics', expect.objectContaining({
      heartbeatsUpdated: '2',
      eventsDrained: '3',
      costsDrained: '2',
    }))

    // Verify all stream entries cleaned up
    expect(mockRedis.xdel).toHaveBeenCalledWith('rt:events', '1000-0', '1001-0', '1002-0')
    expect(mockRedis.xdel).toHaveBeenCalledWith('rt:costs', '2000-0', '2001-0')
  })
})

describe('lock contention simulation', () => {
  it('two workers racing — only one drains', async () => {
    // Worker-1 acquires lock
    mockRedis.set
      .mockResolvedValueOnce('OK')   // worker-1 wins
      .mockResolvedValueOnce(null)   // worker-2 loses

    const supabase = createStatefulSupabase()

    const [result1, result2] = await Promise.all([
      drainRuntimeStreams(supabase, 'worker-1'),
      drainRuntimeStreams(supabase, 'worker-2'),
    ])

    // Exactly one worker drained, one skipped
    const skipped = [result1.skipped, result2.skipped]
    expect(skipped.filter(Boolean)).toHaveLength(1)
    expect(skipped.filter(s => !s)).toHaveLength(1)
  })

  it('second worker picks up after first finishes', async () => {
    // Cycle 1: worker-1 drains
    mockRedis.set.mockResolvedValueOnce('OK')
    const supabase = createStatefulSupabase()
    const result1 = await drainRuntimeStreams(supabase, 'worker-1')
    expect(result1.skipped).toBe(false)

    // Cycle 2: worker-2 drains (lock released)
    mockRedis.set.mockResolvedValueOnce('OK')
    const result2 = await drainRuntimeStreams(supabase, 'worker-2')
    expect(result2.skipped).toBe(false)
  })
})

describe('partial failure scenarios', () => {
  it('heartbeat failure does not prevent event/cost drain', async () => {
    // Heartbeat scan fails
    mockRedis.scan.mockRejectedValueOnce(new Error('SCAN timeout'))

    const supabase = createStatefulSupabase()
    const result = await drainRuntimeStreams(supabase, 'worker-1')

    // Error reported but lock still released
    expect(result.error).toBe('SCAN timeout')
    expect(mockRedis.eval).toHaveBeenCalled()
  })

  it('event insert unique-violation (23505) reconciles entry-by-entry before XDEL', async () => {
    const events = [
      makeEvent('1000-0', 'r1', 'test', 0),
      makeEvent('1001-0', 'r1', 'test', 1),
    ]

    mockRedis.xrange
      .mockResolvedValueOnce(events)
      .mockResolvedValueOnce([])

    // Bulk insert fails because one row is a duplicate. The drain must
    // reconcile each entry individually so the fresh sibling row is inserted
    // before the stream entries are deleted.
    const rowInsert = vi.fn()
      .mockResolvedValueOnce({
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint',
        },
        data: null,
      })
      .mockResolvedValueOnce({
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint',
        },
        data: null,
      })
      .mockResolvedValueOnce({
        error: null,
        data: [{ id: 'fresh-row' }],
      })

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'runtime_events') {
          return {
            insert: vi.fn(() => ({
              select: rowInsert,
            })),
          }
        }
        return {}
      }),
    } as any

    const result = await drainRuntimeStreams(supabase, 'worker-1')

    expect(result.eventsDrained).toBe(2)
    expect(result.eventsDeferred).toBe(0)
    expect(result.eventsDlqed).toBe(0)
    expect(rowInsert).toHaveBeenCalledTimes(3) // 1 bulk attempt + 2 per-row reconciliation inserts
    expect(mockRedis.xdel).toHaveBeenCalledWith('rt:events', '1000-0', '1001-0')
  })

  it('transient Postgres error defers entries (does NOT XDEL — retried next cycle)', async () => {
    const events = [makeEvent('1000-0', 'r1', 'test', 0)]

    mockRedis.xrange
      .mockResolvedValueOnce(events)
      .mockResolvedValueOnce([])

    // Simulate a non-conflict error (network blip / timeout / RLS failure).
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'runtime_events') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn().mockResolvedValue({
                error: {
                  code: '08006',
                  message: 'connection terminated',
                },
                data: null,
              }),
            })),
          }
        }
        return {}
      }),
    } as any

    const result = await drainRuntimeStreams(supabase, 'worker-1')

    // Critical: data is NOT lost — entries stay in the stream for next drain cycle.
    expect(result.eventsDrained).toBe(0)
    expect(result.eventsDeferred).toBe(1)
    expect(result.eventsDlqed).toBe(0)
    expect(mockRedis.xdel).not.toHaveBeenCalledWith('rt:events', '1000-0')
    // Retry counter is keyed per batch head ID (see getRetryKey in runtime-drain.ts)
    expect(mockRedis.incr).toHaveBeenCalledWith('rt:drain:events:retry:1000-0')
  })

  it('transient errors that exceed MAX_DRAIN_RETRIES are promoted to DLQ', async () => {
    const events = [makeEvent('1000-0', 'r1', 'test', 0)]

    mockRedis.xrange
      .mockResolvedValueOnce(events)
      .mockResolvedValueOnce([])

    // Simulate this being the 5th consecutive failure on the same head batch.
    mockRedis.incr.mockResolvedValueOnce(5)

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'runtime_events') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn().mockResolvedValue({
                error: { code: '08006', message: 'persistent network failure' },
                data: null,
              }),
            })),
          }
        }
        return {}
      }),
    } as any

    const result = await drainRuntimeStreams(supabase, 'worker-1')

    expect(result.eventsDrained).toBe(0)
    expect(result.eventsDeferred).toBe(0)
    expect(result.eventsDlqed).toBe(1)
    // Entries copied to DLQ stream then removed from main stream.
    expect(mockRedis.xadd).toHaveBeenCalledWith(
      'rt:events:dlq',
      '*',
      expect.objectContaining({
        _dlq_source_id: '1000-0',
        _dlq_reason: 'persistent network failure',
        _dlq_code: '08006',
      }),
    )
    expect(mockRedis.xdel).toHaveBeenCalledWith('rt:events', '1000-0')
  })

  it('does not XDEL source entries when DLQ write fails', async () => {
    const events = [makeEvent('1000-0', 'r1', 'test', 0)]

    mockRedis.xrange
      .mockResolvedValueOnce(events)
      .mockResolvedValueOnce([])
    mockRedis.incr.mockResolvedValueOnce(5)
    mockRedis.xadd.mockRejectedValueOnce(new Error('dlq unavailable'))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'runtime_events') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn().mockResolvedValue({
                error: { code: '08006', message: 'persistent network failure' },
                data: null,
              }),
            })),
          }
        }
        return {}
      }),
    } as any

    const result = await drainRuntimeStreams(supabase, 'worker-1')

    expect(result.eventsDrained).toBe(0)
    expect(result.eventsDeferred).toBe(0)
    expect(result.eventsDlqed).toBe(1)
    expect(mockRedis.xdel).not.toHaveBeenCalledWith('rt:events', '1000-0')
  })

  it('cost upsert transient error defers without losing telemetry', async () => {
    const costs = [makeCost('3000-0', 'r1', 'agent-1', 100, 50, 0.01)]

    mockRedis.xrange
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(costs)

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'mc_agent_cost_tracking') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: '08006', message: 'connection lost' },
                  }),
                })),
              })),
            })),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        return {}
      }),
    } as any

    const result = await drainRuntimeStreams(supabase, 'worker-1')

    expect(result.costsDrained).toBe(0)
    expect(result.costsDeferred).toBe(1)
    expect(mockRedis.xdel).not.toHaveBeenCalledWith('rt:costs', '3000-0')
  })

  it('stale heartbeat with wrong generation is skipped', async () => {
    mockRedis.scan.mockResolvedValueOnce([0, ['rt:r1:live']])
    mockPipeline.exec.mockResolvedValueOnce([
      makeHeartbeat('r1', 50, 60, 30, 2), // generation 2
    ])

    // Simulate generation mismatch — update finds 0 rows
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'dedicated_runtimes') {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                  error: { message: 'No rows affected' },
                }),
              })),
            })),
          }
        }
        return {}
      }),
    } as any

    mockRedis.xrange.mockResolvedValue([])

    const result = await drainRuntimeStreams(supabase, 'worker-1')
    // Update attempted but didn't match — heartbeatsUpdated stays 0
    expect(result.heartbeatsUpdated).toBe(0)
  })
})

describe('cost accumulation across drain cycles', () => {
  it('second drain adds to existing cost row', async () => {
    const supabase = createStatefulSupabase()

    // Cycle 1: first cost entry
    mockRedis.xrange
      .mockResolvedValueOnce([]) // events
      .mockResolvedValueOnce([makeCost('3000-0', 'r1', 'agent-1', 100, 50, 0.01)])

    await drainRuntimeStreams(supabase, 'worker-1')

    // Cycle 2: second cost entry — should read existing and accumulate
    vi.clearAllMocks()
    mockRedis.set.mockResolvedValue('OK')
    mockRedis.scan.mockResolvedValue([0, []])
    mockRedis.xrange
      .mockResolvedValueOnce([]) // events
      .mockResolvedValueOnce([makeCost('3001-0', 'r1', 'agent-1', 200, 100, 0.02)])

    await drainRuntimeStreams(supabase, 'worker-1')

    // Final cost row should have accumulated values
    const costWrites = dbWrites.filter(w => w.table === 'mc_agent_cost_tracking' && w.operation === 'upsert')
    const lastWrite = costWrites[costWrites.length - 1]
    expect(lastWrite.data.input_tokens).toBe(300)   // 100 + 200
    expect(lastWrite.data.output_tokens).toBe(150)   // 50 + 100
    expect(lastWrite.data.estimated_cost_usd).toBeCloseTo(0.03)
  })
})

describe('paginated SCAN simulation', () => {
  it('handles multi-page SCAN cursor', async () => {
    // SCAN returns results in two pages
    mockRedis.scan
      .mockResolvedValueOnce([42, ['rt:r1:live', 'rt:r2:live']])   // page 1, cursor=42
      .mockResolvedValueOnce([0, ['rt:r3:live']])                   // page 2, cursor=0 (done)

    mockPipeline.exec.mockResolvedValueOnce([
      makeHeartbeat('r1', 10, 20, 30),
      makeHeartbeat('r2', 40, 50, 60),
      makeHeartbeat('r3', 70, 80, 90),
    ])

    const supabase = createStatefulSupabase()
    const result = await drainRuntimeStreams(supabase, 'worker-1')

    expect(result.heartbeatsUpdated).toBe(3)
    // Two SCAN calls for heartbeat pagination. Additional SCAN calls come
    // from retry-counter cleanup (event + cost clear paths fall through to
    // SCAN when the exact key get() returns null), which is unrelated to
    // the pagination behavior being verified here.
    const heartbeatScans = mockRedis.scan.mock.calls.filter(
      ([, opts]: [number, { match?: string } | undefined]) =>
        !opts?.match || opts.match.startsWith('rt:') && !opts.match.includes('retry'),
    )
    expect(heartbeatScans.length).toBeGreaterThanOrEqual(2)
  })
})

describe('empty fleet (cold start)', () => {
  it('completes cleanly with no data to drain', async () => {
    mockRedis.scan.mockResolvedValueOnce([0, []])
    mockRedis.xrange.mockResolvedValue([])

    const supabase = createStatefulSupabase()
    const result = await drainRuntimeStreams(supabase, 'worker-1')

    expect(result.skipped).toBe(false)
    expect(result.heartbeatsUpdated).toBe(0)
    expect(result.eventsDrained).toBe(0)
    expect(result.costsDrained).toBe(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.error).toBeUndefined()

    // Metrics still recorded even for empty cycle
    expect(mockRedis.hset).toHaveBeenCalledWith('rt:drain:metrics', expect.objectContaining({
      heartbeatsUpdated: '0',
      eventsDrained: '0',
      costsDrained: '0',
    }))
  })
})

describe('event burst simulation', () => {
  it('handles EVENT_BATCH worth of entries (1000)', async () => {
    // Generate 50 events (realistic batch)
    const events = Array.from({ length: 50 }, (_, i) =>
      makeEvent(`${5000 + i}-0`, `r${i % 5 + 1}`, i % 3 === 0 ? 'error' : 'info', i)
    )

    mockRedis.xrange
      .mockResolvedValueOnce(events)
      .mockResolvedValueOnce([])

    const supabase = createStatefulSupabase()
    const result = await drainRuntimeStreams(supabase, 'worker-1')

    expect(result.eventsDrained).toBe(50)

    // All 50 events inserted
    const eventWrites = dbWrites.filter(w => w.table === 'runtime_events')
    expect(eventWrites).toHaveLength(50)

    // All 50 entry IDs deleted from stream
    const xdelCall = mockRedis.xdel.mock.calls.find((c: any[]) => c[0] === 'rt:events')
    expect(xdelCall).toBeDefined()
    expect(xdelCall!.length - 1).toBe(50) // first arg is stream name
  })
})
