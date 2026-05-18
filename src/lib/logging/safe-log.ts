export function maskIdentifier(value?: string | null): string | null {
  if (!value) return null
  if (value.length <= 8) return `${value.slice(0, 2)}***`
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

export function maskEmail(value?: string | null): string | null {
  if (!value) return null
  const [local, domain] = value.split('@')
  if (!local || !domain) return maskIdentifier(value)
  return `${local.slice(0, 2)}***@${domain}`
}

export function maskPhone(value?: string | null): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 4) return '***'
  return `***${digits.slice(-4)}`
}

export function maskWalletAddress(value?: string | null): string | null {
  if (!value) return null
  if (value.length <= 10) return `${value.slice(0, 2)}***`
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

export function summarizeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: redactLogText(error.message) }
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const name = typeof record.name === 'string' && record.name.trim()
      ? record.name
      : 'ObjectError'
    const message = typeof record.message === 'string' && record.message.trim()
      ? record.message
      : [record.code, record.status, record.statusCode, record.details]
          .filter((value) => typeof value === 'string' || typeof value === 'number')
          .map(String)
          .join(' ')

    return {
      name: redactLogText(name),
      message: redactLogText(message || 'Object error'),
    }
  }
  return { name: 'UnknownError', message: redactLogText(String(error)) }
}

const REDACTED = '[redacted]'
const SECRET_KEY_PATTERN = /(authorization|api[_-]?key|bearer|cookie|csrf|jwt|password|private[_-]?key|refresh[_-]?token|secret|session|token)/i
const EMAIL_KEY_PATTERN = /email/i
const PHONE_KEY_PATTERN = /phone|sms/i
const USER_KEY_PATTERN = /(^|[_-])(user|user[_-]?id|privy[_-]?id)([_-]|$)|userid/i
const RESOURCE_ID_KEY_PATTERN =
  /^(orgId|organizationId|projectId|assistantId|agentId|channelId|runtimeId|workspaceId|teamId|crewId|conversationId|threadId)$|(^|[_-])(org|organization|project|assistant|agent|channel|runtime|workspace|team|crew|conversation|thread)[_-]?id($|[_-])/i
const WALLET_KEY_PATTERN = /wallet|address/i
const LONG_HEX_PATTERN = /^0x[a-fA-F0-9]{24,}$/

export function redactLogText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (email) => maskEmail(email) ?? REDACTED)
    .replace(/\b0x[a-fA-F0-9]{24,}\b/g, (address) => maskWalletAddress(address) ?? REDACTED)
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_-]{12,}|bb_live_[A-Za-z0-9_-]{12,}|ste-[A-Za-z0-9_-]{12,})\b/g, REDACTED)
}

export function redactLogValue(value: unknown, parentKey?: string): unknown {
  const key = parentKey ?? ''

  if (SECRET_KEY_PATTERN.test(key)) return REDACTED

  if (typeof value === 'string') {
    if (EMAIL_KEY_PATTERN.test(key)) return maskEmail(value)
    if (PHONE_KEY_PATTERN.test(key)) return maskPhone(value)
    if (USER_KEY_PATTERN.test(key)) return maskIdentifier(value)
    if (RESOURCE_ID_KEY_PATTERN.test(key)) return maskIdentifier(value)
    if (WALLET_KEY_PATTERN.test(key)) return LONG_HEX_PATTERN.test(value) ? maskWalletAddress(value) : maskIdentifier(value)
    return redactLogText(value)
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactLogValue(entry, parentKey))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entry]) => [
        entryKey,
        redactLogValue(entry, entryKey),
      ]),
    )
  }

  return value
}

export function redactLogMetadata<T extends Record<string, unknown> | undefined | null>(metadata: T): T {
  if (!metadata) return metadata
  return redactLogValue(metadata) as T
}
