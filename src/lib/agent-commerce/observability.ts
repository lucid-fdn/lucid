import 'server-only'

import crypto from 'crypto'
import { ErrorService } from '@/lib/errors/error-service'

const REDACTED = '[redacted]'
const HASHED_PREFIX = 'sha256:'
const MAX_TAG_LENGTH = 80

const SENSITIVE_KEY_PATTERN = /(?:authorization|bearer|card|customer|email|grant|key|merchant|password|payment|phone|secret|signature|token|user|wallet)/i
const SAFE_KEY_PATTERN = /^(?:amount|currency|event_type|first_claim|limit_value|operation|provider|rail|reason|request_id|resource_type|retryable|stackId|status|surface|target_type)$/i
const SECRET_VALUE_PATTERN = /\b(?:sk|rk|pk)_(?:live|test)_[a-zA-Z0-9_]+\b|bearer\s+[a-zA-Z0-9._-]+|\b(?:ch|cus|pi|pm|seti|spt|tok)_[a-zA-Z0-9_]+\b/gi
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const CARD_LIKE_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g

function hashValue(value: unknown): string {
  return `${HASHED_PREFIX}${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12)}`
}

function safeTag(value: unknown): string {
  return String(value ?? 'unknown')
    .replace(/[^a-zA-Z0-9:._-]/g, '_')
    .slice(0, MAX_TAG_LENGTH) || 'unknown'
}

export function redactAgentCommerceText(value: string): string {
  return value
    .replace(SECRET_VALUE_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(CARD_LIKE_PATTERN, REDACTED)
}

export function sanitizeAgentCommerceLogContext(value: unknown, key = '', depth = 0): unknown {
  if (value == null) return value
  if (depth > 5) return '[truncated]'

  if (typeof value === 'string') {
    if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_KEY_PATTERN.test(key)) return hashValue(value)
    return redactAgentCommerceText(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeAgentCommerceLogContext(item, key, depth + 1))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).slice(0, 50).map(([entryKey, entryValue]) => {
        if (SENSITIVE_KEY_PATTERN.test(entryKey) && !SAFE_KEY_PATTERN.test(entryKey)) {
          return [entryKey, typeof entryValue === 'string' ? hashValue(entryValue) : REDACTED]
        }
        return [entryKey, sanitizeAgentCommerceLogContext(entryValue, entryKey, depth + 1)]
      }),
    )
  }

  return REDACTED
}

export function safeAgentCommerceErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return redactAgentCommerceText(message)
}

export function agentCommerceObservabilityTags(params: {
  operation?: string
  surface?: string
  provider?: string
  rail?: string
  status?: string | number
  code?: string
} = {}): Record<string, string> {
  return {
    stack: 'commerce',
    operation: safeTag(params.operation),
    surface: safeTag(params.surface),
    provider: safeTag(params.provider),
    rail: safeTag(params.rail),
    status: safeTag(params.status),
    error_code: safeTag(params.code),
  }
}

export function captureAgentCommerceError(error: unknown, params: {
  operation: string
  surface?: string
  severity?: 'fatal' | 'error' | 'warning' | 'info' | 'debug'
  provider?: string
  rail?: string
  status?: string | number
  code?: string
  context?: Record<string, unknown>
  fingerprint?: string[]
}): void {
  const safeError = new Error(safeAgentCommerceErrorMessage(error))
  safeError.name = error instanceof Error ? error.name : 'AgentCommerceError'

  ErrorService.captureException(safeError, {
    severity: params.severity ?? 'error',
    tags: agentCommerceObservabilityTags(params),
    context: sanitizeAgentCommerceLogContext({
      ...(params.context ?? {}),
      operation: params.operation,
      surface: params.surface,
      provider: params.provider,
      rail: params.rail,
      status: params.status,
      code: params.code,
    }) as Record<string, unknown>,
    fingerprint: params.fingerprint,
  })
}
