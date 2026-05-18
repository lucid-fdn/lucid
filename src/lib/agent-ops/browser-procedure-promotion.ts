import {
  normalizeBrowserHostPattern,
  normalizeBrowserProcedureSlug,
  type AgentOpsBrowserProcedureRiskLevel,
} from './browser-procedures'
import type {
  AgentOpsArtifact,
  AgentOpsBrowserQaSession,
  AgentOpsRun,
} from './workflow-types'

const BROWSER_EVIDENCE_TYPES = new Set(['screenshot', 'console_log', 'network_log', 'perf_metric'])

export interface BrowserProcedurePromotionCandidate {
  run: AgentOpsRun
  artifacts: AgentOpsArtifact[]
  browserQaSessions: AgentOpsBrowserQaSession[]
}

export interface BrowserProcedurePromotionPlan {
  hostPattern: string
  name: string
  slug: string
  description: string
  intentTriggers: string[]
  procedureType: 'read_only' | 'mutating' | 'monitoring' | 'qa' | 'design' | 'devex'
  riskLevel: AgentOpsBrowserProcedureRiskLevel
  fixtureArtifactId: string | null
  definition: Record<string, unknown>
  testDefinition: Record<string, unknown>
  approvalPolicy: Record<string, unknown>
  metadata: Record<string, unknown>
}

export function buildBrowserProcedurePromotionPlan(
  input: BrowserProcedurePromotionCandidate,
): BrowserProcedurePromotionPlan | null {
  const browserArtifacts = input.artifacts.filter(isBrowserEvidenceArtifact)
  const targetUrl = resolvePromotionTargetUrl(input.run, input.browserQaSessions, browserArtifacts)
  if (!targetUrl || (browserArtifacts.length === 0 && input.browserQaSessions.length === 0)) {
    return null
  }

  const targetHost = normalizeBrowserHostPattern(targetUrl)
  const workflowLabel = formatLabel(input.run.workflowId)
  const scopeLabel = input.run.scope.label ?? input.run.scope.ref ?? targetHost
  const fixtureArtifact = browserArtifacts.find((artifact) => artifact.type === 'screenshot') ?? browserArtifacts[0] ?? null
  const actionTrace = extractBrowserActionTrace(browserArtifacts)
  const evidenceSummary = browserArtifacts.slice(0, 20).map((artifact) => ({
    id: artifact.id,
    type: artifact.type,
    title: artifact.title,
    summary: artifact.summary ?? null,
    uri: artifact.uri ?? null,
    checksum: artifact.checksum ?? null,
    created_at: artifact.createdAt,
  }))

  const definition = {
    schema_version: 1,
    kind: 'browser_operator_plan',
    source: 'agent_ops_run_promotion',
    source_run_id: input.run.id,
    workflow_id: input.run.workflowId,
    target: {
      url: targetUrl,
      host: targetHost,
      scope: input.run.scope,
    },
    mode: actionTrace.length > 0 ? 'replay_guided' : 'observe_guided',
    steps: actionTrace.length > 0
      ? actionTrace
      : buildFallbackBrowserSteps(input.run, targetUrl, browserArtifacts),
    evidence_artifacts: evidenceSummary,
  }

  const outputKeys = input.run.output ? Object.keys(input.run.output).sort() : []
  const testDefinition = {
    schema_version: 1,
    assertions: [
      {
        id: 'target-loads',
        kind: 'browser_state',
        description: `Browser Operator can load ${targetHost} and return evidence.`,
        required: true,
      },
      ...outputKeys.slice(0, 8).map((key) => ({
        id: `output-${normalizeBrowserProcedureSlug(key)}`,
        kind: 'output_shape',
        path: key,
        description: `Output preserves ${key}.`,
        required: false,
      })),
    ],
    fixture: {
      artifact_id: fixtureArtifact?.id ?? null,
      artifact_type: fixtureArtifact?.type ?? null,
      target_url: targetUrl,
      captured_artifact_count: browserArtifacts.length,
    },
  }

  const riskLevel = inferPromotionRiskLevel(input.run, browserArtifacts)
  return {
    hostPattern: targetHost,
    name: `${workflowLabel}: ${scopeLabel}`.slice(0, 160),
    slug: normalizeBrowserProcedureSlug(`${input.run.workflowId}-${targetHost}-${input.run.id.slice(0, 8)}`),
    description: `Quarantined Browser Operator procedure promoted from Agent Ops run ${input.run.id}. Review fixtures, assertions, and trust state before activation.`,
    intentTriggers: buildIntentTriggers(input.run, targetHost),
    procedureType: inferProcedureType(input.run),
    riskLevel,
    fixtureArtifactId: fixtureArtifact?.id ?? null,
    definition,
    testDefinition,
    approvalPolicy: {
      requires_operator_review: true,
      default_trust_state: 'quarantined',
      reason: 'Promoted procedures are not executable until reviewed and activated.',
      risk_level: riskLevel,
    },
    metadata: {
      promoted_from_run_id: input.run.id,
      promoted_from_workflow_id: input.run.workflowId,
      promoted_target_url: targetUrl,
      promoted_target_host: targetHost,
      browser_artifact_count: browserArtifacts.length,
      browser_session_count: input.browserQaSessions.length,
      fixture_artifact_id: fixtureArtifact?.id ?? null,
    },
  }
}

