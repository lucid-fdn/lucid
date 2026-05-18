/**
 * Agent Bridge — Offline Ring Buffer
 *
 * Fixed-capacity ring buffer for queuing telemetry when the control plane is unreachable.
 * Tail-drops oldest entries on overflow and tracks dropped count for reporting.
 *
 * Extracted from worker/src/runtime/data-sink.ts (verbatim logic, typed for SDK).
 *
 * Design: O(1) push, O(n) flush. No allocations on push (pre-allocated array).
 * Not thread-safe — Node.js single-threaded, no locks needed.
 */

// =============================================================================
// Types
// =============================================================================

export interface BufferEntry {
  type: 'heartbeat' | 'event' | 'cost'
  payload: unknown
  timestamp: number
}

// =============================================================================
// Ring Buffer
// =============================================================================

export class OfflineBuffer {
  private readonly ring: (BufferEntry | null)[]
  private head = 0
  private tail = 0
  private count = 0

  /** Number of entries dropped due to overflow since last reset. */
  droppedCount = 0

  constructor(private readonly capacity = 1000) {
    this.ring = new Array<BufferEntry | null>(capacity).fill(null)
  }

  push(entry: BufferEntry): void {
    if (this.count === this.capacity) {
      // Tail-drop: discard oldest to make room
      this.tail = (this.tail + 1) % this.capacity
      this.count--
      this.droppedCount++
    }
    this.ring[this.head] = entry
    this.head = (this.head + 1) % this.capacity
    this.count++
  }

  /** Drain up to `batchSize` entries from the buffer (FIFO). */
  flush(batchSize = 50): BufferEntry[] {
    const batch: BufferEntry[] = []
    const n = Math.min(batchSize, this.count)
    for (let i = 0; i < n; i++) {
      const entry = this.ring[this.tail]
      if (entry) batch.push(entry)
      this.ring[this.tail] = null
      this.tail = (this.tail + 1) % this.capacity
      this.count--
    }
    return batch
  }

  /** Current number of buffered entries. */
  get depth(): number {
    return this.count
  }
}
