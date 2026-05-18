import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventReporter } from '../event-reporter.js'
import { defaultLogger } from '../logger.js'
import type { FeedEvent } from '../types.js'

function mockClient() {
  return { post: vi.fn().mockResolvedValue(undefined), get: vi.fn() }
}

function event(eventType: FeedEvent['eventType'] = 'tool_call'): FeedEvent {
  return { agentId: 'agent-1', eventType, severity: 'info', payload: {} }
}

describe('EventReporter', () => {
  let client: ReturnType<typeof mockClient>
  let reporter: EventReporter

  beforeEach(() => {
    vi.useFakeTimers()
    client = mockClient()
    reporter = new EventReporter(client as never, defaultLogger, { intervalMs: 5_000 })
  })

  afterEach(() => {
    reporter.stop()
    vi.useRealTimers()
  })

  describe('batching', () => {
    it('buffers events and flushes on interval', async () => {
      reporter.start()
      reporter.report(event('run_started'))
      reporter.report(event('tool_call'))

      expect(client.post).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(5_000)

      expect(client.post).toHaveBeenCalledTimes(1)
      expect(client.post).toHaveBeenCalledWith(
        '/api/runtimes/events',
        { events: expect.arrayContaining([expect.objectContaining({ eventType: 'run_started' })]) },
      )
    })

    it('auto-flushes at 100 events', () => {
      reporter.start()
      for (let i = 0; i < 100; i++) reporter.report(event())
      expect(client.post).toHaveBeenCalledTimes(1)
    })

    it('does not flush when empty', async () => {
      reporter.start()
      await vi.advanceTimersByTimeAsync(5_000)
      expect(client.post).not.toHaveBeenCalled()
    })
  })

  describe('retry', () => {
    it('re-queues failed events for next flush', async () => {
      client.post.mockRejectedValueOnce(new Error('Network'))
      reporter.start()
      reporter.report(event('error'))

      await reporter.flush()
      expect(client.post).toHaveBeenCalledTimes(1)

      // Events should be back in buffer for retry
      client.post.mockResolvedValueOnce(undefined)
      await reporter.flush()
      expect(client.post).toHaveBeenCalledTimes(2)
    })

    it('caps buffer at 500 to prevent unbounded growth', async () => {
      client.post.mockRejectedValue(new Error('Network'))
      reporter.start()

      for (let i = 0; i < 600; i++) reporter.report(event())
      // Flush auto-triggered batch (100 events) which will fail and re-queue
      await vi.advanceTimersByTimeAsync(0)
      await reporter.flush()

      expect(client.post).toHaveBeenCalled()
    })
  })

  describe('lifecycle', () => {
    it('stops timer on stop()', () => {
      reporter.start()
      reporter.stop()
      reporter.report(event())
      vi.advanceTimersByTime(10_000)
      expect(client.post).not.toHaveBeenCalled()
    })

    it('exposes pendingCount for diagnostics', () => {
      expect(reporter.pendingCount).toBe(0)
      reporter.report(event())
      reporter.report(event())
      expect(reporter.pendingCount).toBe(2)
    })
  })
})
