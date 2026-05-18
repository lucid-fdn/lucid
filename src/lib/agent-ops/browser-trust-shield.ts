import crypto from 'node:crypto'
import { z } from 'zod'

import {
  buildTrustGuardCanary,
  checkCanaryLeaks,
  type TrustGuardCanary,
} from '@/lib/security/trust-guard'

export const AGENT_OPS_BROWSER_TRUST_EVENT_TYPES = [
  'canary_leak',
  'prompt_injection_pattern',
  'hidden_content',
  'low_level_action_blocked',
  'classifier_warning',
  'private_network_blocked',
  'handoff_required',
] as const

export type AgentOpsBrowserTrustEventType = (typeof AGENT_OPS_BROWSER_TRUST_EVENT_TYPES)[number]

export const AGENT_OPS_BROWSER_TRUST_EVENT_SEVERITIES = ['info', 'warn', 'block'] as const

export type AgentOpsBrowserTrustEventSeverity = (typeof AGENT_OPS_BROWSER_TRUST_EVENT_SEVERITIES)[number]

export const AGENT_OPS_BROWSER_TRUST_EVENT_LAYERS = [
  'browser_content',
  'browser_action',
  'browser_output',
  'classifier',
  'network',
] as const

export type AgentOpsBrowserTrustEventLayer = (typeof AGENT_OPS_BROWSER_TRUST_EVENT_LAYERS)[number]

const metadataSchema = z.record(z.string(), z.unknown())

