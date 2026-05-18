import type { AgentOpsWorkflowId } from './workflow-types'

export const AGENT_OPS_FAILURE_OWNERSHIP_KINDS = [
  'pre_existing_issue',
  'agent_mistake',
  'human_handoff',
  'infra_issue',
  'flaky_test',
  'product_bug',
] as const

export type AgentOpsFailureOwnershipKind = (typeof AGENT_OPS_FAILURE_OWNERSHIP_KINDS)[number]

export interface AgentOpsFailureOwnership {
  kind: AgentOpsFailureOwnershipKind
  label: string
  confidence: number | null
  reason: string | null
  owner: string | null
  requiresHuman: boolean
}

const ownershipKinds = new Set<string>(AGENT_OPS_FAILURE_OWNERSHIP_KINDS)
const ownershipWorkflowIds = new Set<AgentOpsWorkflowId>(['qa', 'ship', 'canary', 'retro'])

const ownershipLabels: Record<AgentOpsFailureOwnershipKind, string> = {
  pre_existing_issue: 'Pre-existing issue',
  agent_mistake: 'Agent mistake',
  human_handoff: 'Human handoff',
  infra_issue: 'Infrastructure issue',
  flaky_test: 'Flaky test',
  product_bug: 'Product bug',
}

export function isAgentOpsFailureOwnershipKind(value: unknown): value is AgentOpsFailureOwnershipKind {
  return typeof value === 'string' && ownershipKinds.has(value)
}

export function isAgentOpsFailureOwnershipWorkflow(workflowId: string | null | undefined): workflowId is AgentOpsWorkflowId {
  return Boolean(workflowId && ownershipWorkflowIds.has(workflowId as AgentOpsWorkflowId))
}

export function formatAgentOpsFailureOwnershipLabel(kind: AgentOpsFailureOwnershipKind): string {
  return ownershipLabels[kind]
}

export function normalizeAgentOpsFailureOwnership(value: unknown): AgentOpsFailureOwnership | null {
  const record = asRecord(value)
  const kind = normalizeOwnershipKind(record.kind ?? record.type ?? record.category)
  if (!kind) return null

  return {
    kind,
    label: getString(record.label) ?? formatAgentOpsFailureOwnershipLabel(kind),
    confidence: getConfidence(record.confidence),
    reason: getString(record.reason ?? record.rationale ?? record.body),
    owner: getString(record.owner ?? record.owner_team ?? record.ownerTeam),
    requiresHuman: getBoolean(record.requires_human ?? record.requiresHuman ?? record.human_handoff),
  }
}

export function readAgentOpsFailureOwnershipFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): AgentOpsFailureOwnership | null {
  return normalizeAgentOpsFailureOwnership(
    metadata?.failure_ownership
      ?? metadata?.failureOwnership
      ?? metadata?.ownership,
  )
}

export function serializeAgentOpsFailureOwnership(
  ownership: AgentOpsFailureOwnership,
): Record<string, unknown> {
  return {
    kind: ownership.kind,
    label: ownership.label,
    confidence: ownership.confidence,
    reason: ownership.reason,
    owner: ownership.owner,
    requires_human: ownership.requiresHuman,
  }
}

export function buildAgentOpsFailureOwnershipInstructions(workflowId: string | null | undefined): string | null {
  if (!isAgentOpsFailureOwnershipWorkflow(workflowId)) return null
  return [
    'For QA, Ship, Canary, and Retro findings, include metadata.failure_ownership whenever a failure, regression, release risk, or follow-up is reported.',
    `Use one kind from: ${AGENT_OPS_FAILURE_OWNERSHIP_KINDS.join(', ')}.`,
    'The object should include kind, confidence, reason, owner when known, and requires_human when a human follow-up is needed.',
  ].join(' ')
}

function normalizeOwnershipKind(value: unknown): AgentOpsFailureOwnershipKind | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return isAgentOpsFailureOwnershipKind(normalized) ? normalized : null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, 1_000) : null
}

function getBoolean(value: unknown): boolean {
  return value === true
}

function getConfidence(value: unknown): number | null {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return null
  return Math.max(0, Math.min(1, numberValue))
}
