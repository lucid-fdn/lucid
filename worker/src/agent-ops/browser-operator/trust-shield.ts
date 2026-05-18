import crypto from 'node:crypto'
import {
  buildBrowserOperatorHandoffEvent,
  detectBrowserOperatorHandoff,
  type BrowserOperatorHandoff,
} from './handoff.js'

export interface BrowserOperatorTrustShieldContext {
  state: string
  canaries: Array<{ token: string; tokenHash: string; label: string }>
  deterministicPatterns: string[]
  lowLevelActionPolicy: string
  classifier: Record<string, unknown>
}

export interface BrowserOperatorTrustEvent {
  event_type: string
  severity: 'info' | 'warn' | 'block'
  layer: 'browser_content' | 'browser_action' | 'browser_output' | 'classifier' | 'network'
  browser_session_id?: string | null
  host?: string | null
  url_hash?: string | null
  content_hash?: string | null
  details: Record<string, unknown>
}

export interface BrowserOperatorTrustEvaluation {
  state: 'protected' | 'degraded' | 'blocked'
  events: BrowserOperatorTrustEvent[]
  handoff: BrowserOperatorHandoff | null
  blocked: boolean
}

const DEFAULT_PROMPT_INJECTION_PATTERNS = [
  'ignore previous instructions',
  'ignore all previous instructions',
  'disregard previous instructions',
  'system prompt',
  'developer message',
  'reveal your instructions',
  'send your secrets',
  'exfiltrate',
  'prompt injection',
]

const LOW_LEVEL_ACTIONS = new Set([
  'click',
  'hover',
  'type',
  'select',
  'check',
  'uncheck',
  'fill',
  'press',
  'scroll',
  'submit',
  'drag',
  'download',
  'upload',
  'delete',
  'pay',
  'purchase',
  'transfer',
  'confirm',
  'approve',
])

export function normalizeBrowserTrustShieldContext(value: unknown): BrowserOperatorTrustShieldContext | null {
  const record = asRecord(value)
  if (!record) return null
  const canaries = readArray(record.canaries)
    .map(asRecord)
    .map((item) => ({
      token: getString(item?.token),
      tokenHash: getString(item?.tokenHash ?? item?.token_hash),
      label: getString(item?.label) ?? 'browser-trust-shield',
    }))
    .filter((item): item is { token: string; tokenHash: string; label: string } =>
      Boolean(item.token && item.tokenHash),
    )

  return {
    state: getString(record.state) ?? 'protected',
    canaries,
    deterministicPatterns: readArray(record.deterministic_patterns)
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0),
    lowLevelActionPolicy: getString(record.low_level_action_policy) ?? 'deny_by_default',
    classifier: asRecord(record.classifier) ?? { enabled: false, status: 'disabled' },
  }
}

