import { describe, it, expect, vi } from 'vitest'
import { createCircuitBreaker } from '../circuit-breaker'

describe('createCircuitBreaker', () => {
  it('starts in closed state', () => {
    const breaker = createCircuitBreaker({ name: 'test' })
    expect(breaker.state).toBe('closed')
    expect(breaker.failures).toBe(0)
  })

  it('passes through successful calls', async () => {
    const breaker = createCircuitBreaker({ name: 'test' })
    const result = await breaker.call(
      () => Promise.resolve('success'),
      () => 'fallback',
    )
    expect(result).toBe('success')
    expect(breaker.state).toBe('closed')
  })

  it('falls back on failure', async () => {
    const breaker = createCircuitBreaker({ name: 'test', failureThreshold: 3 })
    const result = await breaker.call(
      () => Promise.reject(new Error('fail')),
      () => 'fallback',
    )
    expect(result).toBe('fallback')
    expect(breaker.failures).toBe(1)
  })

  it('opens after reaching failure threshold', async () => {
    const breaker = createCircuitBreaker({ name: 'test', failureThreshold: 2 })
    const failFn = () => Promise.reject(new Error('fail'))
    const fallbackFn = () => 'fallback'

    await breaker.call(failFn, fallbackFn)
    expect(breaker.state).toBe('closed')

    await breaker.call(failFn, fallbackFn)
    expect(breaker.state).toBe('open')
  })

  it('rejects fast when open', async () => {
    const breaker = createCircuitBreaker({
      name: 'test',
      failureThreshold: 1,
      resetTimeoutMs: 60_000,
    })

    // Open the circuit
    await breaker.call(
      () => Promise.reject(new Error('fail')),
      () => 'fallback',
    )
    expect(breaker.state).toBe('open')

    // Next call should go to fallback without calling fn
    const fn = vi.fn(() => Promise.resolve('should-not-be-called'))
    const result = await breaker.call(fn, () => 'fast-fallback')
    expect(result).toBe('fast-fallback')
    expect(fn).not.toHaveBeenCalled()
  })

  it('transitions to half_open after reset timeout', async () => {
    const breaker = createCircuitBreaker({
      name: 'test',
      failureThreshold: 1,
      resetTimeoutMs: 50,
    })

    // Open the circuit
    await breaker.call(
      () => Promise.reject(new Error('fail')),
      () => 'fallback',
    )
    expect(breaker.state).toBe('open')

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 60))

    // Next call should probe (half_open)
    const result = await breaker.call(
      () => Promise.resolve('recovered'),
      () => 'fallback',
    )
    expect(result).toBe('recovered')
    expect(breaker.state).toBe('closed')
  })

  it('reopens from half_open on failure', async () => {
    const breaker = createCircuitBreaker({
      name: 'test',
      failureThreshold: 1,
      resetTimeoutMs: 50,
    })

    // Open
    await breaker.call(
      () => Promise.reject(new Error('fail')),
      () => 'fallback',
    )

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 60))

    // Probe fails
    await breaker.call(
      () => Promise.reject(new Error('still-failing')),
      () => 'fallback',
    )
    expect(breaker.state).toBe('open')
  })

  it('resets failures on success', async () => {
    const breaker = createCircuitBreaker({ name: 'test', failureThreshold: 3 })

    await breaker.call(() => Promise.reject(new Error('fail')), () => 'f')
    await breaker.call(() => Promise.reject(new Error('fail')), () => 'f')
    expect(breaker.failures).toBe(2)

    await breaker.call(() => Promise.resolve('ok'), () => 'f')
    expect(breaker.failures).toBe(0)
  })

  it('manual reset closes the circuit', async () => {
    const breaker = createCircuitBreaker({ name: 'test', failureThreshold: 1 })

    await breaker.call(() => Promise.reject(new Error('fail')), () => 'f')
    expect(breaker.state).toBe('open')

    breaker.reset()
    expect(breaker.state).toBe('closed')
    expect(breaker.failures).toBe(0)
  })

  it('fires onStateChange callback', async () => {
    const changes: string[] = []
    const breaker = createCircuitBreaker({
      name: 'test',
      failureThreshold: 1,
      onStateChange: (from, to) => changes.push(`${from}->${to}`),
    })

    await breaker.call(() => Promise.reject(new Error('fail')), () => 'f')
    expect(changes).toEqual(['closed->open'])
  })

  it('reports stats correctly', async () => {
    const breaker = createCircuitBreaker({ name: 'my-service', failureThreshold: 3 })

    await breaker.call(() => Promise.resolve('ok'), () => 'f')
    await breaker.call(() => Promise.reject(new Error('e')), () => 'f')

    const stats = breaker.stats()
    expect(stats.name).toBe('my-service')
    expect(stats.totalCalls).toBe(2)
    expect(stats.totalFailures).toBe(1)
    expect(stats.totalFallbacks).toBe(1)
    expect(stats.lastSuccessAt).toBeGreaterThan(0)
    expect(stats.lastFailureAt).toBeGreaterThan(0)
  })

  it('times out slow calls', async () => {
    const breaker = createCircuitBreaker({
      name: 'test',
      callTimeoutMs: 50,
      failureThreshold: 3,
    })

    const result = await breaker.call(
      () => new Promise((resolve) => setTimeout(() => resolve('too-late'), 200)),
      () => 'timeout-fallback',
    )
    expect(result).toBe('timeout-fallback')
    expect(breaker.failures).toBe(1)
  })
})
