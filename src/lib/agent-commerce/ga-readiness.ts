import type {
  AgentCommerceProviderPromotionEvidenceSummary,
} from './provider-promotion'

export type AgentCommerceGaEvidenceGateId =
  | 'manual_agent_platform_live_rail'
  | 'manual_seller_live_rail'
  | 'staging_reconciliation_beta_window'
  | 'production_dashboard_operational'
  | 'lucid_l2_p0_execution_blocked'
  | 'external_security_review'

export interface AgentCommerceGaEvidenceGate {
  id: AgentCommerceGaEvidenceGateId
  label: string
  category: 'local' | 'staging' | 'security'
  requiredEvidence: string[]
  requiredCommands: string[]
}

export interface AgentCommerceGaEvidenceInput {
  environment: 'staging' | 'production'
  release: string
  evidence: Partial<Record<AgentCommerceGaEvidenceGateId, string[]>>
  commandResults: Partial<Record<AgentCommerceGaEvidenceGateId, string[]>>
  providerPromotions?: AgentCommerceProviderPromotionEvidenceSummary[]
  links?: Record<string, string>
}

export interface AgentCommerceGaEvidenceResult {
  id: AgentCommerceGaEvidenceGateId
  label: string
  category: AgentCommerceGaEvidenceGate['category']
  ready: boolean
  missingEvidence: string[]
  missingCommands: string[]
}

export interface AgentCommerceGaEvidenceReport {
  ready: boolean
  release: string
  environment: AgentCommerceGaEvidenceInput['environment']
  results: AgentCommerceGaEvidenceResult[]
  providerPromotions: AgentCommerceProviderPromotionEvidenceSummary[]
}

export const AGENT_COMMERCE_GA_EVIDENCE_GATES: readonly AgentCommerceGaEvidenceGate[] = [
  {
    id: 'manual_agent_platform_live_rail',
    label: 'Manual provider is a live agent-platform rail behind a provider adapter.',
    category: 'local',
    requiredEvidence: [
      'rail_readiness_has_live_agent_platform_rail',
      'manual_provider_durable_spend_flow',
      'runtime_tools_internal_api_only',
    ],
    requiredCommands: [
      'npm run agent-commerce:rail-readiness',
      'npm run test -- src/lib/agent-commerce',
    ],
  },
  {
    id: 'manual_seller_live_rail',
    label: 'Manual provider is a live seller rail behind a provider adapter.',
    category: 'local',
    requiredEvidence: [
      'rail_readiness_has_live_seller_rail',
      'manual_seller_grant_entitlement_flow',
      'refund_reversal_flow_exists',
    ],
    requiredCommands: [
      'npm run agent-commerce:rail-readiness',
      'npm run test -- src/lib/agent-commerce',
    ],
  },
  {
    id: 'staging_reconciliation_beta_window',
    label: 'Agent Commerce reconciliation has run in staging for a beta window.',
    category: 'staging',
    requiredEvidence: [
      'seven_day_reconciliation_job_history',
      'stale_approval_reconciliation_log',
      'stuck_credential_reconciliation_log',
      'provider_mismatch_triage_log',
      'zero_untriaged_p0_p1_commerce_incidents',
    ],
    requiredCommands: [
      'npm run agent-commerce:staging-reconciliation-evidence',
      'npm run agent-commerce:dashboard',
      'npm run test -- src/lib/agent-commerce',
    ],
  },
  {
    id: 'production_dashboard_operational',
    label: 'Mission Control Commerce exposes production spend, revenue, failure, replay, and provider health metrics.',
    category: 'local',
    requiredEvidence: [
      'production_summary_visible',
      'spend_revenue_failure_replay_provider_metrics_visible',
      'provider_health_controls_visible',
    ],
    requiredCommands: [
      'npm run agent-commerce:dashboard',
    ],
  },
  {
    id: 'lucid_l2_p0_execution_blocked',
    label: 'Lucid-L2 P0 execution remains blocked unless upstream gates close with review evidence.',
    category: 'security',
    requiredEvidence: [
      'p0_l2_backlog_items_open_or_reviewed',
      'wallet_execution_gate_requires_review_ref',
      'public_routes_have_no_wallet_signing_imports',
    ],
    requiredCommands: [
      'npm run agent-commerce:l2-gates',
      'npm run stack:boundaries',
    ],
  },
  {
    id: 'external_security_review',
    label: 'External security review of Agent Commerce flows is complete.',
    category: 'security',
    requiredEvidence: [
      'reviewer_identity',
      'review_scope',
      'review_date',
      'findings_disposition',
      'zero_open_p0_p1_findings',
    ],
    requiredCommands: [
      'npm run agent-commerce:security-review-evidence',
      'npm run agent-commerce:l2-gates',
      'npm run agent-commerce:dashboard',
      'npm run agent-commerce:rail-readiness',
      'npm run stack:boundaries',
    ],
  },
] as const

function missing(required: string[], actual?: string[]): string[] {
  const actualSet = new Set(actual ?? [])
  return required.filter((item) => !actualSet.has(item))
}

export function evaluateAgentCommerceGaEvidence(
  input: AgentCommerceGaEvidenceInput,
): AgentCommerceGaEvidenceReport {
  const results = AGENT_COMMERCE_GA_EVIDENCE_GATES.map((gate) => {
    const missingEvidence = missing(gate.requiredEvidence, input.evidence[gate.id])
    const missingCommands = missing(gate.requiredCommands, input.commandResults[gate.id])
    return {
      id: gate.id,
      label: gate.label,
      category: gate.category,
      ready: missingEvidence.length === 0 && missingCommands.length === 0,
      missingEvidence,
      missingCommands,
    }
  })

  const providerPromotions = input.providerPromotions ?? []

  return {
    ready: results.every((result) => result.ready) && providerPromotions.every((result) => result.ready),
    release: input.release,
    environment: input.environment,
    results,
    providerPromotions,
  }
}
