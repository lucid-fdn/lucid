/**
 * relay-step-protocol tests — Phase 4N-c, Task 59.
 *
 * Verifies the dedicated-runtime StepRunPacket claim loop:
 *   - claim → execute → completeStep happy path
 *   - fail path drives DataSink.failStep with retryable flag
 *   - empty-claim backoff (returns null eventually)
 *   - degraded claim backoff (database/control-plane outage protection)
 *   - stop() drains in-flight work
 *   - executor exceptions are caught and reported as retryable failures
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startRelayStepLoop, type StepExecutor } from '../../../processors/relay-step.js'
import type { DataSink, StepRunPacket } from '../../../runtime/data-sink.js'

function makePacket(overrides: Partial<StepRunPacket> = {}): StepRunPacket {
  return {
    stepId: 'step-1',
    dagId: 'dag-1',
    dagNodeId: 'node-1',
    stepType: 'inbound',
    attempt: 0,
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    payload: { hello: 'world' },
    ...overrides,
  }
}

function makeDataSink(claims: (StepRunPacket | null)[]): DataSink & {
  claimNextStep: ReturnType<typeof vi.fn>
  completeStep: ReturnType<typeof vi.fn>
  failStep: ReturnType<typeof vi.fn>
  renewStepLease: ReturnType<typeof vi.fn>
} {
  const queue = [...claims]
  return {
    async reportHeartbeat() { return null },
    async reportEvents() {},
    async submitApproval() { return 'id' },
    async pollApprovalResolution() { return null },
    async reportHealthScores() {},
    async reportCosts() {},
    claimNextStep: vi.fn(async () => queue.shift() ?? null),
    completeStep: vi.fn(async () => {}),
    failStep: vi.fn(async () => {}),
    renewStepLease: vi.fn(async () => ({ ok: true as const, leaseExpiresAt: new Date().toISOString() })),
  } as any
}

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} }
// 1ms sleep — small enough to be "instant" for tests, large enough to let setTimeout
// in the test body fire (setImmediate alone starves the timer phase and OOMs).
const instantSleep = () => new Promise<void>((r) => setTimeout(r, 1))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(async () => {
  // Ensure no lingering heartbeat intervals.
  vi.useRealTimers()
})

describe('relay-step loop — claim → execute → complete', () => {
  it('completes a step via the injected executor', async () => {
    const packet = makePacket()
    const sink = makeDataSink([packet, null, null, null])
    const executor: StepExecutor = {
      execute: vi.fn(async () => ({ ok: true, output: 'done', durationMs: 5 })),
    }

    const loop = startRelayStepLoop({
      dataSink: sink,
      executor,
      logger: silentLogger,
      sleep: instantSleep,
    })

    // Let loop tick a few times.
    await new Promise((r) => setTimeout(r, 20))
    await loop.stop()

    expect(sink.claimNextStep).toHaveBeenCalled()
    expect(executor.execute).toHaveBeenCalledWith(packet)
    expect(sink.completeStep).toHaveBeenCalledWith({
      stepId: 'step-1',
      output: 'done',
      durationMs: 5,
    })
    expect(sink.failStep).not.toHaveBeenCalled()
  })

  it('reports executor failures via failStep with retryable flag', async () => {
    const packet = makePacket({ stepId: 'step-2' })
    const sink = makeDataSink([packet, null, null])
    const executor: StepExecutor = {
      execute: vi.fn(async () => ({
        ok: false,
        errorMessage: 'bad input',
        retryable: false,
      })),
    }

    const loop = startRelayStepLoop({
      dataSink: sink,
      executor,
      logger: silentLogger,
      sleep: instantSleep,
    })

    await new Promise((r) => setTimeout(r, 20))
    await loop.stop()

    expect(sink.failStep).toHaveBeenCalledWith({
      stepId: 'step-2',
      errorMessage: 'bad input',
      retryable: false,
    })
    expect(sink.completeStep).not.toHaveBeenCalled()
  })

  it('catches executor exceptions and marks step as retryable fail', async () => {
    const packet = makePacket({ stepId: 'step-3' })
    const sink = makeDataSink([packet, null, null])
    const executor: StepExecutor = {
      execute: vi.fn(async () => {
        throw new Error('boom')
      }),
    }

    const loop = startRelayStepLoop({
      dataSink: sink,
      executor,
      logger: silentLogger,
      sleep: instantSleep,
    })

    await new Promise((r) => setTimeout(r, 20))
    await loop.stop()

    expect(sink.failStep).toHaveBeenCalledWith({
      stepId: 'step-3',
      errorMessage: 'boom',
      retryable: true,
    })
  })

  it('sleeps on empty claims (backoff path)', async () => {
    const sink = makeDataSink([null, null, null, null])
    const executor: StepExecutor = { execute: vi.fn() }
    // Must yield to timer phase so the test's setTimeout(20) can fire;
    // a pure Promise.resolve() starves the event loop and OOMs.
    const sleep = vi.fn(async () => { await new Promise<void>((r) => setTimeout(r, 1)) })

    const loop = startRelayStepLoop({
      dataSink: sink,
      executor,
      logger: silentLogger,
      sleep,
    })

    await new Promise((r) => setTimeout(r, 20))
    await loop.stop()

    expect(executor.execute).not.toHaveBeenCalled()
    expect(sleep).toHaveBeenCalled()
    // Backoff sequence starts at 100ms.
    expect(sleep.mock.calls[0]?.[0]).toBe(100)
  })

  it('backs off aggressively after claim errors', async () => {
    const sink = makeDataSink([])
    sink.claimNextStep.mockRejectedValue(new Error('db timeout'))
    const executor: StepExecutor = { execute: vi.fn() }
    const sleep = vi.fn(async () => { await new Promise<void>((r) => setTimeout(r, 1)) })

    const loop = startRelayStepLoop({
      dataSink: sink,
      executor,
      logger: silentLogger,
      sleep,
    })

    await new Promise((r) => setTimeout(r, 20))
    await loop.stop()

    expect(executor.execute).not.toHaveBeenCalled()
    expect(sleep.mock.calls[0]?.[0]).toBe(5_000)
    expect(sleep.mock.calls[1]?.[0]).toBe(10_000)
  })

  it('throws if DataSink lacks required step methods', () => {
    const bad = { async reportHeartbeat() { return null } } as unknown as DataSink
    expect(() =>
      startRelayStepLoop({
        dataSink: bad,
        executor: { execute: vi.fn() },
        logger: silentLogger,
        sleep: instantSleep,
      }),
    ).toThrow(/claimNextStep/)
  })

  it('stop() drains in-flight work', async () => {
    const packet = makePacket({ stepId: 'step-4' })
    const sink = makeDataSink([packet, null, null])
    let executorFinished = false
    const executor: StepExecutor = {
      execute: async () => {
        await new Promise((r) => setTimeout(r, 5))
        executorFinished = true
        return { ok: true }
      },
    }

    const loop = startRelayStepLoop({
      dataSink: sink,
      executor,
      logger: silentLogger,
      sleep: instantSleep,
    })

    await new Promise((r) => setTimeout(r, 2))
    await loop.stop()
    expect(executorFinished).toBe(true)
    expect(sink.completeStep).toHaveBeenCalled()
  })
})
