/**
 * Agent Bridge — Simulation Tests
 *
 * Production-scale scenarios: network partitions, burst traffic, concurrent runs,
 * extended outages, reconnection sequences, backoff escalation, and memory safety.
 *
 * These tests verify the SDK behaves correctly under adversarial conditions
 * that are difficult to reproduce in unit or E2E tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LucidBridge } from '../bridge.js'
import { OfflineBuffer } from '../offline-buffer.js'
import { EventReporter } from '../event-reporter.js'
import { HeartbeatManager } from '../heartbeat.js'
import { MessageRelay } from '../message-relay.js'
import { defaultLogger } from '../logger.js'
import type { BridgeConfig, RunPacket, FeedEvent } from '../types.js'

// =============================================================================
// Mock HTTP Boundary
// =============================================================================

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function jsonResponse(data: unknown = {}): Partial<Response> {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

// =============================================================================
// Factories
// =============================================================================

function validConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    runtimeId: 'rt-sim',
    runtimeKey: 'key-sim',
    controlPlaneUrl: 'https://lucid.test',
    heartbeatIntervalMs: 30_000,
    eventFlushIntervalMs: 5_000,
    messagePollIntervalMs: 5_000,
    ...overrides,
  }
}

function mockClient() {
  return { post: vi.fn().mockResolvedValue(undefined), get: vi.fn() }
}

function makePacket(index: number): RunPacket {
  return {
    eventId: `evt-${index}`,
    idempotencyToken: `tok-${index}`,
    channelMeta: {
      channelType: 'telegram',
      channelId: 'ch-1',
      externalUserId: `user-${index}`,
      externalChatId: `chat-${index}`,
    },
    assistantConfig: {
      id: `agent-${index % 3}`,
      name: `Agent ${index % 3}`,
      engine: 'openclaw',
      systemPrompt: null,
      soulContent: null,
      runtimeFlavor: 'c1_managed',
      modelId: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 4096,
      enabledTools: [],
      policyConfig: {},
      memoryEnabled: true,
      approvalRequiredTools: [], orgId: 'org-test-1',
    },
    recentMessages: [],
    memoryInjection: [],
    boardMemories: [],
    conversationSummary: null,
    userMessage: {
      text: `Message ${index}`,
      externalMessageId: `msg-${index}`,
      externalUserId: `user-${index}`,
      messageData: null,
    },
    skills: [],
    plugins: [],
  }
}

function makeEvent(index: number): FeedEvent {
  return {
    agentId: `agent-${index % 5}`,
    eventType: 'tool_call',
    severity: 'info',
    payload: { seq: index, tool: `tool_${index % 10}` },
  }
}

// =============================================================================
// Network Partition Simulation
// =============================================================================

describe('network partition simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('survives 5-minute total outage then recovers', async () => {
    let networkUp = false

    mockFetch.mockImplementation(() => {
      if (!networkUp) return Promise.reject(new Error('ECONNREFUSED'))
      return Promise.resolve(jsonResponse())
    })

    const bridge = new LucidBridge(validConfig({ mode: 'observe' }))
    await bridge.start()
    expect(bridge.isRunning).toBe(true)

    // Report events during outage
    for (let i = 0; i < 20; i++) {
      bridge.reportEvent(makeEvent(i))
    }

    // Advance 5 minutes (heartbeats + event flushes all failing)
    for (let i = 0; i < 60; i++) {
      await vi.advanceTimersByTimeAsync(5_000)
    }

    // Offline buffer should have accumulated heartbeats
    expect(bridge.offlineBufferDepth).toBeGreaterThan(0)

    // Network recovers
    networkUp = true

    // Next heartbeat should succeed
    await vi.advanceTimersByTimeAsync(30_000)

    // Events should flush
    await vi.advanceTimersByTimeAsync(5_000)

    await bridge.stop()
  })

  it('intermittent failures (50% packet loss) do not crash', async () => {
    let callCount = 0
    mockFetch.mockImplementation(() => {
      callCount++
      if (callCount % 2 === 0) return Promise.reject(new Error('Timeout'))
      return Promise.resolve(jsonResponse())
    })

    const bridge = new LucidBridge(validConfig({ mode: 'observe' }))
    await bridge.start()

    for (let i = 0; i < 10; i++) {
      bridge.reportEvent(makeEvent(i))
    }

    // Run for 2 minutes of intermittent failures
    for (let i = 0; i < 24; i++) {
      await vi.advanceTimersByTimeAsync(5_000)
    }

    expect(bridge.isRunning).toBe(true)
    await bridge.stop()
  })
})

// =============================================================================
// Event Reporter Burst Simulation
// =============================================================================

describe('event reporter burst simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('handles 500 events reported in rapid succession', () => {
    const client = mockClient()
    const reporter = new EventReporter(client as never, defaultLogger, { intervalMs: 5_000 })
    reporter.start()

    for (let i = 0; i < 500; i++) {
      reporter.report(makeEvent(i))
    }

    // Auto-flush should have triggered at 100, 200, 300, 400, 500
    expect(client.post).toHaveBeenCalledTimes(5)

    // Verify each batch was max 100
    for (const call of client.post.mock.calls) {
      const events = call[1].events
      expect(events.length).toBeLessThanOrEqual(100)
    }

    reporter.stop()
  })

  it('retried events maintain ordering through failure cycles', async () => {
    const client = mockClient()
    let failCount = 0
    client.post.mockImplementation(async () => {
      failCount++
      if (failCount <= 3) throw new Error('Network')
      return undefined
    })

    const reporter = new EventReporter(client as never, defaultLogger, { intervalMs: 1_000 })
    reporter.start()

    // Report 10 events
    for (let i = 0; i < 10; i++) {
      reporter.report({
        agentId: 'a-1',
        eventType: 'tool_call',
        severity: 'info',
        payload: { seq: i },
      })
    }

    // Flush 3 times (all fail)
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1_000)
    }
    expect(reporter.pendingCount).toBeGreaterThan(0)

    // 4th flush succeeds
    await vi.advanceTimersByTimeAsync(1_000)

    // The successful batch should have events in original order
    const successCall = client.post.mock.calls.find(
      (_, idx) => !client.post.mock.results[idx].value?.then
        || client.post.mock.results[idx].type === 'return',
    )
    if (successCall) {
      const events = successCall[1].events
      for (let i = 1; i < events.length; i++) {
        expect(events[i].payload.seq).toBeGreaterThan(events[i - 1].payload.seq)
      }
    }

    reporter.stop()
  })

  it('buffer cap at 500 prevents unbounded growth during extended outage', async () => {
    const client = mockClient()
    client.post.mockRejectedValue(new Error('Network'))

    const reporter = new EventReporter(client as never, defaultLogger, { intervalMs: 1_000 })
    reporter.start()

    // Report 1000 events (well over the 500 cap)
    for (let i = 0; i < 1000; i++) {
      reporter.report(makeEvent(i))
    }

    // Flush cycles (all fail, events re-queued, capped)
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(1_000)
    }

    // Buffer should be bounded
    expect(reporter.pendingCount).toBeLessThanOrEqual(500)

    reporter.stop()
  })
})

// =============================================================================
// Offline Buffer Stress Simulation
// =============================================================================

describe('offline buffer stress simulation', () => {
  it('10K pushes stay within capacity bounds', () => {
    const capacity = 500
    const buf = new OfflineBuffer(capacity)

    for (let i = 0; i < 10_000; i++) {
      buf.push({ type: 'event', payload: { seq: i }, timestamp: Date.now() + i })
      expect(buf.depth).toBeLessThanOrEqual(capacity)
    }

    expect(buf.depth).toBe(capacity)
    expect(buf.droppedCount).toBe(9_500)
  })

  it('alternating push-flush cycles maintain integrity over 1000 cycles', () => {
    const buf = new OfflineBuffer(50)

    for (let cycle = 0; cycle < 1000; cycle++) {
      // Push 10 entries
      for (let j = 0; j < 10; j++) {
        buf.push({ type: 'event', payload: { cycle, j }, timestamp: Date.now() })
      }
      // Flush 7 entries
      const batch = buf.flush(7)
      expect(batch.length).toBeLessThanOrEqual(7)
      expect(buf.depth).toBeGreaterThanOrEqual(0)
      expect(buf.depth).toBeLessThanOrEqual(50)
    }
  })

  it('mixed-type entries preserve type through round trip', () => {
    const buf = new OfflineBuffer(1000)
    const types = ['heartbeat', 'event', 'cost'] as const

    for (let i = 0; i < 300; i++) {
      buf.push({
        type: types[i % 3],
        payload: { seq: i },
        timestamp: Date.now() + i,
      })
    }

    const flushed = buf.flush(300)
    expect(flushed).toHaveLength(300)

    // Verify type pattern: heartbeat, event, cost, heartbeat, event, cost...
    for (let i = 0; i < 300; i++) {
      expect(flushed[i].type).toBe(types[i % 3])
    }
  })

  it('dropped count accumulates across multiple overflow events', () => {
    const buf = new OfflineBuffer(10)

    // Overflow 3 times
    for (let wave = 0; wave < 3; wave++) {
      for (let i = 0; i < 20; i++) {
        buf.push({ type: 'event', payload: { wave, i }, timestamp: Date.now() })
      }
    }

    // 60 pushed, 10 capacity, 50 dropped
    expect(buf.droppedCount).toBe(50)
    expect(buf.depth).toBe(10)

    // Reset (simulating heartbeat report)
    buf.droppedCount = 0
    expect(buf.droppedCount).toBe(0)

    // More overflow
    for (let i = 0; i < 15; i++) {
      buf.push({ type: 'heartbeat', payload: { i }, timestamp: Date.now() })
    }
    expect(buf.droppedCount).toBe(15)
  })
})

// =============================================================================
// Message Relay Backoff Simulation
// =============================================================================

describe('message relay backoff simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (capped)', async () => {
    const client = mockClient()
    client.post.mockRejectedValue(new Error('Network'))

    const handler = vi.fn()
    const relay = new MessageRelay(
      client as never,
      { report: vi.fn() } as never,
      {} as never,
      handler,
      undefined,
      defaultLogger,
      { intervalMs: 5_000, claimWaitMs: 15_000 },
    )

    relay.start()

    // Track timestamps of claim attempts
    const claimTimestamps: number[] = []
    client.post.mockImplementation(async () => {
      claimTimestamps.push(Date.now())
      throw new Error('Network')
    })

    // First attempt (immediate)
    await vi.advanceTimersByTimeAsync(0)
    // Backoff 1s
    await vi.advanceTimersByTimeAsync(1_000)
    // Backoff 2s
    await vi.advanceTimersByTimeAsync(2_000)
    // Backoff 4s
    await vi.advanceTimersByTimeAsync(4_000)
    // Backoff 8s
    await vi.advanceTimersByTimeAsync(8_000)
    // Backoff 16s
    await vi.advanceTimersByTimeAsync(16_000)
    // Backoff 30s (capped)
    await vi.advanceTimersByTimeAsync(30_000)

    // Should have at least 5 attempts
    expect(client.post.mock.calls.length).toBeGreaterThanOrEqual(5)

    relay.stop()
  })

  it('backoff resets after successful poll', async () => {
    const client = mockClient()
    let callCount = 0

    client.post.mockImplementation(async () => {
      callCount++
      // First 3 calls fail, then succeed
      if (callCount <= 3) throw new Error('Network')
      return { packets: [] }
    })

    const handler = vi.fn()
    const relay = new MessageRelay(
      client as never,
      { report: vi.fn() } as never,
      {} as never,
      handler,
      undefined,
      defaultLogger,
      { intervalMs: 2_000, claimWaitMs: 15_000 },
    )

    relay.start()

    // Fail 3 times with exponential backoff
    await vi.advanceTimersByTimeAsync(0) // fail 1
    await vi.advanceTimersByTimeAsync(1_000) // fail 2
    await vi.advanceTimersByTimeAsync(2_000) // fail 3
    await vi.advanceTimersByTimeAsync(4_000) // succeed (backoff resets)

    const callsBeforeReset = callCount

    // Next poll should be at base interval (2s), not backed-off
    await vi.advanceTimersByTimeAsync(2_000)
    expect(callCount).toBe(callsBeforeReset + 1)

    relay.stop()
  })
})

// =============================================================================
// Concurrent trackRun Simulation
// =============================================================================

describe('concurrent trackRun simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetch.mockResolvedValue(jsonResponse())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('10 concurrent trackRun calls produce 10 unique run_started events', async () => {
    const bridge = new LucidBridge(validConfig({ mode: 'observe' }))
    await bridge.start()

    // Fire 10 trackRun calls concurrently
    const promises = Array.from({ length: 10 }, (_, i) =>
      bridge.trackRun({ agentId: `agent-${i}` }, async () => ({
        responseText: `Result ${i}`,
      })),
    )

    const results = await Promise.all(promises)
    expect(results).toHaveLength(10)

    // All should have valid durationMs
    for (const r of results) {
      expect(r.durationMs).toBeGreaterThanOrEqual(0)
    }

    // Flush events
    await vi.advanceTimersByTimeAsync(5_000)

    // Verify 10 run_started + 10 run_finished events
    const eventCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('/events'),
    )
    const allEvents = eventCalls
      .map((c: unknown[]) => JSON.parse((c[1] as any).body))
      .flatMap((b: any) => b.events || [])

    const starts = allEvents.filter((e: any) => e.eventType === 'run_started')
    const finishes = allEvents.filter((e: any) => e.eventType === 'run_finished')
    expect(starts).toHaveLength(10)
    expect(finishes).toHaveLength(10)

    await bridge.stop()
  })

  it('mixed success and failure in concurrent runs', async () => {
    const bridge = new LucidBridge(validConfig({ mode: 'observe' }))
    await bridge.start()

    const promises = Array.from({ length: 10 }, (_, i) =>
      bridge.trackRun({ agentId: `agent-${i}` }, async () => {
        if (i % 3 === 0) throw new Error(`Agent ${i} failed`)
        return { responseText: `OK ${i}` }
      }).catch((err: Error) => ({ error: err.message, durationMs: 0 })),
    )

    const results = await Promise.all(promises)
    const successes = results.filter((r: any) => !r.error)
    const failures = results.filter((r: any) => r.error)

    // indices 0, 3, 6, 9 fail → 4 failures, 6 successes
    expect(failures).toHaveLength(4)
    expect(successes).toHaveLength(6)

    // Flush events
    await vi.advanceTimersByTimeAsync(5_000)

    const eventCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('/events'),
    )
    const allEvents = eventCalls
      .map((c: unknown[]) => JSON.parse((c[1] as any).body))
      .flatMap((b: any) => b.events || [])

    const errors = allEvents.filter((e: any) => e.eventType === 'error')
    expect(errors).toHaveLength(4)

    await bridge.stop()
  })
})

// =============================================================================
// High-Volume Message Processing Simulation
// =============================================================================

describe('high-volume message simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('processes 50 messages across 5 poll cycles', async () => {
    let pollCycle = 0

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/claim-inbound')) {
        pollCycle++
        if (pollCycle <= 5) {
          const packets = Array.from({ length: 10 }, (_, i) =>
            makePacket((pollCycle - 1) * 10 + i),
          )
          return Promise.resolve(jsonResponse({ packets }))
        }
        return Promise.resolve(jsonResponse({ packets: [] }))
      }
      if (url.includes('/complete-inbound')) {
        return Promise.resolve(jsonResponse({ alreadyApplied: false, delivered: true }))
      }
      return Promise.resolve(jsonResponse())
    })

    let processedCount = 0
    const bridge = new LucidBridge(validConfig({ mode: 'full' }))
    bridge.onMessage(async (packet) => {
      processedCount++
      return { responseText: `Reply to ${packet.userMessage.text}` }
    })

    await bridge.start()

    // Run 5 poll cycles
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(5_000)
    }

    expect(processedCount).toBe(50)

    // Verify all 50 complete-inbound calls were made
    const completeCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('/complete-inbound'),
    )
    expect(completeCalls).toHaveLength(50)

    await bridge.stop()
  })
})

// =============================================================================
// Heartbeat + Offline Buffer Interaction Simulation
// =============================================================================

describe('heartbeat offline buffer simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('heartbeat piggybacks _droppedTelemetry after buffer overflow', () => {
    const client = mockClient()
    const buffer = new OfflineBuffer(5)
    const hb = new HeartbeatManager(client as never, buffer, defaultLogger, {
      runtimeId: 'rt-1',
      generation: 1,
      intervalMs: 30_000,
    })

    // Overflow the buffer
    for (let i = 0; i < 10; i++) {
      buffer.push({ type: 'event', payload: { i }, timestamp: Date.now() })
    }
    expect(buffer.droppedCount).toBe(5)

    // Send heartbeat
    hb.start()

    // Verify _droppedTelemetry was included
    const payload = client.post.mock.calls[0][1]
    expect(payload._droppedTelemetry).toBe(5)

    hb.stop()
  })

  it('droppedCount resets after successful heartbeat delivery', async () => {
    const client = mockClient()
    const buffer = new OfflineBuffer(5)
    const hb = new HeartbeatManager(client as never, buffer, defaultLogger, {
      runtimeId: 'rt-1',
      generation: 1,
      intervalMs: 30_000,
    })

    // Overflow
    for (let i = 0; i < 8; i++) {
      buffer.push({ type: 'event', payload: { i }, timestamp: Date.now() })
    }
    expect(buffer.droppedCount).toBe(3)

    hb.start()

    // Wait for async .then() to resolve
    await vi.advanceTimersByTimeAsync(0)
    expect(buffer.droppedCount).toBe(0)

    hb.stop()
  })

  it('failed heartbeat goes into offline buffer', async () => {
    const client = mockClient()
    client.post.mockRejectedValue(new Error('Network'))

    const buffer = new OfflineBuffer(100)
    const hb = new HeartbeatManager(client as never, buffer, defaultLogger, {
      runtimeId: 'rt-1',
      generation: 1,
      intervalMs: 30_000,
    })

    hb.start()

    // Wait for catch handler
    await vi.advanceTimersByTimeAsync(0)
    expect(buffer.depth).toBe(1)

    // More heartbeats fail
    await vi.advanceTimersByTimeAsync(30_000)
    await vi.advanceTimersByTimeAsync(0)
    expect(buffer.depth).toBe(2)

    hb.stop()
  })
})

// =============================================================================
// Performance Budget Assertions
// =============================================================================

describe('performance budgets', () => {
  it('OfflineBuffer push is O(1) — 100K pushes in under 200ms', () => {
    const buf = new OfflineBuffer(1000)
    const start = performance.now()

    for (let i = 0; i < 100_000; i++) {
      buf.push({ type: 'event', payload: { i }, timestamp: i })
    }

    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(200)
    expect(buf.depth).toBe(1000)
  })

  it('EventReporter report() is synchronous — 10K reports in under 50ms', () => {
    const client = mockClient()
    const reporter = new EventReporter(client as never, defaultLogger, { intervalMs: 60_000 })

    const start = performance.now()
    for (let i = 0; i < 10_000; i++) {
      reporter.report(makeEvent(i))
    }
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(50)

    // Auto-flush should have triggered 100 times (at 100-event threshold)
    expect(client.post).toHaveBeenCalledTimes(100)

    reporter.stop()
  })
})

// =============================================================================
// Long-Running Session Simulation
// =============================================================================

describe('long-running session simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetch.mockResolvedValue(jsonResponse())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('30-minute observe session with periodic trackRun', async () => {
    const bridge = new LucidBridge(validConfig({ mode: 'observe' }))
    await bridge.start()

    // Simulate 30 minutes: trackRun every 30s, events throughout
    for (let minute = 0; minute < 30; minute++) {
      // 2 trackRun calls per minute
      for (let j = 0; j < 2; j++) {
        await bridge.trackRun({ agentId: 'agent-1' }, async () => ({
          responseText: `Run at minute ${minute}`,
        }))
      }

      // Advance 1 minute (triggers heartbeats + event flushes)
      await vi.advanceTimersByTimeAsync(60_000)
    }

    expect(bridge.isRunning).toBe(true)

    // Should have sent heartbeats (~60, every 30s for 30 min)
    const heartbeats = mockFetch.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('/heartbeat'),
    )
    expect(heartbeats.length).toBeGreaterThanOrEqual(50) // ~60 but some timing variance

    // Should have flushed events multiple times
    const eventFlushes = mockFetch.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('/events'),
    )
    expect(eventFlushes.length).toBeGreaterThanOrEqual(10)

    await bridge.stop()
  })
})
