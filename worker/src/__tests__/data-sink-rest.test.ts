/**
 * RestDataSink + OfflineBuffer Tests
 *
 * Tests the REST DataSink implementation: relay methods, offline buffering,
 * backoff logic, and boundary conditions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RestDataSink, OfflineBuffer } from '../runtime/data-sink.js'

// ─── OfflineBuffer Tests ───

describe('OfflineBuffer', () => {
  it('push and flush work correctly', () => {
    const buffer = new OfflineBuffer(5)
    buffer.push({ type: 'heartbeat', payload: { id: 1 }, timestamp: 1 })
    buffer.push({ type: 'event', payload: { id: 2 }, timestamp: 2 })

    expect(buffer.depth).toBe(2)

    const batch = buffer.flush(10)
    expect(batch).toHaveLength(2)
    expect(batch[0].type).toBe('heartbeat')
    expect(batch[1].type).toBe('event')
    expect(buffer.depth).toBe(0)
  })

  it('respects capacity with tail-drop', () => {
    const buffer = new OfflineBuffer(3)
    buffer.push({ type: 'heartbeat', payload: { id: 1 }, timestamp: 1 })
    buffer.push({ type: 'heartbeat', payload: { id: 2 }, timestamp: 2 })
    buffer.push({ type: 'heartbeat', payload: { id: 3 }, timestamp: 3 })
    // This should evict id: 1
    buffer.push({ type: 'heartbeat', payload: { id: 4 }, timestamp: 4 })

    expect(buffer.depth).toBe(3)
    expect(buffer.droppedCount).toBe(1)

    const batch = buffer.flush(10)
    expect(batch).toHaveLength(3)
    // Oldest (id: 1) was dropped, so first item is id: 2
    expect((batch[0].payload as any).id).toBe(2)
    expect((batch[2].payload as any).id).toBe(4)
  })

  it('flushes partial batch when requested', () => {
    const buffer = new OfflineBuffer(100)
    for (let i = 0; i < 10; i++) {
      buffer.push({ type: 'event', payload: { i }, timestamp: i })
    }

    const batch = buffer.flush(3)
    expect(batch).toHaveLength(3)
    expect(buffer.depth).toBe(7)
  })

  it('handles empty buffer flush', () => {
    const buffer = new OfflineBuffer(5)
    const batch = buffer.flush(10)
    expect(batch).toHaveLength(0)
    expect(buffer.depth).toBe(0)
  })

  it('tracks dropped count across multiple overflows', () => {
    const buffer = new OfflineBuffer(2)
    for (let i = 0; i < 10; i++) {
      buffer.push({ type: 'heartbeat', payload: { i }, timestamp: i })
    }
    expect(buffer.droppedCount).toBe(8) // 10 pushed, capacity 2, so 8 dropped
    expect(buffer.depth).toBe(2)
  })

  it('peek/ack leaves the entry in place until ackFirst()', () => {
    const buffer = new OfflineBuffer(5)
    buffer.push({ type: 'event', payload: { id: 'first' }, timestamp: 1 })
    buffer.push({ type: 'event', payload: { id: 'second' }, timestamp: 2 })

    const peeked = buffer.peekFirst()
    expect((peeked!.payload as any).id).toBe('first')
    expect(buffer.depth).toBe(2) // still there

    buffer.ackFirst()
    expect(buffer.depth).toBe(1)

    const next = buffer.peekFirst()
    expect((next!.payload as any).id).toBe('second')
  })

  it('peekFirst returns null on empty buffer', () => {
    const buffer = new OfflineBuffer(5)
    expect(buffer.peekFirst()).toBeNull()
    buffer.ackFirst() // no-op
    expect(buffer.depth).toBe(0)
  })

  it('wraps around ring buffer correctly', () => {
    const buffer = new OfflineBuffer(3)
    // Fill buffer
    buffer.push({ type: 'heartbeat', payload: { id: 'a' }, timestamp: 1 })
    buffer.push({ type: 'heartbeat', payload: { id: 'b' }, timestamp: 2 })
    buffer.push({ type: 'heartbeat', payload: { id: 'c' }, timestamp: 3 })
    // Flush all
    buffer.flush(3)
    expect(buffer.depth).toBe(0)
    // Push more (wraps around)
    buffer.push({ type: 'event', payload: { id: 'd' }, timestamp: 4 })
    buffer.push({ type: 'event', payload: { id: 'e' }, timestamp: 5 })

    const batch = buffer.flush(10)
    expect(batch).toHaveLength(2)
    expect((batch[0].payload as any).id).toBe('d')
    expect((batch[1].payload as any).id).toBe('e')
  })
})

// ─── RestDataSink Tests ───

describe('RestDataSink', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
    vi.useFakeTimers()
  })

  afterEach(() => {
    fetchSpy.mockRestore()
    vi.useRealTimers()
  })

  function okResponse(data: unknown = {}): Response {
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  function errorResponse(status: number): Response {
    return new Response('Error', { status })
  }

  // ─── Relay Methods ───

  describe('claimInboundEvents', () => {
    it('posts to claim-inbound endpoint and returns packets', async () => {
      const mockPackets = [{ eventId: 'evt-1' }, { eventId: 'evt-2' }]
      fetchSpy.mockResolvedValueOnce(okResponse({ packets: mockPackets }))

      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      const result = await sink.claimInboundEvents(5)

      expect(result).toHaveLength(2)
      expect(result[0].eventId).toBe('evt-1')
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/api/runtimes/messages/claim-inbound',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer key-1',
          }),
        })
      )
      const callBody = JSON.parse((fetchSpy.mock.calls[0][1] as any).body)
      expect(callBody.batchSize).toBe(5)
    })

    it('throws on non-200 response', async () => {
      fetchSpy.mockResolvedValueOnce(errorResponse(429))

      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      await expect(sink.claimInboundEvents(5)).rejects.toThrow('429')
    })
  })

  describe('completeInboundEvent', () => {
    it('posts to complete-inbound endpoint and returns result', async () => {
      const mockResult = { alreadyApplied: false, delivered: true, externalMessageId: 'ext_1' }
      fetchSpy.mockResolvedValueOnce(okResponse(mockResult))

      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      const result = await sink.completeInboundEvent({
        eventId: 'evt-1',
        runId: 'run-1',
        responseText: 'Hello',
      })

      expect(result.delivered).toBe(true)
      expect(result.externalMessageId).toBe('ext_1')
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/api/runtimes/messages/complete-inbound',
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('passes token usage through', async () => {
      fetchSpy.mockResolvedValueOnce(okResponse({ alreadyApplied: false, delivered: true }))

      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      await sink.completeInboundEvent({
        eventId: 'evt-1',
        runId: 'run-1',
        responseText: 'Hello',
        tokenUsage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.002 },
      })

      const callBody = JSON.parse((fetchSpy.mock.calls[0][1] as any).body)
      expect(callBody.tokenUsage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        estimatedCostUsd: 0.002,
      })
    })

    it('returns alreadyApplied for idempotent replay', async () => {
      fetchSpy.mockResolvedValueOnce(okResponse({ alreadyApplied: true, delivered: true }))

      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      const result = await sink.completeInboundEvent({
        eventId: 'evt-1',
        runId: 'run-1',
        responseText: 'Hello',
      })

      expect(result.alreadyApplied).toBe(true)
    })
  })

  describe('reportAIGeneration', () => {
    it('posts AI generation receipts to the runtime control-plane endpoint', async () => {
      fetchSpy.mockResolvedValueOnce(okResponse({ success: true }))

      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      await sink.reportAIGeneration({
        agentId: 'agent-1',
        runId: 'run-1',
        feature: 'agent-run',
        modality: 'agent-run',
        prompt: 'hello',
        success: true,
        provider: 'trustgate',
        model: 'openai/gpt-4.1',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      })

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/api/runtimes/ai-generation-events',
        expect.objectContaining({ method: 'POST' }),
      )
      const callBody = JSON.parse((fetchSpy.mock.calls[0][1] as any).body)
      expect(callBody).toMatchObject({
        agentId: 'agent-1',
        runId: 'run-1',
        feature: 'agent-run',
        modality: 'agent-run',
      })
    })
  })

  // ─── Heartbeat + Offline Buffer ───

  describe('reportHeartbeat', () => {
    it('reports heartbeat successfully', async () => {
      fetchSpy.mockResolvedValueOnce(okResponse())

      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      const configVersion = await sink.reportHeartbeat({
        runtimeId: 'rt-1',
        generation: 1,
        cpuPercent: 50,
        ramPercent: 60,
        diskPercent: 30,
        pendingEvents: 0,
        deadLetters: 0,
        openclawVersion: '1.0.0',
        agentCount: 2,
        uptimeSeconds: 3600,
      })

      expect(fetchSpy).toHaveBeenCalledOnce()
      expect(configVersion).toBeNull()
    })

    it('returns configVersion when the control plane reports drift metadata', async () => {
      fetchSpy.mockResolvedValueOnce(okResponse({ status: 'ok', configVersion: 'cfg-123' }))

      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      const configVersion = await sink.reportHeartbeat({
        runtimeId: 'rt-1',
        generation: 1,
        cpuPercent: 50,
        ramPercent: 60,
        diskPercent: 30,
        pendingEvents: 0,
        deadLetters: 0,
        openclawVersion: '1.0.0',
        agentCount: 2,
        uptimeSeconds: 3600,
      })

      expect(configVersion).toBe('cfg-123')
    })

    it('buffers heartbeat on network failure', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network error'))

      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      // Should not throw
      await sink.reportHeartbeat({
        runtimeId: 'rt-1',
        generation: 1,
        cpuPercent: 50,
        ramPercent: 60,
        diskPercent: 30,
        pendingEvents: 0,
        deadLetters: 0,
        openclawVersion: '1.0.0',
        agentCount: 2,
        uptimeSeconds: 3600,
      })

      // Heartbeat was buffered (no assertion on internal buffer, just no throw)
      expect(fetchSpy).toHaveBeenCalledOnce()
    })
  })

  // ─── Events + Offline Buffer ───

  describe('reportEvents', () => {
    it('sends events batch', async () => {
      fetchSpy.mockResolvedValueOnce(okResponse())

      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      await sink.reportEvents([
        { eventType: 'run_started', severity: 'info', payload: { runId: 'r1' } },
        { eventType: 'run_finished', severity: 'info', payload: { runId: 'r1' } },
      ])

      const callBody = JSON.parse((fetchSpy.mock.calls[0][1] as any).body)
      expect(callBody.events).toHaveLength(2)
    })

    it('skips empty events array', async () => {
      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      await sink.reportEvents([])
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('buffers events on failure', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network error'))

      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      await sink.reportEvents([
        { eventType: 'error', severity: 'error', payload: { msg: 'test' } },
      ])

      // Should not throw
      expect(fetchSpy).toHaveBeenCalledOnce()
    })

    it('preserves buffered critical events across a failed flush attempt', async () => {
      // Regression: previously flushBuffer() pulled entries out of the ring
      // buffer upfront. A single failing POST mid-batch silently dropped
      // every remaining entry in that batch — including critical signals
      // like `channel_deactivated`. The peek/ack loop must keep unprocessed
      // entries in the buffer so the next flush retries them.
      vi.useRealTimers()

      fetchSpy.mockRejectedValueOnce(new Error('buffer this')) // initial reportEvents fails
      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      await sink.reportEvents([
        { eventType: 'channel_deactivated', severity: 'critical', payload: { channelType: 'telegram' } },
      ])

      // Now trigger a heartbeat whose flush attempt also fails. The
      // critical event must still be sitting in the buffer — not lost.
      fetchSpy.mockResolvedValueOnce(okResponse()) // heartbeat itself succeeds
      fetchSpy.mockRejectedValueOnce(new Error('flush post fails')) // flushed event POST fails

      await sink.reportHeartbeat({
        runtimeId: 'rt-1',
        generation: 1,
        cpuPercent: 1,
        ramPercent: 1,
        diskPercent: 1,
        pendingEvents: 0,
        deadLetters: 0,
        openclawVersion: '1.0.0',
        agentCount: 0,
        uptimeSeconds: 0,
      })

      // Give the scheduled flush a chance to run
      await new Promise((r) => setTimeout(r, 50))

      // The critical event must still be deliverable on the next attempt.
      fetchSpy.mockResolvedValue(okResponse())
      await sink.reportHeartbeat({
        runtimeId: 'rt-1',
        generation: 1,
        cpuPercent: 1,
        ramPercent: 1,
        diskPercent: 1,
        pendingEvents: 0,
        deadLetters: 0,
        openclawVersion: '1.0.0',
        agentCount: 0,
        uptimeSeconds: 0,
      })

      await new Promise((r) => setTimeout(r, 50))

      // Verify at least one POST to /api/runtimes/events happened with the
      // critical event after recovery. If flushBuffer dropped the entry on
      // the first failure, this assertion fails.
      const eventPosts = fetchSpy.mock.calls.filter(
        (call) => String(call[0]).includes('/api/runtimes/events'),
      )
      const criticalDelivered = eventPosts.some((call) => {
        try {
          const body = JSON.parse((call[1] as any).body)
          return body.events?.[0]?.eventType === 'channel_deactivated'
        } catch {
          return false
        }
      })
      expect(criticalDelivered).toBe(true)

      vi.useFakeTimers()
    })
  })

  // ─── Approval (no buffer — fail fast) ───

  describe('submitApproval', () => {
    it('submits approval and returns ID', async () => {
      fetchSpy.mockResolvedValueOnce(okResponse({ approvalId: 'apr-1' }))

      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      const id = await sink.submitApproval({
        agentId: 'agent-1',
        toolName: 'dex_swap',
        toolArgs: { amount: '1.0' },
        runId: 'run-1',
        timeoutMs: 300_000,
      })

      expect(id).toBe('apr-1')
    })

    it('throws on failure (no buffer)', async () => {
      fetchSpy.mockResolvedValueOnce(errorResponse(500))

      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      await expect(
        sink.submitApproval({
          agentId: 'agent-1',
          toolName: 'dex_swap',
          toolArgs: {},
          runId: 'run-1',
          timeoutMs: 300_000,
        })
      ).rejects.toThrow('500')
    })
  })

  describe('pollApprovalResolution', () => {
    it('returns null for pending approval', async () => {
      fetchSpy.mockResolvedValueOnce(okResponse({ status: 'pending' }))

      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      const result = await sink.pollApprovalResolution('apr-1')
      expect(result).toBeNull()
    })

    it('returns resolution for decided approval', async () => {
      fetchSpy.mockResolvedValueOnce(okResponse({
        status: 'approved',
        resolvedAt: '2026-03-30T12:00:00Z',
      }))

      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      const result = await sink.pollApprovalResolution('apr-1')
      expect(result).toEqual({
        decision: 'approved',
        resolvedAt: '2026-03-30T12:00:00Z',
      })
    })
  })

  // ─── Native Channels in Heartbeat ───

  describe('native channels in heartbeat', () => {
    it('includes native channel status in heartbeat', async () => {
      fetchSpy.mockResolvedValueOnce(okResponse())

      const sink = new RestDataSink('https://api.example.com', 'rt-1', 'key-1')
      await sink.reportHeartbeat({
        runtimeId: 'rt-1',
        generation: 1,
        cpuPercent: 50,
        ramPercent: 60,
        diskPercent: 30,
        pendingEvents: 0,
        deadLetters: 0,
        openclawVersion: '1.0.0',
        agentCount: 2,
        uptimeSeconds: 3600,
        nativeChannels: [
          { channelType: 'telegram', accountId: 'bot123', status: 'connected' },
          { channelType: 'discord', accountId: 'srv456', status: 'error', errorMessage: 'Token expired' },
        ],
      })

      const callBody = JSON.parse((fetchSpy.mock.calls[0][1] as any).body)
      expect(callBody.nativeChannels).toHaveLength(2)
      expect(callBody.nativeChannels[0].status).toBe('connected')
      expect(callBody.nativeChannels[1].errorMessage).toBe('Token expired')
    })
  })
})
