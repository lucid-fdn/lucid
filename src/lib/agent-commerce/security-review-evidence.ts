import { z } from 'zod'

export const AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE = [
  'reviewer_identity',
  'review_scope',
  'review_date',
  'findings_disposition',
  'zero_open_p0_p1_findings',
] as const

export type AgentCommerceSecurityReviewEvidenceId =
  typeof AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE[number]

export const AGENT_COMMERCE_SECURITY_REVIEW_REQUIRED_SCOPE = [
  'control_plane_apis',
  'runtime_tools',
  'provider_adapters',
  'webhooks',
  'machine_payments',
  'generated_app_paid_actions',
  'wallet_execution_guard',
  'lucid_l2_p0_gates',
  'ga_evidence_gates',
  'operator_runbooks',
] as const

export type AgentCommerceSecurityReviewScopeId =
  typeof AGENT_COMMERCE_SECURITY_REVIEW_REQUIRED_SCOPE[number]

export const AgentCommerceSecurityReviewFindingSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(240),
  severity: z.enum(['P0', 'P1', 'P2', 'P3', 'info']),
  status: z.enum(['open', 'mitigated', 'accepted_risk', 'false_positive']),
  disposition_url: z.string().url().optional(),
  notes: z.string().max(2_000).optional(),
})

export const AgentCommerceSecurityReviewPacketSchema = z.object({
  release: z.string().min(1).max(120),
  environment: z.enum(['staging', 'production']),
  reviewer: z.object({
    name: z.string().min(1).max(160),
    organization: z.string().min(1).max(160),
    independence: z.enum(['external', 'internal_independent']),
    identity_url: z.string().url(),
  }),
  review: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    scope: z.array(z.enum(AGENT_COMMERCE_SECURITY_REVIEW_REQUIRED_SCOPE)).min(1),
    scope_url: z.string().url(),
    findings_disposition_url: z.string().url(),
    zero_open_p0_p1_findings_url: z.string().url(),
    reviewer_attested_zero_open_p0_p1: z.literal(true),
  }),
  findings: z.array(AgentCommerceSecurityReviewFindingSchema).default([]),
  commandResults: z.array(z.string().min(1)).default([]),
})

export type AgentCommerceSecurityReviewPacket = z.infer<
  typeof AgentCommerceSecurityReviewPacketSchema
>

export const AgentCommerceSecurityReviewEvidenceSummarySchema = z.object({
  ready: z.boolean(),
  evidence: z.array(z.enum(AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE)),
  missingEvidence: z.array(z.enum(AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE)),
  release: z.string(),
  environment: z.enum(['staging', 'production']),
  reviewer: z.object({
    name: z.string(),
    organization: z.string(),
    independence: z.enum(['external', 'internal_independent']),
    identity_url: z.string().url(),
  }),
  review_date: z.string(),
  required_scope: z.array(z.enum(AGENT_COMMERCE_SECURITY_REVIEW_REQUIRED_SCOPE)),
  covered_scope: z.array(z.enum(AGENT_COMMERCE_SECURITY_REVIEW_REQUIRED_SCOPE)),
  missing_scope: z.array(z.enum(AGENT_COMMERCE_SECURITY_REVIEW_REQUIRED_SCOPE)),
  findings: z.object({
    total: z.number().int().nonnegative(),
    open_p0_p1: z.number().int().nonnegative(),
    undispositioned: z.number().int().nonnegative(),
  }),
  links: z.object({
    reviewer_identity: z.string().url(),
    review_scope: z.string().url(),
    findings_disposition: z.string().url(),
    zero_open_p0_p1_findings: z.string().url(),
  }),
})

export type AgentCommerceSecurityReviewEvidenceSummary = z.infer<
  typeof AgentCommerceSecurityReviewEvidenceSummarySchema
>

function hasEvidence(
  evidence: Set<AgentCommerceSecurityReviewEvidenceId>,
  id: AgentCommerceSecurityReviewEvidenceId,
): boolean {
  return evidence.has(id)
}

function isReviewDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return false
  return date.toISOString().slice(0, 10) === value
}

export function summarizeAgentCommerceSecurityReviewEvidence(
  packetInput: AgentCommerceSecurityReviewPacket,
): AgentCommerceSecurityReviewEvidenceSummary {
  const packet = AgentCommerceSecurityReviewPacketSchema.parse(packetInput)
  const coveredScope = new Set(packet.review.scope)
  const missingScope = AGENT_COMMERCE_SECURITY_REVIEW_REQUIRED_SCOPE
    .filter((scope) => !coveredScope.has(scope))
  const undispositioned = packet.findings.filter((finding) => finding.status === 'open').length
  const openP0P1 = packet.findings.filter((finding) => (
    finding.status === 'open' && (finding.severity === 'P0' || finding.severity === 'P1')
  )).length

  const evidence = new Set<AgentCommerceSecurityReviewEvidenceId>()
  if (packet.reviewer.name && packet.reviewer.organization && packet.reviewer.identity_url) {
    evidence.add('reviewer_identity')
  }
  if (missingScope.length === 0 && packet.review.scope_url) {
    evidence.add('review_scope')
  }
  if (isReviewDate(packet.review.date)) evidence.add('review_date')
  if (undispositioned === 0 && packet.review.findings_disposition_url) {
    evidence.add('findings_disposition')
  }
  if (
    openP0P1 === 0
    && packet.review.reviewer_attested_zero_open_p0_p1
    && packet.review.zero_open_p0_p1_findings_url
  ) {
    evidence.add('zero_open_p0_p1_findings')
  }

  const missingEvidence = AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE
    .filter((id) => !hasEvidence(evidence, id))

  return AgentCommerceSecurityReviewEvidenceSummarySchema.parse({
    ready: missingEvidence.length === 0,
    evidence: [...evidence],
    missingEvidence,
    release: packet.release,
    environment: packet.environment,
    reviewer: packet.reviewer,
    review_date: packet.review.date,
    required_scope: [...AGENT_COMMERCE_SECURITY_REVIEW_REQUIRED_SCOPE],
    covered_scope: [...coveredScope],
    missing_scope: missingScope,
    findings: {
      total: packet.findings.length,
      open_p0_p1: openP0P1,
      undispositioned,
    },
    links: {
      reviewer_identity: packet.reviewer.identity_url,
      review_scope: packet.review.scope_url,
      findings_disposition: packet.review.findings_disposition_url,
      zero_open_p0_p1_findings: packet.review.zero_open_p0_p1_findings_url,
    },
  })
}
