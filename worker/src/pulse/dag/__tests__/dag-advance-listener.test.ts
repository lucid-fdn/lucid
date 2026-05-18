/**
 * DAG Advance Listener — Unit Tests
 *
 * Phase 6. Verifies:
 *   - startDagAdvanceListener subscribes to `dag:advance` Supabase Broadcast
 *   - nodes_promoted event triggers scheduler.onExternalAdvance(dagId)
 *   - Rapid-fire events for the same dagId debounce into a single call
 *   - stopDagAdvanceListener unsubscribes and clears pending timers
 *   - onExternalAdvance errors are logged but don't crash the listener
 *   - Multiple different dagIds each trigger independently
 *   - Missing dag_id in payload is silently ignored
 *   - Double start is a no-op (idempotent)
 *   - CHANNEL_ERROR status logs one fallback notice
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  startDagAdvanceListener,
  stopDagAdvanceListener,
} from '../dag-advance-listener.js'

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type BroadcastCallback = (payload: { payload: unknown }) => void
type StatusCallback = (status: string) => void

function createMockChannel() {
  let broadcastCallback: BroadcastCallback | null = null
  let statusCallback: StatusCallback | null = null

  const channel = {
    on: vi.fn().mockImplementation(
      (_type: string, _filter: unknown, cb: BroadcastCallback) => {
        broadcastCallback = cb
        return channel
      },
    ),
    subscribe: vi.fn().mockImplementation((cb?: StatusCallback) => {
      statusCallback = cb ?? null
      return channel
    }),
    unsubscribe: vi.fn(),
    /** Test helper: simulate a broadcast payload arriving. */
    simulateBroadcast(payload: unknown) {
      broadcastCallback?.({ payload })
    },
    /** Test helper: simulate a subscription status callback. */
    simulateStatus(status: string) {
      statusCallback?.(status)
    },
  }
  return channel
}

function createMockSupabase(channel: ReturnType<typeof createMockChannel>) {
  return {
    channel: vi.fn().mockReturnValue(channel),
  } as any
}

