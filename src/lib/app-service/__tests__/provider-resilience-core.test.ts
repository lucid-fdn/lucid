import { afterEach, describe, expect, it } from 'vitest'
import { AppServiceError } from '../errors'
import {
  classifyProviderFailure,
  evaluateProviderCircuit,
  isProviderQuotaExhaustion,
  providerRetryDelayMs,
  recordProviderCircuitFailure,
} from '../provider-resilience-core'
import {
  getProviderCircuitState,
  resetProviderCircuitStates,
  runProviderRequestWithResilience,
} from '../provider-resilience'

describe('provider resilience core', () => {
  afterEach(() => {
    resetProviderCircuitStates()
  })

  it('classifies timeout, retryable, and quota failures without retrying exhausted quota', () => {
    const timeout = new AppServiceError('provider_unavailable', 'v0 API request timed out.', 504, {
      retryable: true,
    })
    const rateLimit = new AppServiceError('rate_limited', 'Temporary rate limit.', 429, {
      retryable: true,
    })
    const quota = new AppServiceError('rate_limited', 'Daily quota exhausted.', 429, {
      retryable: true,
    })

    expect(classifyProviderFailure(timeout)).toMatchObject({
      mode: 'timeout',
      retryable: true,
      countsTowardCircuit: true,
    })
    expect(classifyProviderFailure(rateLimit)).toMatchObject({
      mode: 'rate_limited',
      retryable: true,
      countsTowardCircuit: true,
    })
    expect(classifyProviderFailure(quota)).toMatchObject({
      mode: 'quota_exhausted',
      retryable: false,
      countsTowardCircuit: false,
    })
    expect(isProviderQuotaExhaustion('provider usage cap limit exceeded')).toBe(true)
  })

  it('opens and half-opens the circuit after repeated provider failures', () => {
    const circuit = { failureThreshold: 2, resetAfterMs: 1_000 }
    const now = 1_000

    const firstFailure = recordProviderCircuitFailure(undefined, now, circuit)
    expect(evaluateProviderCircuit(firstFailure, now, circuit)).toEqual({
      allowed: true,
      status: 'closed',
      retryAfterMs: null,
    })

    const openCircuit = recordProviderCircuitFailure(firstFailure, now + 10, circuit)
    expect(evaluateProviderCircuit(openCircuit, now + 20, circuit)).toEqual({
      allowed: false,
      status: 'open',
      retryAfterMs: 990,
    })

    expect(evaluateProviderCircuit(openCircuit, now + 1_010, circuit)).toEqual({
      allowed: true,
      status: 'half_open',
      retryAfterMs: null,
    })
  })

  it('retries transient provider requests and records circuit state', async () => {
    let calls = 0
    const result = await runProviderRequestWithResilience({
      provider: 'v0',
      operation: 'POST /chats',
      policy: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
      circuit: { failureThreshold: 2, resetAfterMs: 1_000 },
      wait: async () => {},
      execute: async () => {
        calls += 1
        if (calls === 1) {
          throw new AppServiceError('provider_unavailable', 'Provider unavailable.', 502, {
            retryable: true,
          })
        }
        return { ok: true }
      },
    })

    expect(result).toEqual({ ok: true })
    expect(calls).toBe(2)
    expect(getProviderCircuitState('v0', 'POST /chats')).toMatchObject({
      status: 'closed',
      failureCount: 0,
    })
  })

  it('uses bounded exponential retry delays', () => {
    const policy = { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 250 }
    expect(providerRetryDelayMs({ attempt: 1, policy })).toBe(100)
    expect(providerRetryDelayMs({ attempt: 2, policy })).toBe(200)
    expect(providerRetryDelayMs({ attempt: 3, policy })).toBe(250)
    expect(providerRetryDelayMs({ attempt: 1, retryAfterMs: 1_000, policy })).toBe(250)
  })
})
