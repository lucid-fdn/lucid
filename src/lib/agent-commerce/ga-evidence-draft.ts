import {
  AGENT_COMMERCE_GA_EVIDENCE_GATES,
  type AgentCommerceGaEvidenceGateId,
  type AgentCommerceGaEvidenceInput,
} from './ga-readiness'
import type {
  AgentCommerceStagingReconciliationEvidenceSummary,
} from './staging-reconciliation-evidence'
import type {
  AgentCommerceSecurityReviewEvidenceSummary,
} from './security-review-evidence'
import type {
  AgentCommerceProviderPromotionEvidenceSummary,
} from './provider-promotion'

export interface AgentCommerceGaExternalEvidenceRefs {
  reconciliationHistoryUrl?: string
  staleApprovalReconciliationUrl?: string
  stuckCredentialReconciliationUrl?: string
  providerMismatchTriageUrl?: string
  incidentStatusUrl?: string
  securityReviewUrl?: string
  securityFindingsDispositionUrl?: string
  zeroOpenSecurityFindingsUrl?: string
}

export interface AgentCommerceGaEvidenceDraftInput {
  environment?: AgentCommerceGaEvidenceInput['environment']
  release: string
  includeLocalEvidence?: boolean
  externalRefs?: AgentCommerceGaExternalEvidenceRefs
  stagingReconciliation?: AgentCommerceStagingReconciliationEvidenceSummary
  securityReview?: AgentCommerceSecurityReviewEvidenceSummary
  providerPromotions?: AgentCommerceProviderPromotionEvidenceSummary[]
  links?: Record<string, string>
}

function gate(id: AgentCommerceGaEvidenceGateId) {
  const found = AGENT_COMMERCE_GA_EVIDENCE_GATES.find((item) => item.id === id)
  if (!found) throw new Error(`Unknown Agent Commerce GA evidence gate: ${id}`)
  return found
}

function includeGate(
  target: AgentCommerceGaEvidenceInput,
  id: AgentCommerceGaEvidenceGateId,
  includeEvidence: boolean,
  includeCommands: boolean,
): void {
  const item = gate(id)
  if (includeEvidence) target.evidence[id] = [...item.requiredEvidence]
  if (includeCommands) target.commandResults[id] = [...item.requiredCommands]
}

function isUrl(value: string | undefined): value is string {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function addLink(links: Record<string, string>, key: string, value: string | undefined): void {
  if (isUrl(value)) links[key] = value
}

export function collectAgentCommerceGaEvidenceDraft(
  input: AgentCommerceGaEvidenceDraftInput,
): AgentCommerceGaEvidenceInput {
  const draft: AgentCommerceGaEvidenceInput = {
    environment: input.environment ?? 'staging',
    release: input.release,
    evidence: {},
    commandResults: {},
    providerPromotions: input.providerPromotions ?? [],
    links: { ...(input.links ?? {}) },
  }

  if (input.includeLocalEvidence) {
    includeGate(draft, 'manual_agent_platform_live_rail', true, true)
    includeGate(draft, 'manual_seller_live_rail', true, true)
    includeGate(draft, 'production_dashboard_operational', true, true)
    includeGate(draft, 'lucid_l2_p0_execution_blocked', true, true)
    includeGate(draft, 'staging_reconciliation_beta_window', false, true)
    includeGate(draft, 'external_security_review', false, true)
  }

  if (input.stagingReconciliation) {
    draft.evidence.staging_reconciliation_beta_window = [
      ...input.stagingReconciliation.evidence,
    ]
  }

  if (input.securityReview) {
    draft.evidence.external_security_review = [
      ...input.securityReview.evidence,
    ]
    addLink(draft.links ?? {}, 'security_reviewer_identity', input.securityReview.links.reviewer_identity)
    addLink(draft.links ?? {}, 'security_review_scope', input.securityReview.links.review_scope)
    addLink(draft.links ?? {}, 'security_findings_disposition', input.securityReview.links.findings_disposition)
    addLink(draft.links ?? {}, 'zero_open_security_findings', input.securityReview.links.zero_open_p0_p1_findings)
  }

  for (const promotion of input.providerPromotions ?? []) {
    addLink(draft.links ?? {}, `provider_promotion_${promotion.provider}`, promotion.links.release || promotion.links.account_access)
  }

  const refs = input.externalRefs ?? {}
  const stagingRefs = [
    refs.reconciliationHistoryUrl,
    refs.staleApprovalReconciliationUrl,
    refs.stuckCredentialReconciliationUrl,
    refs.providerMismatchTriageUrl,
    refs.incidentStatusUrl,
  ]
  if (stagingRefs.every(isUrl)) {
    draft.evidence.staging_reconciliation_beta_window = [
      ...gate('staging_reconciliation_beta_window').requiredEvidence,
    ]
  }

  const securityRefs = [
    refs.securityReviewUrl,
    refs.securityFindingsDispositionUrl,
    refs.zeroOpenSecurityFindingsUrl,
  ]
  if (securityRefs.every(isUrl)) {
    draft.evidence.external_security_review = [
      ...gate('external_security_review').requiredEvidence,
    ]
  }

  addLink(draft.links ?? {}, 'reconciliation_job_history', refs.reconciliationHistoryUrl)
  addLink(draft.links ?? {}, 'stale_approval_reconciliation', refs.staleApprovalReconciliationUrl)
  addLink(draft.links ?? {}, 'stuck_credential_reconciliation', refs.stuckCredentialReconciliationUrl)
  addLink(draft.links ?? {}, 'provider_mismatch_triage', refs.providerMismatchTriageUrl)
  addLink(draft.links ?? {}, 'commerce_incident_status', refs.incidentStatusUrl)
  addLink(draft.links ?? {}, 'security_review', refs.securityReviewUrl)
  addLink(draft.links ?? {}, 'security_findings_disposition', refs.securityFindingsDispositionUrl)
  addLink(draft.links ?? {}, 'zero_open_security_findings', refs.zeroOpenSecurityFindingsUrl)

  return draft
}
