/**
 * Offline buffer simulation tests — real-world network partition scenarios.
 *
 * Simulates fleet-scale behavior: 200 runtimes buffering during outage,
 * reconnection flush ordering, backoff escalation, memory pressure,
 * and dropped telemetry reporting.
 */
import { describe, it, expect } from 'vitest'
import { OfflineBuffer } from '../../runtime/data-sink.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

type EntryType = 'heartbeat' | 'event' | 'cost'

function makeEntry(type: EntryType, seq: number, runtimeId = 'r1') {
  return {
    type,
    payload: { seq, runtimeId, ts: Date.now() + seq },
    timestamp: Date.now() + seq,
  }
}

function makeBurst(type: EntryType, count: number, startSeq = 0, runtimeId = 'r1') {
  return Array.from({ length: count }, (_, i) => makeEntry(type, startSeq + i, runtimeId))
}

// ── Simulation Tests ─────────────────────────────────────────────────────────

describe('network partition simulation', () => {
  it('buffers telemetry during 5-minute outage then flushes in order', () => {
    const buf = new OfflineBuffer(1000)

    // Simulate 5 minutes of 30s heartbeats (10 heartbeats) + 5s event batches (60 batches)
    const heartbeats = makeBurst('heartbeat', 10, 0)
    const events = makeBurst('event', 60, 100)
    const costs = makeBurst('cost', 5, 200)

    // Interleave entries like real traffic
    for (let i = 0; i < 60; i++) {
      buf.push(events[i])
      if (i % 6 === 0 && i / 6 < heartbeats.length) {
        buf.push(heartbeats[i / 6])
      }
      if (i % 12 === 0 && i / 12 < costs.length) {
        buf.push(costs[i / 12])
      }
    }

    expect(buf.depth).toBe(75) // 60 events + 10 heartbeats + 5 costs
    expect(buf.droppedCount).toBe(0)

    // Reconnect: flush in batches of 50 (oldest first)
    const batch1 = buf.flush(50)
    expect(batch1).toHaveLength(50)
    // First entry should be the first event pushed
    expect((batch1[0].payload as any).seq).toBe(100)

    const batch2 = buf.flush(50)
    expect(batch2).toHaveLength(25)

    expect(buf.depth).toBe(0)

    // Verify FIFO: all seqs should be monotonically non-decreasing within same type
    const allFlushed = [...batch1, ...batch2]
    const eventSeqs = allFlushed.filter(e => e.type === 'event').map(e => (e.payload as any).seq)
    for (let i = 1; i < eventSeqs.length; i++) {
      expect(eventSeqs[i]).toBeGreaterThan(eventSeqs[i - 1])
    }
  })

  it('tail-drops oldest when buffer fills during extended outage', () => {
    const buf = new OfflineBuffer(100)

    // Push 150 entries — buffer holds 100, drops oldest 50
    const entries = makeBurst('event', 150, 0)
    for (const e of entries) buf.push(e)

    expect(buf.depth).toBe(100)
    expect(buf.droppedCount).toBe(50)

    // Verify oldest retained entry is seq=50 (first 50 were dropped)
    const flushed = buf.flush(100)
    expect((flushed[0].payload as any).seq).toBe(50)
    expect((flushed[99].payload as any).seq).toBe(149)
  })
})

describe('multi-runtime buffer isolation', () => {
  it('each runtime has independent buffer state', () => {
    const buffers = new Map<string, OfflineBuffer>()
    const runtimeIds = ['r1', 'r2', 'r3', 'r4', 'r5']

    for (const id of runtimeIds) {
      buffers.set(id, new OfflineBuffer(100))
    }

    // Each runtime pushes different amounts
    for (let i = 0; i < runtimeIds.length; i++) {
      const buf = buffers.get(runtimeIds[i])!
      const count = (i + 1) * 10
      for (const entry of makeBurst('heartbeat', count, 0, runtimeIds[i])) {
        buf.push(entry)
      }
    }

    expect(buffers.get('r1')!.depth).toBe(10)
    expect(buffers.get('r5')!.depth).toBe(50)

    // Flush one runtime — others unaffected
    buffers.get('r3')!.flush(100)
    expect(buffers.get('r3')!.depth).toBe(0)
    expect(buffers.get('r4')!.depth).toBe(40)
  })
})

describe('reconnection flush sequence', () => {
  it('progressive flush with backoff-sized batches', () => {
    const buf = new OfflineBuffer(1000)

    // Buffer 200 entries during outage
    for (const e of makeBurst('event', 200, 0)) buf.push(e)
    expect(buf.depth).toBe(200)

    // Simulate backoff-style flush: 10, 20, 40, 80 (exponential batch sizes)
    const batchSizes = [10, 20, 40, 80, 50] // last batch gets remaining
    const results: number[] = []

    for (const size of batchSizes) {
      const batch = buf.flush(size)
      results.push(batch.length)
    }

    expect(results).toEqual([10, 20, 40, 80, 50])
    expect(buf.depth).toBe(0)
  })

  it('interleaved push+flush during reconnection', () => {
    const buf = new OfflineBuffer(100)

    // Buffered during outage
    for (const e of makeBurst('event', 30, 0)) buf.push(e)

    // Reconnecting: flush some, new data arrives, flush more
    const batch1 = buf.flush(10) // flush 10 oldest
    expect(batch1).toHaveLength(10)
    expect((batch1[0].payload as any).seq).toBe(0)

    // New data arrives while flushing
    for (const e of makeBurst('heartbeat', 5, 100)) buf.push(e)
    expect(buf.depth).toBe(25) // 20 remaining + 5 new

    const batch2 = buf.flush(25)
    expect(batch2).toHaveLength(25)
    // Old events come before new heartbeats (FIFO)
    expect((batch2[0].payload as any).seq).toBe(10) // continued from where batch1 left off
    expect(batch2[batch2.length - 1].type).toBe('heartbeat')
  })
})

