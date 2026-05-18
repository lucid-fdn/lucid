/**
 * Redis Health Probe + Circuit Breaker Tests
 *
 * Tests the Hystrix-pattern circuit breaker: CLOSED → OPEN → HALF_OPEN → CLOSED.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock getPulseRedis before importing the module under test
vi.mock('../redis.js', () => ({
  getPulseRedis: vi.fn(),
}))

import { RedisHealthProbe, type CircuitState } from '../redis-health.js'
import { getPulseRedis } from '../redis.js'

const mockGetPulseRedis = vi.mocked(getPulseRedis)

describe('RedisHealthProbe', () => {
  let probe: RedisHealthProbe
  let stateChanges: Array<{ from: CircuitState; to: CircuitState }>

  beforeEach(() => {
    vi.useFakeTimers()
    stateChanges = []
    mockGetPulseRedis.mockReset()
  })

  afterEach(() => {
    probe?.stop()
    vi.useRealTimers()
  })

  function createProbe(overrides?: Partial<Parameters<typeof RedisHealthProbe['prototype']['getStatus']>>) {
    probe = new RedisHealthProbe(
      {
        failureThreshold: 3,
        successThreshold: 3,
        probeIntervalMs: 1000,
        openCooldownMs: 5000,
      },
      (from, to) => stateChanges.push({ from, to }),
    )
    return probe
  }

  function mockRedisHealthy() {
    mockGetPulseRedis.mockResolvedValue({
      ping: vi.fn().mockResolvedValue('PONG'),
    } as any)
  }

  function mockRedisDown() {
    mockGetPulseRedis.mockResolvedValue(null)
  }

  function mockRedisError() {
    mockGetPulseRedis.mockRejectedValue(new Error('fetch failed'))
  }

  // ─── Basic State Machine ────────────────────────────────────────────

  describe('initial state', () => {
    it('starts in closed state', () => {
      createProbe()
      expect(probe.getState()).toBe('closed')
      // isHealthy() requires a definitive successful probe, not just default state
      expect(probe.isHealthy()).toBe(false)
      probe.recordSuccess()
      expect(probe.isHealthy()).toBe(true)
    })

    it('returns full status snapshot', () => {
      createProbe()
      const status = probe.getStatus()
      expect(status.state).toBe('closed')
      expect(status.consecutiveFailures).toBe(0)
      expect(status.consecutiveSuccesses).toBe(0)
      expect(status.lastProbeAt).toBeNull()
    })
  })

  // ─── CLOSED → OPEN (failure threshold) ──────────────────────────────

  describe('closed → open transition', () => {
    it('opens circuit after 3 consecutive failures', async () => {
      mockRedisDown()
      createProbe()
      probe.start()

      // 3 probes, each fails
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(1000)
      }

      expect(probe.getState()).toBe('open')
      expect(probe.isHealthy()).toBe(false)
      expect(stateChanges).toContainEqual({ from: 'closed', to: 'open' })
    })

    it('resets failure counter on success', () => {
      createProbe()

      // 2 failures (using record for precise control)
      probe.recordFailure()
      probe.recordFailure()
      expect(probe.getStatus().consecutiveFailures).toBe(2)

      // 1 success → resets
      probe.recordSuccess()
      expect(probe.getStatus().consecutiveFailures).toBe(0)
      expect(probe.getState()).toBe('closed')
    })

    it('handles Redis throwing errors', async () => {
      mockRedisError()
      createProbe()
      probe.start()

      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(1000)
      }

      expect(probe.getState()).toBe('open')
    })
  })

  // ─── OPEN → HALF_OPEN (cooldown) ────────────────────────────────────

  describe('open → half_open transition', () => {
    it('transitions to half_open when a success arrives while open', () => {
      // Use recordFailure/recordSuccess for precise state control
      createProbe()

      // Open the circuit (3 failures)
      probe.recordFailure()
      probe.recordFailure()
      probe.recordFailure()
      expect(probe.getState()).toBe('open')

      // A single success while open → transitions to half_open
      probe.recordSuccess()
      expect(probe.getState()).toBe('half_open')
    })

    it('stays open during cooldown period in probing mode', async () => {
      mockRedisDown()
      createProbe()
      probe.start()

      // Open the circuit (3 failures)
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(1000)
      }
      expect(probe.getState()).toBe('open')

      // During cooldown (5s), probes skip — circuit stays open
      await vi.advanceTimersByTimeAsync(3000)
      expect(probe.getState()).toBe('open')
    })
  })

  // ─── HALF_OPEN → CLOSED (success threshold) ─────────────────────────

  describe('half_open → closed transition', () => {
    it('closes circuit after sustained successes through half_open', async () => {
      mockRedisDown()
      createProbe()
      probe.start()

      // Open circuit
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(1000)
      }
      expect(probe.getState()).toBe('open')

      // Wait for cooldown and let Redis recover — probes will transition
      // through half_open and close the circuit as successes accumulate
      mockRedisHealthy()
      await vi.advanceTimersByTimeAsync(10_000) // Well past cooldown + enough probes

      expect(probe.getState()).toBe('closed')
      expect(probe.isHealthy()).toBe(true)
      // Verify the full transition path happened
      expect(stateChanges).toContainEqual({ from: 'open', to: 'half_open' })
      expect(stateChanges).toContainEqual({ from: 'half_open', to: 'closed' })
    })
  })

  // ─── HALF_OPEN → OPEN (any failure) ─────────────────────────────────

  describe('half_open → open on failure', () => {
    it('goes back to open on any failure during half_open', async () => {
      // Use recordFailure/recordSuccess for precise control over state transitions
      createProbe()

      // Open circuit via 3 failures
      probe.recordFailure()
      probe.recordFailure()
      probe.recordFailure()
      expect(probe.getState()).toBe('open')

      // Manually transition to half_open via a success
      probe.recordSuccess()
      expect(probe.getState()).toBe('half_open')

      // Fail during half_open → back to open
      probe.recordFailure()
      expect(probe.getState()).toBe('open')
    })
  })

  // ─── External record methods ─────────────────────────────────────────

  describe('external recording', () => {
    it('recordFailure contributes to circuit opening', () => {
      createProbe()

      probe.recordFailure()
      probe.recordFailure()
      probe.recordFailure()

      expect(probe.getState()).toBe('open')
    })

    it('recordSuccess resets failure counter', () => {
      createProbe()

      probe.recordFailure()
      probe.recordFailure()
      probe.recordSuccess()

      expect(probe.getStatus().consecutiveFailures).toBe(0)
      expect(probe.getState()).toBe('closed')
    })
  })

  // ─── Full round-trip ────────────────────────────────────────────────

  describe('full lifecycle', () => {
    it('completes full cycle: closed → open → half_open → closed', async () => {
      createProbe()
      probe.start()

      // Phase 1: Healthy
      mockRedisHealthy()
      await vi.advanceTimersByTimeAsync(3000)
      expect(probe.getState()).toBe('closed')

      // Phase 2: Redis goes down → open
      mockRedisDown()
      await vi.advanceTimersByTimeAsync(3000)
      expect(probe.getState()).toBe('open')

      // Phase 3: Cooldown (5s) → probe → half_open
      mockRedisHealthy()
      await vi.advanceTimersByTimeAsync(6000)
      expect(probe.getState()).toBe('half_open')

      // Phase 4: Sustained recovery → closed
      await vi.advanceTimersByTimeAsync(3000)
      expect(probe.getState()).toBe('closed')
      expect(probe.isHealthy()).toBe(true)

      // Verify full state transition sequence
      const transitions = stateChanges.map(s => `${s.from}→${s.to}`)
      expect(transitions).toContain('closed→open')
      expect(transitions).toContain('open→half_open')
      expect(transitions).toContain('half_open→closed')
    })
  })

  // ─── Edge cases ──────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('stop() prevents further probes', async () => {
      mockRedisDown()
      createProbe()
      probe.start()
      probe.stop()

      await vi.advanceTimersByTimeAsync(10_000)

      // Only the immediate probe on start should have fired
      // Circuit should not be open since we stopped quickly
      expect(mockGetPulseRedis).toHaveBeenCalledTimes(1)
    })

    it('start() is idempotent', () => {
      mockRedisHealthy()
      createProbe()
      probe.start()
      probe.start()
      probe.start()
      // No crash, no duplicate timers
      probe.stop()
    })

    it('handles Redis returning unexpected PING result', async () => {
      mockGetPulseRedis.mockResolvedValue({
        ping: vi.fn().mockResolvedValue('UNEXPECTED'),
      } as any)

      createProbe()
      probe.start()

      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(1000)
      }

      expect(probe.getState()).toBe('open')
    })
  })
})
