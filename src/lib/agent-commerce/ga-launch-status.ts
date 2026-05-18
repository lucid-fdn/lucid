import type { AgentCommerceProviderId } from '@contracts/agent-commerce'
import { AgentCommerceProviderIdSchema } from '@contracts/agent-commerce'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  evaluateAgentCommerceGaEvidence,
  type AgentCommerceGaEvidenceInput,
} from './ga-readiness'
import {
  AgentCommerceProviderPromotionEvidenceSummarySchema,
  type AgentCommerceProviderPromotionEvidenceSummary,
} from './provider-promotion'
import {
  AgentCommerceSecurityReviewEvidenceSummarySchema,
  type AgentCommerceSecurityReviewEvidenceSummary,
} from './security-review-evidence'
import {
  AgentCommerceStagingReconciliationEvidenceSummarySchema,
  type AgentCommerceStagingReconciliationEvidenceSummary,
} from './staging-reconciliation-evidence'
import {
  AgentCommerceGaFinalLocalGateSchema,
  type AgentCommerceGaFinalLocalGate,
} from './ga-final-local-gate'
import {
  stableAgentCommerceReleaseBundleStringify,
} from './ga-release-bundle'

export const AgentCommerceGaLaunchStatusBlockerSchema = z.enum([
  'final_local_gate_not_ready',
  'ga_evidence_not_ready',
  'staging_reconciliation_summary_missing',
  'staging_reconciliation_incomplete',
  'external_security_review_summary_missing',
  'external_security_review_incomplete',
  'security_review_release_mismatch',
  'security_review_environment_mismatch',
  'required_provider_promotion_missing',
  'provider_promotion_incomplete',
  'provider_promotion_release_mismatch',
  'provider_promotion_environment_mismatch',
  'lucid_l2_upstream_p0_unclosed',
])

export type AgentCommerceGaLaunchStatusBlocker = z.infer<
  typeof AgentCommerceGaLaunchStatusBlockerSchema
>

export const AgentCommerceLucidL2P0ClosureIdSchema = z.enum([
  'P0-L2-001',
  'P0-L2-002',
  'P0-L2-003',
])

export type AgentCommerceLucidL2P0ClosureId = z.infer<
  typeof AgentCommerceLucidL2P0ClosureIdSchema
>

export const AGENT_COMMERCE_LUCID_L2_REQUIRED_P0_CLOSURES: readonly AgentCommerceLucidL2P0ClosureId[] = [
  'P0-L2-001',
  'P0-L2-002',
  'P0-L2-003',
]

export const AgentCommerceGaLaunchStatusSchema = z.object({
  schema_version: z.literal('agent-commerce-ga-launch-status:v1'),
  release: z.string().min(1).max(120),
  environment: z.enum(['staging', 'production']),
  evaluated_at: z.string().datetime(),
  ready: z.boolean(),
  blockers: z.array(AgentCommerceGaLaunchStatusBlockerSchema),
  final_local_gate: z.object({
    ready: z.boolean(),
    final_gate_hash: z.string().regex(/^[a-f0-9]{64}$/),
    blockers: z.array(z.string().min(1).max(120)),
  }),
  ga_readiness: z.object({
    ready: z.boolean(),
    blocked_gate_ids: z.array(z.string().min(1).max(120)),
  }),
  staging_reconciliation: z.object({
    required: z.literal(true),
    ready: z.boolean(),
    summary_present: z.boolean(),
    missing_evidence: z.array(z.string().min(1).max(120)),
    observed_run_days: z.array(z.string().min(1).max(20)),
    required_run_days: z.number().int().positive().optional(),
  }),
  external_security_review: z.object({
    required: z.literal(true),
    ready: z.boolean(),
    summary_present: z.boolean(),
    missing_evidence: z.array(z.string().min(1).max(120)),
    missing_scope: z.array(z.string().min(1).max(120)),
    open_p0_p1_findings: z.number().int().nonnegative().optional(),
  }),
  provider_promotions: z.object({
    required_provider_ids: z.array(AgentCommerceProviderIdSchema),
    provided_provider_ids: z.array(AgentCommerceProviderIdSchema),
    missing_required_provider_ids: z.array(AgentCommerceProviderIdSchema),
    blocked_provider_ids: z.array(AgentCommerceProviderIdSchema),
    environment_mismatch_provider_ids: z.array(AgentCommerceProviderIdSchema),
    release_mismatch_provider_ids: z.array(AgentCommerceProviderIdSchema),
    summaries: z.array(AgentCommerceProviderPromotionEvidenceSummarySchema),
  }),
  lucid_l2_execution: z.object({
    required: z.boolean(),
    ready: z.boolean(),
    required_closure_ids: z.array(AgentCommerceLucidL2P0ClosureIdSchema),
    supplied_closure_ids: z.array(AgentCommerceLucidL2P0ClosureIdSchema),
    missing_closure_ids: z.array(AgentCommerceLucidL2P0ClosureIdSchema),
    closure_urls: z.partialRecord(AgentCommerceLucidL2P0ClosureIdSchema, z.string().url()),
  }),
  launch_status_hash: z.string().regex(/^[a-f0-9]{64}$/),
})

