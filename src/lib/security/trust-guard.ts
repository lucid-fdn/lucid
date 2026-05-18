import crypto from 'node:crypto'

import type { UntrustedContentKind } from './untrusted-content'

export type TrustGuardSourceKind =
  | UntrustedContentKind
  | 'project_learning'
  | 'agent_ops_api'
  | 'canary_leak'
  | 'model_classifier'

export type TrustGuardSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export interface TrustGuardSecurityAttemptInput {
  orgId: string
  projectId?: string | null
  assistantId?: string | null
  opsRunId?: string | null
  sourceKind: TrustGuardSourceKind
  sourceRef?: string | null
  severity: TrustGuardSeverity
  title: string
  body: string
  metadata?: Record<string, unknown>
}

export interface TrustGuardCanary {
  token: string
  tokenHash: string
  label: string
}

export interface TrustGuardCanaryLeak {
  label: string
  tokenHash: string
  firstIndex: number
  contextPreview: string
}

export interface TrustGuardCanaryLeakCheck {
  leaked: boolean
  sourceKind: TrustGuardSourceKind
  sourceRef: string | null
  scannedChars: number
  truncated: boolean
  leaks: TrustGuardCanaryLeak[]
}

export interface TrustGuardModelClassifier {
  classify(input: {
    sourceKind: TrustGuardSourceKind
    sourceRef?: string | null
    content: string
    metadata?: Record<string, unknown>
  }): Promise<{
    severity: TrustGuardSeverity
    title: string
    summary: string
    confidence?: number
    metadata?: Record<string, unknown>
  }>
}

export type TrustGuardModelClassifierStatus = 'disabled' | 'skipped' | 'completed' | 'error'

export interface TrustGuardModelClassifierResult {
  status: TrustGuardModelClassifierStatus
  shouldBlock: false
  severity: TrustGuardSeverity
  title: string
  summary: string
  confidence: number | null
  metadata: Record<string, unknown>
}

const DEFAULT_CANARY_SCAN_MAX_CHARS = 120_000
const DEFAULT_CLASSIFIER_MAX_CHARS = 24_000

export function buildTrustGuardCanary(input: {
  orgId: string
  scopeRef?: string | null
  label?: string
  nonce?: string
}): TrustGuardCanary {
  const label = normalizeCanaryLabel(input.label)
  const nonce = input.nonce ?? crypto.randomUUID()
  const tokenHash = hashValue(`${input.orgId}|${input.scopeRef ?? ''}|${label}|${nonce}`)
  return {
    token: `lucid_canary_${tokenHash.slice(0, 32)}`,
    tokenHash,
    label,
  }
}

export function normalizeTrustGuardCanaries(value: unknown): TrustGuardCanary[] {
  const items = Array.isArray(value) ? value : value ? [value] : []
  const canaries: TrustGuardCanary[] = []

  for (const item of items) {
    if (typeof item === 'string') {
      const token = item.trim()
      if (token) canaries.push({ token, tokenHash: hashValue(token), label: 'agent-ops-canary' })
      continue
    }

    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const token = typeof record.token === 'string' ? record.token.trim() : ''
    if (!token) continue
    const label = typeof record.label === 'string' ? normalizeCanaryLabel(record.label) : 'agent-ops-canary'
    const tokenHash = typeof record.tokenHash === 'string' && record.tokenHash.length >= 16
      ? record.tokenHash
      : hashValue(token)
    canaries.push({ token, tokenHash, label })
  }

  return dedupeCanaries(canaries)
}

export function checkCanaryLeaks(input: {
  content: unknown
  canaries: readonly TrustGuardCanary[]
  sourceKind: TrustGuardSourceKind
  sourceRef?: string | null
  maxChars?: number
}): TrustGuardCanaryLeakCheck {
  const raw = stringifyForScan(input.content)
  const maxChars = Math.min(Math.max(input.maxChars ?? DEFAULT_CANARY_SCAN_MAX_CHARS, 1), 500_000)
  const scanned = raw.slice(0, maxChars)
  const leaks: TrustGuardCanaryLeak[] = []

  for (const canary of input.canaries) {
    const firstIndex = scanned.indexOf(canary.token)
    if (firstIndex === -1) continue
    leaks.push({
      label: canary.label,
      tokenHash: canary.tokenHash,
      firstIndex,
      contextPreview: buildLeakPreview(scanned, firstIndex, canary.token.length),
    })
  }

  return {
    leaked: leaks.length > 0,
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef ?? null,
    scannedChars: scanned.length,
    truncated: raw.length > scanned.length,
    leaks,
  }
}

