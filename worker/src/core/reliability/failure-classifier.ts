export type MessageFailureKind =
  | 'transport_ingest_failed'
  | 'claim_failed'
  | 'policy_blocked'
  | 'rate_limited'
  | 'runtime_failed'
  | 'outbound_create_failed'
  | 'outbound_send_failed'
  | 'unknown'

export interface MessageFailure {
  kind: MessageFailureKind
  retryable: boolean
  message: string
}

function normalizeMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  if (typeof error === 'string' && error.trim().length > 0) return error
  return 'Unknown failure'
}

export function classifyMessageFailure(input: {
  stage: 'ingest' | 'claim' | 'policy' | 'rate_limit' | 'runtime' | 'outbound_create' | 'outbound_send'
  error: unknown
  retryable?: boolean
}): MessageFailure {
  const message = normalizeMessage(input.error)
  const retryable = input.retryable ?? !(input.stage === 'policy' || input.stage === 'rate_limit')

  switch (input.stage) {
    case 'ingest':
      return { kind: 'transport_ingest_failed', retryable, message }
    case 'claim':
      return { kind: 'claim_failed', retryable, message }
    case 'policy':
      return { kind: 'policy_blocked', retryable: false, message }
    case 'rate_limit':
      return { kind: 'rate_limited', retryable: false, message }
    case 'runtime':
      return { kind: 'runtime_failed', retryable, message }
    case 'outbound_create':
      return { kind: 'outbound_create_failed', retryable, message }
    case 'outbound_send':
      return { kind: 'outbound_send_failed', retryable, message }
    default:
      return { kind: 'unknown', retryable, message }
  }
}
