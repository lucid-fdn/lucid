/**
 * Pulse Enqueue — Unit Tests
 *
 * Tests: inbound/outbound/scheduled enqueue, priority classification, sweep safety net.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRedis } = vi.hoisted(() => {
  const mockRedis = {
    set: vi.fn().mockResolvedValue('OK'),
    xadd: vi.fn().mockResolvedValue('1234567890-0'),
    zadd: vi.fn().mockResolvedValue(1),
    eval: vi.fn().mockResolvedValue(null),
    pipeline: vi.fn(() => ({
      hincrby: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([1]),
    })),
  }

  return { mockRedis }
})

vi.mock('../redis.js', () => ({
  getPulseRedis: vi.fn().mockResolvedValue(mockRedis),
}))

import { PulseQueue } from '../queue.js'
import { enqueueInboundEvent, sweepPendingInboundEvents } from '../enqueue/inbound.js'
import { enqueueOutboundEvent, sweepPendingOutboundEvents } from '../enqueue/outbound.js'
import { scanAndEnqueueScheduledTasks } from '../enqueue/scheduled.js'

describe('Enqueue', () => {
  let queue: PulseQueue

  beforeEach(() => {
    vi.clearAllMocks()
    mockRedis.set.mockResolvedValue('OK')
    mockRedis.xadd.mockResolvedValue('1234567890-0')
    queue = new PulseQueue()
  })

  describe('inbound', () => {
    it('should enqueue inbound event', async () => {
      const result = await enqueueInboundEvent(queue, {
        id: 'evt-1',
        assistant_id: 'agent-1',
        org_id: 'org-1',
      })
      expect(result).toBe(true)
      // Should use SET NX for dedup
      expect(mockRedis.set).toHaveBeenCalledWith(
        'pulse:dedup:evt-1:0',
        '1',
        { nx: true, ex: 300 },
      )
      // Should XADD to stream
      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'pulse:stream:{inbound}:normal',
        '*',
        { job: expect.any(String) },
        { maxlen: 10_000, approximate: true },
      )
    })

    it('should classify approval-triggered events as critical', async () => {
      await enqueueInboundEvent(queue, {
        id: 'evt-1',
        assistant_id: 'agent-1',
        org_id: 'org-1',
        external_message_id: 'agent-msg:run-abc:tool-xyz',
      })

      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'pulse:stream:{inbound}:critical',
        '*',
        expect.any(Object),
        expect.any(Object),
      )
    })
  })

  describe('outbound', () => {
    it('should enqueue outbound event', async () => {
      const result = await enqueueOutboundEvent(
        queue,
        { id: 'evt-1', channel_id: 'ch-1' },
        'org-1',
      )
      expect(result).toBe(true)
    })
  })

  describe('scheduled', () => {
    it('should enqueue due scheduled tasks', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'ai_assistants') {
            return {
              select: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [{ id: 'agent-1' }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }
          }
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({
                        data: [
                          { id: 'task-1', assistant_id: 'agent-1', org_id: 'org-1', next_run_at: new Date().toISOString() },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }
        }),
      }

      const count = await scanAndEnqueueScheduledTasks(queue, mockSupabase as any)
      expect(count).toBe(1)
      // Enqueue uses SET NX + XADD now (not ZADD)
      expect(mockRedis.set).toHaveBeenCalled()
      expect(mockRedis.xadd).toHaveBeenCalled()
    })

    it('should handle empty scheduled tasks', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'ai_assistants') {
            return {
              select: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }
          }
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }
        }),
      }

      const count = await scanAndEnqueueScheduledTasks(queue, mockSupabase as any)
      expect(count).toBe(0)
    })
  })

  describe('sweep safety net', () => {
    it('should sweep and enqueue pending inbound events', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'assistant_inbound_events') {
            return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({
                        data: [
                          { id: 'evt-1', assistant_id: 'agent-1' },
                          { id: 'evt-2', assistant_id: 'agent-2' },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
                }),
              }),
            }
          }
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: 'agent-1', org_id: 'org-1' },
                  { id: 'agent-2', org_id: 'org-1' },
                ],
                error: null,
              }),
            }),
          }
        }),
      }

      const count = await sweepPendingInboundEvents(queue, mockSupabase as any)
      expect(count).toBe(2)
    })

    it('should sweep and enqueue pending outbound events', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [
                        { id: 'evt-1', channel_id: 'ch-1' },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }

      const count = await sweepPendingOutboundEvents(queue, mockSupabase as any)
      expect(count).toBe(1)
    })
  })
})
