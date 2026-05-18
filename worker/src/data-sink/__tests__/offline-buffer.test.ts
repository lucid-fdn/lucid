/**
 * Tests for OfflineBuffer ring buffer (telemetry-only).
 */
import { describe, it, expect } from 'vitest'
import { OfflineBuffer } from '../../runtime/data-sink.js'

function makeEntry(type: 'heartbeat' | 'event' | 'cost', seq: number) {
  return {
    type,
    payload: { seq },
    timestamp: Date.now() + seq,
  }
}

describe('OfflineBuffer', () => {
  describe('push and flush', () => {
    it('pushes and flushes in FIFO order', () => {
      const buf = new OfflineBuffer(10)
      buf.push(makeEntry('heartbeat', 1))
      buf.push(makeEntry('event', 2))
      buf.push(makeEntry('cost', 3))

      expect(buf.depth).toBe(3)

      const batch = buf.flush(10)
      expect(batch).toHaveLength(3)
      expect((batch[0].payload as any).seq).toBe(1)
      expect((batch[1].payload as any).seq).toBe(2)
      expect((batch[2].payload as any).seq).toBe(3)
      expect(buf.depth).toBe(0)
    })

    it('flushes only up to batchSize', () => {
      const buf = new OfflineBuffer(10)
      for (let i = 0; i < 5; i++) {
        buf.push(makeEntry('event', i))
      }

      const batch = buf.flush(2)
      expect(batch).toHaveLength(2)
      expect(buf.depth).toBe(3)
    })

    it('returns empty array from empty buffer', () => {
      const buf = new OfflineBuffer(10)
      const batch = buf.flush()
      expect(batch).toEqual([])
      expect(buf.depth).toBe(0)
    })
  })

  describe('overflow (tail-drop)', () => {
    it('drops oldest entries when capacity exceeded', () => {
      const buf = new OfflineBuffer(3)
      buf.push(makeEntry('heartbeat', 1))
      buf.push(makeEntry('event', 2))
      buf.push(makeEntry('cost', 3))
      buf.push(makeEntry('heartbeat', 4)) // drops entry 1

      expect(buf.depth).toBe(3)
      expect(buf.droppedCount).toBe(1)

      const batch = buf.flush(10)
      expect(batch).toHaveLength(3)
      // First entry should be seq=2 (seq=1 was dropped)
      expect((batch[0].payload as any).seq).toBe(2)
      expect((batch[2].payload as any).seq).toBe(4)
    })

    it('tracks droppedCount correctly across multiple overflows', () => {
      const buf = new OfflineBuffer(2)
      buf.push(makeEntry('event', 1))
      buf.push(makeEntry('event', 2))
      buf.push(makeEntry('event', 3)) // drops 1
      buf.push(makeEntry('event', 4)) // drops 2
      buf.push(makeEntry('event', 5)) // drops 3

      expect(buf.droppedCount).toBe(3)
      expect(buf.depth).toBe(2)

      const batch = buf.flush(10)
      expect((batch[0].payload as any).seq).toBe(4)
      expect((batch[1].payload as any).seq).toBe(5)
    })
  })

  describe('droppedCount tracking', () => {
    it('starts at zero', () => {
      const buf = new OfflineBuffer(10)
      expect(buf.droppedCount).toBe(0)
    })

    it('increments on overflow', () => {
      const buf = new OfflineBuffer(1)
      buf.push(makeEntry('event', 1))
      expect(buf.droppedCount).toBe(0)

      buf.push(makeEntry('event', 2))
      expect(buf.droppedCount).toBe(1)
    })

    it('can be reset externally', () => {
      const buf = new OfflineBuffer(1)
      buf.push(makeEntry('event', 1))
      buf.push(makeEntry('event', 2))
      expect(buf.droppedCount).toBe(1)

      buf.droppedCount = 0
      expect(buf.droppedCount).toBe(0)
    })
  })

  describe('batch flush size', () => {
    it('defaults to 50', () => {
      const buf = new OfflineBuffer(100)
      for (let i = 0; i < 60; i++) {
        buf.push(makeEntry('event', i))
      }

      const batch = buf.flush()
      expect(batch).toHaveLength(50)
      expect(buf.depth).toBe(10)
    })

    it('respects custom batch size', () => {
      const buf = new OfflineBuffer(100)
      for (let i = 0; i < 20; i++) {
        buf.push(makeEntry('event', i))
      }

      const batch = buf.flush(5)
      expect(batch).toHaveLength(5)
      expect(buf.depth).toBe(15)
    })
  })

  describe('reconnect flush sequence', () => {
    it('flushes oldest-first across multiple calls', () => {
      const buf = new OfflineBuffer(100)
      for (let i = 0; i < 10; i++) {
        buf.push(makeEntry('event', i))
      }

      const batch1 = buf.flush(3)
      expect(batch1).toHaveLength(3)
      expect((batch1[0].payload as any).seq).toBe(0)

      const batch2 = buf.flush(3)
      expect(batch2).toHaveLength(3)
      expect((batch2[0].payload as any).seq).toBe(3)

      const batch3 = buf.flush(10)
      expect(batch3).toHaveLength(4)
      expect((batch3[0].payload as any).seq).toBe(6)

      expect(buf.depth).toBe(0)
    })
  })

  describe('empty buffer', () => {
    it('has depth 0', () => {
      const buf = new OfflineBuffer(10)
      expect(buf.depth).toBe(0)
    })

    it('flush returns empty array', () => {
      const buf = new OfflineBuffer(10)
      expect(buf.flush()).toEqual([])
    })

    it('push-then-flush-then-push works correctly', () => {
      const buf = new OfflineBuffer(10)
      buf.push(makeEntry('event', 1))
      buf.flush(10)
      expect(buf.depth).toBe(0)

      buf.push(makeEntry('event', 2))
      expect(buf.depth).toBe(1)
      const batch = buf.flush(10)
      expect((batch[0].payload as any).seq).toBe(2)
    })
  })
})
