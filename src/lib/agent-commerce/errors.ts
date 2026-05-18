export type AgentCommerceErrorCode =
  | 'feature_disabled'
  | 'kill_switch_active'
  | 'validation_failed'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'idempotency_required'
  | 'idempotency_conflict'
  | 'policy_denied'
  | 'provider_unavailable'
  | 'invalid_state_transition'
  | 'internal_error'

export class AgentCommerceError extends Error {
  readonly code: AgentCommerceErrorCode
  readonly status: number
  readonly details?: unknown
  readonly retryable: boolean

  constructor(
    code: AgentCommerceErrorCode,
    message: string,
    status = 500,
    options: { details?: unknown; retryable?: boolean } = {},
  ) {
    super(message)
    this.name = 'AgentCommerceError'
    this.code = code
    this.status = status
    this.details = options.details
    this.retryable = options.retryable ?? false
  }
}

export function normalizeAgentCommerceError(error: unknown): AgentCommerceError {
  if (error instanceof AgentCommerceError) return error
  return new AgentCommerceError(
    'internal_error',
    error instanceof Error ? error.message : 'Agent Commerce request failed.',
    500,
  )
}
