/**
 * Pulse — Partial-atomicity recovery
 *
 * The 5-step PulseQueue.claim() flow is not atomic end-to-end. A worker
 * crash between any two steps can leave the system in a partially-advanced
 * state. This test documents the three observable crash windows and the
 * recovery mechanism that covers each one.
 *
 * Claim flow (from queue.ts):
 *   1. CLAIM_LUA ZPOPMIN                             ← atomic
 *   2. pipeline: INCR inflight + EXPIRE 300          ← atomic pair
 *   3. post-INCR over-limit check → floor-DECR + re-enqueue
 *   4. pipeline: SET lease NX EX 60 + SADD active    ← best-effort
 *   5. SET NX failure → floor-DECR + return null
 *
 * Crash windows:
 *   Window A — after ZPOPMIN, before INCR
 *     Job is gone from ZSET; inflight unchanged; no lease; not in active set.
 *     The DB row is still in 'processing' state (set by the inbound worker
 *     / claim RPC). Recovery: the orphan detector's resetStuckDbEvents()
 *     resets the DB row → 'pending' after 2 min, then the sweep safety net
 *     re-enqueues it.
 *
 *   Window B — after INCR, before SET NX lease
 *     Inflight is elevated; no lease; not in active set.
 *     Recovery: the 5-min EXPIRE on the inflight counter cleans it, and
 *     the DB row reset handles the event. This window cannot be detected
 *     by the orphan detector's active-set scan (the run was never added).
 *
 *   Window C — after SET NX lease, before SADD active
 *     Lease exists; not in active set.
 *     Recovery: the 60s lease TTL expires naturally; the DB row reset
 *     handles the event. Again, this window is invisible to the active-set
 *     scan — the recovery is purely time-based.
 *
 * Common safety net: all three windows converge on the same recovery
 * path — resetStuckDbEvents() walks the event tables and flips stuck
 * 'processing' rows back to 'pending' so they can be re-enqueued by the
 * sweep. This test pins that contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockPipeline, mockRedis } = vi.hoisted(() => {
  const mockPipeline = {
    get: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  }
  const mockRedis = {
    set: vi.fn().mockResolvedValue('OK'),
    smembers: vi.fn().mockResolvedValue([]),
    srem: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
    expire: vi.fn().mockResolvedValue(true),
    hincrby: vi.fn().mockResolvedValue(1),
    eval: vi.fn().mockResolvedValue(1),
    pipeline: vi.fn(() => ({ ...mockPipeline })),
  }
  return { mockPipeline, mockRedis }
})

vi.mock('../redis.js', () => ({
  getPulseRedis: vi.fn().mockResolvedValue(mockRedis),
}))

vi.mock('../queue.js', () => ({
  PulseQueue: vi.fn().mockImplementation(() => ({
    enqueue: vi.fn().mockResolvedValue(true),
  })),
}))

import { OrphanDetector } from '../orphan-detector.js'
import { PulseQueue } from '../queue.js'

interface StuckRowCapture {
  table: string
  update: Record<string, unknown>
  whereStatus?: unknown
  whereStatusIn?: unknown
  whereTimestamp?: { column: string; threshold: string }
}

function buildSupabaseMock() {
  const captured: StuckRowCapture[] = []

  const chain = (table: string): unknown => {
    const capture: StuckRowCapture = { table, update: {} }

    // Chainable final — last link resolves to { error: null }
    const terminal = Promise.resolve({ error: null, data: [] })

    const eqLt = {
      eq: vi.fn((_col: string, val: unknown) => {
        capture.whereStatus = val
        return { lt: eqLt.lt } as any
      }),
      in: vi.fn((_col: string, vals: unknown[]) => {
        capture.whereStatusIn = vals
        return { lt: eqLt.lt } as any
      }),
      lt: vi.fn((col: string, threshold: string) => {
        capture.whereTimestamp = { column: col, threshold }
        captured.push(capture)
        return terminal
      }),
    }

    return {
      update: vi.fn((update: Record<string, unknown>) => {
        capture.update = update
        return eqLt
      }),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          lt: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    }
  }

  return {
    supabase: {
      from: vi.fn((table: string) => chain(table)),
    } as any,
    captured,
  }
}

describe('Pulse partial-atomicity recovery', () => {
  let detector: OrphanDetector
  let queue: PulseQueue

  beforeEach(() => {
    vi.clearAllMocks()
    queue = new PulseQueue()
  })

  afterEach(() => {
    detector?.stop()
  })

  it('Window A (post-ZPOPMIN, pre-INCR): stuck inbound/outbound rows reset to pending', async () => {
    // Nothing in Redis active set — the crash happened before SADD.
    mockRedis.smembers.mockResolvedValueOnce([])
    const { supabase, captured } = buildSupabaseMock()
    detector = new OrphanDetector(queue, supabase)

    const result = await detector.detect()

    expect(result.orphansFound).toBe(0)

    // Primary recovery: DB events reset from processing → pending
    const inbound = captured.find((c) => c.table === 'assistant_inbound_events')
    const outbound = captured.find((c) => c.table === 'assistant_outbound_events')
    expect(inbound).toBeDefined()
    expect(outbound).toBeDefined()
    expect(inbound!.update).toEqual({
      status: 'pending',
      locked_by: null,
      locked_at: null,
      locked_until: null,
    })
    expect(outbound!.update).toEqual({
      status: 'pending',
      locked_by: null,
      locked_at: null,
      locked_until: null,
    })
    // Gated on the 2-min stuck threshold
    expect(inbound!.whereStatus).toEqual('processing')
    expect(inbound!.whereTimestamp?.column).toBe('locked_at')
  })

  it('Window B (post-INCR, pre-SET NX): inflight TTL + DB reset cover recovery', async () => {
    // Invisible to orphan scan — run never joined the active set.
    // The 5-min TTL on pulse:agent:{id}:inflight (set in claim step 2)
    // cleans the counter. The DB reset covers the event.
    mockRedis.smembers.mockResolvedValueOnce([])
    const { supabase, captured } = buildSupabaseMock()
    detector = new OrphanDetector(queue, supabase)

    const result = await detector.detect()

    // Active-set scan finds nothing — counter will be reclaimed via TTL
    expect(result.counterResets).toBe(0)
    // DB recovery still fires — this is the contract that covers Window B
    expect(captured.find((c) => c.table === 'assistant_inbound_events')).toBeDefined()
    expect(captured.find((c) => c.table === 'assistant_outbound_events')).toBeDefined()
  })

  it('Window C (post-SET NX, pre-SADD): lease TTL + DB reset cover recovery', async () => {
    // Lease exists in Redis but run never made it into pulse:active.
    // The 60s lease TTL expires on its own. DB reset covers the event.
    mockRedis.smembers.mockResolvedValueOnce([])
    const { supabase, captured } = buildSupabaseMock()
    detector = new OrphanDetector(queue, supabase)

    const result = await detector.detect()

    expect(result.orphansFound).toBe(0)
    // DB recovery is the observable recovery surface
    const tables = captured.map((c) => c.table)
    expect(tables).toContain('assistant_inbound_events')
    expect(tables).toContain('assistant_outbound_events')
    expect(tables).toContain('agent_scheduled_tasks')
  })

  it('DB recovery runs even when Redis active set is empty (safety net is unconditional)', async () => {
    mockRedis.smembers.mockResolvedValueOnce([])
    const { supabase, captured } = buildSupabaseMock()
    detector = new OrphanDetector(queue, supabase)

    await detector.detect()

    // All three event tables must be scanned regardless of Redis state
    const tables = new Set(captured.map((c) => c.table))
    expect(tables.has('assistant_inbound_events')).toBe(true)
    expect(tables.has('assistant_outbound_events')).toBe(true)
    expect(tables.has('agent_scheduled_tasks')).toBe(true)
  })

  it('Stuck threshold is ~2 minutes ago (2x lease TTL)', async () => {
    mockRedis.smembers.mockResolvedValueOnce([])
    const { supabase, captured } = buildSupabaseMock()
    detector = new OrphanDetector(queue, supabase)

    const beforeMs = Date.now()
    await detector.detect()
    const afterMs = Date.now()

    const inbound = captured.find((c) => c.table === 'assistant_inbound_events')
    expect(inbound?.whereTimestamp).toBeDefined()
    const thresholdMs = new Date(inbound!.whereTimestamp!.threshold).getTime()
    // Threshold is 2 min (120s) before "now" at the time detect() ran
    expect(thresholdMs).toBeGreaterThanOrEqual(beforeMs - 120_000 - 50)
    expect(thresholdMs).toBeLessThanOrEqual(afterMs - 120_000 + 50)
  })
})
