export type AppServiceProviderName = 'v0' | 'vercel' | 'sandbox'

export type ProviderFailureMode =
  | 'timeout'
  | 'quota_exhausted'
  | 'rate_limited'
  | 'retryable_unavailable'
  | 'provider_unavailable'
  | 'validation'
  | 'unknown'

export type ProviderCircuitStatus = 'closed' | 'open' | 'half_open'

export interface ProviderCircuitState {
  status: ProviderCircuitStatus
  failureCount: number
  openedAtMs?: number
  lastFailureAtMs?: number
}

export interface ProviderCircuitOptions {
  failureThreshold: number
  resetAfterMs: number
}

export interface ProviderCircuitDecision {
  allowed: boolean
  status: ProviderCircuitStatus
  retryAfterMs: number | null
}

export interface ProviderRetryPolicy {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
}

export interface ProviderFailureClassification {
  mode: ProviderFailureMode
  retryable: boolean
  countsTowardCircuit: boolean
  status?: number
}

const QUOTA_PATTERNS = [
  'quota',
  'daily cap',
  'monthly cap',
  'usage cap',
  'hard limit',
  'insufficient credits',
  'credits exhausted',
  'limit exceeded',
]

export const DEFAULT_PROVIDER_RETRY_POLICY: ProviderRetryPolicy = {
  maxAttempts: 2,
  baseDelayMs: 250,
  maxDelayMs: 2_000,
}

export const DEFAULT_PROVIDER_CIRCUIT_OPTIONS: ProviderCircuitOptions = {
  failureThreshold: 5,
  resetAfterMs: 60_000,
}

export const CLOSED_PROVIDER_CIRCUIT_STATE: ProviderCircuitState = {
  status: 'closed',
  failureCount: 0,
}

function integerFromEnv(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, parsed))
}

export function providerRetryPolicyFromEnv(env: Record<string, string | undefined> = process.env): ProviderRetryPolicy {
  return {
    maxAttempts: integerFromEnv(
      env.APP_SERVICE_PROVIDER_RETRY_MAX_ATTEMPTS,
      DEFAULT_PROVIDER_RETRY_POLICY.maxAttempts,
      1,
      5,
    ),
    baseDelayMs: integerFromEnv(
      env.APP_SERVICE_PROVIDER_RETRY_BASE_DELAY_MS,
      DEFAULT_PROVIDER_RETRY_POLICY.baseDelayMs,
      0,
      30_000,
    ),
    maxDelayMs: integerFromEnv(
      env.APP_SERVICE_PROVIDER_RETRY_MAX_DELAY_MS,
      DEFAULT_PROVIDER_RETRY_POLICY.maxDelayMs,
      0,
      60_000,
    ),
  }
}

export function providerCircuitOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): ProviderCircuitOptions {
  return {
    failureThreshold: integerFromEnv(
      env.APP_SERVICE_PROVIDER_CIRCUIT_FAILURE_THRESHOLD,
      DEFAULT_PROVIDER_CIRCUIT_OPTIONS.failureThreshold,
      1,
      100,
    ),
    resetAfterMs: integerFromEnv(
      env.APP_SERVICE_PROVIDER_CIRCUIT_RESET_MS,
      DEFAULT_PROVIDER_CIRCUIT_OPTIONS.resetAfterMs,
      1_000,
      3_600_000,
    ),
  }
}

export function isRetryableProviderStatus(status?: number): boolean {
  return status === 408
    || status === 409
    || status === 425
    || status === 429
    || status === 500
    || status === 502
    || status === 503
    || status === 504
}

export function isProviderQuotaExhaustion(input: unknown): boolean {
  const text = stringifyProviderFailure(input).toLowerCase()
  return QUOTA_PATTERNS.some((pattern) => text.includes(pattern))
}

export function stringifyProviderFailure(input: unknown): string {
  if (!input) return ''
  if (typeof input === 'string') return input
  if (input instanceof Error) {
    try {
      return `${input.name} ${input.message} ${JSON.stringify(input)}`
    } catch {
      return `${input.name} ${input.message}`
    }
  }
  try {
    return JSON.stringify(input)
  } catch {
    return String(input)
  }
}