export function evaluateBrowserOperatorTrust(input: {
  trustShield: BrowserOperatorTrustShieldContext | null
  targetUrl?: string | null
  finalUrl?: string | null
  sessionId?: string | null
  content?: unknown
  requestedAction?: string | null
  allowPrivateNetwork?: boolean
}): BrowserOperatorTrustEvaluation {
  const trustShield = input.trustShield
  const events: BrowserOperatorTrustEvent[] = []
  const scanUrl = input.finalUrl ?? input.targetUrl ?? null
  const host = extractHost(scanUrl)
  const urlHash = scanUrl ? hashValue(scanUrl) : null
  const text = stringifyForScan(input.content ?? '')
  const contentHash = text ? hashValue(text.slice(0, 120_000)) : null

  if (scanUrl && !input.allowPrivateNetwork && isPrivateOrLocalUrl(scanUrl)) {
    events.push({
      event_type: 'private_network_blocked',
      severity: 'block',
      layer: 'network',
      browser_session_id: input.sessionId ?? null,
      host,
      url_hash: urlHash,
      content_hash: contentHash,
      details: { reason: 'private_or_local_network_target' },
    })
  }

  if (trustShield && input.requestedAction && shouldBlockLowLevelAction(trustShield, input.requestedAction)) {
    events.push({
      event_type: 'low_level_action_blocked',
      severity: 'block',
      layer: 'browser_action',
      browser_session_id: input.sessionId ?? null,
      host,
      url_hash: urlHash,
      content_hash: contentHash,
      details: {
        action: input.requestedAction,
        policy: trustShield.lowLevelActionPolicy,
      },
    })
  }

  if (trustShield && text) {
    for (const canary of trustShield.canaries) {
      const index = text.indexOf(canary.token)
      if (index === -1) continue
      events.push({
        event_type: 'canary_leak',
        severity: 'block',
        layer: 'browser_output',
        browser_session_id: input.sessionId ?? null,
        host,
        url_hash: urlHash,
        content_hash: contentHash,
        details: {
          token_hash: canary.tokenHash,
          canary_label: canary.label,
          first_index: index,
          context_preview: redactCanaries(buildPreview(text, index, canary.token.length), trustShield.canaries),
        },
      })
    }

    const normalized = text.toLowerCase()
    const patterns = trustShield.deterministicPatterns.length > 0
      ? trustShield.deterministicPatterns
      : DEFAULT_PROMPT_INJECTION_PATTERNS
    for (const pattern of patterns) {
      const normalizedPattern = pattern.toLowerCase()
      const index = normalized.indexOf(normalizedPattern)
      if (index === -1) continue
      events.push({
        event_type: 'prompt_injection_pattern',
        severity: 'warn',
        layer: 'browser_content',
        browser_session_id: input.sessionId ?? null,
        host,
        url_hash: urlHash,
        content_hash: contentHash,
        details: {
          pattern: normalizedPattern,
          first_index: index,
          context_preview: redactCanaries(
            buildPreview(text, index, normalizedPattern.length),
            trustShield.canaries,
          ),
        },
      })
    }
  }

  const handoff = detectBrowserOperatorHandoff({
    content: input.content,
    requestedAction: input.requestedAction,
  })
  if (handoff) {
    events.push(buildBrowserOperatorHandoffEvent({
      handoff,
      sessionId: input.sessionId,
      currentUrl: scanUrl,
    }) as unknown as BrowserOperatorTrustEvent)
  }

  const deduped = dedupeTrustEvents(events)
  const blocked = deduped.some((event) => event.severity === 'block')
  return {
    state: blocked ? 'blocked' : deduped.length > 0 || handoff ? 'degraded' : 'protected',
    events: deduped,
    handoff,
    blocked,
  }
}

export function shouldBlockLowLevelAction(
  trustShield: BrowserOperatorTrustShieldContext,
  action: string,
): boolean {
  return trustShield.lowLevelActionPolicy === 'deny_by_default' && LOW_LEVEL_ACTIONS.has(action.toLowerCase())
}

export function isPrivateOrLocalUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true
  if (host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true
  if (/^10\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  const private172 = /^172\.(\d+)\./.exec(host)
  if (private172) {
    const second = Number(private172[1])
    return second >= 16 && second <= 31
  }
  if (/^169\.254\./.test(host)) return true
  return false
}

function dedupeTrustEvents(events: BrowserOperatorTrustEvent[]): BrowserOperatorTrustEvent[] {
  const seen = new Set<string>()
  const deduped: BrowserOperatorTrustEvent[] = []
  for (const event of events) {
    const key = `${event.event_type}:${event.severity}:${event.layer}:${event.content_hash}:${JSON.stringify(event.details)}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(event)
  }
  return deduped.slice(0, 20)
}

function extractHost(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).hostname
  } catch {
    return null
  }
}

function stringifyForScan(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function buildPreview(value: string, index: number, length: number): string {
  const start = Math.max(0, index - 80)
  const end = Math.min(value.length, index + length + 80)
  return value.slice(start, end).replace(/\s+/g, ' ').trim()
}

function redactCanaries(value: string, canaries: readonly { token: string }[]): string {
  let redacted = value
  for (const canary of canaries) {
    redacted = redacted.split(canary.token).join('[REDACTED_CANARY]')
  }
  return redacted
}

function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
