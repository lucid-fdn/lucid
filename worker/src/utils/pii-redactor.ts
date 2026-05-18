/**
 * PII Redactor — Masks personally identifiable information in log output.
 *
 * Controlled by `PII_REDACT_LOGS` config (default: true).
 *
 * Redacts:
 *   - Phone numbers  → +***1234
 *   - Email addresses → u***@domain.com
 *   - UUIDs          → abcd1234***
 *   - IP addresses   → ***.***.***.123
 *   - Composite keys → each segment redacted independently
 */

let _enabled = true

/** Call once at startup with config.PII_REDACT_LOGS */
export function initPiiRedactor(enabled: boolean): void {
  _enabled = enabled
}

/**
 * Monkey-patch console methods to auto-redact PII in all string args.
 * Call ONCE at startup, before any logging.
 */
export function wrapConsole(enabled: boolean): void {
  initPiiRedactor(enabled)
  if (!enabled) return

  const origLog = console.log.bind(console)
  const origInfo = console.info.bind(console)
  const origDebug = console.debug.bind(console)
  const origWarn = console.warn.bind(console)
  const origError = console.error.bind(console)

  function redactArgs(args: unknown[]): unknown[] {
    return args.map(arg => {
      if (typeof arg === 'string') return redactString(arg)
      if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
        try { return redactObject(arg as Record<string, unknown>) } catch { return arg }
      }
      return arg
    })
  }

  console.log = (...args: unknown[]) => origLog(...redactArgs(args))
  console.info = (...args: unknown[]) => origInfo(...redactArgs(args))
  console.debug = (...args: unknown[]) => origDebug(...redactArgs(args))
  console.warn = (...args: unknown[]) => origWarn(...redactArgs(args))
  console.error = (...args: unknown[]) => origError(...redactArgs(args))
}

/** Redact a single string value */
export function redact(value: string): string {
  if (!_enabled) return value
  return redactString(value)
}

/**
 * Deep-redact an object for logging.
 * Returns a new object with all string values redacted.
 */
export function redactObject<T extends Record<string, unknown>>(obj: T): T {
  if (!_enabled) return obj
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(obj)) {
    result[key] = redactValue(val)
  }
  return result as T
}

/* ─── Internal ─────────────────────────────────────────── */

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const PHONE_RE = /\+\d{7,15}/g
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const IPV4_RE = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g
const EVM_ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/g
const SOLANA_ADDRESS_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g

function redactString(value: string): string {
  let result = value

  // UUIDs → first 8 chars + ***
  result = result.replace(UUID_RE, (match) => match.slice(0, 8) + '***')

  // Phone numbers → +***LAST4
  result = result.replace(PHONE_RE, (match) => {
    const last4 = match.slice(-4)
    return `+***${last4}`
  })

  // Emails → first char + *** @ domain
  result = result.replace(EMAIL_RE, (match) => {
    const [local, domain] = match.split('@')
    return `${local[0]}***@${domain}`
  })

  // IPv4 → ***.***.***.LAST
  result = result.replace(IPV4_RE, (_match, _a, _b, _c, d) => {
    return `***.***.***.${d}`
  })

  // Wallet addresses/signatures → prefix + suffix only. This intentionally
  // redacts long base58 strings too; operational logs do not need full onchain
  // identifiers.
  result = result.replace(EVM_ADDRESS_RE, (match) => `${match.slice(0, 6)}...${match.slice(-4)}`)
  result = result.replace(SOLANA_ADDRESS_RE, (match) => `${match.slice(0, 6)}...${match.slice(-4)}`)

  return result
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value)
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry))
  if (typeof value === 'object' && value !== null) return redactObject(value as Record<string, unknown>)
  return value
}