export const browserTrustSecurityEventSchema = z.object({
  id: z.string().uuid().optional(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  opsRunId: z.string().uuid().nullable().optional(),
  browserSessionId: z.string().nullable().optional(),
  eventType: z.enum(AGENT_OPS_BROWSER_TRUST_EVENT_TYPES),
  severity: z.enum(AGENT_OPS_BROWSER_TRUST_EVENT_SEVERITIES),
  layer: z.enum(AGENT_OPS_BROWSER_TRUST_EVENT_LAYERS),
  host: z.string().nullable().optional(),
  urlHash: z.string().nullable().optional(),
  contentHash: z.string().nullable().optional(),
  details: metadataSchema.default({}),
  createdAt: z.string().optional(),
})

export type AgentOpsBrowserTrustSecurityEvent = z.infer<typeof browserTrustSecurityEventSchema>

export interface BrowserTrustShieldRuntimeContext {
  state: 'protected' | 'degraded' | 'blocked'
  schemaVersion: 1
  canaries: TrustGuardCanary[]
  deterministicPatterns: string[]
  lowLevelActionPolicy: 'deny_by_default'
  classifier: {
    enabled: boolean
    status: 'disabled' | 'available' | 'degraded'
  }
}

const DETERMINISTIC_PROMPT_INJECTION_PATTERNS = [
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

export function buildBrowserTrustShieldRuntimeContext(input: {
  orgId: string
  runId: string
  targetUrl?: string | null
  classifierEnabled?: boolean
}): BrowserTrustShieldRuntimeContext {
  const canary = buildTrustGuardCanary({
    orgId: input.orgId,
    scopeRef: input.targetUrl ?? input.runId,
    label: 'browser-trust-shield',
  })

  return {
    state: 'protected',
    schemaVersion: 1,
    canaries: [canary],
    deterministicPatterns: DETERMINISTIC_PROMPT_INJECTION_PATTERNS,
    lowLevelActionPolicy: 'deny_by_default',
    classifier: {
      enabled: input.classifierEnabled ?? false,
      status: input.classifierEnabled ? 'available' : 'disabled',
    },
  }
}

export function serializeBrowserTrustShieldForRuntime(
  context: BrowserTrustShieldRuntimeContext,
): Record<string, unknown> {
  return {
    state: context.state,
    schema_version: context.schemaVersion,
    canaries: context.canaries,
    deterministic_patterns: context.deterministicPatterns,
    low_level_action_policy: context.lowLevelActionPolicy,
    classifier: context.classifier,
  }
}

export function sanitizeBrowserTrustShieldForEvidence(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value)
  if (!record) return null
  const canaries = Array.isArray(record.canaries) ? record.canaries : []
  return {
    state: getString(record.state) ?? 'protected',
    schema_version: getNumber(record.schema_version) ?? 1,
    canaries: canaries.map((item) => {
      const canary = asRecord(item)
      return {
        token_hash: getString(canary?.tokenHash ?? canary?.token_hash),
        label: getString(canary?.label),
      }
    }).filter((item) => item.token_hash),
    low_level_action_policy: getString(record.low_level_action_policy) ?? 'deny_by_default',
    classifier: asRecord(record.classifier) ?? { enabled: false, status: 'disabled' },
  }
}

export function detectBrowserTrustEvents(input: {
  orgId: string
  projectId?: string | null
  opsRunId?: string | null
  browserSessionId?: string | null
  targetUrl?: string | null
  content: unknown
  canaries?: readonly TrustGuardCanary[]
  patterns?: readonly string[]
}): AgentOpsBrowserTrustSecurityEvent[] {
  const text = stringifyForScan(input.content)
  const host = extractHost(input.targetUrl)
  const urlHash = input.targetUrl ? hashValue(input.targetUrl) : null
  const contentHash = text ? hashValue(text.slice(0, 120_000)) : null
  const events: AgentOpsBrowserTrustSecurityEvent[] = []
  const canaries = input.canaries ?? []
  const canaryCheck = checkCanaryLeaks({
    content: text,
    canaries,
    sourceKind: 'agent_ops_api',
    sourceRef: input.opsRunId ?? input.browserSessionId ?? null,
  })

  for (const leak of canaryCheck.leaks) {
    events.push(baseEvent(input, {
      eventType: 'canary_leak',
      severity: 'block',
      layer: 'browser_output',
      host,
      urlHash,
      contentHash,
      details: {
        token_hash: leak.tokenHash,
        canary_label: leak.label,
        first_index: leak.firstIndex,
        context_preview: leak.contextPreview,
      },
    }))
  }

  const normalized = text.toLowerCase()
  for (const pattern of input.patterns ?? DETERMINISTIC_PROMPT_INJECTION_PATTERNS) {
    const normalizedPattern = pattern.toLowerCase()
    const index = normalized.indexOf(normalizedPattern)
    if (index === -1) continue
    events.push(baseEvent(input, {
      eventType: 'prompt_injection_pattern',
      severity: 'warn',
      layer: 'browser_content',
      host,
      urlHash,
      contentHash,
      details: {
        pattern: normalizedPattern,
        first_index: index,
        context_preview: redactCanaries(
          buildPreview(text, index, normalizedPattern.length),
          canaries,
        ),
      },
    }))
  }

  return dedupeEvents(events)
}

function baseEvent(
  input: Pick<AgentOpsBrowserTrustSecurityEvent, 'orgId' | 'projectId' | 'opsRunId' | 'browserSessionId'>,
  event: Omit<AgentOpsBrowserTrustSecurityEvent, 'orgId' | 'projectId' | 'opsRunId' | 'browserSessionId'>,
): AgentOpsBrowserTrustSecurityEvent {
  return {
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    opsRunId: input.opsRunId ?? null,
    browserSessionId: input.browserSessionId ?? null,
    ...event,
  }
}

function dedupeEvents(events: AgentOpsBrowserTrustSecurityEvent[]): AgentOpsBrowserTrustSecurityEvent[] {
  const seen = new Set<string>()
  const deduped: AgentOpsBrowserTrustSecurityEvent[] = []
  for (const event of events) {
    const key = `${event.eventType}:${event.severity}:${event.layer}:${event.contentHash}:${JSON.stringify(event.details)}`
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

function redactCanaries(value: string, canaries: readonly TrustGuardCanary[]): string {
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

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
