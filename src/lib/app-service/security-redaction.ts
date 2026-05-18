export const APP_SERVICE_REDACTED = '[redacted]'

const SAFE_SECRETISH_KEYS = new Set([
  'agentops_trace_id',
  'api_url',
  'app_runtime_api_version',
  'build_log_artifact_id',
  'conversation_id',
  'deployment_receipt_artifact_id',
  'eval_report_artifact_id',
  'external_deployment_id',
  'external_url',
  'idempotency_key',
  'next_since',
  'preview_url',
  'provider_deployment_id',
  'provider_version_id',
  'public_url',
  'source_artifact_id',
  'source_checksum',
  'token_usage',
  'visitor_session_id',
  'web_url',
])

const SECRET_KEY_PATTERN = /(^|[_-])(api[_-]?key|authorization|bearer|client[_-]?secret|cookie|jwt|password|private[_-]?key|refresh[_-]?token|secret|token)([_-]|$)/i

const TEXT_PATTERNS: Array<[RegExp, string | ((match: string, ...groups: string[]) => string)]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, APP_SERVICE_REDACTED],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]'],
  [/\b(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g, APP_SERVICE_REDACTED],
  [/\b(sk-[A-Za-z0-9_-]{12,}|v0_[A-Za-z0-9_-]{12,}|vercel_[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_-]{12,})\b/g, APP_SERVICE_REDACTED],
  [
    /\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PRIVATE_KEY|PASSWORD|CLIENT_SECRET)[A-Z0-9_]*)\s*[:=]\s*("[^"]+"|'[^']+'|[^\s,}]+)/gi,
    (_match, key) => `${key}=${APP_SERVICE_REDACTED}`,
  ],
]

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase()
  if (SAFE_SECRETISH_KEYS.has(normalized)) return false
  return SECRET_KEY_PATTERN.test(normalized)
}

export function redactAppServiceText(value: string): string {
  return TEXT_PATTERNS.reduce((text, [pattern, replacement]) => (
    text.replace(pattern, replacement as string)
  ), value)
}

export function redactAppServiceValue(value: unknown, parentKey?: string): unknown {
  if (parentKey && isSecretKey(parentKey)) {
    return APP_SERVICE_REDACTED
  }

  if (typeof value === 'string') {
    return redactAppServiceText(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactAppServiceValue(item))
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactAppServiceValue(entry, key)]),
    )
  }

  return value
}

export function redactAppServiceMetadata<T extends Record<string, unknown>>(metadata: T): T {
  return redactAppServiceValue(metadata) as T
}

export function containsAppServiceSecret(value: unknown): boolean {
  return JSON.stringify(value) !== JSON.stringify(redactAppServiceValue(value))
}
