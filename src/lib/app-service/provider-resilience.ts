import { AppServiceError } from './errors'
import {
  classifyProviderFailure,
  evaluateProviderCircuit,
  providerCircuitOptionsFromEnv,
  providerRetryDelayMs,
  providerRetryPolicyFromEnv,
  recordProviderCircuitFailure,
  recordProviderCircuitSuccess,
  type AppServiceProviderName,
  type ProviderCircuitOptions,
  type ProviderCircuitState,
  type ProviderRetryPolicy,
} from './provider-resilience-core'

interface ProviderResilienceInput<T> {
  provider: AppServiceProviderName
  operation: string
  execute: () => Promise<T>
  policy?: ProviderRetryPolicy
  circuit?: ProviderCircuitOptions
  wait?: (ms: number) => Promise<void>
  now?: () => number
}

const providerCircuitStates = new Map<string, ProviderCircuitState>()

function circuitKey(provider: AppServiceProviderName, operation: string): string {
  return `${provider}:${operation}`
}

function defaultWait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export function resetProviderCircuitStates() {
  providerCircuitStates.clear()
}

export function getProviderCircuitState(provider: AppServiceProviderName, operation: string) {
  return providerCircuitStates.get(circuitKey(provider, operation))
}

export async function runProviderRequestWithResilience<T>(input: ProviderResilienceInput<T>): Promise<T> {
  const policy = input.policy ?? providerRetryPolicyFromEnv()
  const circuit = input.circuit ?? providerCircuitOptionsFromEnv()
  const wait = input.wait ?? defaultWait
  const now = input.now ?? Date.now
  const key = circuitKey(input.provider, input.operation)

  const decision = evaluateProviderCircuit(providerCircuitStates.get(key), now(), circuit)
  if (!decision.allowed) {
    throw new AppServiceError(
      'provider_unavailable',
      `${input.provider} provider circuit is open for ${input.operation}.`,
      503,
      {
        retryable: true,
        details: {
          provider: input.provider,
          operation: input.operation,
          circuit_status: decision.status,
          retry_after_ms: decision.retryAfterMs,
        },
      },
    )
  }

  let attempt = 0
  let lastError: unknown
  while (attempt < policy.maxAttempts) {
    attempt += 1
    try {
      const result = await input.execute()
      providerCircuitStates.set(key, recordProviderCircuitSuccess())
      return result
    } catch (error) {
      lastError = error
      const failure = classifyProviderFailure(error)
      if (failure.countsTowardCircuit) {
        providerCircuitStates.set(key, recordProviderCircuitFailure(providerCircuitStates.get(key), now(), circuit))
      }

      if (!failure.retryable || attempt >= policy.maxAttempts) {
        throw error
      }

      await wait(providerRetryDelayMs({ attempt, policy }))
    }
  }

  throw lastError
}
