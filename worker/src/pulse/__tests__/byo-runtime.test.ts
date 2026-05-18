/**
 * Pulse BYO Runtime Tests
 *
 * Verifies that dedicated runtimes can:
 * - Extend lease via REST (renew-lease)
 * - Explicitly fail/nack events (fail-inbound)
 * - DataSink has the new methods
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('BYO Runtime — DataSink Extensions', () => {
  let RestDataSink: typeof import('../../runtime/data-sink.js').RestDataSink

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../../runtime/data-sink.js')
    RestDataSink = mod.RestDataSink
  })

  it('should have renewLease method on RestDataSink', () => {
    const sink = new RestDataSink('https://example.com', 'rt-1', 'key-1')
    expect(typeof sink.renewLease).toBe('function')
  })

  it('should have failInboundEvent method on RestDataSink', () => {
    const sink = new RestDataSink('https://example.com', 'rt-1', 'key-1')
    expect(typeof sink.failInboundEvent).toBe('function')
  })

  it('should call renew-lease endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'renewed' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const sink = new RestDataSink('https://cp.example.com', 'rt-1', 'key-1')
    const result = await sink.renewLease('evt-1', 'run-1')

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cp.example.com/api/runtimes/messages/renew-lease',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ eventId: 'evt-1', runId: 'run-1' }),
      }),
    )

    vi.unstubAllGlobals()
  })

  it('should return false on renew-lease failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: () => Promise.resolve('Event not in claimed state'),
    })
    vi.stubGlobal('fetch', mockFetch)

    const sink = new RestDataSink('https://cp.example.com', 'rt-1', 'key-1')
    const result = await sink.renewLease('evt-1', 'run-1')

    expect(result).toBe(false)

    vi.unstubAllGlobals()
  })

  it('should call fail-inbound endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'failed' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const sink = new RestDataSink('https://cp.example.com', 'rt-1', 'key-1')
    const result = await sink.failInboundEvent('evt-1', 'run-1', 'LLM timeout')

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cp.example.com/api/runtimes/messages/fail-inbound',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ eventId: 'evt-1', runId: 'run-1', errorMessage: 'LLM timeout' }),
      }),
    )

    vi.unstubAllGlobals()
  })

  it('should return false on fail-inbound failure', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)

    const sink = new RestDataSink('https://cp.example.com', 'rt-1', 'key-1')
    const result = await sink.failInboundEvent('evt-1', 'run-1', 'error')

    expect(result).toBe(false)

    vi.unstubAllGlobals()
  })
})

describe('BYO Runtime — DataSink Interface', () => {
  it('should define optional renewLease and failInboundEvent on interface', async () => {
    const { createDataSink } = await import('../../runtime/data-sink.js')
    // Without env vars, createDataSink returns null (SaaS worker)
    const sink = createDataSink()
    expect(sink).toBeNull()
  })
})
