import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HeartbeatManager } from '../heartbeat.js'
import { OfflineBuffer } from '../offline-buffer.js'
import { defaultLogger } from '../logger.js'

function mockClient() {
  return { post: vi.fn().mockResolvedValue(undefined), get: vi.fn() }
}

describe('HeartbeatManager', () => {
  let client: ReturnType<typeof mockClient>
  let buffer: OfflineBuffer
  let hb: HeartbeatManager

  beforeEach(() => {
    vi.useFakeTimers()
    client = mockClient()
    buffer = new OfflineBuffer(100)
    hb = new HeartbeatManager(client as never, buffer, defaultLogger, {
      runtimeId: 'rt-123',
      generation: 1,
      intervalMs: 30_000,
    })
  })

  afterEach(() => {
    hb.stop()
    vi.useRealTimers()
  })

  it('sends initial heartbeat immediately on start', () => {
    hb.start()
    expect(client.post).toHaveBeenCalledTimes(1)
    expect(client.post).toHaveBeenCalledWith(
      '/api/runtimes/heartbeat',
      expect.objectContaining({ runtimeId: 'rt-123', generation: 1 }),
    )
  })

  it('sends recurring heartbeats on interval', () => {
    hb.start()
    vi.advanceTimersByTime(30_000)
    expect(client.post).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(30_000)
    expect(client.post).toHaveBeenCalledTimes(3)
  })

  it('stops recurring heartbeats after stop()', () => {
    hb.start()
    hb.stop()
    vi.advanceTimersByTime(60_000)
    expect(client.post).toHaveBeenCalledTimes(1) // only initial
  })

  it('buffers heartbeat payload on network failure', async () => {
    client.post.mockRejectedValueOnce(new Error('Network'))
    hb.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(buffer.depth).toBe(1)
  })

  it('piggybacks _droppedTelemetry count', () => {
    buffer.droppedCount = 5
    hb.start()
    expect(client.post).toHaveBeenCalledWith(
      '/api/runtimes/heartbeat',
      expect.objectContaining({ _droppedTelemetry: 5 }),
    )
  })

  it('resets droppedCount after successful delivery', async () => {
    buffer.droppedCount = 3
    hb.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(buffer.droppedCount).toBe(0)
  })

  it('sends shutdown heartbeat with status field', async () => {
    await hb.sendShutdown()
    expect(client.post).toHaveBeenCalledWith(
      '/api/runtimes/heartbeat',
      expect.objectContaining({ status: 'shutdown' }),
    )
  })

  it('includes system metrics in payload', () => {
    hb.start()
    const payload = client.post.mock.calls[0][1]
    expect(typeof payload.cpuPercent).toBe('number')
    expect(typeof payload.ramPercent).toBe('number')
    expect(typeof payload.uptimeSeconds).toBe('number')
    expect(payload.engine).toBe('openclaw')
    expect(payload.runtimeProtocol).toBe('lucid-runtime-v2')
    expect(payload.engineVersion).toBe('agent-bridge/0.1.0')
    expect(payload.runtimeVersion).toBe('agent-bridge/0.1.0')
    expect(payload.openclawVersion).toBe('agent-bridge/0.1.0')
  })
})
