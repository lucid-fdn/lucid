/**
 * Redis Health Probe + Circuit Breaker
 *
 * Industry-standard Hystrix/Resilience4j circuit breaker pattern:
 *   CLOSED (healthy) → OPEN (broken) → HALF_OPEN (probing) → CLOSED
 *
 * Used by Pulse orchestrator to decide: run Pulse (Redis) or fall back to polling (DB).
 */

import { getPulseRedis } from './redis.js'

export type CircuitState = 'closed' | 'open' | 'half_open'

export interface RedisHealthStatus {
  state: CircuitState
  consecutiveFailures: number
  consecutiveSuccesses: number
  lastProbeAt: number | null
  lastSuccessAt: number | null
  lastFailureAt: number | null
}

export interface RedisHealthConfig {
  /** Consecutive failures before opening circuit (default: 3) */
  failureThreshold: number
  /** Consecutive successes in half_open before closing circuit (default: 3) */
  successThreshold: number
  /** Probe interval in ms (default: 10_000 = 10s) */
  probeIntervalMs: number
  /** How long to wait before probing after circuit opens (default: 30_000 = 30s) */
  openCooldownMs: number
}

const DEFAULT_CONFIG: RedisHealthConfig = {
  failureThreshold: 3,
  successThreshold: 3,
  probeIntervalMs: 10_000,
  openCooldownMs: 30_000,
}

export class RedisHealthProbe {
  private state: CircuitState = 'closed'
  private consecutiveFailures = 0
  private consecutiveSuccesses = 0
  private lastProbeAt: number | null = null
  private lastSuccessAt: number | null = null
  private lastFailureAt: number | null = null
  private probeTimer: ReturnType<typeof setInterval> | null = null
  private isProbing = false
  private config: RedisHealthConfig
  private onStateChange?: (oldState: CircuitState, newState: CircuitState) => void

  constructor(
    config?: Partial<RedisHealthConfig>,
    onStateChange?: (oldState: CircuitState, newState: CircuitState) => void,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.onStateChange = onStateChange
  }

  /** Start periodic health probing */
  start(): void {
    if (this.probeTimer) return
    // Fire-and-forget initial probe — use probeOnce() if you need to await the result
    this.probe()
    this.probeTimer = setInterval(() => this.probe(), this.config.probeIntervalMs)
  }

  /** Single awaitable probe — use at startup to get a definitive health status */
  async probeOnce(): Promise<void> {
    await this.probe()
  }

  /** Stop health probing */
  stop(): void {
    if (this.probeTimer) {
      clearInterval(this.probeTimer)
      this.probeTimer = null
    }
  }

  /** Current circuit state */
  getState(): CircuitState {
    return this.state
  }

  /**
   * Whether Redis is considered healthy.
   *
   * Returns true only if the circuit is closed AND we have observed at least
   * one successful probe. The naked `state === 'closed'` check is unsafe at
   * startup: the default state is `closed` and `failureThreshold = 3`, so a
   * single startup probe failure leaves the circuit closed with zero recorded
   * successes — Pulse would boot against a dead Redis and every claim would
   * fail until three probes compound. Requiring `lastSuccessAt` forces the
   * caller to wait for a definitive probe before committing to Pulse mode.
   */
  isHealthy(): boolean {
    return this.state === 'closed' && this.lastSuccessAt !== null
  }

  /** Full status snapshot for /health endpoint */
  getStatus(): RedisHealthStatus {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastProbeAt: this.lastProbeAt,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
    }
  }

  /** Record an external success (e.g., a successful Pulse claim) */
  recordSuccess(): void {
    this.onProbeSuccess()
  }

  /** Record an external failure (e.g., a failed Pulse claim due to Redis) */
  recordFailure(): void {
    this.onProbeFailure()
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private async probe(): Promise<void> {
    if (this.isProbing) return // Prevent overlapping async probes
    this.isProbing = true

    try {
      // If circuit is open, check cooldown before probing
      if (this.state === 'open') {
        const timeSinceOpen = Date.now() - (this.lastFailureAt || 0)
        if (timeSinceOpen < this.config.openCooldownMs) {
          return // Still in cooldown, don't probe
        }
        // Cooldown expired → transition to half_open
        this.transition('half_open')
      }

      try {
        const redis = await getPulseRedis()
        if (!redis) {
          console.warn('[pulse:circuit] Probe: no Redis adapter (connection failed at init)')
          this.onProbeFailure()
          return
        }

        // Simple PING — cheapest possible Redis operation
        const result = await redis.ping()
        if (result === 'PONG') {
          this.onProbeSuccess()
        } else {
          console.warn(`[pulse:circuit] Probe: unexpected PING result: ${JSON.stringify(result)}`)
          this.onProbeFailure()
        }
      } catch (err) {
        console.warn('[pulse:circuit] Probe: ping threw:', err instanceof Error ? err.message : err)
        this.onProbeFailure()
      }
    } finally {
      this.lastProbeAt = Date.now() // Set AFTER probe completes (not before)
      this.isProbing = false
    }
  }

  private onProbeSuccess(): void {
    this.lastSuccessAt = Date.now()
    this.consecutiveFailures = 0
    this.consecutiveSuccesses++

    if (this.state === 'half_open' && this.consecutiveSuccesses >= this.config.successThreshold) {
      this.transition('closed')
    } else if (this.state === 'open') {
      // Single success while open → transition to half_open
      this.transition('half_open')
    }
  }

  private onProbeFailure(): void {
    this.lastFailureAt = Date.now()
    this.consecutiveSuccesses = 0
    this.consecutiveFailures++

    if (this.state === 'closed' && this.consecutiveFailures >= this.config.failureThreshold) {
      this.transition('open')
    } else if (this.state === 'half_open') {
      // Any failure during probing → back to open
      this.transition('open')
    }
  }

  private transition(newState: CircuitState): void {
    if (this.state === newState) return
    const oldState = this.state
    this.state = newState

    if (newState === 'closed') {
      this.consecutiveFailures = 0
    } else if (newState === 'open') {
      this.consecutiveSuccesses = 0
    }

    this.onStateChange?.(oldState, newState)
  }
}
