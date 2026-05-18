/**
 * Agent Bridge — Event Reporter
 *
 * Batches feed events and flushes to the control plane on a timer.
 * Auto-flushes at MAX_BATCH_SIZE to prevent latency on burst.
 * Failed batches are re-queued at the front of the buffer for retry.
 *
 * Buffer cap (MAX_BUFFER_SIZE = 500) prevents unbounded memory growth
 * during extended outages. Overflow is logged as a warning.
 *
 * Matches the pattern in worker/src/runtime/event-reporter.ts.
 */

import type { RestClient } from './http-client.js'
import type { FeedEvent, BridgeLogger } from './types.js'

const MAX_BATCH_SIZE = 100
const MAX_BUFFER_SIZE = 500

export class EventReporter {
  private buffer: FeedEvent[] = []
  private timer: ReturnType<typeof setInterval> | undefined
  private readonly intervalMs: number

  constructor(
    private readonly client: RestClient,
    private readonly logger: BridgeLogger,
    opts: { intervalMs: number },
  ) {
    this.intervalMs = opts.intervalMs
  }

  start(): void {
    this.timer = setInterval(() => this.flush(), this.intervalMs)
    this.logger.info(`Event reporter started (flush every ${this.intervalMs / 1000}s)`)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  /** Add an event to the buffer. Auto-flushes if buffer hits MAX_BATCH_SIZE. */
  report(event: FeedEvent): void {
    this.buffer.push(event)
    if (this.buffer.length >= MAX_BATCH_SIZE) {
      this.flush()
    }
  }

  /** Send buffered events to the control plane. Safe to call concurrently. */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return

    const batch = this.buffer.splice(0, MAX_BATCH_SIZE)
    try {
      await this.client.post('/api/runtimes/events', { events: batch })
    } catch (err) {
      this.logger.error('Event flush failed:', err instanceof Error ? err.message : err)

      // Re-queue failed batch at front for retry
      this.buffer.unshift(...batch)

      // Cap buffer to prevent unbounded growth during extended outages
      if (this.buffer.length > MAX_BUFFER_SIZE) {
        const dropped = this.buffer.length - MAX_BUFFER_SIZE
        this.buffer = this.buffer.slice(0, MAX_BUFFER_SIZE)
        this.logger.warn(`Dropped ${dropped} events (buffer overflow)`)
      }
    }
  }

  /** Current number of buffered events (for diagnostics). */
  get pendingCount(): number {
    return this.buffer.length
  }
}