export type AgentCommerceGaLaunchStatus = z.infer<
  typeof AgentCommerceGaLaunchStatusSchema
>

export interface AgentCommerceGaLaunchStatusInput {
  gaEvidence: AgentCommerceGaEvidenceInput
  finalLocalGate: AgentCommerceGaFinalLocalGate
  stagingReconciliation?: AgentCommerceStagingReconciliationEvidenceSummary
  securityReview?: AgentCommerceSecurityReviewEvidenceSummary
  providerPromotions?: AgentCommerceProviderPromotionEvidenceSummary[]
  requiredProviderPromotions?: AgentCommerceProviderId[]
  requiresLucidL2Execution?: boolean
  lucidL2P0ClosureUrls?: Partial<Record<AgentCommerceLucidL2P0ClosureId, string>>
  evaluatedAt?: string
}

export interface AgentCommerceGaLaunchStatusVerificationInput {
  gaEvidence: AgentCommerceGaEvidenceInput
  finalLocalGate: AgentCommerceGaFinalLocalGate
  stagingReconciliation?: AgentCommerceStagingReconciliationEvidenceSummary
  securityReview?: AgentCommerceSecurityReviewEvidenceSummary
  providerPromotions?: AgentCommerceProviderPromotionEvidenceSummary[]
}

export interface AgentCommerceGaLaunchStatusVerificationResult {
  ready: boolean
  launchStatusReady: boolean
  launchStatusHashValid: boolean
  launchStatusSelfConsistent: boolean
  finalLocalGateReady: boolean
  gaReadinessReady: boolean
  stagingReconciliationReady: boolean
  externalSecurityReviewReady: boolean
  requiredProviderPromotionsReady: boolean
  lucidL2ExecutionReady: boolean
  expectedLaunchStatusHash: string
  actualLaunchStatusHash: string
  expectedBlockers: AgentCommerceGaLaunchStatusBlocker[]
  actualBlockers: AgentCommerceGaLaunchStatusBlocker[]
  launchStatusFieldMismatches: string[]
}

export const AgentCommerceGaLaunchStatusVerificationResultSchema = z.object({
  ready: z.boolean(),
  launchStatusReady: z.boolean(),
  launchStatusHashValid: z.boolean(),
  launchStatusSelfConsistent: z.boolean(),
  finalLocalGateReady: z.boolean(),
  gaReadinessReady: z.boolean(),
  stagingReconciliationReady: z.boolean(),
  externalSecurityReviewReady: z.boolean(),
  requiredProviderPromotionsReady: z.boolean(),
  lucidL2ExecutionReady: z.boolean(),
  expectedLaunchStatusHash: z.string().regex(/^[a-f0-9]{64}$/),
  actualLaunchStatusHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedBlockers: z.array(AgentCommerceGaLaunchStatusBlockerSchema),
  actualBlockers: z.array(AgentCommerceGaLaunchStatusBlockerSchema),
  launchStatusFieldMismatches: z.array(z.string().min(1).max(120)),
}) satisfies z.ZodType<AgentCommerceGaLaunchStatusVerificationResult>

function uniqueSorted<T extends string>(items: Iterable<T>): T[] {
  return [...new Set(items)].sort()
}

function unsignedLaunchStatus(
  status: AgentCommerceGaLaunchStatus,
): Omit<AgentCommerceGaLaunchStatus, 'launch_status_hash'> {
  return {
    schema_version: status.schema_version,
    release: status.release,
    environment: status.environment,
    evaluated_at: status.evaluated_at,
    ready: status.ready,
    blockers: status.blockers,
    final_local_gate: status.final_local_gate,
    ga_readiness: status.ga_readiness,
    staging_reconciliation: status.staging_reconciliation,
    external_security_review: status.external_security_review,
    provider_promotions: status.provider_promotions,
    lucid_l2_execution: status.lucid_l2_execution,
  }
}

export function hashAgentCommerceGaLaunchStatus(
  statusInput: AgentCommerceGaLaunchStatus,
): string {
  const status = AgentCommerceGaLaunchStatusSchema.parse(statusInput)
  return createHash('sha256')
    .update(stableAgentCommerceReleaseBundleStringify(unsignedLaunchStatus(status)))
    .digest('hex')
}

