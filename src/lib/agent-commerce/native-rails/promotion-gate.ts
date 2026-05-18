import type {
  AgentCommerceNativeRailAdapter,
  AgentCommerceNativeRailId,
  AgentCommerceNativeRailManifest,
  AgentCommerceNativeRailPromotionBlocker,
  AgentCommerceNativeRailPromotionEvidence,
} from './types'
import { getAgentCommerceNativeRailAdapter } from './registry'

export interface AgentCommerceNativeRailPromotionInput {
  railId: AgentCommerceNativeRailId
  target: 'sandbox' | 'staging' | 'live'
  manifest?: AgentCommerceNativeRailManifest
  adapter?: AgentCommerceNativeRailAdapter | null
  env?: Record<string, string | undefined>
  credentialRefs?: Record<string, string | undefined>
  evidence?: AgentCommerceNativeRailPromotionEvidence[]
}

export interface AgentCommerceNativeRailPromotionResult {
  railId: AgentCommerceNativeRailId
  target: AgentCommerceNativeRailPromotionInput['target']
  ready: boolean
  blockers: AgentCommerceNativeRailPromotionBlocker[]
  missingEvidence: AgentCommerceNativeRailPromotionEvidence[]
  missingEnv: string[]
  missingCredentialRefs: string[]
  manifest: AgentCommerceNativeRailManifest | null
}

const BASE_STAGING_EVIDENCE: readonly AgentCommerceNativeRailPromotionEvidence[] = [
  'sandbox_flow_verified',
  'fail_closed_paths_verified',
  'source_terms_reviewed',
]

const LIVE_EVIDENCE: readonly AgentCommerceNativeRailPromotionEvidence[] = [
  ...BASE_STAGING_EVIDENCE,
  'provider_credentials_configured',
  'merchant_flow_verified',
  'approval_boundary_verified',
  'idempotency_guard_verified',
  'receipt_parser_verified',
  'reconciliation_mapping_verified',
  'webhook_or_polling_verified',
]

export function requiredNativeRailPromotionEvidence(
  target: AgentCommerceNativeRailPromotionInput['target'],
): AgentCommerceNativeRailPromotionEvidence[] {
  if (target === 'sandbox') return ['fail_closed_paths_verified']
  if (target === 'staging') return [...BASE_STAGING_EVIDENCE]
  return [...LIVE_EVIDENCE]
}

export function evaluateAgentCommerceNativeRailPromotion(
  input: AgentCommerceNativeRailPromotionInput,
): AgentCommerceNativeRailPromotionResult {
  const adapter = input.adapter ?? getAgentCommerceNativeRailAdapter(input.railId)
  const manifest = input.manifest ?? adapter?.manifest ?? null
  const suppliedEvidence = new Set(input.evidence ?? [])
  const requiredEvidence = requiredNativeRailPromotionEvidence(input.target)
  const missingEvidence = requiredEvidence.filter((item) => !suppliedEvidence.has(item))
  const missingEnv = manifest ? missingKeys(manifest.requiredEnv, input.env ?? process.env) : []
  const missingCredentialRefs = manifest ? missingKeys(manifest.requiredCredentialRefs, input.credentialRefs ?? {}) : []
  const blockers: AgentCommerceNativeRailPromotionBlocker[] = []

  if (!adapter) blockers.push('adapter_missing')
  if (!manifest || manifest.status === 'requested' || manifest.status === 'research' || manifest.status === 'blocked' || manifest.status === 'deprecated') {
    blockers.push('rail_not_live_candidate')
  }
  if (input.target === 'live' && missingEnv.length > 0) blockers.push('provider_credentials_missing')
  if (input.target === 'live' && missingCredentialRefs.length > 0) blockers.push('provider_credentials_missing')
  if (hasMissing(missingEvidence, ['sandbox_flow_verified'])) blockers.push('sandbox_evidence_missing')
  if (hasMissing(missingEvidence, ['merchant_flow_verified'])) blockers.push('merchant_flow_evidence_missing')
  if (hasMissing(missingEvidence, ['approval_boundary_verified'])) blockers.push('approval_evidence_missing')
  if (hasMissing(missingEvidence, ['idempotency_guard_verified'])) blockers.push('idempotency_evidence_missing')
  if (hasMissing(missingEvidence, ['receipt_parser_verified'])) blockers.push('receipt_evidence_missing')
  if (hasMissing(missingEvidence, ['reconciliation_mapping_verified', 'webhook_or_polling_verified'])) {
    blockers.push('reconciliation_evidence_missing')
  }
  if (hasMissing(missingEvidence, ['fail_closed_paths_verified'])) blockers.push('fail_closed_evidence_missing')
  if (hasMissing(missingEvidence, ['source_terms_reviewed'])) blockers.push('source_review_missing')

  return {
    railId: input.railId,
    target: input.target,
    ready: blockers.length === 0,
    blockers: unique(blockers),
    missingEvidence,
    missingEnv,
    missingCredentialRefs,
    manifest,
  }
}

function missingKeys(
  keys: readonly string[],
  values: Record<string, string | undefined>,
): string[] {
  return keys.filter((key) => !values[key]?.trim())
}

function hasMissing(
  missing: AgentCommerceNativeRailPromotionEvidence[],
  group: readonly AgentCommerceNativeRailPromotionEvidence[],
): boolean {
  return group.some((item) => missing.includes(item))
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}