describe('dropped count reporting', () => {
  it('accumulates drops across overflow events', () => {
    const buf = new OfflineBuffer(10)

    // Push 25 entries: 10 fit, 15 overflow
    for (const e of makeBurst('event', 25, 0)) buf.push(e)

    expect(buf.droppedCount).toBe(15)

    // Report and reset (simulating heartbeat report)
    const reported = buf.droppedCount
    buf.droppedCount = 0

    expect(reported).toBe(15)
    expect(buf.droppedCount).toBe(0)

    // More overflow
    for (const e of makeBurst('event', 5, 100)) buf.push(e)
    expect(buf.droppedCount).toBe(5) // new drops after reset
  })

  it('no drops reported when buffer never overflows', () => {
    const buf = new OfflineBuffer(1000)

    for (const e of makeBurst('event', 100, 0)) buf.push(e)

    expect(buf.droppedCount).toBe(0)

    buf.flush(100)
    expect(buf.droppedCount).toBe(0)
  })
})

describe('memory safety', () => {
  it('buffer capacity bounds memory usage regardless of push count', () => {
    const capacity = 500
    const buf = new OfflineBuffer(capacity)

    // Push 10,000 entries — buffer should never exceed capacity
    for (let i = 0; i < 10000; i++) {
      buf.push(makeEntry('event', i))
      expect(buf.depth).toBeLessThanOrEqual(capacity)
    }

    expect(buf.depth).toBe(capacity)
    expect(buf.droppedCount).toBe(9500)

    // Flush all — should get exactly capacity entries
    const all = buf.flush(capacity)
    expect(all).toHaveLength(capacity)
    expect(buf.depth).toBe(0)
  })

  it('alternating push-flush cycles maintain buffer integrity', () => {
    const buf = new OfflineBuffer(50)

    for (let cycle = 0; cycle < 100; cycle++) {
      // Push 10 entries
      for (const e of makeBurst('event', 10, cycle * 10)) buf.push(e)

      // Flush 7 entries
      const batch = buf.flush(7)
      expect(batch).toHaveLength(Math.min(7, buf.depth + batch.length))

      // Buffer should never be negative
      expect(buf.depth).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('type-mixed buffering', () => {
  it('preserves type information through buffer round-trip', () => {
    const buf = new OfflineBuffer(100)

    buf.push(makeEntry('heartbeat', 1))
    buf.push(makeEntry('event', 2))
    buf.push(makeEntry('cost', 3))
    buf.push(makeEntry('heartbeat', 4))
    buf.push(makeEntry('event', 5))

    const flushed = buf.flush(10)
    expect(flushed.map(e => e.type)).toEqual([
      'heartbeat', 'event', 'cost', 'heartbeat', 'event',
    ])
  })
})

describe('fleet-scale stress test', () => {
  it('simulates 200 runtimes buffering for 30 seconds at 5s event intervals', () => {
    const RUNTIME_COUNT = 200
    const INTERVAL_S = 5
    const DURATION_S = 30
    const CYCLES = DURATION_S / INTERVAL_S // 6 cycles

    const buffers = new Map<string, OfflineBuffer>()
    for (let i = 0; i < RUNTIME_COUNT; i++) {
      buffers.set(`runtime-${i}`, new OfflineBuffer(1000))
    }

    let totalPushed = 0

    // Simulate 30 seconds of buffering
    for (let cycle = 0; cycle < CYCLES; cycle++) {
      for (const [id, buf] of buffers) {
        // Each runtime sends: 1 heartbeat (every 30s) + ~4 events per 5s + 1 cost per 60s
        if (cycle === 0) {
          buf.push(makeEntry('heartbeat', totalPushed++, id))
        }
        for (let j = 0; j < 4; j++) {
          buf.push(makeEntry('event', totalPushed++, id))
        }
        if (cycle === 0) {
          buf.push(makeEntry('cost', totalPushed++, id))
        }
      }
    }

    // Verify: each runtime should have ~26 entries (1 heartbeat + 24 events + 1 cost)
    for (const [, buf] of buffers) {
      expect(buf.depth).toBe(26) // 1 + 24 + 1
      expect(buf.droppedCount).toBe(0) // well within 1000 capacity
    }

    // Total across fleet
    let totalDepth = 0
    for (const [, buf] of buffers) totalDepth += buf.depth
    expect(totalDepth).toBe(200 * 26) // 5200 entries across fleet

    // Flush all — simulating reconnection
    let totalFlushed = 0
    for (const [, buf] of buffers) {
      const batch = buf.flush(1000)
      totalFlushed += batch.length
    }
    expect(totalFlushed).toBe(5200)

    // All buffers empty
    for (const [, buf] of buffers) {
      expect(buf.depth).toBe(0)
    }
  })
})
