import crypto from 'node:crypto'

import type { AgentOpsEvidenceType, AgentOpsScope } from './workflow-types'

export const BROWSER_QA_EVIDENCE_TYPES = [
  'screenshot',
  'console_log',
  'network_log',
  'perf_metric',
] as const satisfies readonly AgentOpsEvidenceType[]

const browserQaEvidenceTypes = new Set<AgentOpsEvidenceType>(BROWSER_QA_EVIDENCE_TYPES)

export interface BrowserQaTargetContext {
  runId: string
  input?: Record<string, unknown> | null
  scope?: Pick<AgentOpsScope, 'ref'> | Record<string, unknown> | null
  evidence?: {
    uri?: string | null
    content?: Record<string, unknown> | null
  } | null
}

export function isBrowserQaEvidenceType(type: AgentOpsEvidenceType): boolean {
  return browserQaEvidenceTypes.has(type)
}

export function resolveBrowserQaTargetUrl(context: BrowserQaTargetContext): string | null {
  const candidates = [
    context.evidence?.uri,
    getString(context.evidence?.content?.url),
    getString(context.evidence?.content?.target_url),
    getString(context.evidence?.content?.targetUrl),
    getString(context.input?.target),
    getString(context.input?.deployUrl),
    getString(context.input?.deploy_url),
    getString(context.scope?.ref),
  ]

  for (const candidate of candidates) {
    const normalized = normalizeHttpUrl(candidate)
    if (normalized) return normalized
  }
  return null
}

export function buildBrowserQaSessionKey(input: {
  runId: string
  targetUrl: string
}): string {
  return crypto
    .createHash('sha256')
    .update(`${input.runId}|${input.targetUrl}`)
    .digest('hex')
}

export function normalizeBrowserQaArtifactContent(input: {
  runId: string
  targetUrl: string
  content?: Record<string, unknown> | null
  capturedAt?: string
}): Record<string, unknown> {
  return {
    ...(input.content ?? {}),
    browser_qa: {
      schema_version: 1,
      session_key: buildBrowserQaSessionKey(input),
      target_url: input.targetUrl,
      captured_at: input.capturedAt ?? new Date().toISOString(),
    },
  }
}

function normalizeHttpUrl(value: unknown): string | null {
  const raw = getString(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