function resolvePromotionTargetUrl(
  run: AgentOpsRun,
  sessions: readonly AgentOpsBrowserQaSession[],
  artifacts: readonly AgentOpsArtifact[],
): string | null {
  for (const candidate of [
    sessions[0]?.targetUrl,
    readString(run.input.target),
    readString(run.input.url),
    readString(run.input.deployUrl),
    readString(run.input.deploy_url),
    run.scope.ref,
    ...artifacts.flatMap((artifact) => [
      artifact.uri,
      readString(artifact.content.url),
      readString(artifact.content.target_url),
      readString(artifact.content.targetUrl),
      readString(readRecord(artifact.content.browser_qa)?.target_url),
    ]),
  ]) {
    const normalized = normalizeHttpUrl(candidate)
    if (normalized) return normalized
  }
  return null
}

function isBrowserEvidenceArtifact(artifact: AgentOpsArtifact): boolean {
  return BROWSER_EVIDENCE_TYPES.has(artifact.type)
    || Boolean(readRecord(artifact.content.browser_qa))
}

function extractBrowserActionTrace(artifacts: readonly AgentOpsArtifact[]): Array<Record<string, unknown>> {
  const steps: Array<Record<string, unknown>> = []
  for (const artifact of artifacts) {
    const content = artifact.content
    const candidates = [
      content.steps,
      content.actions,
      content.action_trace,
      readRecord(content.browser_qa)?.steps,
      readRecord(content.browser_qa)?.actions,
    ]
    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) continue
      for (const item of candidate) {
        if (item && typeof item === 'object') {
          steps.push(sanitizeStep(item as Record<string, unknown>))
        }
      }
    }
  }
  return steps.slice(0, 50)
}

function buildFallbackBrowserSteps(
  run: AgentOpsRun,
  targetUrl: string,
  artifacts: readonly AgentOpsArtifact[],
): Array<Record<string, unknown>> {
  return [
    {
      id: 'open-target',
      action: 'open',
      target_url: targetUrl,
    },
    {
      id: 'observe-page',
      action: 'observe',
      collect: artifacts.length > 0
        ? Array.from(new Set(artifacts.map((artifact) => artifact.type))).sort()
        : ['screenshot', 'console_log', 'network_log'],
    },
    {
      id: 'summarize-standard-output',
      action: 'summarize',
      workflow_id: run.workflowId,
      output_sections: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
    },
  ]
}

function sanitizeStep(step: Record<string, unknown>): Record<string, unknown> {
  const allowed: Record<string, unknown> = {}
  for (const key of ['id', 'action', 'selector', 'text', 'url', 'target_url', 'expect', 'assertion', 'metadata']) {
    const value = step[key]
    if (
      typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
      || Array.isArray(value)
      || (value && typeof value === 'object')
    ) {
      allowed[key] = value
    }
  }
  return allowed
}

function inferProcedureType(run: AgentOpsRun): BrowserProcedurePromotionPlan['procedureType'] {
  if (run.workflowId === 'monitor-page') return 'monitoring'
  if (run.workflowId === 'design-review') return 'design'
  if (run.workflowId === 'update-portal') return 'mutating'
  if (run.workflowId === 'extract-data' || run.workflowId === 'research-site') return 'read_only'
  return 'qa'
}

function inferPromotionRiskLevel(
  run: AgentOpsRun,
  artifacts: readonly AgentOpsArtifact[],
): AgentOpsBrowserProcedureRiskLevel {
  if (run.workflowId === 'update-portal') return 'high'
  if (artifacts.some((artifact) => {
    const body = `${artifact.title} ${artifact.summary ?? ''}`.toLowerCase()
    return body.includes('payment') || body.includes('delete') || body.includes('submit')
  })) {
    return 'high'
  }
  return run.workflowId === 'monitor-page' ? 'low' : 'medium'
}

function buildIntentTriggers(run: AgentOpsRun, targetHost: string): string[] {
  const base = [
    run.workflowId,
    formatLabel(run.workflowId),
    `${run.workflowId} ${targetHost}`,
  ]
  const scopeRef = run.scope.ref ?? run.scope.label
  if (scopeRef) base.push(`${run.workflowId} ${scopeRef}`)
  return Array.from(new Set(base.map((item) => item.toLowerCase()).filter(Boolean))).slice(0, 8)
}

function normalizeHttpUrl(value: unknown): string | null {
  const raw = readString(value)
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

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
