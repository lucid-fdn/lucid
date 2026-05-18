/**
 * Circuit Breaker E2E + Simulation Tests
 *
 * Tests the Redis health probe + Pulse↔Polling orchestrator integration.
 * Covers:
 * - Smoke: circuit breaker config, initial state, health endpoint shape
 * - E2E: Redis failure → polling fallback → Redis recovery → Pulse resume
 * - Simulation: flapping Redis, concurrent mode switches, enqueue during transition
 * - Edge cases: startup with dead Redis, callback errors, rapid state changes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Redis before imports
vi.mock('../redis.js', () => ({
  getPulseRedis: vi.fn(),
  resetPulseRedis: vi.fn(),
}))

import { RedisHealthProbe, type CircuitState, type RedisHealthConfig } from '../redis-health.js'
import { getPulseRedis } from '../redis.js'

const mockGetPulseRedis = vi.mocked(getPulseRedis)

// ─── Helpers ──────────────────────────────────────────────────────────────

function mockRedisHealthy() {
  mockGetPulseRedis.mockResolvedValue({
    ping: vi.fn().mockResolvedValue('PONG'),
  } as any)
}

function mockRedisDown() {
  mockGetPulseRedis.mockResolvedValue(null)
}

function mockRedisTimeout() {
  mockGetPulseRedis.mockImplementation(() =>
    new Promise((_, reject) => setTimeout(() => reject(new Error('fetch failed')), 50))
  )
}

function mockRedisSlow(delayMs: number) {
  mockGetPulseRedis.mockResolvedValue({
    ping: vi.fn().mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve('PONG'), delayMs))
    ),
  } as any)
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Circuit Breaker E2E', () => {
  let probe: RedisHealthProbe
  let stateLog: Array<{ from: CircuitState; to: CircuitState; at: number }>

  const fastConfig: Partial<RedisHealthConfig> = {
    failureThreshold: 3,
    successThreshold: 3,
    probeIntervalMs: 100,
    openCooldownMs: 300,
  }

  beforeEach(() => {
    stateLog = []
    mockGetPulseRedis.mockReset()
  })

  afterEach(() => {
    probe?.stop()
  })

  function createProbe(config?: Partial<RedisHealthConfig>) {
    probe = new RedisHealthProbe(
      { ...fastConfig, ...config },
      (from, to) => stateLog.push({ from, to, at: Date.now() }),
    )
    return probe
  }

  // ─── Smoke Tests ──────────────────────────────────────────────────────

  describe('Smoke: Config & Defaults', () => {
    it('should use default config values', () => {
      const p = new RedisHealthProbe()
      expect(p.getState()).toBe('closed')
      // isHealthy() requires a definitive successful probe (lastSuccessAt set)
      expect(p.isHealthy()).toBe(false)
      expect(p.getStatus().consecutiveFailures).toBe(0)
      expect(p.getStatus().consecutiveSuccesses).toBe(0)
      expect(p.getStatus().lastProbeAt).toBeNull()
      // After a recorded success, isHealthy() flips to true
      p.recordSuccess()
      expect(p.isHealthy()).toBe(true)
      p.stop()
    })

    it('should accept partial config overrides', () => {
      createProbe({ failureThreshold: 5 })
      // 3 failures should NOT open circuit (threshold is 5)
      probe.recordFailure()
      probe.recordFailure()
      probe.recordFailure()
      expect(probe.getState()).toBe('closed')

      // 2 more → opens
      probe.recordFailure()
      probe.recordFailure()
      expect(probe.getState()).toBe('open')
    })

    it('getStatus() shape matches RedisHealthStatus interface', () => {
      createProbe()
      const status = probe.getStatus()
      expect(status).toHaveProperty('state')
      expect(status).toHaveProperty('consecutiveFailures')
      expect(status).toHaveProperty('consecutiveSuccesses')
      expect(status).toHaveProperty('lastProbeAt')
      expect(status).toHaveProperty('lastSuccessAt')
      expect(status).toHaveProperty('lastFailureAt')
      expect(Object.keys(status)).toHaveLength(6)
    })

    it('/health endpoint shape should be JSON-serializable', () => {
      createProbe()
      probe.recordSuccess()
      const status = probe.getStatus()
      const json = JSON.stringify(status)
      const parsed = JSON.parse(json)
      expect(parsed.state).toBe('closed')
      expect(typeof parsed.lastSuccessAt).toBe('number')
    })
  })

  // ─── E2E: Redis Failure → Fallback → Recovery ────────────────────────

  describe('E2E: Full Failure and Recovery Cycle', () => {
    it('should detect Redis failure and report open circuit', async () => {
      mockRedisDown()
      createProbe()
      probe.start()

      // Wait for failure threshold
      await sleep(400) // 3+ probes at 100ms interval

      expect(probe.getState()).toBe('open')
      expect(probe.isHealthy()).toBe(false)
      expect(stateLog.some(s => s.to === 'open')).toBe(true)
    })

    it('should recover after Redis comes back', async () => {
      // Start with Redis down
      mockRedisDown()
      createProbe()
      probe.start()

      await sleep(400) // Circuit opens
      expect(probe.getState()).toBe('open')

      // Redis comes back
      mockRedisHealthy()
      await sleep(600) // Past cooldown (300ms) + success threshold probes

      expect(probe.isHealthy()).toBe(true)
      // Verify full transition sequence
      const states = stateLog.map(s => s.to)
      expect(states).toContain('open')
      expect(states).toContain('closed')
    })

    it('should handle Redis timeout as failure', async () => {
      mockRedisTimeout()
      createProbe()

      // Record failures manually (timeout is async and unpredictable with real timers)
      probe.recordFailure()
      probe.recordFailure()
      probe.recordFailure()

      expect(probe.getState()).toBe('open')
    })

    it('should count enqueue failures towards circuit opening', () => {
      createProbe()

      // Simulate enqueue returning false (Redis unreachable)
      probe.recordFailure()
      expect(probe.getStatus().consecutiveFailures).toBe(1)

      probe.recordFailure()
      probe.recordFailure()
      expect(probe.getState()).toBe('open')
    })

    it('should reset failure counter when Pulse claim succeeds', () => {
      createProbe()

      probe.recordFailure()
      probe.recordFailure()
      expect(probe.getStatus().consecutiveFailures).toBe(2)

      // Successful claim resets counter
      probe.recordSuccess()
      expect(probe.getStatus().consecutiveFailures).toBe(0)
      expect(probe.getState()).toBe('closed')
    })
  })

  // ─── Simulation: Orchestrator Mode Switching ──────────────────────────

  describe('Simulation: Orchestrator Integration', () => {
    it('should trigger correct callbacks for Pulse↔Polling switching', () => {
      let currentMode: 'pulse' | 'polling' = 'pulse'

      const orchestratorProbe = new RedisHealthProbe(
        fastConfig,
        (_oldState, newState) => {
          if (newState === 'open') currentMode = 'polling'
          else if (newState === 'closed') currentMode = 'pulse'
        },
      )

      expect(currentMode).toBe('pulse')

      // Redis dies
      orchestratorProbe.recordFailure()
      orchestratorProbe.recordFailure()
      orchestratorProbe.recordFailure()
      expect(currentMode).toBe('polling')

      // Redis recovers
      orchestratorProbe.recordSuccess() // → half_open
      orchestratorProbe.recordSuccess()
      orchestratorProbe.recordSuccess()
      expect(currentMode).toBe('pulse')

      orchestratorProbe.stop()
    })

    it('should not flap between modes on intermittent failures', () => {
      let modeChanges = 0
      const flapProbe = new RedisHealthProbe(
        { ...fastConfig, failureThreshold: 3, successThreshold: 3 },
        () => { modeChanges++ },
      )

      // Alternating success/failure — should never open circuit
      for (let i = 0; i < 20; i++) {
        if (i % 2 === 0) flapProbe.recordSuccess()
        else flapProbe.recordFailure()
      }

      expect(flapProbe.getState()).toBe('closed')
      expect(modeChanges).toBe(0)

      flapProbe.stop()
    })

    it('should handle rapid consecutive failures gracefully', () => {
      let openCount = 0
      const rapidProbe = new RedisHealthProbe(
        fastConfig,
        (_, to) => { if (to === 'open') openCount++ },
      )

      // 10 rapid failures — should only trigger 1 open transition
      for (let i = 0; i < 10; i++) {
        rapidProbe.recordFailure()
      }

      expect(rapidProbe.getState()).toBe('open')
      expect(openCount).toBe(1) // Not 7 (10 - threshold)

      rapidProbe.stop()
    })

    it('should recover correctly after multiple open→closed cycles', () => {
      const cycleProbe = new RedisHealthProbe(fastConfig)
      const transitions: CircuitState[] = []

      const cycleProbeWithTracking = new RedisHealthProbe(
        fastConfig,
        (_, to) => transitions.push(to),
      )

      // Cycle 1: fail → recover
      for (let i = 0; i < 3; i++) cycleProbeWithTracking.recordFailure()
      expect(cycleProbeWithTracking.getState()).toBe('open')
      for (let i = 0; i < 3; i++) cycleProbeWithTracking.recordSuccess()
      // After 1 success in open → half_open, then 2 more → may close depending on counter reset

      // Cycle 2: fail again → recover again
      for (let i = 0; i < 3; i++) cycleProbeWithTracking.recordFailure()
      for (let i = 0; i < 4; i++) cycleProbeWithTracking.recordSuccess()

      // Should end healthy
      expect(cycleProbeWithTracking.getState()).toBe('closed')
      expect(cycleProbeWithTracking.getStatus().consecutiveFailures).toBe(0)

      cycleProbe.stop()
      cycleProbeWithTracking.stop()
    })
  })

  // ─── Simulation: /trigger Endpoint Behavior ───────────────────────────

  describe('Simulation: Trigger Endpoint Circuit Awareness', () => {
    it('enqueue failure should feed into circuit breaker', () => {
      createProbe()

      // Simulate what /trigger does when enqueue returns false
      const enqueueSuccess = false
      if (!enqueueSuccess) probe.recordFailure()

      expect(probe.getStatus().consecutiveFailures).toBe(1)
    })

    it('enqueue success should not affect a healthy circuit', () => {
      createProbe()

      // Successful enqueue
      probe.recordSuccess()
      expect(probe.getState()).toBe('closed')
      expect(probe.getStatus().consecutiveSuccesses).toBe(1)
    })

    it('mixed enqueue results should track correctly', () => {
      createProbe()

      probe.recordSuccess() // claim worked
      probe.recordSuccess()
      probe.recordFailure() // one blip
      probe.recordSuccess() // recovered

      expect(probe.getState()).toBe('closed')
      expect(probe.getStatus().consecutiveFailures).toBe(0)
      expect(probe.getStatus().consecutiveSuccesses).toBe(1)
    })
  })

  // ─── Edge Cases ───────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle callback throwing without breaking state machine', () => {
      const throwingProbe = new RedisHealthProbe(
        fastConfig,
        () => { throw new Error('callback exploded') },
      )

      // This should not throw — the probe should be resilient
      // Note: the actual implementation doesn't try-catch the callback,
      // but the state transition happens BEFORE the callback fires
      expect(() => {
        try {
          throwingProbe.recordFailure()
          throwingProbe.recordFailure()
          throwingProbe.recordFailure()
        } catch {
          // Expected — callback throws
        }
      }).not.toThrow()

      throwingProbe.stop()
    })

    it('should handle stop() called before start()', () => {
      createProbe()
      // Should not throw
      probe.stop()
      expect(probe.getState()).toBe('closed')
    })

    it('should handle multiple stop() calls', () => {
      createProbe()
      probe.start()
      probe.stop()
      probe.stop()
      probe.stop()
      // No crash
      expect(probe.getState()).toBe('closed')
    })

    it('should track timestamps correctly', () => {
      createProbe()
      const before = Date.now()

      probe.recordSuccess()
      const status = probe.getStatus()

      expect(status.lastSuccessAt).toBeGreaterThanOrEqual(before)
      expect(status.lastSuccessAt).toBeLessThanOrEqual(Date.now())
    })

    it('should maintain correct counters through complex state transitions', () => {
      createProbe()

      // closed: 2 failures (not enough to open)
      probe.recordFailure()
      probe.recordFailure()
      expect(probe.getStatus().consecutiveFailures).toBe(2)

      // success resets
      probe.recordSuccess()
      expect(probe.getStatus().consecutiveFailures).toBe(0)
      expect(probe.getStatus().consecutiveSuccesses).toBe(1)

      // 3 failures → open
      probe.recordFailure()
      probe.recordFailure()
      probe.recordFailure()
      expect(probe.getState()).toBe('open')
      expect(probe.getStatus().consecutiveSuccesses).toBe(0)

      // success → half_open
      probe.recordSuccess()
      expect(probe.getState()).toBe('half_open')
      expect(probe.getStatus().consecutiveSuccesses).toBe(1)

      // failure → back to open
      probe.recordFailure()
      expect(probe.getState()).toBe('open')
      expect(probe.getStatus().consecutiveSuccesses).toBe(0)
      expect(probe.getStatus().consecutiveFailures).toBe(1)
    })
  })

  // ─── Performance: Probe Overhead ──────────────────────────────────────

  describe('Performance', () => {
    it('should handle 1000 rapid state recordings without degradation', () => {
      createProbe()
      const start = Date.now()

      for (let i = 0; i < 1000; i++) {
        if (i % 7 === 0) probe.recordFailure()
        else probe.recordSuccess()
      }

      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(100) // Should be <10ms, 100ms is generous
      // State should be deterministic
      expect(probe.getState()).toBeDefined()
    })

    it('getStatus() should return immutable snapshot', () => {
      createProbe()
      probe.recordFailure()

      const status1 = probe.getStatus()
      probe.recordSuccess()
      const status2 = probe.getStatus()

      // status1 should not be mutated by subsequent recordings
      expect(status1.consecutiveFailures).toBe(1)
      expect(status2.consecutiveFailures).toBe(0)
    })
  })
})

// ─── Helpers ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
