import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LucidBridge, BridgeConfigError } from '../bridge.js'
import type { BridgeConfig } from '../types.js'

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

function validConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    runtimeId: 'rt-test',
    runtimeKey: 'key-test',
    controlPlaneUrl: 'https://lucid.test',
    heartbeatIntervalMs: 60_000,
    eventFlushIntervalMs: 60_000,
    messagePollIntervalMs: 60_000,
    ...overrides,
  }
}

describe('LucidBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetch.mockResolvedValue(jsonResponse())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('config validation', () => {
    it('throws on missing runtimeId', async () => {
      const bridge = new LucidBridge(validConfig({ runtimeId: '' }))
      await expect(bridge.start()).rejects.toThrow(BridgeConfigError)
      await expect(bridge.start()).rejects.toThrow('runtimeId is required')
    })

    it('throws on missing runtimeKey', async () => {
      const bridge = new LucidBridge(validConfig({ runtimeKey: '' }))
      await expect(bridge.start()).rejects.toThrow('runtimeKey is required')
    })

    it('throws on missing controlPlaneUrl', async () => {
      const bridge = new LucidBridge(validConfig({ controlPlaneUrl: '' }))
      await expect(bridge.start()).rejects.toThrow('controlPlaneUrl is required')
    })

    it('throws on invalid URL', async () => {
      const bridge = new LucidBridge(validConfig({ controlPlaneUrl: 'not-a-url' }))
      await expect(bridge.start()).rejects.toThrow('must be a valid URL')
    })
  })

  describe('full mode', () => {
    it('requires onMessage handler', async () => {
      const bridge = new LucidBridge(validConfig({ mode: 'full' }))
      await expect(bridge.start()).rejects.toThrow('message handler')
    })

    it('starts all subsystems with handler', async () => {
      const bridge = new LucidBridge(validConfig({ mode: 'full' }))
      bridge.onMessage(async () => ({ responseText: 'hi' }))

      await bridge.start()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://lucid.test/api/runtimes/heartbeat',
        expect.objectContaining({ method: 'POST' }),
      )

      await bridge.stop()
    })

    it('sends shutdown heartbeat on stop', async () => {
      const bridge = new LucidBridge(validConfig({ mode: 'full' }))
      bridge.onMessage(async () => ({ responseText: 'hi' }))

      await bridge.start()
      await bridge.stop()

      const heartbeatCalls = mockFetch.mock.calls.filter(
        (c: unknown[]) => (c[0] as string).includes('/heartbeat'),
      )
      const lastBody = JSON.parse(heartbeatCalls[heartbeatCalls.length - 1][1].body)
      expect(lastBody.status).toBe('shutdown')
    })
  })

  describe('observe mode', () => {
    it('starts without onMessage handler', async () => {
      const bridge = new LucidBridge(validConfig({ mode: 'observe' }))

      await bridge.start()
      expect(mockFetch).toHaveBeenCalled()
      await bridge.stop()
    })

    it('trackRun wraps execution with events and timing', async () => {
      const bridge = new LucidBridge(validConfig({ mode: 'observe' }))
      await bridge.start()

      const result = await bridge.trackRun(
        { agentId: 'my-agent' },
        async () => ({
          responseText: 'done',
          tokenUsage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001 },
        }),
      )

      expect(result.responseText).toBe('done')
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
      expect(result.tokenUsage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        estimatedCostUsd: 0.001,
      })

      await bridge.stop()
    })

    it('trackRun rethrows on failure', async () => {
      const bridge = new LucidBridge(validConfig({ mode: 'observe' }))
      await bridge.start()

      await expect(
        bridge.trackRun(
          { agentId: 'my-agent' },
          async () => { throw new Error('Agent failed') },
        ),
      ).rejects.toThrow('Agent failed')

      await bridge.stop()
    })
  })

  describe('convenience methods', () => {
    it('reportEvent flushes to events endpoint', async () => {
      const bridge = new LucidBridge(validConfig({ mode: 'observe' }))
      await bridge.start()

      bridge.reportEvent({
        agentId: 'agent-1',
        eventType: 'tool_call',
        severity: 'info',
        payload: { tool: 'test' },
      })

      await vi.advanceTimersByTimeAsync(60_000)

      const eventCalls = mockFetch.mock.calls.filter(
        (c: unknown[]) => (c[0] as string).includes('/events'),
      )
      expect(eventCalls.length).toBeGreaterThanOrEqual(1)

      await bridge.stop()
    })

    it('reportCost sends to costs endpoint', async () => {
      const bridge = new LucidBridge(validConfig({ mode: 'observe' }))
      await bridge.start()

      bridge.reportCost({
        agentId: 'agent-1',
        runId: 'run-1',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCostUsd: 0.001,
      })

      await vi.advanceTimersByTimeAsync(0)

      const costCalls = mockFetch.mock.calls.filter(
        (c: unknown[]) => (c[0] as string).includes('/costs'),
      )
      expect(costCalls.length).toBeGreaterThanOrEqual(1)

      await bridge.stop()
    })
  })

  describe('diagnostics', () => {
    it('defaults to full mode', async () => {
      const bridge = new LucidBridge({
        runtimeId: 'rt-1',
        runtimeKey: 'key-1',
        controlPlaneUrl: 'https://lucid.test',
      })
      await expect(bridge.start()).rejects.toThrow('message handler')
    })

    it('stop is idempotent', async () => {
      const bridge = new LucidBridge(validConfig({ mode: 'observe' }))
      await bridge.start()
      await bridge.stop()
      await bridge.stop() // should not throw
    })

    it('exposes isRunning state', async () => {
      const bridge = new LucidBridge(validConfig({ mode: 'observe' }))
      expect(bridge.isRunning).toBe(false)
      await bridge.start()
      expect(bridge.isRunning).toBe(true)
      await bridge.stop()
      expect(bridge.isRunning).toBe(false)
    })
  })
})
