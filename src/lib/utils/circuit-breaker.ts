/**
 * Circuit Breaker — Generic async call protection with fallback chain.
 *
 * Three states: CLOSED (normal), OPEN (failing, reject fast), HALF_OPEN (testing recovery).
 * When a circuit opens, callers get the fallback result instead of waiting for a timeout.
 *
 * Usage:
 *   const breaker = createCircuitBreaker({
 *     name: 'l2-gateway',
 *     failureThreshold: 3,
 *     resetTimeoutMs: 30_000,
 *     callTimeoutMs: 10_000,
 *   })
 *
 *   const result = await breaker.call(
 *     () => fetch('https://l2.example.com/status'),
 *     () => ({ status: 'unknown', cached: true }),  // fallback
 *   )
 */

export type CircuitState = 'closed' | 'open' | 'half_open'

export interface CircuitBreakerOptions {
  /** Human-readable name for logging */
  name: string
  /** Consecutive failures before opening (default: 3) */
  failureThreshold?: number
  /** Ms before attempting recovery (default: 30s) */
  resetTimeoutMs?: number
  /** Ms before a single call times out (default: 10s) */
  callTimeoutMs?: number
  /** Optional callback on state change */
  onStateChange?: (from: CircuitState, to: CircuitState) => void
}

export interface CircuitBreaker {
  /** Execute fn with circuit breaker protection. Falls back on open circuit or failure. */
  call<T>(fn: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T>
  /** Current circuit state */
  state: CircuitState
  /** Consecutive failure count */
  failures: number
  /** Manually reset the circuit to closed */
  reset(): void
  /** Get stats for observability */
  stats(): CircuitBreakerStats
}

export interface CircuitBreakerStats {
  name: string
  state: CircuitState
  failures: number
  totalCalls: number
  totalFailures: number
  totalFallbacks: number
  lastFailureAt: number | null
  lastSuccessAt: number | null
}

export function createCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  const {
    name,
    failureThreshold = 3,
    resetTimeoutMs = 30_000,
    callTimeoutMs = 10_000,
    onStateChange,
  } = options

  let state: CircuitState = 'closed'
  let failures = 0
  let lastFailureAt: number | null = null
  let lastSuccessAt: number | null = null
  let totalCalls = 0
  let totalFailures = 0
  let totalFallbacks = 0
  let halfOpenProbeInFlight = false

  function transition(to: CircuitState) {
    if (state !== to) {
      const from = state
      state = to
      onStateChange?.(from, to)
    }
  }

  function onSuccess() {
    failures = 0
    halfOpenProbeInFlight = false
    lastSuccessAt = Date.now()
    transition('closed')
  }

  function onFailure() {
    failures++
    totalFailures++
    halfOpenProbeInFlight = false
    lastFailureAt = Date.now()
    if (failures >= failureThreshold) {
      transition('open')
    }
  }

  function shouldAttempt(): boolean {
    if (state === 'closed') return true
    if (state === 'open') {
      // Check if reset timeout has elapsed
      if (lastFailureAt && Date.now() - lastFailureAt >= resetTimeoutMs) {
        transition('half_open')
        halfOpenProbeInFlight = true
        return true
      }
      return false
    }
    // half_open — only allow one concurrent probe to avoid thundering herd
    if (halfOpenProbeInFlight) return false
    halfOpenProbeInFlight = true
    return true
  }

  async function callWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Circuit breaker "${name}": call timed out after ${callTimeoutMs}ms`)), callTimeoutMs)

      fn().then(
        (result) => {
          clearTimeout(timer)
          resolve(result)
        },
        (error) => {
          clearTimeout(timer)
          reject(error)
        },
      )
    })
  }

  return {
    get state() { return state },
    get failures() { return failures },

    async call<T>(fn: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T> {
      totalCalls++

      if (!shouldAttempt()) {
        totalFallbacks++
        return fallback()
      }

      try {
        const result = await callWithTimeout(fn)
        onSuccess()
        return result
      } catch {
        onFailure()
        totalFallbacks++
        return fallback()
      }
    },

    reset() {
      failures = 0
      transition('closed')
    },

    stats() {
      return {
        name,
        state,
        failures,
        totalCalls,
        totalFailures,
        totalFallbacks,
        lastFailureAt,
        lastSuccessAt,
      }
    },
  }
}