function createMockScheduler() {
  return {
    onExternalAdvance: vi.fn().mockResolvedValue(undefined),
  } as any
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DAG Advance Listener', () => {
  let mockChannel: ReturnType<typeof createMockChannel>
  let mockSupabase: ReturnType<typeof createMockSupabase>
  let mockScheduler: ReturnType<typeof createMockScheduler>

  beforeEach(() => {
    vi.useFakeTimers()
    mockChannel = createMockChannel()
    mockSupabase = createMockSupabase(mockChannel)
    mockScheduler = createMockScheduler()
  })

  afterEach(() => {
    // Always clean up module-level state between tests.
    stopDagAdvanceListener()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // 1. Start / subscribe
  // -----------------------------------------------------------------------

  it('subscribes to the dag:advance Supabase broadcast channel', () => {
    startDagAdvanceListener(mockSupabase, mockScheduler)

    expect(mockSupabase.channel).toHaveBeenCalledWith('dag:advance')
    expect(mockChannel.on).toHaveBeenCalledWith(
      'broadcast',
      { event: 'nodes_promoted' },
      expect.any(Function),
    )
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 2. Receive nodes_promoted → onExternalAdvance
  // -----------------------------------------------------------------------

  it('calls scheduler.onExternalAdvance when nodes_promoted arrives', async () => {
    startDagAdvanceListener(mockSupabase, mockScheduler)

    mockChannel.simulateBroadcast({ dag_id: 'dag-1', node_ids: ['n1'] })

    // Advance past the 500ms debounce.
    await vi.advanceTimersByTimeAsync(500)

    expect(mockScheduler.onExternalAdvance).toHaveBeenCalledWith('dag-1')
    expect(mockScheduler.onExternalAdvance).toHaveBeenCalledTimes(1)
  })

  // -----------------------------------------------------------------------
  // 3. Debounce: rapid-fire same dagId → single call
  // -----------------------------------------------------------------------

  it('debounces rapid-fire events for the same dagId into a single call', async () => {
    startDagAdvanceListener(mockSupabase, mockScheduler)

    // Fire 5 events in quick succession for the same DAG.
    for (let i = 0; i < 5; i++) {
      mockChannel.simulateBroadcast({ dag_id: 'dag-debounce', node_ids: [`n${i}`] })
      await vi.advanceTimersByTimeAsync(100) // 100ms between each — under 500ms debounce
    }

    // Advance past the final debounce window.
    await vi.advanceTimersByTimeAsync(500)

    expect(mockScheduler.onExternalAdvance).toHaveBeenCalledTimes(1)
    expect(mockScheduler.onExternalAdvance).toHaveBeenCalledWith('dag-debounce')
  })

  // -----------------------------------------------------------------------
  // 4. Stop → unsubscribes cleanly
  // -----------------------------------------------------------------------

  it('unsubscribes and clears pending timers on stop', async () => {
    startDagAdvanceListener(mockSupabase, mockScheduler)

    // Enqueue a debounced advance that hasn't fired yet.
    mockChannel.simulateBroadcast({ dag_id: 'dag-pending', node_ids: ['n1'] })

    stopDagAdvanceListener()

    expect(mockChannel.unsubscribe).toHaveBeenCalled()

    // Advance timers — the pending debounce should NOT fire.
    await vi.advanceTimersByTimeAsync(1000)

    expect(mockScheduler.onExternalAdvance).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 5. Error in onExternalAdvance → logged, doesn't crash
  // -----------------------------------------------------------------------

  it('logs a warning but does not crash when onExternalAdvance throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockScheduler.onExternalAdvance.mockRejectedValueOnce(new Error('boom'))

    startDagAdvanceListener(mockSupabase, mockScheduler)
    mockChannel.simulateBroadcast({ dag_id: 'dag-err', node_ids: ['n1'] })

    await vi.advanceTimersByTimeAsync(500)

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[dag-advance-listener]'),
      'boom',
    )

    // Listener still works — a subsequent event should be processed.
    mockChannel.simulateBroadcast({ dag_id: 'dag-ok', node_ids: ['n2'] })
    await vi.advanceTimersByTimeAsync(500)

    expect(mockScheduler.onExternalAdvance).toHaveBeenCalledWith('dag-ok')
  })

  it('handles non-Error throws gracefully', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockScheduler.onExternalAdvance.mockRejectedValueOnce('string-error')

    startDagAdvanceListener(mockSupabase, mockScheduler)
    mockChannel.simulateBroadcast({ dag_id: 'dag-str-err', node_ids: ['n1'] })

    await vi.advanceTimersByTimeAsync(500)

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[dag-advance-listener]'),
      'string-error',
    )
  })

  // -----------------------------------------------------------------------
  // 6. Multiple different dagIds → each triggers independently
  // -----------------------------------------------------------------------

  it('triggers onExternalAdvance independently for different dagIds', async () => {
    startDagAdvanceListener(mockSupabase, mockScheduler)

    mockChannel.simulateBroadcast({ dag_id: 'dag-A', node_ids: ['n1'] })
    mockChannel.simulateBroadcast({ dag_id: 'dag-B', node_ids: ['n2'] })
    mockChannel.simulateBroadcast({ dag_id: 'dag-C', node_ids: ['n3'] })

    await vi.advanceTimersByTimeAsync(500)

    expect(mockScheduler.onExternalAdvance).toHaveBeenCalledTimes(3)
    expect(mockScheduler.onExternalAdvance).toHaveBeenCalledWith('dag-A')
    expect(mockScheduler.onExternalAdvance).toHaveBeenCalledWith('dag-B')
    expect(mockScheduler.onExternalAdvance).toHaveBeenCalledWith('dag-C')
  })

  it('debounces per dagId, not globally', async () => {
    startDagAdvanceListener(mockSupabase, mockScheduler)

    // dag-A fires twice (should debounce to 1), dag-B fires once.
    mockChannel.simulateBroadcast({ dag_id: 'dag-A', node_ids: ['n1'] })
    await vi.advanceTimersByTimeAsync(200)
    mockChannel.simulateBroadcast({ dag_id: 'dag-B', node_ids: ['n2'] })
    await vi.advanceTimersByTimeAsync(200)
    mockChannel.simulateBroadcast({ dag_id: 'dag-A', node_ids: ['n3'] }) // resets dag-A debounce

    await vi.advanceTimersByTimeAsync(500)

    expect(mockScheduler.onExternalAdvance).toHaveBeenCalledWith('dag-A')
    expect(mockScheduler.onExternalAdvance).toHaveBeenCalledWith('dag-B')
    // dag-A debounced to 1, dag-B is 1 → total 2
    expect(mockScheduler.onExternalAdvance).toHaveBeenCalledTimes(2)
  })

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it('ignores payloads with missing dag_id', async () => {
    startDagAdvanceListener(mockSupabase, mockScheduler)

    mockChannel.simulateBroadcast({ node_ids: ['n1'] }) // no dag_id
    mockChannel.simulateBroadcast(undefined) // undefined payload
    mockChannel.simulateBroadcast({}) // empty object

    await vi.advanceTimersByTimeAsync(500)

    expect(mockScheduler.onExternalAdvance).not.toHaveBeenCalled()
  })

  it('double start is a no-op (idempotent)', () => {
    startDagAdvanceListener(mockSupabase, mockScheduler)
    startDagAdvanceListener(mockSupabase, mockScheduler)

    // channel() should only be called once — second start returns early.
    expect(mockSupabase.channel).toHaveBeenCalledTimes(1)
  })

  it('logs one fallback notice on CHANNEL_ERROR subscription status', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    startDagAdvanceListener(mockSupabase, mockScheduler)

    mockChannel.simulateStatus('CHANNEL_ERROR')
    mockChannel.simulateStatus('CHANNEL_ERROR')

    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[dag-advance-listener] Realtime subscription unavailable'),
    )
  })

  it('can restart after stop', async () => {
    startDagAdvanceListener(mockSupabase, mockScheduler)
    stopDagAdvanceListener()

    // Create a fresh channel mock for the second start.
    const channel2 = createMockChannel()
    mockSupabase.channel.mockReturnValue(channel2)

    startDagAdvanceListener(mockSupabase, mockScheduler)

    channel2.simulateBroadcast({ dag_id: 'dag-restart', node_ids: ['n1'] })
    await vi.advanceTimersByTimeAsync(500)

    expect(mockScheduler.onExternalAdvance).toHaveBeenCalledWith('dag-restart')
  })

  it('clears the pending map on stop so restarts have a clean slate', async () => {
    startDagAdvanceListener(mockSupabase, mockScheduler)

    // Enqueue a pending advance.
    mockChannel.simulateBroadcast({ dag_id: 'dag-stale', node_ids: ['n1'] })

    stopDagAdvanceListener()

    // Restart with fresh channel.
    const channel2 = createMockChannel()
    mockSupabase.channel.mockReturnValue(channel2)
    startDagAdvanceListener(mockSupabase, mockScheduler)

    // Advance past the original debounce window — the stale pending should NOT fire.
    await vi.advanceTimersByTimeAsync(1000)

    expect(mockScheduler.onExternalAdvance).not.toHaveBeenCalled()
  })
})