export function createAgentCommerceGaLaunchStatus(
  input: AgentCommerceGaLaunchStatusInput,
): AgentCommerceGaLaunchStatus {
  const finalLocalGate = AgentCommerceGaFinalLocalGateSchema.parse(input.finalLocalGate)
  const report = evaluateAgentCommerceGaEvidence(input.gaEvidence)
  const staging = input.stagingReconciliation
    ? AgentCommerceStagingReconciliationEvidenceSummarySchema.parse(input.stagingReconciliation)
    : undefined
  const security = input.securityReview
    ? AgentCommerceSecurityReviewEvidenceSummarySchema.parse(input.securityReview)
    : undefined
  const providerPromotions = (input.providerPromotions ?? input.gaEvidence.providerPromotions ?? [])
    .map((summary) => AgentCommerceProviderPromotionEvidenceSummarySchema.parse(summary))
    .sort((left, right) => left.provider.localeCompare(right.provider))
  const requiredProviderIds = uniqueSorted(input.requiredProviderPromotions ?? [])
  const providedProviderIds = uniqueSorted(providerPromotions.map((summary) => summary.provider))
  const missingRequiredProviderIds = requiredProviderIds.filter((provider) => !providedProviderIds.includes(provider))
  const blockedProviderIds = uniqueSorted(
    providerPromotions
      .filter((summary) => !summary.ready)
      .map((summary) => summary.provider),
  )
  const providerEnvironmentMismatches = uniqueSorted(
    providerPromotions
      .filter((summary) => summary.environment !== input.gaEvidence.environment)
      .map((summary) => summary.provider),
  )
  const providerReleaseMismatches = uniqueSorted(
    providerPromotions
      .filter((summary) => summary.release !== input.gaEvidence.release)
      .map((summary) => summary.provider),
  )
  const requiresLucidL2Execution = Boolean(input.requiresLucidL2Execution)
  const closureUrls = z.partialRecord(AgentCommerceLucidL2P0ClosureIdSchema, z.string().url()).parse(
    input.lucidL2P0ClosureUrls ?? {},
  )
  const suppliedClosureIds = uniqueSorted(
    Object.keys(closureUrls).filter((id): id is AgentCommerceLucidL2P0ClosureId => (
      AgentCommerceLucidL2P0ClosureIdSchema.safeParse(id).success
    )),
  )
  const missingClosureIds = requiresLucidL2Execution
    ? AGENT_COMMERCE_LUCID_L2_REQUIRED_P0_CLOSURES.filter((id) => !suppliedClosureIds.includes(id))
    : []
  const blockedGateIds = report.results
    .filter((result) => !result.ready)
    .map((result) => result.id)
  const blockers: AgentCommerceGaLaunchStatusBlocker[] = []

  if (!finalLocalGate.ready) blockers.push('final_local_gate_not_ready')
  if (!report.ready) blockers.push('ga_evidence_not_ready')
  if (!staging) blockers.push('staging_reconciliation_summary_missing')
  if (staging && !staging.ready) blockers.push('staging_reconciliation_incomplete')
  if (!security) blockers.push('external_security_review_summary_missing')
  if (security && !security.ready) blockers.push('external_security_review_incomplete')
  if (security && security.release !== input.gaEvidence.release) blockers.push('security_review_release_mismatch')
  if (security && security.environment !== input.gaEvidence.environment) {
    blockers.push('security_review_environment_mismatch')
  }
  if (missingRequiredProviderIds.length > 0) blockers.push('required_provider_promotion_missing')
  if (blockedProviderIds.length > 0) blockers.push('provider_promotion_incomplete')
  if (providerReleaseMismatches.length > 0) blockers.push('provider_promotion_release_mismatch')
  if (providerEnvironmentMismatches.length > 0) blockers.push('provider_promotion_environment_mismatch')
  if (missingClosureIds.length > 0) blockers.push('lucid_l2_upstream_p0_unclosed')

  const unsigned = {
    schema_version: 'agent-commerce-ga-launch-status:v1' as const,
    release: input.gaEvidence.release,
    environment: input.gaEvidence.environment,
    evaluated_at: input.evaluatedAt ?? new Date().toISOString(),
    ready: blockers.length === 0,
    blockers: uniqueSorted(blockers),
    final_local_gate: {
      ready: finalLocalGate.ready,
      final_gate_hash: finalLocalGate.final_gate_hash,
      blockers: finalLocalGate.blockers,
    },
    ga_readiness: {
      ready: report.ready,
      blocked_gate_ids: blockedGateIds,
    },
    staging_reconciliation: {
      required: true as const,
      ready: Boolean(staging?.ready),
      summary_present: Boolean(staging),
      missing_evidence: staging?.missingEvidence ?? [],
      observed_run_days: staging?.observed_run_days ?? [],
      required_run_days: staging?.window.required_run_days,
    },
    external_security_review: {
      required: true as const,
      ready: Boolean(security?.ready),
      summary_present: Boolean(security),
      missing_evidence: security?.missingEvidence ?? [],
      missing_scope: security?.missing_scope ?? [],
      open_p0_p1_findings: security?.findings.open_p0_p1,
    },
    provider_promotions: {
      required_provider_ids: requiredProviderIds,
      provided_provider_ids: providedProviderIds,
      missing_required_provider_ids: missingRequiredProviderIds,
      blocked_provider_ids: blockedProviderIds,
      environment_mismatch_provider_ids: providerEnvironmentMismatches,
      release_mismatch_provider_ids: providerReleaseMismatches,
      summaries: providerPromotions,
    },
    lucid_l2_execution: {
      required: requiresLucidL2Execution,
      ready: !requiresLucidL2Execution || missingClosureIds.length === 0,
      required_closure_ids: requiresLucidL2Execution
        ? [...AGENT_COMMERCE_LUCID_L2_REQUIRED_P0_CLOSURES]
        : [],
      supplied_closure_ids: suppliedClosureIds,
      missing_closure_ids: missingClosureIds,
      closure_urls: closureUrls,
    },
  }

  return AgentCommerceGaLaunchStatusSchema.parse({
    ...unsigned,
    launch_status_hash: createHash('sha256')
      .update(stableAgentCommerceReleaseBundleStringify(unsigned))
      .digest('hex'),
  })
}

