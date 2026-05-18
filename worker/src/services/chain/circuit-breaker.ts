/**
 * Circuit Breaker — P1-22
 *
 * Prevents cascading failures when DEX APIs or RPC providers are down.
 * Three states: CLOSED (normal), OPEN (failing, reject fast), HALF_OPEN (testing recovery).
 */

// ============================================================================
// Types
// ============================================================================

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

interface CircuitBreakerOptions {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number
  /** How long to stay open before trying half-open, in ms (default: 30s) */
  resetTimeout?: number
  /** Number of successes in half-open to close circuit (default: 2) */
  successThreshold?: number
  /** Optional name for logging */
  name?: string
}

interface CircuitStats {
  state: CircuitState
  failures: number
  successes: number
  lastFailure: number | null
  lastSuccess: number | null
  totalRequests: number
  totalFailures: number
}

// ============================================================================
// CircuitBreaker Class
// ============================================================================

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED'
  private failures = 0
  private successes = 0
  private lastFailureTime: number | null = null
  private lastSuccessTime: number | null = null
  private totalRequests = 0
  private totalFailures = 0

  private readonly failureThreshold: number
  private readonly resetTimeout: number
  private readonly successThreshold: number
  private readonly name: string

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5
    this.resetTimeout = options.resetTimeout ?? 30_000
    this.successThreshold = options.successThreshold ?? 2
    this.name = options.name ?? 'unnamed'
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitOpenError if circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++

    if (this.state === 'OPEN') {
      // Check if reset timeout has elapsed
      if (this.lastFailureTime && Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN'
        this.successes = 0
        console.log(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN`)
      } else {
        throw new CircuitOpenError(
          `Circuit breaker "${this.name}" is OPEN. ` +
          `${this.failures} consecutive failures. ` +
          `Will retry in ${Math.ceil((this.resetTimeout - (Date.now() - (this.lastFailureTime || 0))) / 1000)}s`
        )
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    this.lastSuccessTime = Date.now()
    this.failures = 0

    if (this.state === 'HALF_OPEN') {
      this.successes++
      if (this.successes >= this.successThreshold) {
        this.state = 'CLOSED'
        this.successes = 0
        console.log(`[CircuitBreaker:${this.name}] Circuit CLOSED (recovered)`)
      }
    }
  }

  private onFailure(): void {
    this.failures++
    this.totalFailures++
    this.lastFailureTime = Date.now()

    if (this.state === 'HALF_OPEN') {
      // Immediate re-open on failure during half-open
      this.state = 'OPEN'
      console.warn(`[CircuitBreaker:${this.name}] Circuit re-OPENED from HALF_OPEN`)
    } else if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN'
      console.warn(
        `[CircuitBreaker:${this.name}] Circuit OPENED after ${this.failures} failures`
      )
    }
  }

  /** Get current stats */
  getStats(): CircuitStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailureTime,
      lastSuccess: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
    }
  }

  /** Force reset (for admin use) */
  reset(): void {
    this.state = 'CLOSED'
    this.failures = 0
    this.successes = 0
    console.log(`[CircuitBreaker:${this.name}] Force reset to CLOSED`)
  }

  /** Check if requests can pass */
  isAvailable(): boolean {
    if (this.state === 'CLOSED') return true
    if (this.state === 'HALF_OPEN') return true
    if (this.state === 'OPEN' && this.lastFailureTime) {
      return Date.now() - this.lastFailureTime >= this.resetTimeout
    }
    return false
  }
}

// ============================================================================
// Error
// ============================================================================

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CircuitOpenError'
  }
}

// ============================================================================
// Pre-configured Instances for Trading Services
// ============================================================================

export const circuitBreakers = {
  jupiter: new CircuitBreaker({
    name: 'jupiter',
    failureThreshold: 3,
    resetTimeout: 30_000,
    successThreshold: 2,
  }),

  oneInch: new CircuitBreaker({
    name: '1inch',
    failureThreshold: 3,
    resetTimeout: 30_000,
    successThreshold: 2,
  }),

  hyperliquid: new CircuitBreaker({
    name: 'hyperliquid',
    failureThreshold: 3,
    resetTimeout: 60_000,
    successThreshold: 2,
  }),

  coinGecko: new CircuitBreaker({
    name: 'coinGecko',
    failureThreshold: 5,
    resetTimeout: 60_000,
    successThreshold: 2,
  }),

  evmRpc: new Map<string, CircuitBreaker>(),
  solanaRpc: new Map<string, CircuitBreaker>(),
}

/** Get or create a chain-specific RPC circuit breaker */
export function getEvmRpcBreaker(chainId: string): CircuitBreaker {
  if (!circuitBreakers.evmRpc.has(chainId)) {
    circuitBreakers.evmRpc.set(
      chainId,
      new CircuitBreaker({
        name: `evm-rpc-${chainId}`,
        failureThreshold: 5,
        resetTimeout: 15_000,
        successThreshold: 1,
      })
    )
  }
  return circuitBreakers.evmRpc.get(chainId)!
}

export function getSolanaRpcBreaker(chainId: string = 'mainnet-beta'): CircuitBreaker {
  if (!circuitBreakers.solanaRpc.has(chainId)) {
    circuitBreakers.solanaRpc.set(
      chainId,
      new CircuitBreaker({
        name: `solana-rpc-${chainId}`,
        failureThreshold: 5,
        resetTimeout: 15_000,
        successThreshold: 1,
      })
    )
  }
  return circuitBreakers.solanaRpc.get(chainId)!
}