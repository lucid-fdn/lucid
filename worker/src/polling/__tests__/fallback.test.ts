/**
 * Polling Fallback Module Tests
 *
 * E2E, smoke, and simulation tests for the extracted polling fallback module.
 * Validates:
 * - Lifecycle: start/stop idempotency, deps isolation
 * - Module-level triggers: triggerInboundPoll/triggerOutboundPoll (safe before/after start)
 * - Backoff: shouldBackoff exponential behavior
 * - Integration: polling activates, processes events, stops cleanly
 * - Circuit breaker simulation: Pulse → polling fallback → Pulse recovery
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mock Supabase + Processors ────────────────────────────────────────────

const { mockSupabase, mockConfig, mockEncryptionService, callLog, clearLog } = vi.hoisted(() => {
  const callLog: string[] = []

  const mockSupabase: any = {
    rpc: vi.fn(async (name: string) => {
      callLog.push(`rpc:${name}`)
      if (name === 'claim_next_inbound_event') {
        return { data: [], error: null }
      }
      if (name === 'claim_next_outbound_event') {
        return { data: [], error: null }
      }
      if (name === 'claim_next_scheduled_task') {
        return { data: [], error: null }
      }
      if (name === 'reset_stuck_events') {
        return { data: { inbound_reset: 0, outbound_reset: 0 }, error: null }
      }
      if (name === 'reset_stuck_scheduled_tasks') {
        return { data: 0, error: null }
      }
      if (name === 'reset_stuck_summary_jobs') {
        return { data: 0, error: null }
      }
      return { data: null, error: null }
    }),
    from: vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue({
        lt: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  }

  const mockConfig: any = {
    WORKER_ID: 'test-worker-1',
    INBOUND_POLL_INTERVAL: 5000,
    OUTBOUND_POLL_INTERVAL: 3000,
    CLEANUP_INTERVAL: 300000,
    SCHEDULED_TASK_POLL_INTERVAL: 30000,
    BROADCAST_FALLBACK_POLL_INTERVAL: 30000,
    INBOUND_BATCH_SIZE: 10,
    OUTBOUND_BATCH_SIZE: 20,
    MAX_CONCURRENT_INBOUND: 5,
    MAX_CONCURRENT_OUTBOUND: 10,
    DEDUP_TTL_HOURS: 24,
    LUCID_RUNTIME_ID: undefined,
  }

  const mockEncryptionService: any = {}

  function clearLog() {
    callLog.length = 0
  }

  return { mockSupabase, mockConfig, mockEncryptionService, callLog, clearLog }
})

// Mock processors — they should never actually run agent loops in these tests
vi.mock('../../processors/inbound.js', () => ({
  processInboundEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../processors/outbound.js', () => ({
  processOutboundEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../processors/scheduled.js', () => ({
  processScheduledTask: vi.fn().mockResolvedValue(undefined),
}))

// Mock guards
vi.mock('../../guards/InboundDeduper.js', () => ({
  InboundDeduper: vi.fn().mockImplementation(() => ({
    cleanup: vi.fn().mockResolvedValue(undefined),
  })),
}))

// Mock observability (no-op)
vi.mock('../../observability/tracing.js', () => ({
  withDbSpan: vi.fn((_name: string, fn: () => any) => fn()),
}))
vi.mock('../../observability/metrics.js', () => ({
  incSchedulerClaimed: vi.fn(),
}))

// Mock broadcast subscriber
vi.mock('../../runtime/broadcast-subscriber.js', () => ({
  updateCursorFromPolling: vi.fn(),
}))

import pLimit from 'p-limit'
import {
  startPollingFallback,
  stopPollingFallback,
  triggerInboundPoll,
  triggerOutboundPoll,
  shouldBackoff,
} from '../fallback.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ─── Smoke Tests ──────────────────────────────────────────────────────────────

describe('Smoke: shouldBackoff', () => {
  it('should not backoff on 0 failures', () => {
    expect(shouldBackoff(0)).toBe(false)
  })

  it('should eventually backoff on many failures', () => {
    // With 10 failures, skip probability is very high (1 - 1/512 ≈ 99.8%)
    let backed = 0
    for (let i = 0; i < 100; i++) {
      if (shouldBackoff(10)) backed++
    }
    expect(backed).toBeGreaterThan(90) // Almost always backs off
  })

  it('should rarely backoff on 1 failure', () => {
    // With 1 failure, skipCycles = 1, so probability = 1 - 1/1 = 0 → never backs off
    expect(shouldBackoff(1)).toBe(false)
  })
})

describe('Smoke: Lifecycle Idempotency', () => {
  afterEach(() => {
    stopPollingFallback()
  })

  it('stopPollingFallback is safe to call when not started', () => {
    expect(() => stopPollingFallback()).not.toThrow()
  })

  it('stopPollingFallback is safe to call multiple times', () => {
    startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
    })
    expect(() => {
      stopPollingFallback()
      stopPollingFallback()
      stopPollingFallback()
    }).not.toThrow()
  })

  it('startPollingFallback restarts if already running (idempotent)', () => {
    const limit = pLimit(5)
    const h1 = startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: limit,
      outboundLimit: limit,
    })
    expect(h1).toBeDefined()

    // Second start should not throw (stops first internally)
    const h2 = startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: limit,
      outboundLimit: limit,
    })
    expect(h2).toBeDefined()
    expect(h2).not.toBe(h1) // New handle
  })
})

describe('Smoke: Handle Metrics', () => {
  afterEach(() => {
    stopPollingFallback()
  })

  it('should return initial zero metrics', () => {
    const handle = startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
    })

    const m = handle.getMetrics()
    expect(m.inboundFailures).toBe(0)
    expect(m.outboundFailures).toBe(0)
    expect(m.scheduledTaskFailures).toBe(0)
    expect(m.inboundPolling).toBe(false)
    expect(m.outboundPolling).toBe(false)
  })
})

describe('Smoke: Role-Owned Maintenance Loops', () => {
  afterEach(() => {
    stopPollingFallback()
  })

  it('does not run cleanup maintenance when disabled for interactive/channel workers', async () => {
    clearLog()

    startPollingFallback({
      supabase: mockSupabase,
      config: { ...mockConfig, CLEANUP_INTERVAL: 10 },
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
      runInteractive: false,
      runAutomation: false,
      runMaintenance: false,
    })

    await sleep(50)

    expect(callLog).not.toContain('rpc:reset_stuck_events')
    expect(callLog).not.toContain('rpc:reset_stuck_scheduled_tasks')
    expect(callLog).not.toContain('rpc:reset_stuck_summary_jobs')
  })

  it('runs cleanup maintenance when enabled for automation workers', async () => {
    clearLog()

    startPollingFallback({
      supabase: mockSupabase,
      config: { ...mockConfig, CLEANUP_INTERVAL: 10 },
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
      runInteractive: false,
      runAutomation: false,
      runMaintenance: true,
    })

    await sleep(50)

    expect(callLog).toContain('rpc:reset_stuck_events')
    expect(callLog).toContain('rpc:reset_stuck_scheduled_tasks')
    expect(callLog).toContain('rpc:reset_stuck_summary_jobs')
  })
})

// ─── Trigger Tests ──────────────────────────────────────────────────────────

describe('Triggers: triggerInboundPoll / triggerOutboundPoll', () => {
  afterEach(() => {
    stopPollingFallback()
  })

  it('triggerInboundPoll is a no-op before start', () => {
    // Should not throw even when module is not started
    expect(() => triggerInboundPoll()).not.toThrow()
  })

  it('triggerOutboundPoll is a no-op before start', () => {
    expect(() => triggerOutboundPoll()).not.toThrow()
  })

  it('triggerInboundPoll is a no-op after stop', () => {
    startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
    })
    stopPollingFallback()

    expect(() => triggerInboundPoll()).not.toThrow()
  })

  it('triggerInboundPoll fires poll when active', async () => {
    clearLog()
    startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
    })

    // Wait for immediate first poll to complete
    await sleep(50)
    clearLog()

    triggerInboundPoll()
    await sleep(50)

    expect(callLog).toContain('rpc:claim_next_inbound_event')
  })

  it('triggerOutboundPoll fires poll when active', async () => {
    clearLog()
    startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
    })

    await sleep(50)
    clearLog()

    triggerOutboundPoll()
    await sleep(50)

    expect(callLog).toContain('rpc:claim_next_outbound_event')
  })
})

// ─── E2E: Polling Activates and Processes ───────────────────────────────────

describe('E2E: Polling Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearLog()
  })

  afterEach(() => {
    stopPollingFallback()
  })

  it('should perform immediate first poll on start (M2 fix)', async () => {
    startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
    })

    // Wait for setImmediate to fire
    await sleep(50)

    // Should have called both inbound and outbound claim RPCs
    expect(callLog).toContain('rpc:claim_next_inbound_event')
    expect(callLog).toContain('rpc:claim_next_outbound_event')
  })

  it('should process events when returned by RPC', async () => {
    const { processInboundEvent } = await import('../../processors/inbound.js')

    // Return 1 event from the claim RPC
    mockSupabase.rpc.mockImplementation(async (name: string) => {
      callLog.push(`rpc:${name}`)
      if (name === 'claim_next_inbound_event') {
        // Return event only on first call
        const events = mockSupabase.rpc.mock.calls.filter((c: any[]) => c[0] === 'claim_next_inbound_event').length <= 1
          ? [{ id: 'evt-1', assistant_id: 'agent-1', org_id: 'org-1' }]
          : []
        return { data: events, error: null }
      }
      if (name === 'claim_next_outbound_event') return { data: [], error: null }
      if (name === 'claim_next_scheduled_task') return { data: [], error: null }
      if (name === 'reset_stuck_events') return { data: { inbound_reset: 0, outbound_reset: 0 }, error: null }
      if (name === 'reset_stuck_scheduled_tasks') return { data: 0, error: null }
      if (name === 'reset_stuck_summary_jobs') return { data: 0, error: null }
      return { data: null, error: null }
    })

    startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
    })

    await sleep(100)

    expect(vi.mocked(processInboundEvent)).toHaveBeenCalled()
  })

  it('falls back to direct outbound claim when the RPC is missing from schema cache', async () => {
    const { processOutboundEvent } = await import('../../processors/outbound.js')

    mockSupabase.rpc.mockImplementation(async (name: string) => {
      callLog.push(`rpc:${name}`)
      if (name === 'claim_next_inbound_event') return { data: [], error: null }
      if (name === 'claim_next_outbound_event') {
        return {
          data: null,
          error: {
            message:
              'Could not find the function public.claim_next_outbound_event(p_batch_size, p_runtime_id, p_worker_id) in the schema cache',
          },
        }
      }
      if (name === 'claim_next_scheduled_task') return { data: [], error: null }
      if (name === 'reset_stuck_events') return { data: { inbound_reset: 0, outbound_reset: 0 }, error: null }
      if (name === 'reset_stuck_scheduled_tasks') return { data: 0, error: null }
      if (name === 'reset_stuck_summary_jobs') return { data: 0, error: null }
      return { data: null, error: null }
    })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table !== 'assistant_outbound_events') {
        return {
          delete: vi.fn().mockReturnValue({
            lt: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }

      return {
        select: vi.fn().mockImplementation(() => ({
          in: vi.fn().mockImplementation(() => ({
            order: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'out-1',
                    channel_id: 'ch-1',
                    inbound_event_id: 'in-1',
                    conversation_id: 'conv-1',
                    message_text: 'hello',
                    reply_to_external_id: null,
                    attempts: 0,
                    max_attempts: 3,
                    next_attempt_at: null,
                    status: 'pending',
                    locked_until: null,
                    channel: {
                      assistant: { runtime_id: null, deleted_at: null },
                    },
                  },
                ],
                error: null,
              }),
            })),
          })),
        })),
        update: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            in: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                select: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'out-1',
                      channel_id: 'ch-1',
                      inbound_event_id: 'in-1',
                      conversation_id: 'conv-1',
                      message_text: 'hello',
                      reply_to_external_id: null,
                      attempts: 1,
                      max_attempts: 3,
                    },
                  ],
                  error: null,
                }),
              })),
            })),
          })),
        })),
      }
    })

    startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
    })

    await sleep(100)

    expect(callLog).toContain('rpc:claim_next_outbound_event')
    expect(vi.mocked(processOutboundEvent)).toHaveBeenCalled()
  })

  it('should increment failure counter on RPC error', async () => {
    mockSupabase.rpc.mockImplementation(async (name: string) => {
      callLog.push(`rpc:${name}`)
      if (name === 'claim_next_inbound_event') {
        return { data: null, error: { message: 'DB connection refused' } }
      }
      if (name === 'claim_next_outbound_event') return { data: [], error: null }
      if (name === 'claim_next_scheduled_task') return { data: [], error: null }
      if (name === 'reset_stuck_events') return { data: { inbound_reset: 0, outbound_reset: 0 }, error: null }
      if (name === 'reset_stuck_scheduled_tasks') return { data: 0, error: null }
      if (name === 'reset_stuck_summary_jobs') return { data: 0, error: null }
      return { data: null, error: null }
    })

    const handle = startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
    })

    await sleep(50)

    const m = handle.getMetrics()
    expect(m.inboundFailures).toBeGreaterThanOrEqual(1)
  })

  it('should handle Supabase HTML error pages', async () => {
    mockSupabase.rpc.mockImplementation(async (name: string) => {
      callLog.push(`rpc:${name}`)
      if (name === 'claim_next_inbound_event') {
        return { data: null, error: { message: '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>' } }
      }
      if (name === 'claim_next_outbound_event') return { data: [], error: null }
      if (name === 'claim_next_scheduled_task') return { data: [], error: null }
      if (name === 'reset_stuck_events') return { data: { inbound_reset: 0, outbound_reset: 0 }, error: null }
      if (name === 'reset_stuck_scheduled_tasks') return { data: 0, error: null }
      if (name === 'reset_stuck_summary_jobs') return { data: 0, error: null }
      return { data: null, error: null }
    })

    const handle = startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
    })

    await sleep(50)

    // Should have incremented failures (error was sanitized internally)
    expect(handle.getMetrics().inboundFailures).toBeGreaterThanOrEqual(1)
  })

  it('should use custom inbound interval for broadcast wake', async () => {
    clearLog()

    startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
      broadcastWakeActive: true,
      inboundIntervalMs: 30000, // 30s fallback
    })

    await sleep(50)

    // Should have fired immediate first poll
    expect(callLog).toContain('rpc:claim_next_inbound_event')

    // The interval is 30s so no second poll within 50ms
    // (we just verify the module accepts the config without error)
  })
})

// ─── Simulation: Circuit Breaker Fallback ──────────────────────────────────

describe('Simulation: Pulse → Polling Fallback → Pulse Recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearLog()
    // Reset mock to default behavior
    mockSupabase.rpc.mockImplementation(async (name: string) => {
      callLog.push(`rpc:${name}`)
      if (name === 'claim_next_inbound_event') return { data: [], error: null }
      if (name === 'claim_next_outbound_event') return { data: [], error: null }
      if (name === 'claim_next_scheduled_task') return { data: [], error: null }
      if (name === 'reset_stuck_events') return { data: { inbound_reset: 0, outbound_reset: 0 }, error: null }
      if (name === 'reset_stuck_scheduled_tasks') return { data: 0, error: null }
      if (name === 'reset_stuck_summary_jobs') return { data: 0, error: null }
      return { data: null, error: null }
    })
  })

  afterEach(() => {
    stopPollingFallback()
  })

  it('should start polling on circuit open, stop on circuit close', async () => {
    // Simulate: circuit opens → polling starts
    const handle = startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
    })

    await sleep(50)

    // Polling is active — RPCs were called
    expect(callLog.length).toBeGreaterThan(0)

    // Simulate: circuit closes → stop polling
    stopPollingFallback()
    clearLog()

    // Triggers should be no-ops now
    triggerInboundPoll()
    triggerOutboundPoll()
    await sleep(50)

    expect(callLog).toHaveLength(0)
  })

  it('should survive rapid start/stop cycles without leaking timers', () => {
    const limit = pLimit(5)
    for (let i = 0; i < 20; i++) {
      startPollingFallback({
        supabase: mockSupabase,
        config: mockConfig,
        encryptionService: mockEncryptionService,
        inboundLimit: limit,
        outboundLimit: limit,
      })
      stopPollingFallback()
    }
    // No throws, no timer leaks — final state is stopped
    expect(() => triggerInboundPoll()).not.toThrow()
  })

  it('should cleanly hand off between polling sessions', async () => {
    const limit = pLimit(5)

    // First session
    const h1 = startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: limit,
      outboundLimit: limit,
    })
    await sleep(50)
    const m1 = h1.getMetrics()
    expect(m1.inboundFailures).toBe(0)
    stopPollingFallback()

    // Second session (simulates circuit recovery → re-open)
    clearLog()
    const h2 = startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: limit,
      outboundLimit: limit,
    })
    await sleep(50)

    // New handle, fresh counters
    const m2 = h2.getMetrics()
    expect(m2.inboundFailures).toBe(0)
    expect(callLog).toContain('rpc:claim_next_inbound_event')
  })
})

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  afterEach(() => {
    stopPollingFallback()
  })

  it('should not crash if processor throws', async () => {
    const { processInboundEvent } = await import('../../processors/inbound.js')
    vi.mocked(processInboundEvent).mockRejectedValueOnce(new Error('Agent loop exploded'))

    mockSupabase.rpc.mockImplementation(async (name: string) => {
      if (name === 'claim_next_inbound_event') {
        return { data: [{ id: 'evt-crash', assistant_id: 'a1', org_id: 'o1' }], error: null }
      }
      if (name === 'claim_next_outbound_event') return { data: [], error: null }
      if (name === 'claim_next_scheduled_task') return { data: [], error: null }
      if (name === 'reset_stuck_events') return { data: { inbound_reset: 0, outbound_reset: 0 }, error: null }
      if (name === 'reset_stuck_scheduled_tasks') return { data: 0, error: null }
      if (name === 'reset_stuck_summary_jobs') return { data: 0, error: null }
      return { data: null, error: null }
    })

    const handle = startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
    })

    await sleep(100)

    // Polling should still be running (processor errors don't crash the loop)
    // Failures should not increment (processor threw, but the polling loop caught it)
    const m = handle.getMetrics()
    expect(m.inboundFailures).toBe(0) // Processor error ≠ claim error
  })

  it('should reset counters on restart', async () => {
    // First session with errors
    mockSupabase.rpc.mockImplementation(async (name: string) => {
      if (name === 'claim_next_inbound_event') {
        return { data: null, error: { message: 'DB error' } }
      }
      if (name === 'claim_next_outbound_event') return { data: [], error: null }
      if (name === 'claim_next_scheduled_task') return { data: [], error: null }
      if (name === 'reset_stuck_events') return { data: { inbound_reset: 0, outbound_reset: 0 }, error: null }
      if (name === 'reset_stuck_scheduled_tasks') return { data: 0, error: null }
      if (name === 'reset_stuck_summary_jobs') return { data: 0, error: null }
      return { data: null, error: null }
    })

    const h1 = startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
    })
    await sleep(50)
    expect(h1.getMetrics().inboundFailures).toBeGreaterThanOrEqual(1)

    // Restart with no errors
    mockSupabase.rpc.mockImplementation(async (name: string) => {
      if (name === 'claim_next_inbound_event') return { data: [], error: null }
      if (name === 'claim_next_outbound_event') return { data: [], error: null }
      if (name === 'claim_next_scheduled_task') return { data: [], error: null }
      if (name === 'reset_stuck_events') return { data: { inbound_reset: 0, outbound_reset: 0 }, error: null }
      if (name === 'reset_stuck_scheduled_tasks') return { data: 0, error: null }
      if (name === 'reset_stuck_summary_jobs') return { data: 0, error: null }
      return { data: null, error: null }
    })

    const h2 = startPollingFallback({
      supabase: mockSupabase,
      config: mockConfig,
      encryptionService: mockEncryptionService,
      inboundLimit: pLimit(5),
      outboundLimit: pLimit(10),
    })
    await sleep(50)

    // Fresh start → counters reset
    expect(h2.getMetrics().inboundFailures).toBe(0)
  })
})
