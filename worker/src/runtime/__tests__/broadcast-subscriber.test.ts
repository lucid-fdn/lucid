/**
 * Broadcast Wake Subscriber — Unit Tests
 *
 * Tests the push-based wake signal subscription for Phase 1.
 * Verifies: subscription lifecycle, cursor dedup, reconnect, metrics.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Supabase client
const mockSubscribe = vi.fn()
const mockOn = vi.fn()
const mockSend = vi.fn()
const mockRemoveChannel = vi.fn().mockResolvedValue(undefined)
const mockRemoveAllChannels = vi.fn().mockResolvedValue(undefined)

const mockChannel = {
  on: mockOn,
  subscribe: mockSubscribe,
  send: mockSend,
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => mockChannel),
    removeChannel: mockRemoveChannel,
    removeAllChannels: mockRemoveAllChannels,
  })),
}))

// Mock metrics
vi.mock('../../observability/metrics.js', () => ({
  incBroadcastWakeReceived: vi.fn(),
  incBroadcastPollingRescued: vi.fn(),
  recordBroadcastWakeLatency: vi.fn(),
}))

import {
  startBroadcastWake,
  stopBroadcastWake,
  getLastSeenCursor,
  updateCursorFromPolling,
} from '../broadcast-subscriber.js'

import {
  incBroadcastWakeReceived,
  incBroadcastPollingRescued,
  recordBroadcastWakeLatency,
} from '../../observability/metrics.js'

describe('Broadcast Wake Subscriber', () => {
  const defaultOptions = {
    supabaseUrl: 'https://test.supabase.co',
    supabaseKey: 'test-key',
    runtimeId: 'runtime-123',
    onWake: vi.fn(),
    onStatusChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Make on() return the channel for chaining
    mockOn.mockReturnValue(mockChannel)
    mockSubscribe.mockImplementation((cb) => {
      // Simulate successful subscription
      if (cb) cb('SUBSCRIBED')
      return mockChannel
    })
  })

  afterEach(() => {
    stopBroadcastWake()
  })

  it('should subscribe to the correct channel name', () => {
    startBroadcastWake(defaultOptions)

    // Verify .on('broadcast', { event: 'wake' }) was called
    expect(mockOn).toHaveBeenCalledWith(
      'broadcast',
      { event: 'wake' },
      expect.any(Function),
    )
  })

  it('should call onStatusChange with connected on successful subscription', () => {
    startBroadcastWake(defaultOptions)

    expect(defaultOptions.onStatusChange).toHaveBeenCalledWith('connected')
  })

  it('should stop cleanly', () => {
    startBroadcastWake(defaultOptions)
    stopBroadcastWake()

    expect(mockRemoveAllChannels).toHaveBeenCalled()
  })

  it('should start with cursor at 0', () => {
    startBroadcastWake(defaultOptions)

    expect(getLastSeenCursor()).toBe(0)
  })

  describe('cursor dedup', () => {
    it('should track cursor from polling updates', () => {
      startBroadcastWake(defaultOptions)
      updateCursorFromPolling(5)

      expect(getLastSeenCursor()).toBe(5)
    })

    it('should increment polling rescued counter when polling finds newer events', () => {
      startBroadcastWake(defaultOptions)
      updateCursorFromPolling(10)

      expect(incBroadcastPollingRescued).toHaveBeenCalled()
    })

    it('should not increment polling rescued for same cursor', () => {
      startBroadcastWake(defaultOptions)
      updateCursorFromPolling(5)
      vi.mocked(incBroadcastPollingRescued).mockClear()
      updateCursorFromPolling(3)

      expect(incBroadcastPollingRescued).not.toHaveBeenCalled()
    })
  })

  describe('wake handler', () => {
    it('should call onWake when broadcast message received', () => {
      startBroadcastWake(defaultOptions)

      // Get the wake handler from the .on() call
      const wakeHandler = mockOn.mock.calls[0][2]

      const now = new Date().toISOString()
      wakeHandler({ payload: { hint: 'inbound', cursor: 1, publishedAt: now } })

      expect(defaultOptions.onWake).toHaveBeenCalledWith({
        hint: 'inbound',
        cursor: 1,
        publishedAt: now,
      })
      expect(incBroadcastWakeReceived).toHaveBeenCalled()
    })

    it('should skip duplicate cursors', () => {
      startBroadcastWake(defaultOptions)
      const wakeHandler = mockOn.mock.calls[0][2]

      const now = new Date().toISOString()
      wakeHandler({ payload: { hint: 'inbound', cursor: 5, publishedAt: now } })
      wakeHandler({ payload: { hint: 'inbound', cursor: 3, publishedAt: now } })

      // onWake called only once (second call has lower cursor)
      expect(defaultOptions.onWake).toHaveBeenCalledTimes(1)
    })

    it('should accept wakes without cursor (governance)', () => {
      startBroadcastWake(defaultOptions)
      const wakeHandler = mockOn.mock.calls[0][2]

      const now = new Date().toISOString()
      wakeHandler({ payload: { hint: 'governance', publishedAt: now } })

      expect(defaultOptions.onWake).toHaveBeenCalled()
    })

    it('should record wake latency', () => {
      startBroadcastWake(defaultOptions)
      const wakeHandler = mockOn.mock.calls[0][2]

      const publishedAt = new Date(Date.now() - 50).toISOString()
      wakeHandler({ payload: { hint: 'inbound', cursor: 1, publishedAt } })

      expect(recordBroadcastWakeLatency).toHaveBeenCalled()
      const latency = vi.mocked(recordBroadcastWakeLatency).mock.calls[0][0]
      expect(latency).toBeGreaterThanOrEqual(0)
      expect(latency).toBeLessThan(60000)
    })

    it('should ignore null payloads', () => {
      startBroadcastWake(defaultOptions)
      const wakeHandler = mockOn.mock.calls[0][2]

      wakeHandler({ payload: null })

      expect(defaultOptions.onWake).not.toHaveBeenCalled()
    })
  })

  describe('reconnect', () => {
    it('should report error status on channel error', () => {
      mockSubscribe.mockImplementation((cb) => {
        if (cb) cb('CHANNEL_ERROR')
        return mockChannel
      })

      startBroadcastWake(defaultOptions)

      expect(defaultOptions.onStatusChange).toHaveBeenCalledWith('error')
    })

    it('should report disconnected status on channel close', () => {
      mockSubscribe.mockImplementation((cb) => {
        if (cb) cb('CLOSED')
        return mockChannel
      })

      startBroadcastWake(defaultOptions)

      expect(defaultOptions.onStatusChange).toHaveBeenCalledWith('disconnected')
    })
  })
})