export function verifyAgentCommerceGaLaunchStatus(
  statusInput: AgentCommerceGaLaunchStatus,
  verificationInput: AgentCommerceGaLaunchStatusVerificationInput,
): AgentCommerceGaLaunchStatusVerificationResult {
  const status = AgentCommerceGaLaunchStatusSchema.parse(statusInput)
  const expectedStatus = createAgentCommerceGaLaunchStatus({
    ...verificationInput,
    requiredProviderPromotions: status.provider_promotions.required_provider_ids,
    requiresLucidL2Execution: status.lucid_l2_execution.required,
    lucidL2P0ClosureUrls: status.lucid_l2_execution.closure_urls,
    evaluatedAt: status.evaluated_at,
  })
  const expectedLaunchStatusHash = hashAgentCommerceGaLaunchStatus(status)
  const actualLaunchStatusHash = status.launch_status_hash
  const expectedUnsigned = unsignedLaunchStatus(expectedStatus)
  const actualUnsigned = unsignedLaunchStatus(status)
  const launchStatusFieldMismatches = Object.keys(expectedUnsigned)
    .filter((key) => {
      const typedKey = key as keyof typeof expectedUnsigned
      return stableAgentCommerceReleaseBundleStringify(expectedUnsigned[typedKey])
        !== stableAgentCommerceReleaseBundleStringify(actualUnsigned[typedKey])
    })
    .sort()
  const launchStatusHashValid = expectedLaunchStatusHash === actualLaunchStatusHash
  const launchStatusSelfConsistent = launchStatusFieldMismatches.length === 0
  const requiredProviderPromotionsReady = status.provider_promotions.missing_required_provider_ids.length === 0
    && status.provider_promotions.blocked_provider_ids.length === 0
    && status.provider_promotions.environment_mismatch_provider_ids.length === 0
    && status.provider_promotions.release_mismatch_provider_ids.length === 0

  return AgentCommerceGaLaunchStatusVerificationResultSchema.parse({
    ready: status.ready
      && launchStatusHashValid
      && launchStatusSelfConsistent
      && status.final_local_gate.ready
      && status.ga_readiness.ready
      && status.staging_reconciliation.ready
      && status.external_security_review.ready
      && requiredProviderPromotionsReady
      && status.lucid_l2_execution.ready,
    launchStatusReady: status.ready,
    launchStatusHashValid,
    launchStatusSelfConsistent,
    finalLocalGateReady: status.final_local_gate.ready,
    gaReadinessReady: status.ga_readiness.ready,
    stagingReconciliationReady: status.staging_reconciliation.ready,
    externalSecurityReviewReady: status.external_security_review.ready,
    requiredProviderPromotionsReady,
    lucidL2ExecutionReady: status.lucid_l2_execution.ready,
    expectedLaunchStatusHash,
    actualLaunchStatusHash,
    expectedBlockers: expectedStatus.blockers,
    actualBlockers: status.blockers,
    launchStatusFieldMismatches,
  })
}
