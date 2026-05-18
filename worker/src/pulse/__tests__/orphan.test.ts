/**
 * Pulse Orphan Detector — Unit Tests
 *
 * Tests: orphan detection, counter reset, lock protection.
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

describe('OrphanDetector', () => {
  let detector: OrphanDetector
  let queue: PulseQueue

  beforeEach(() => {
    vi.clearAllMocks()
    queue = new PulseQueue()
    detector = new OrphanDetector(queue)
  })

  afterEach(() => {
    detector.stop()
  })

  it('should skip when no active runs', async () => {
    mockRedis.smembers.mockResolvedValueOnce([])

    const result = await detector.detect()
    expect(result.orphansFound).toBe(0)
    expect(result.counterResets).toBe(0)
  })

  it('should detect orphaned runs (lease expired)', async () => {
    mockRedis.smembers.mockResolvedValueOnce(['run-1', 'run-2'])

    // Pipeline GET for leases — run-1 has lease, run-2 doesn't (orphaned)
    mockPipeline.exec.mockResolvedValueOnce([
      JSON.stringify({ workerId: 'w1', agentId: 'a1', eventId: 'e1', eventType: 'inbound', attempt: 0, claimedAt: new Date().toISOString() }),
      null, // No lease = orphaned
    ])

    const result = await detector.detect()
    expect(result.orphansFound).toBe(1)
    expect(mockRedis.srem).toHaveBeenCalledWith('pulse:active', 'run-2')
  })

  it('should not remove runs with valid leases', async () => {
    mockRedis.smembers.mockResolvedValueOnce(['run-1'])

    const lease = JSON.stringify({ workerId: 'w1', agentId: 'a1', eventId: 'e1', eventType: 'inbound', attempt: 0, claimedAt: new Date().toISOString() })
    mockPipeline.exec.mockResolvedValueOnce([lease])
    mockRedis.get.mockResolvedValueOnce('1') // inflight counter

    const result = await detector.detect()
    expect(result.orphansFound).toBe(0)
    expect(mockRedis.srem).not.toHaveBeenCalled()
  })

  it('should reset inflated inflight counters', async () => {
    mockRedis.smembers.mockResolvedValueOnce(['run-1'])

    const lease = JSON.stringify({ workerId: 'w1', agentId: 'a1', eventId: 'e1', eventType: 'inbound', attempt: 0, claimedAt: new Date().toISOString() })
    mockPipeline.exec.mockResolvedValueOnce([lease])

    // Default eval mock returns 1, which means RESET_INFLIGHT_LUA returns "reset performed"
    const result = await detector.detect()
    expect(result.counterResets).toBe(1)
    // Verify eval was called with RESET_INFLIGHT_LUA script for the inflight key
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('current > expected'),
      ['pulse:agent:a1:inflight'],
      ['1'],
    )
  })

  it('should skip detection when lock is held', async () => {
    mockRedis.set.mockResolvedValueOnce(null) // Lock acquisition fails

    const result = await detector.detect()
    expect(result.orphansFound).toBe(0)
    expect(mockRedis.smembers).not.toHaveBeenCalled()
  })

  it('should release lock after detection', async () => {
    mockRedis.smembers.mockResolvedValueOnce([])

    await detector.detect()

    // Should call conditional-del Lua to release lock
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('GET'),
      expect.arrayContaining(['pulse:orphan:lock']),
      expect.any(Array),
    )
  })
})