export function buildCanaryLeakSecurityAttempts(input: {
  orgId: string
  projectId?: string | null
  assistantId?: string | null
  opsRunId?: string | null
  check: TrustGuardCanaryLeakCheck
  metadata?: Record<string, unknown>
}): TrustGuardSecurityAttemptInput[] {
  if (!input.check.leaked) return []

  return input.check.leaks.map((leak) => ({
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    assistantId: input.assistantId ?? null,
    opsRunId: input.opsRunId ?? null,
    sourceKind: 'canary_leak',
    sourceRef: input.check.sourceRef,
    severity: 'critical',
    title: 'Trust canary leaked in model/tool output',
    body: `A high-risk Agent Ops step output included the trust canary "${leak.label}". Treat the surrounding browser/tool content as potentially hostile or over-followed.`,
    metadata: {
      ...input.metadata,
      original_source_kind: input.check.sourceKind,
      token_hash: leak.tokenHash,
      canary_label: leak.label,
      first_index: leak.firstIndex,
      context_preview: leak.contextPreview,
      scanned_chars: input.check.scannedChars,
      truncated: input.check.truncated,
    },
  }))
}

export function isTrustGuardModelClassifierEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.FEATURE_AGENT_OPS_TRUST_MODEL_CLASSIFIER === 'true'
}

export async function runOptionalTrustGuardModelClassifier(input: {
  sourceKind: TrustGuardSourceKind
  sourceRef?: string | null
  content: unknown
  metadata?: Record<string, unknown>
  classifier?: TrustGuardModelClassifier | null
  enabled?: boolean
  maxChars?: number
}): Promise<TrustGuardModelClassifierResult> {
  const enabled = input.enabled ?? isTrustGuardModelClassifierEnabled()
  if (!enabled) {
    return classifierResult('disabled', 'info', 'Trust classifier disabled', 'Model-based trust classification is disabled by feature flag.', null)
  }
  if (!input.classifier) {
    return classifierResult('skipped', 'info', 'Trust classifier unavailable', 'Model-based trust classification was enabled but no classifier adapter was provided.', null)
  }

  const content = stringifyForScan(input.content).slice(0, input.maxChars ?? DEFAULT_CLASSIFIER_MAX_CHARS)
  try {
    const result = await input.classifier.classify({
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef ?? null,
      content,
      metadata: input.metadata,
    })
    return {
      status: 'completed',
      shouldBlock: false,
      severity: result.severity,
      title: result.title,
      summary: result.summary,
      confidence: typeof result.confidence === 'number' ? result.confidence : null,
      metadata: result.metadata ?? {},
    }
  } catch (error) {
    return classifierResult(
      'error',
      'info',
      'Trust classifier failed open',
      error instanceof Error ? error.message : 'Unknown classifier error',
      null,
      { failed_open: true },
    )
  }
}

export function buildModelClassifierSecurityAttempt(input: {
  orgId: string
  projectId?: string | null
  assistantId?: string | null
  opsRunId?: string | null
  sourceRef?: string | null
  result: TrustGuardModelClassifierResult
  metadata?: Record<string, unknown>
}): TrustGuardSecurityAttemptInput | null {
  if (input.result.status === 'disabled' || input.result.status === 'skipped') return null
  if (input.result.status === 'completed' && input.result.severity !== 'high' && input.result.severity !== 'critical') return null

  return {
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    assistantId: input.assistantId ?? null,
    opsRunId: input.opsRunId ?? null,
    sourceKind: 'model_classifier',
    sourceRef: input.sourceRef ?? null,
    severity: input.result.status === 'error' ? 'info' : input.result.severity,
    title: input.result.title,
    body: input.result.summary,
    metadata: {
      ...input.metadata,
      classifier_status: input.result.status,
      classifier_confidence: input.result.confidence,
      ...input.result.metadata,
    },
  }
}

function classifierResult(
  status: TrustGuardModelClassifierStatus,
  severity: TrustGuardSeverity,
  title: string,
  summary: string,
  confidence: number | null,
  metadata: Record<string, unknown> = {},
): TrustGuardModelClassifierResult {
  return { status, shouldBlock: false, severity, title, summary, confidence, metadata }
}

function normalizeCanaryLabel(value: string | undefined): string {
  const normalized = (value ?? 'agent-ops-canary')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return normalized || 'agent-ops-canary'
}

function dedupeCanaries(canaries: TrustGuardCanary[]): TrustGuardCanary[] {
  const seen = new Set<string>()
  const deduped: TrustGuardCanary[] = []
  for (const canary of canaries) {
    if (seen.has(canary.token)) continue
    seen.add(canary.token)
    deduped.push(canary)
  }
  return deduped
}

function stringifyForScan(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function buildLeakPreview(content: string, firstIndex: number, tokenLength: number): string {
  const start = Math.max(0, firstIndex - 80)
  const end = Math.min(content.length, firstIndex + tokenLength + 80)
  return `${content.slice(start, firstIndex)}[REDACTED_CANARY]${content.slice(firstIndex + tokenLength, end)}`
}

function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}