export function providerFailureStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const record = error as Record<string, unknown>
  return typeof record.status === 'number' ? record.status : undefined
}

export function classifyProviderFailure(error: unknown): ProviderFailureClassification {
  const status = providerFailureStatus(error)
  const retryableFlag = Boolean(error && typeof error === 'object' && (error as Record<string, unknown>).retryable)
  const name = error instanceof Error ? error.name : undefined

  if (name === 'AbortError' || status === 408 || status === 504) {
    return {
      mode: 'timeout',
      retryable: true,
      countsTowardCircuit: true,
      status,
    }
  }

  if (status === 429 && isProviderQuotaExhaustion(error)) {
    return {
      mode: 'quota_exhausted',
      retryable: false,
      countsTowardCircuit: false,
      status,
    }
  }

  if (status === 429) {
    return {
      mode: 'rate_limited',
      retryable: true,
      countsTowardCircuit: true,
      status,
    }
  }

  if (status && isRetryableProviderStatus(status)) {
    return {
      mode: 'retryable_unavailable',
      retryable: true,
      countsTowardCircuit: true,
      status,
    }
  }

  if (retryableFlag) {
    return {
      mode: 'retryable_unavailable',
      retryable: true,
      countsTowardCircuit: true,
      status,
    }
  }

  if (status && status >= 400 && status < 500) {
    return {
      mode: 'validation',
      retryable: false,
      countsTowardCircuit: false,
      status,
    }
  }

  if (status && status >= 500) {
    return {
      mode: 'provider_unavailable',
      retryable: true,
      countsTowardCircuit: true,
      status,
    }
  }

  return {
    mode: 'unknown',
    retryable: false,
    countsTowardCircuit: false,
    status,
  }
}

export function providerRetryDelayMs(input: {
  attempt: number
  retryAfterMs?: number | null
  policy?: ProviderRetryPolicy
}): number {
  const policy = input.policy ?? DEFAULT_PROVIDER_RETRY_POLICY
  if (typeof input.retryAfterMs === 'number' && Number.isFinite(input.retryAfterMs) && input.retryAfterMs >= 0) {
    return Math.min(policy.maxDelayMs, input.retryAfterMs)
  }

  const exponential = policy.baseDelayMs * (2 ** Math.max(0, input.attempt - 1))
  return Math.min(policy.maxDelayMs, Math.max(0, exponential))
}

export function evaluateProviderCircuit(
  state: ProviderCircuitState | undefined,
  nowMs: number,
  options: ProviderCircuitOptions = DEFAULT_PROVIDER_CIRCUIT_OPTIONS,
): ProviderCircuitDecision {
  if (!state || state.status === 'closed') {
    return { allowed: true, status: 'closed', retryAfterMs: null }
  }

  const openedAtMs = state.openedAtMs ?? nowMs
  const elapsedMs = nowMs - openedAtMs
  if (elapsedMs >= options.resetAfterMs) {
    return { allowed: true, status: 'half_open', retryAfterMs: null }
  }

  return {
    allowed: false,
    status: 'open',
    retryAfterMs: Math.max(0, options.resetAfterMs - elapsedMs),
  }
}

export function recordProviderCircuitFailure(
  state: ProviderCircuitState | undefined,
  nowMs: number,
  options: ProviderCircuitOptions = DEFAULT_PROVIDER_CIRCUIT_OPTIONS,
): ProviderCircuitState {
  const previousFailureCount = state?.status === 'half_open' ? 0 : state?.failureCount ?? 0
  const failureCount = previousFailureCount + 1
  const shouldOpen = failureCount >= options.failureThreshold

  return {
    status: shouldOpen ? 'open' : 'closed',
    failureCount,
    lastFailureAtMs: nowMs,
    ...(shouldOpen ? { openedAtMs: nowMs } : {}),
  }
}

export function recordProviderCircuitSuccess(): ProviderCircuitState {
  return { ...CLOSED_PROVIDER_CIRCUIT_STATE }
}
