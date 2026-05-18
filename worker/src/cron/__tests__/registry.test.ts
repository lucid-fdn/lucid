import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startCronJobs, type CronJob } from '../registry.js'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function makeJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    name: 'test-job',
    intervalMs: 1_000,
    sharedOnly: false,
    handler: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('startCronJobs', () => {
  it('starts all jobs and returns named timers', () => {
    const jobs = [makeJob({ name: 'a' }), makeJob({ name: 'b' })]
    const running = startCronJobs(jobs, false)

    expect(running).toHaveLength(2)
    expect(running[0].name).toBe('a')
    expect(running[1].name).toBe('b')
    expect(running[0].timer).toBeDefined()
    expect(running[1].timer).toBeDefined()

    // Clean up
    for (const r of running) clearInterval(r.timer)
  })

  it('skips sharedOnly jobs when isDedicatedRuntime is true', () => {
    const jobs = [
      makeJob({ name: 'shared', sharedOnly: true }),
      makeJob({ name: 'both', sharedOnly: false }),
    ]
    const running = startCronJobs(jobs, true)

    expect(running).toHaveLength(1)
    expect(running[0].name).toBe('both')

    for (const r of running) clearInterval(r.timer)
  })

  it('includes sharedOnly jobs when isDedicatedRuntime is false', () => {
    const jobs = [
      makeJob({ name: 'shared', sharedOnly: true }),
      makeJob({ name: 'both', sharedOnly: false }),
    ]
    const running = startCronJobs(jobs, false)

    expect(running).toHaveLength(2)

    for (const r of running) clearInterval(r.timer)
  })

  it('invokes handler on each interval tick', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const jobs = [makeJob({ handler, intervalMs: 500 })]
    const running = startCronJobs(jobs, false)

    // Advance timers to trigger handler
    await vi.advanceTimersByTimeAsync(500)
    expect(handler).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(500)
    expect(handler).toHaveBeenCalledTimes(2)

    for (const r of running) clearInterval(r.timer)
  })

  it('prevents overlapping execution (overlap guard)', async () => {
    let resolveHandler: () => void
    const slowHandler = vi.fn().mockImplementation(() => new Promise<void>(resolve => {
      resolveHandler = resolve
    }))

    const jobs = [makeJob({ handler: slowHandler, intervalMs: 100 })]
    const running = startCronJobs(jobs, false)

    // First tick: starts the handler (it will block)
    await vi.advanceTimersByTimeAsync(100)
    expect(slowHandler).toHaveBeenCalledTimes(1)

    // Second tick: handler still running, should be skipped
    await vi.advanceTimersByTimeAsync(100)
    expect(slowHandler).toHaveBeenCalledTimes(1) // Still 1 — skipped

    // Resolve the first handler
    resolveHandler!()
    await vi.advanceTimersByTimeAsync(0) // Flush microtasks

    // Third tick: handler finished, should run again
    await vi.advanceTimersByTimeAsync(100)
    expect(slowHandler).toHaveBeenCalledTimes(2)

    for (const r of running) clearInterval(r.timer)
  })

  it('catches and logs handler errors without crashing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failHandler = vi.fn().mockRejectedValue(new Error('boom'))
    const jobs = [makeJob({ name: 'fail-job', handler: failHandler, intervalMs: 200 })]
    const running = startCronJobs(jobs, false)

    await vi.advanceTimersByTimeAsync(200)
    expect(failHandler).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith('[cron] fail-job error:', 'boom')

    // Job continues running on next tick (not permanently broken)
    await vi.advanceTimersByTimeAsync(200)
    expect(failHandler).toHaveBeenCalledTimes(2)

    errorSpy.mockRestore()
    for (const r of running) clearInterval(r.timer)
  })

  it('handles non-Error throws gracefully', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failHandler = vi.fn().mockRejectedValue('string-error')
    const jobs = [makeJob({ name: 'str-fail', handler: failHandler, intervalMs: 200 })]
    const running = startCronJobs(jobs, false)

    await vi.advanceTimersByTimeAsync(200)
    expect(errorSpy).toHaveBeenCalledWith('[cron] str-fail error:', 'string-error')

    errorSpy.mockRestore()
    for (const r of running) clearInterval(r.timer)
  })

  it('returns empty array when all jobs are sharedOnly and runtime is dedicated', () => {
    const jobs = [
      makeJob({ name: 'a', sharedOnly: true }),
      makeJob({ name: 'b', sharedOnly: true }),
    ]
    const running = startCronJobs(jobs, true)
    expect(running).toHaveLength(0)
  })

  it('timers can be cleared for graceful shutdown', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const jobs = [makeJob({ handler, intervalMs: 100 })]
    const running = startCronJobs(jobs, false)

    await vi.advanceTimersByTimeAsync(100)
    expect(handler).toHaveBeenCalledTimes(1)

    // Clear all timers (simulates graceful shutdown)
    for (const r of running) clearInterval(r.timer)

    await vi.advanceTimersByTimeAsync(500)
    expect(handler).toHaveBeenCalledTimes(1) // No more calls after clear
  })
})
