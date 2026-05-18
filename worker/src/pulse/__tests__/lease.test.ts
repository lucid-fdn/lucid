/**
 * Pulse Lease — Unit Tests
 *
 * Tests: lease acquire, renew, expiry detection, fencing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRedis } = vi.hoisted(() => {
  const mockRedis = {
    get: vi.fn().mockResolvedValue(null),
    expire: vi.fn().mockResolvedValue(true),
    eval: vi.fn().mockResolvedValue(null),
    zadd: vi.fn().mockResolvedValue(1),
    srem: vi.fn().mockResolvedValue(1),
    hincrby: vi.fn().mockResolvedValue(1),
    scard: vi.fn().mockResolvedValue(0),
    hgetall: vi.fn().mockResolvedValue(null),
    pipeline: vi.fn(() => ({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      sadd: vi.fn().mockReturnThis(),
      srem: vi.fn().mockReturnThis(),
      hincrby: vi.fn().mockReturnThis(),
      rpush: vi.fn().mockReturnThis(),
      ltrim: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([1, true]),
    })),
  }

  return { mockRedis }
})

vi.mock('../redis.js', () => ({
  getPulseRedis: vi.fn().mockResolvedValue(mockRedis),
}))

import { PulseQueue } from '../queue.js'

describe('PulseLease', () => {
  let queue: PulseQueue

  beforeEach(() => {
    vi.clearAllMocks()
    queue = new PulseQueue()
  })

  describe('renewLease', () => {
    it('should extend TTL when worker owns the lease (atomic Lua)', async () => {
      mockRedis.eval.mockResolvedValueOnce(1) // RENEW_LEASE_LUA returns 1

      const result = await queue.renewLease('run-1', 'worker-1')
      expect(result).toBe(true)
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('EXPIRE'),
        ['pulse:lease:run-1'],
        ['worker-1', '60'],
      )
    })

    it('should reject if different worker', async () => {
      mockRedis.eval.mockResolvedValueOnce(0) // RENEW_LEASE_LUA returns 0

      const result = await queue.renewLease('run-1', 'worker-2')
      expect(result).toBe(false)
    })

    it('should return false when lease has expired', async () => {
      mockRedis.eval.mockResolvedValueOnce(0) // RENEW_LEASE_LUA returns 0 (key gone)

      const result = await queue.renewLease('run-1', 'worker-1')
      expect(result).toBe(false)
    })
  })

  describe('conditional-del fencing', () => {
    it('should delete lease only when worker matches', async () => {
      mockRedis.eval
        .mockResolvedValueOnce(1) // conditional-del returns 1
        .mockResolvedValueOnce(0) // floor-decr

      const job = {
        runId: 'run-1',
        eventId: 'evt-1',
        eventType: 'inbound' as const,
        agentId: 'agent-1',
        orgId: 'org-1',
        priority: 'normal' as const,
        attempt: 0,
        enqueuedAt: Date.now(),
      }

      const result = await queue.complete(job, 'worker-1')
      expect(result).toBe(true)
    })

    it('should not delete lease when worker does not match', async () => {
      mockRedis.eval.mockResolvedValueOnce(0) // Lua returns 0 = not owner

      const job = {
        runId: 'run-1',
        eventId: 'evt-1',
        eventType: 'inbound' as const,
        agentId: 'agent-1',
        orgId: 'org-1',
        priority: 'normal' as const,
        attempt: 0,
        enqueuedAt: Date.now(),
      }

      const result = await queue.complete(job, 'wrong-worker')
      expect(result).toBe(false)
    })
  })
})
