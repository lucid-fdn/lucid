import type { AgentCommerceProviderId } from '@contracts/agent-commerce'
import { AgentCommerceProviderIdSchema } from '@contracts/agent-commerce'
import { createHash, createHmac } from 'node:crypto'
import { z } from 'zod'
import {
  AGENT_COMMERCE_GA_EVIDENCE_GATES,
  evaluateAgentCommerceGaEvidence,
  type AgentCommerceGaEvidenceGateId,
  type AgentCommerceGaEvidenceInput,
  type AgentCommerceGaEvidenceReport,
} from './ga-readiness'
import {
  AgentCommerceProviderPromotionEvidenceSummarySchema,
} from './provider-promotion'

const gateIds = AGENT_COMMERCE_GA_EVIDENCE_GATES.map((gate) => gate.id) as [
  AgentCommerceGaEvidenceGateId,
  ...AgentCommerceGaEvidenceGateId[],
]

export const AgentCommerceGaEvidenceGateIdSchema = z.enum(gateIds)

const AgentCommerceGaEvidenceGateRecordSchema = z.partialRecord(
  AgentCommerceGaEvidenceGateIdSchema,
  z.array(z.string().min(1)),
).default({})

export const AgentCommerceGaEvidenceInputFileSchema = z.object({
  environment: z.enum(['staging', 'production']),
  release: z.string().min(1).max(120),
  evidence: AgentCommerceGaEvidenceGateRecordSchema,
  commandResults: AgentCommerceGaEvidenceGateRecordSchema,
  providerPromotions: z.array(AgentCommerceProviderPromotionEvidenceSummarySchema).default([]),
  links: z.record(z.string(), z.string().url()).default({}),
}) satisfies z.ZodType<AgentCommerceGaEvidenceInput>

export const AgentCommerceGaReleaseBundleSourceKindSchema = z.enum([
  'ga_evidence',
  'staging_reconciliation',
  'security_review',
  'provider_promotion',
  'supporting',
])

export type AgentCommerceGaReleaseBundleSourceKind = z.infer<
  typeof AgentCommerceGaReleaseBundleSourceKindSchema
>

function isSafeRepoRelativePath(value: string): boolean {
  if (value.startsWith('/') || value.includes('\0')) return false
  return !value.split(/[\\/]+/).includes('..')
}

export const AgentCommerceGaReleaseBundleSourceFileSchema = z.object({
  kind: AgentCommerceGaReleaseBundleSourceKindSchema,
  path: z.string().min(1).max(500).refine(isSafeRepoRelativePath, {
    message: 'path must be repo-relative and must not contain traversal segments',
  }),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative().optional(),
  provider: AgentCommerceProviderIdSchema.optional(),
})

export type AgentCommerceGaReleaseBundleSourceFile = z.infer<
  typeof AgentCommerceGaReleaseBundleSourceFileSchema
>

export const AgentCommerceGaReleaseBundleSourceIntegritySchema = z.object({
  ready: z.boolean(),
  requiredSourceKinds: z.array(AgentCommerceGaReleaseBundleSourceKindSchema),
  missingSourceKinds: z.array(AgentCommerceGaReleaseBundleSourceKindSchema),
  duplicatePaths: z.array(z.string()),
  missingProviderPromotionSources: z.array(AgentCommerceProviderIdSchema),
  providerPromotionEnvironmentMismatches: z.array(z.object({
    provider: AgentCommerceProviderIdSchema,
    expected: z.enum(['staging', 'production']),
    actual: z.enum(['staging', 'production']),
  })),
})

export type AgentCommerceGaReleaseBundleSourceIntegrity = z.infer<
  typeof AgentCommerceGaReleaseBundleSourceIntegritySchema
>

const AgentCommerceGaEvidenceResultSchema = z.object({
  id: AgentCommerceGaEvidenceGateIdSchema,
  label: z.string().min(1),
  category: z.enum(['local', 'staging', 'security']),
  ready: z.boolean(),
  missingEvidence: z.array(z.string()),
  missingCommands: z.array(z.string()),
})

export const AgentCommerceGaEvidenceReportSchema = z.object({
  ready: z.boolean(),
  release: z.string().min(1).max(120),
  environment: z.enum(['staging', 'production']),
  results: z.array(AgentCommerceGaEvidenceResultSchema),
  providerPromotions: z.array(AgentCommerceProviderPromotionEvidenceSummarySchema),
}) satisfies z.ZodType<AgentCommerceGaEvidenceReport>

export const AgentCommerceGaReleaseBundleSchema = z.object({
  schema_version: z.literal('agent-commerce-ga-release-bundle:v1'),
  release: z.string().min(1).max(120),
  environment: z.enum(['staging', 'production']),
  generated_at: z.string().datetime(),
  ready: z.boolean(),
  ga_evidence: AgentCommerceGaEvidenceInputFileSchema,
  ga_readiness: AgentCommerceGaEvidenceReportSchema,
  source_files: z.array(AgentCommerceGaReleaseBundleSourceFileSchema),
  source_integrity: AgentCommerceGaReleaseBundleSourceIntegritySchema,
  bundle_hash: z.string().regex(/^[a-f0-9]{64}$/),
})

export type AgentCommerceGaReleaseBundle = z.infer<
  typeof AgentCommerceGaReleaseBundleSchema
>

export interface AgentCommerceGaReleaseBundleInput {
  generatedAt?: string
  gaEvidence: AgentCommerceGaEvidenceInput
  sourceFiles: AgentCommerceGaReleaseBundleSourceFile[]
}

export interface AgentCommerceGaReleaseBundleVerificationSource {
  path: string
  sha256: string
  bytes?: number
}

export interface AgentCommerceGaReleaseBundleSourceHashMismatch {
  path: string
  expected: string
  actual: string
}

export interface AgentCommerceGaReleaseBundleSourceByteMismatch {
  path: string
  expected: number
  actual: number
}

export interface AgentCommerceGaReleaseBundleVerificationResult {
  ready: boolean
  bundleHashValid: boolean
  bundleSelfConsistent: boolean
  gaReadinessReady: boolean
  sourceIntegrityReady: boolean
  sourceHashesValid: boolean
  sourceBytesValid: boolean
  expectedBundleHash: string
  actualBundleHash: string
  missingSourceFiles: string[]
  sourceHashMismatches: AgentCommerceGaReleaseBundleSourceHashMismatch[]
  sourceByteMismatches: AgentCommerceGaReleaseBundleSourceByteMismatch[]
}

export const AgentCommerceGaReleaseBundleVerificationResultSchema = z.object({
  ready: z.boolean(),
  bundleHashValid: z.boolean(),
  bundleSelfConsistent: z.boolean(),
  gaReadinessReady: z.boolean(),
  sourceIntegrityReady: z.boolean(),
  sourceHashesValid: z.boolean(),
  sourceBytesValid: z.boolean(),
  expectedBundleHash: z.string().regex(/^[a-f0-9]{64}$/),
  actualBundleHash: z.string().regex(/^[a-f0-9]{64}$/),
  missingSourceFiles: z.array(z.string()),
  sourceHashMismatches: z.array(z.object({
    path: z.string(),
    expected: z.string().regex(/^[a-f0-9]{64}$/),
    actual: z.string().regex(/^[a-f0-9]{64}$/),
  })),
  sourceByteMismatches: z.array(z.object({
    path: z.string(),
    expected: z.number().int().nonnegative(),
    actual: z.number().int().nonnegative(),
  })),
}) satisfies z.ZodType<AgentCommerceGaReleaseBundleVerificationResult>

export const AgentCommerceGaPromotionBlockerSchema = z.enum([
  'target_environment_mismatch',
  'bundle_not_ready',
  'bundle_hash_invalid',
  'bundle_not_self_consistent',
  'ga_readiness_incomplete',
  'source_integrity_incomplete',
  'source_files_missing',
  'source_hash_mismatch',
  'source_byte_mismatch',
  'staging_reconciliation_incomplete',
  'external_security_review_incomplete',
  'provider_promotion_incomplete',
])

export type AgentCommerceGaPromotionBlocker = z.infer<
  typeof AgentCommerceGaPromotionBlockerSchema
>

export const AgentCommerceGaPromotionDecisionSchema = z.object({
  schema_version: z.literal('agent-commerce-ga-promotion-decision:v1'),
  release: z.string().min(1).max(120),
  environment: z.enum(['staging', 'production']),
  target_environment: z.enum(['staging', 'production']),
  decided_at: z.string().datetime(),
  decision: z.enum(['approved', 'blocked']),
  approved: z.boolean(),
  blockers: z.array(AgentCommerceGaPromotionBlockerSchema),
  gate_blockers: z.array(z.object({
    id: AgentCommerceGaEvidenceGateIdSchema,
    label: z.string().min(1),
    missingEvidence: z.array(z.string()),
    missingCommands: z.array(z.string()),
  })),
  provider_promotion_blockers: z.array(z.object({
    provider: AgentCommerceProviderIdSchema,
    missingEvidence: z.array(z.string()),
    blockers: z.array(z.string()),
  })),
  bundle_verification: z.object({
    ready: z.boolean(),
    bundle_hash_valid: z.boolean(),
    bundle_self_consistent: z.boolean(),
    ga_readiness_ready: z.boolean(),
    source_integrity_ready: z.boolean(),
    source_hashes_valid: z.boolean(),
    source_bytes_valid: z.boolean(),
    expected_bundle_hash: z.string().regex(/^[a-f0-9]{64}$/),
    actual_bundle_hash: z.string().regex(/^[a-f0-9]{64}$/),
    missing_source_file_count: z.number().int().nonnegative(),
    source_hash_mismatch_count: z.number().int().nonnegative(),
    source_byte_mismatch_count: z.number().int().nonnegative(),
  }),
  bundle_hash: z.string().regex(/^[a-f0-9]{64}$/),
})

export type AgentCommerceGaPromotionDecision = z.infer<
  typeof AgentCommerceGaPromotionDecisionSchema
>

export interface AgentCommerceGaPromotionDecisionInput {
  bundle: AgentCommerceGaReleaseBundle
  verification: AgentCommerceGaReleaseBundleVerificationResult
  targetEnvironment?: AgentCommerceGaReleaseBundle['environment']
  decidedAt?: string
}

export const AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_STATEMENT = 'I attest that I reviewed the Agent Commerce GA promotion decision, evidence bundle, external gates, and provider promotions for this release.'

const AgentCommerceGaPromotionAttestorSchema = z.object({
  name: z.string().min(1).max(120),
  role: z.string().min(1).max(120),
  organization: z.string().min(1).max(120).optional(),
  identity_url: z.string().url().optional(),
})

export const AgentCommerceGaPromotionAttestationSchema = z.object({
  schema_version: z.literal('agent-commerce-ga-promotion-attestation:v1'),
  release: z.string().min(1).max(120),
  environment: z.enum(['staging', 'production']),
  target_environment: z.enum(['staging', 'production']),
  attested_at: z.string().datetime(),
  attestor: AgentCommerceGaPromotionAttestorSchema,
  approved: z.literal(true),
  statement: z.literal(AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_STATEMENT),
  promotion_decision_hash: z.string().regex(/^[a-f0-9]{64}$/),
  bundle_hash: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.object({
    alg: z.literal('HMAC-SHA256'),
    key_id: z.string().min(1).max(120),
    value: z.string().regex(/^[a-f0-9]{64}$/),
  }),
})

export type AgentCommerceGaPromotionAttestation = z.infer<
  typeof AgentCommerceGaPromotionAttestationSchema
>

export interface AgentCommerceGaPromotionAttestationInput {
  decision: AgentCommerceGaPromotionDecision
  attestor: z.infer<typeof AgentCommerceGaPromotionAttestorSchema>
  attestedAt?: string
  signing: {
    keyId: string
    secret: string
  }
}

export interface AgentCommerceGaPromotionAttestationVerificationResult {
  ready: boolean
  decisionApproved: boolean
  decisionHashValid: boolean
  bundleHashValid: boolean
  releaseMatches: boolean
  environmentMatches: boolean
  targetEnvironmentMatches: boolean
  signatureValid: boolean
  expectedDecisionHash: string
  actualDecisionHash: string
  expectedSignature: string
  actualSignature: string
}

export const AgentCommerceGaPromotionAttestationQuorumBlockerSchema = z.enum([
  'decision_not_approved',
  'target_environment_mismatch',
  'unknown_signing_key',
  'invalid_attestation',
  'insufficient_valid_attestations',
  'missing_required_roles',
])

export const AgentCommerceGaPromotionAttestationInvalidReasonSchema = z.enum([
  'unknown_signing_key',
  'decision_not_approved',
  'decision_hash_mismatch',
  'bundle_hash_mismatch',
  'release_mismatch',
  'environment_mismatch',
  'target_environment_mismatch',
  'invalid_signature',
])

export type AgentCommerceGaPromotionAttestationQuorumBlocker = z.infer<
  typeof AgentCommerceGaPromotionAttestationQuorumBlockerSchema
>

export type AgentCommerceGaPromotionAttestationInvalidReason = z.infer<
  typeof AgentCommerceGaPromotionAttestationInvalidReasonSchema
>

export const AgentCommerceGaPromotionAttestationQuorumSchema = z.object({
  schema_version: z.literal('agent-commerce-ga-promotion-attestation-quorum:v1'),
  release: z.string().min(1).max(120),
  environment: z.enum(['staging', 'production']),
  target_environment: z.enum(['staging', 'production']),
  evaluated_at: z.string().datetime(),
  ready: z.boolean(),
  blockers: z.array(AgentCommerceGaPromotionAttestationQuorumBlockerSchema),
  required_attestations: z.number().int().positive(),
  valid_attestation_count: z.number().int().nonnegative(),
  distinct_valid_attestor_count: z.number().int().nonnegative(),
  required_roles: z.array(z.string().min(1).max(120)),
  satisfied_roles: z.array(z.string().min(1).max(120)),
  missing_roles: z.array(z.string().min(1).max(120)),
  valid_attestations: z.array(z.object({
    key_id: z.string().min(1).max(120),
    attestor_id: z.string().min(1).max(300),
    role: z.string().min(1).max(120),
    promotion_decision_hash: z.string().regex(/^[a-f0-9]{64}$/),
    bundle_hash: z.string().regex(/^[a-f0-9]{64}$/),
  })),
  invalid_attestations: z.array(z.object({
    key_id: z.string().min(1).max(120),
    attestor_id: z.string().min(1).max(300),
    reasons: z.array(AgentCommerceGaPromotionAttestationInvalidReasonSchema),
  })),
  duplicate_attestor_ids: z.array(z.string().min(1).max(300)),
  decision_hash: z.string().regex(/^[a-f0-9]{64}$/),
  bundle_hash: z.string().regex(/^[a-f0-9]{64}$/),
})

export type AgentCommerceGaPromotionAttestationQuorum = z.infer<
  typeof AgentCommerceGaPromotionAttestationQuorumSchema
>

export interface AgentCommerceGaPromotionAttestationQuorumInput {
  decision: AgentCommerceGaPromotionDecision
  attestations: AgentCommerceGaPromotionAttestation[]
  signingKeys: Record<string, string>
  targetEnvironment?: AgentCommerceGaPromotionDecision['target_environment']
  requiredAttestations?: number
  requiredRoles?: string[]
  evaluatedAt?: string
}

export const AgentCommerceGaReleaseCertificateBlockerSchema = z.enum([
  'promotion_decision_not_approved',
  'attestation_quorum_not_ready',
  'release_mismatch',
  'environment_mismatch',
  'target_environment_mismatch',
  'bundle_hash_mismatch',
  'decision_hash_mismatch',
])

export type AgentCommerceGaReleaseCertificateBlocker = z.infer<
  typeof AgentCommerceGaReleaseCertificateBlockerSchema
>

export const AgentCommerceGaReleaseCertificateSchema = z.object({
  schema_version: z.literal('agent-commerce-ga-release-certificate:v1'),
  release: z.string().min(1).max(120),
  environment: z.enum(['staging', 'production']),
  target_environment: z.enum(['staging', 'production']),
  issued_at: z.string().datetime(),
  ready: z.boolean(),
  blockers: z.array(AgentCommerceGaReleaseCertificateBlockerSchema),
  promotion_decision: z.enum(['approved', 'blocked']),
  promotion_decision_approved: z.boolean(),
  attestation_quorum_ready: z.boolean(),
  attestation_quorum_blockers: z.array(AgentCommerceGaPromotionAttestationQuorumBlockerSchema),
  promotion_decision_hash: z.string().regex(/^[a-f0-9]{64}$/),
  attestation_quorum_hash: z.string().regex(/^[a-f0-9]{64}$/),
  bundle_hash: z.string().regex(/^[a-f0-9]{64}$/),
  required_attestations: z.number().int().positive(),
  valid_attestation_count: z.number().int().nonnegative(),
  distinct_valid_attestor_count: z.number().int().nonnegative(),
  required_roles: z.array(z.string().min(1).max(120)),
  satisfied_roles: z.array(z.string().min(1).max(120)),
  missing_roles: z.array(z.string().min(1).max(120)),
  attestation_key_ids: z.array(z.string().min(1).max(120)),
  attestor_ids: z.array(z.string().min(1).max(300)),
})

export type AgentCommerceGaReleaseCertificate = z.infer<
  typeof AgentCommerceGaReleaseCertificateSchema
>

export interface AgentCommerceGaReleaseCertificateInput {
  decision: AgentCommerceGaPromotionDecision
  quorum: AgentCommerceGaPromotionAttestationQuorum
  issuedAt?: string
}

export interface AgentCommerceGaReleaseCertificateVerificationResult {
  ready: boolean
  certificateReady: boolean
  certificateSelfConsistent: boolean
  promotionDecisionApproved: boolean
  attestationQuorumReady: boolean
  releaseMatches: boolean
  environmentMatches: boolean
  targetEnvironmentMatches: boolean
  bundleHashValid: boolean
  promotionDecisionHashValid: boolean
  attestationQuorumHashValid: boolean
  attestationKeyIdsMatch: boolean
  attestorIdsMatch: boolean
  requiredRolesMatch: boolean
  satisfiedRolesMatch: boolean
  missingRolesMatch: boolean
  expectedPromotionDecisionHash: string
  actualPromotionDecisionHash: string
  expectedAttestationQuorumHash: string
  actualAttestationQuorumHash: string
  expectedBundleHash: string
  actualBundleHash: string
  expectedCertificateBlockers: AgentCommerceGaReleaseCertificateBlocker[]
  actualCertificateBlockers: AgentCommerceGaReleaseCertificateBlocker[]
}

export const AgentCommerceGaReleaseCertificateVerificationResultSchema = z.object({
  ready: z.boolean(),
  certificateReady: z.boolean(),
  certificateSelfConsistent: z.boolean(),
  promotionDecisionApproved: z.boolean(),
  attestationQuorumReady: z.boolean(),
  releaseMatches: z.boolean(),
  environmentMatches: z.boolean(),
  targetEnvironmentMatches: z.boolean(),
  bundleHashValid: z.boolean(),
  promotionDecisionHashValid: z.boolean(),
  attestationQuorumHashValid: z.boolean(),
  attestationKeyIdsMatch: z.boolean(),
  attestorIdsMatch: z.boolean(),
  requiredRolesMatch: z.boolean(),
  satisfiedRolesMatch: z.boolean(),
  missingRolesMatch: z.boolean(),
  expectedPromotionDecisionHash: z.string().regex(/^[a-f0-9]{64}$/),
  actualPromotionDecisionHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedAttestationQuorumHash: z.string().regex(/^[a-f0-9]{64}$/),
  actualAttestationQuorumHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedBundleHash: z.string().regex(/^[a-f0-9]{64}$/),
  actualBundleHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedCertificateBlockers: z.array(AgentCommerceGaReleaseCertificateBlockerSchema),
  actualCertificateBlockers: z.array(AgentCommerceGaReleaseCertificateBlockerSchema),
}) satisfies z.ZodType<AgentCommerceGaReleaseCertificateVerificationResult>

export const AgentCommerceGaReleaseArtifactKindSchema = z.enum([
  'ga_evidence',
  'staging_reconciliation_evidence',
  'security_review_evidence',
  'provider_promotion_evidence',
  'ga_release_bundle',
  'ga_release_bundle_verification',
  'ga_promotion_decision',
  'ga_promotion_attestation',
  'ga_promotion_attestation_quorum',
  'ga_release_certificate',
  'ga_release_certificate_verification',
  'supporting',
])

export type AgentCommerceGaReleaseArtifactKind = z.infer<
  typeof AgentCommerceGaReleaseArtifactKindSchema
>

export const AgentCommerceGaReleaseArtifactSecretMarkerSchema = z.enum([
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_SIGNING_KEY',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEYRING_JSON',
  'AGENT_COMMERCE_SECRET_ENCRYPTION_KEY',
  'AGENT_COMMERCE_INTERNAL_SECRET',
  'AGENT_COMMERCE_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY',
])

export type AgentCommerceGaReleaseArtifactSecretMarker = z.infer<
  typeof AgentCommerceGaReleaseArtifactSecretMarkerSchema
>

export const AGENT_COMMERCE_GA_RELEASE_ARTIFACT_SECRET_MARKERS: readonly AgentCommerceGaReleaseArtifactSecretMarker[] = [
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_SIGNING_KEY',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEYRING_JSON',
  'AGENT_COMMERCE_SECRET_ENCRYPTION_KEY',
  'AGENT_COMMERCE_INTERNAL_SECRET',
  'AGENT_COMMERCE_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY',
]

export const AgentCommerceGaReleaseArtifactSchema = z.object({
  kind: AgentCommerceGaReleaseArtifactKindSchema,
  path: z.string().min(1).max(1000).refine((value) => !value.includes('\0'), {
    message: 'path must not contain null bytes',
  }),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
  secret_markers_found: z.array(AgentCommerceGaReleaseArtifactSecretMarkerSchema),
})

export type AgentCommerceGaReleaseArtifact = z.infer<
  typeof AgentCommerceGaReleaseArtifactSchema
>

export const AgentCommerceGaReleaseArtifactIndexBlockerSchema = z.enum([
  'bundle_verification_not_ready',
  'certificate_not_ready',
  'certificate_verification_not_ready',
  'missing_required_artifact',
  'duplicate_singleton_artifact',
  'insufficient_attestation_artifacts',
  'artifact_contains_secret_marker',
])

export type AgentCommerceGaReleaseArtifactIndexBlocker = z.infer<
  typeof AgentCommerceGaReleaseArtifactIndexBlockerSchema
>

export const AgentCommerceGaReleaseArtifactIndexSchema = z.object({
  schema_version: z.literal('agent-commerce-ga-release-artifact-index:v1'),
  release: z.string().min(1).max(120),
  environment: z.enum(['staging', 'production']),
  target_environment: z.enum(['staging', 'production']),
  generated_at: z.string().datetime(),
  ready: z.boolean(),
  blockers: z.array(AgentCommerceGaReleaseArtifactIndexBlockerSchema),
  required_artifact_kinds: z.array(AgentCommerceGaReleaseArtifactKindSchema),
  missing_artifact_kinds: z.array(AgentCommerceGaReleaseArtifactKindSchema),
  duplicate_singleton_artifact_kinds: z.array(AgentCommerceGaReleaseArtifactKindSchema),
  required_promotion_attestations: z.number().int().nonnegative(),
  promotion_attestation_artifact_count: z.number().int().nonnegative(),
  artifact_secret_marker_paths: z.array(z.object({
    path: z.string().min(1).max(1000),
    markers: z.array(AgentCommerceGaReleaseArtifactSecretMarkerSchema),
  })),
  bundle_verification_ready: z.boolean(),
  certificate_verification_ready: z.boolean(),
  certificate_summary: z.object({
    ready: z.boolean(),
    bundle_hash: z.string().regex(/^[a-f0-9]{64}$/),
    promotion_decision_hash: z.string().regex(/^[a-f0-9]{64}$/),
    attestation_quorum_hash: z.string().regex(/^[a-f0-9]{64}$/),
    required_attestations: z.number().int().positive(),
    attestation_key_ids: z.array(z.string().min(1).max(120)),
    attestor_ids: z.array(z.string().min(1).max(300)),
  }),
  artifacts: z.array(AgentCommerceGaReleaseArtifactSchema),
  index_hash: z.string().regex(/^[a-f0-9]{64}$/),
})

export type AgentCommerceGaReleaseArtifactIndex = z.infer<
  typeof AgentCommerceGaReleaseArtifactIndexSchema
>

export interface AgentCommerceGaReleaseArtifactIndexInput {
  certificate: AgentCommerceGaReleaseCertificate
  bundleVerification: AgentCommerceGaReleaseBundleVerificationResult
  certificateVerification: AgentCommerceGaReleaseCertificateVerificationResult
  artifacts: AgentCommerceGaReleaseArtifact[]
  generatedAt?: string
}

export interface AgentCommerceGaReleaseArtifactIndexHashMismatch {
  path: string
  expected: string
  actual: string
}

export interface AgentCommerceGaReleaseArtifactIndexByteMismatch {
  path: string
  expected: number
  actual: number
}

export interface AgentCommerceGaReleaseArtifactIndexSecretMarkerMismatch {
  path: string
  expected: AgentCommerceGaReleaseArtifactSecretMarker[]
  actual: AgentCommerceGaReleaseArtifactSecretMarker[]
}

export interface AgentCommerceGaReleaseArtifactIndexVerificationResult {
  ready: boolean
  indexReady: boolean
  indexHashValid: boolean
  indexMetadataSelfConsistent: boolean
  artifactFilesPresent: boolean
  artifactHashesValid: boolean
  artifactBytesValid: boolean
  artifactSecretMarkersValid: boolean
  noArtifactSecretMarkers: boolean
  requiredArtifactsPresent: boolean
  attestationArtifactsSufficient: boolean
  bundleVerificationReady: boolean
  certificateReady: boolean
  certificateVerificationReady: boolean
  expectedIndexHash: string
  actualIndexHash: string
  expectedBlockers: AgentCommerceGaReleaseArtifactIndexBlocker[]
  actualBlockers: AgentCommerceGaReleaseArtifactIndexBlocker[]
  expectedMissingArtifactKinds: AgentCommerceGaReleaseArtifactKind[]
  actualMissingArtifactKinds: AgentCommerceGaReleaseArtifactKind[]
  missingArtifactPaths: string[]
  artifactHashMismatches: AgentCommerceGaReleaseArtifactIndexHashMismatch[]
  artifactByteMismatches: AgentCommerceGaReleaseArtifactIndexByteMismatch[]
  artifactSecretMarkerMismatches: AgentCommerceGaReleaseArtifactIndexSecretMarkerMismatch[]
}

export const AgentCommerceGaReleaseArtifactIndexVerificationResultSchema = z.object({
  ready: z.boolean(),
  indexReady: z.boolean(),
  indexHashValid: z.boolean(),
  indexMetadataSelfConsistent: z.boolean(),
  artifactFilesPresent: z.boolean(),
  artifactHashesValid: z.boolean(),
  artifactBytesValid: z.boolean(),
  artifactSecretMarkersValid: z.boolean(),
  noArtifactSecretMarkers: z.boolean(),
  requiredArtifactsPresent: z.boolean(),
  attestationArtifactsSufficient: z.boolean(),
  bundleVerificationReady: z.boolean(),
  certificateReady: z.boolean(),
  certificateVerificationReady: z.boolean(),
  expectedIndexHash: z.string().regex(/^[a-f0-9]{64}$/),
  actualIndexHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedBlockers: z.array(AgentCommerceGaReleaseArtifactIndexBlockerSchema),
  actualBlockers: z.array(AgentCommerceGaReleaseArtifactIndexBlockerSchema),
  expectedMissingArtifactKinds: z.array(AgentCommerceGaReleaseArtifactKindSchema),
  actualMissingArtifactKinds: z.array(AgentCommerceGaReleaseArtifactKindSchema),
  missingArtifactPaths: z.array(z.string().min(1).max(1000)),
  artifactHashMismatches: z.array(z.object({
    path: z.string().min(1).max(1000),
    expected: z.string().regex(/^[a-f0-9]{64}$/),
    actual: z.string().regex(/^[a-f0-9]{64}$/),
  })),
  artifactByteMismatches: z.array(z.object({
    path: z.string().min(1).max(1000),
    expected: z.number().int().nonnegative(),
    actual: z.number().int().nonnegative(),
  })),
  artifactSecretMarkerMismatches: z.array(z.object({
    path: z.string().min(1).max(1000),
    expected: z.array(AgentCommerceGaReleaseArtifactSecretMarkerSchema),
    actual: z.array(AgentCommerceGaReleaseArtifactSecretMarkerSchema),
  })),
}) satisfies z.ZodType<AgentCommerceGaReleaseArtifactIndexVerificationResult>

export const AgentCommerceGaReleaseDossierBlockerSchema = z.enum([
  'artifact_index_not_ready',
  'artifact_index_verification_not_ready',
  'artifact_index_verification_not_bound',
  'artifact_index_hash_invalid',
  'artifact_index_metadata_invalid',
  'artifact_file_missing',
  'artifact_hash_mismatch',
  'artifact_byte_mismatch',
  'artifact_secret_marker_drift',
  'artifact_secret_marker_present',
  'required_artifact_missing',
  'attestation_artifacts_insufficient',
  'bundle_verification_not_ready',
  'certificate_not_ready',
  'certificate_verification_not_ready',
])

export type AgentCommerceGaReleaseDossierBlocker = z.infer<
  typeof AgentCommerceGaReleaseDossierBlockerSchema
>

export const AgentCommerceGaReleaseDossierSchema = z.object({
  schema_version: z.literal('agent-commerce-ga-release-dossier:v1'),
  release: z.string().min(1).max(120),
  environment: z.enum(['staging', 'production']),
  target_environment: z.enum(['staging', 'production']),
  generated_at: z.string().datetime(),
  ready: z.boolean(),
  blockers: z.array(AgentCommerceGaReleaseDossierBlockerSchema),
  index_hash: z.string().regex(/^[a-f0-9]{64}$/),
  expected_index_hash: z.string().regex(/^[a-f0-9]{64}$/),
  actual_index_hash: z.string().regex(/^[a-f0-9]{64}$/),
  verification_bound_to_index: z.boolean(),
  certificate_summary: z.object({
    ready: z.boolean(),
    bundle_hash: z.string().regex(/^[a-f0-9]{64}$/),
    promotion_decision_hash: z.string().regex(/^[a-f0-9]{64}$/),
    attestation_quorum_hash: z.string().regex(/^[a-f0-9]{64}$/),
    required_attestations: z.number().int().positive(),
    attestation_key_ids: z.array(z.string().min(1).max(120)),
    attestor_ids: z.array(z.string().min(1).max(300)),
  }),
  verification_summary: z.object({
    index_ready: z.boolean(),
    index_hash_valid: z.boolean(),
    index_metadata_self_consistent: z.boolean(),
    artifact_files_present: z.boolean(),
    artifact_hashes_valid: z.boolean(),
    artifact_bytes_valid: z.boolean(),
    artifact_secret_markers_valid: z.boolean(),
    no_artifact_secret_markers: z.boolean(),
    required_artifacts_present: z.boolean(),
    attestation_artifacts_sufficient: z.boolean(),
    bundle_verification_ready: z.boolean(),
    certificate_ready: z.boolean(),
    certificate_verification_ready: z.boolean(),
    missing_artifact_path_count: z.number().int().nonnegative(),
    artifact_hash_mismatch_count: z.number().int().nonnegative(),
    artifact_byte_mismatch_count: z.number().int().nonnegative(),
    artifact_secret_marker_mismatch_count: z.number().int().nonnegative(),
  }),
  artifact_counts: z.object({
    total: z.number().int().nonnegative(),
    required: z.number().int().nonnegative(),
    promotion_attestations: z.number().int().nonnegative(),
    provider_promotions: z.number().int().nonnegative(),
    supporting: z.number().int().nonnegative(),
    missing_required: z.number().int().nonnegative(),
    secret_marker_paths: z.number().int().nonnegative(),
    total_bytes: z.number().int().nonnegative(),
  }),
  artifacts: z.array(z.object({
    kind: AgentCommerceGaReleaseArtifactKindSchema,
    path: z.string().min(1).max(1000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().nonnegative(),
    secret_marker_count: z.number().int().nonnegative(),
  })),
  public_links: z.record(z.string(), z.string().url()),
  dossier_hash: z.string().regex(/^[a-f0-9]{64}$/),
})

export type AgentCommerceGaReleaseDossier = z.infer<
  typeof AgentCommerceGaReleaseDossierSchema
>

export interface AgentCommerceGaReleaseDossierInput {
  index: AgentCommerceGaReleaseArtifactIndex
  verification: AgentCommerceGaReleaseArtifactIndexVerificationResult
  generatedAt?: string
  publicLinks?: Record<string, string>
}

export interface AgentCommerceGaReleaseDossierVerificationResult {
  ready: boolean
  dossierReady: boolean
  dossierHashValid: boolean
  dossierSelfConsistent: boolean
  dossierBoundToIndex: boolean
  artifactIndexReady: boolean
  artifactIndexVerificationReady: boolean
  markdownMatches: boolean
  expectedDossierHash: string
  actualDossierHash: string
  expectedMarkdownSha256: string
  actualMarkdownSha256: string
  expectedBlockers: AgentCommerceGaReleaseDossierBlocker[]
  actualBlockers: AgentCommerceGaReleaseDossierBlocker[]
  dossierFieldMismatches: string[]
}

export const AgentCommerceGaReleaseDossierVerificationResultSchema = z.object({
  ready: z.boolean(),
  dossierReady: z.boolean(),
  dossierHashValid: z.boolean(),
  dossierSelfConsistent: z.boolean(),
  dossierBoundToIndex: z.boolean(),
  artifactIndexReady: z.boolean(),
  artifactIndexVerificationReady: z.boolean(),
  markdownMatches: z.boolean(),
  expectedDossierHash: z.string().regex(/^[a-f0-9]{64}$/),
  actualDossierHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedMarkdownSha256: z.string().regex(/^[a-f0-9]{64}$/),
  actualMarkdownSha256: z.string().regex(/^[a-f0-9]{64}$/),
  expectedBlockers: z.array(AgentCommerceGaReleaseDossierBlockerSchema),
  actualBlockers: z.array(AgentCommerceGaReleaseDossierBlockerSchema),
  dossierFieldMismatches: z.array(z.string().min(1).max(120)),
}) satisfies z.ZodType<AgentCommerceGaReleaseDossierVerificationResult>

function unique<T>(items: Iterable<T>): T[] {
  return [...new Set(items)]
}

function duplicatePaths(sourceFiles: AgentCommerceGaReleaseBundleSourceFile[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const source of sourceFiles) {
    if (seen.has(source.path)) duplicates.add(source.path)
    seen.add(source.path)
  }
  return [...duplicates].sort()
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  )
}

export function stableAgentCommerceReleaseBundleStringify(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

function sha256Json(value: unknown): string {
  return createHash('sha256')
    .update(stableAgentCommerceReleaseBundleStringify(value))
    .digest('hex')
}

function sha256Text(value: string): string {
  return createHash('sha256')
    .update(value)
    .digest('hex')
}

function hmacSha256Json(value: unknown, secret: string): string {
  return createHmac('sha256', secret)
    .update(stableAgentCommerceReleaseBundleStringify(value))
    .digest('hex')
}

function unsignedReleaseBundle(bundle: AgentCommerceGaReleaseBundle): Omit<AgentCommerceGaReleaseBundle, 'bundle_hash'> {
  return {
    schema_version: bundle.schema_version,
    release: bundle.release,
    environment: bundle.environment,
    generated_at: bundle.generated_at,
    ready: bundle.ready,
    ga_evidence: bundle.ga_evidence,
    ga_readiness: bundle.ga_readiness,
    source_files: bundle.source_files,
    source_integrity: bundle.source_integrity,
  }
}

export function hashAgentCommerceGaReleaseBundle(bundle: AgentCommerceGaReleaseBundle): string {
  return sha256Json(unsignedReleaseBundle(bundle))
}

function requiredSourceKindsForReport(
  gaEvidence: AgentCommerceGaEvidenceInput,
  report: AgentCommerceGaEvidenceReport,
): AgentCommerceGaReleaseBundleSourceKind[] {
  const required: AgentCommerceGaReleaseBundleSourceKind[] = ['ga_evidence']

  const stagingResult = report.results.find((result) => result.id === 'staging_reconciliation_beta_window')
  if (stagingResult?.missingEvidence.length === 0) required.push('staging_reconciliation')

  const securityResult = report.results.find((result) => result.id === 'external_security_review')
  if (securityResult?.missingEvidence.length === 0) required.push('security_review')

  if ((gaEvidence.providerPromotions ?? []).length > 0) required.push('provider_promotion')

  return unique(required)
}

function evaluateSourceIntegrity(
  gaEvidence: AgentCommerceGaEvidenceInput,
  report: AgentCommerceGaEvidenceReport,
  sourceFiles: AgentCommerceGaReleaseBundleSourceFile[],
): AgentCommerceGaReleaseBundleSourceIntegrity {
  const parsedSources = sourceFiles.map((source) => AgentCommerceGaReleaseBundleSourceFileSchema.parse(source))
  const suppliedKinds = new Set(parsedSources.map((source) => source.kind))
  const requiredSourceKinds = requiredSourceKindsForReport(gaEvidence, report)
  const missingSourceKinds = requiredSourceKinds.filter((kind) => !suppliedKinds.has(kind))
  const providerPromotionSources = new Set(
    parsedSources
      .filter((source) => source.kind === 'provider_promotion' && source.provider)
      .map((source) => source.provider as AgentCommerceProviderId),
  )
  const missingProviderPromotionSources = unique(
    (gaEvidence.providerPromotions ?? [])
      .filter((promotion) => !providerPromotionSources.has(promotion.provider))
      .map((promotion) => promotion.provider),
  ).sort()
  const providerPromotionEnvironmentMismatches = (gaEvidence.providerPromotions ?? [])
    .filter((promotion) => promotion.environment !== gaEvidence.environment)
    .map((promotion) => ({
      provider: promotion.provider,
      expected: gaEvidence.environment,
      actual: promotion.environment,
    }))

  const duplicateSourcePaths = duplicatePaths(parsedSources)

  return {
    ready: missingSourceKinds.length === 0
      && duplicateSourcePaths.length === 0
      && missingProviderPromotionSources.length === 0
      && providerPromotionEnvironmentMismatches.length === 0,
    requiredSourceKinds,
    missingSourceKinds,
    duplicatePaths: duplicateSourcePaths,
    missingProviderPromotionSources,
    providerPromotionEnvironmentMismatches,
  }
}

export function createAgentCommerceGaReleaseBundle(
  input: AgentCommerceGaReleaseBundleInput,
): AgentCommerceGaReleaseBundle {
  const gaEvidence = AgentCommerceGaEvidenceInputFileSchema.parse(input.gaEvidence)
  const gaReadiness = evaluateAgentCommerceGaEvidence(gaEvidence)
  const sourceFiles = input.sourceFiles.map((source) => AgentCommerceGaReleaseBundleSourceFileSchema.parse(source))
  const sourceIntegrity = evaluateSourceIntegrity(gaEvidence, gaReadiness, sourceFiles)
  const generatedAt = input.generatedAt ?? new Date().toISOString()

  const unsigned = {
    schema_version: 'agent-commerce-ga-release-bundle:v1' as const,
    release: gaEvidence.release,
    environment: gaEvidence.environment,
    generated_at: generatedAt,
    ready: gaReadiness.ready && sourceIntegrity.ready,
    ga_evidence: gaEvidence,
    ga_readiness: gaReadiness,
    source_files: sourceFiles,
    source_integrity: sourceIntegrity,
  }

  return AgentCommerceGaReleaseBundleSchema.parse({
    ...unsigned,
    bundle_hash: sha256Json(unsigned),
  })
}

export function verifyAgentCommerceGaReleaseBundle(
  bundleInput: AgentCommerceGaReleaseBundle,
  actualSources: AgentCommerceGaReleaseBundleVerificationSource[],
): AgentCommerceGaReleaseBundleVerificationResult {
  const bundle = AgentCommerceGaReleaseBundleSchema.parse(bundleInput)
  const expectedBundle = createAgentCommerceGaReleaseBundle({
    generatedAt: bundle.generated_at,
    gaEvidence: bundle.ga_evidence,
    sourceFiles: bundle.source_files,
  })
  const expectedBundleHash = hashAgentCommerceGaReleaseBundle(bundle)
  const actualBundleHash = bundle.bundle_hash
  const actualSourceByPath = new Map(actualSources.map((source) => [source.path, source]))
  const missingSourceFiles: string[] = []
  const sourceHashMismatches: AgentCommerceGaReleaseBundleSourceHashMismatch[] = []
  const sourceByteMismatches: AgentCommerceGaReleaseBundleSourceByteMismatch[] = []

  for (const source of bundle.source_files) {
    const actualSource = actualSourceByPath.get(source.path)
    if (!actualSource) {
      missingSourceFiles.push(source.path)
      continue
    }

    if (actualSource.sha256 !== source.sha256) {
      sourceHashMismatches.push({
        path: source.path,
        expected: source.sha256,
        actual: actualSource.sha256,
      })
    }

    if (
      typeof source.bytes === 'number'
      && typeof actualSource.bytes === 'number'
      && actualSource.bytes !== source.bytes
    ) {
      sourceByteMismatches.push({
        path: source.path,
        expected: source.bytes,
        actual: actualSource.bytes,
      })
    }
  }

  const bundleHashValid = expectedBundleHash === actualBundleHash
  const bundleSelfConsistent = stableAgentCommerceReleaseBundleStringify(expectedBundle)
    === stableAgentCommerceReleaseBundleStringify(bundle)
  const sourceHashesValid = missingSourceFiles.length === 0 && sourceHashMismatches.length === 0
  const sourceBytesValid = sourceByteMismatches.length === 0

  return {
    ready: bundle.ready
      && expectedBundle.ready
      && bundleHashValid
      && bundleSelfConsistent
      && sourceHashesValid
      && sourceBytesValid,
    bundleHashValid,
    bundleSelfConsistent,
    gaReadinessReady: expectedBundle.ga_readiness.ready,
    sourceIntegrityReady: expectedBundle.source_integrity.ready,
    sourceHashesValid,
    sourceBytesValid,
    expectedBundleHash,
    actualBundleHash,
    missingSourceFiles: missingSourceFiles.sort(),
    sourceHashMismatches,
    sourceByteMismatches,
  }
}

export function decideAgentCommerceGaPromotion(
  input: AgentCommerceGaPromotionDecisionInput,
): AgentCommerceGaPromotionDecision {
  const bundle = AgentCommerceGaReleaseBundleSchema.parse(input.bundle)
  const verification = input.verification
  const targetEnvironment = input.targetEnvironment ?? bundle.environment
  const gateBlockers = bundle.ga_readiness.results
    .filter((result) => !result.ready)
    .map((result) => ({
      id: result.id,
      label: result.label,
      missingEvidence: result.missingEvidence,
      missingCommands: result.missingCommands,
    }))
  const providerPromotionBlockers = bundle.ga_readiness.providerPromotions
    .filter((promotion) => !promotion.ready)
    .map((promotion) => ({
      provider: promotion.provider,
      missingEvidence: promotion.missingEvidence,
      blockers: promotion.blockers,
    }))
  const blockers: AgentCommerceGaPromotionBlocker[] = []

  if (targetEnvironment !== bundle.environment) blockers.push('target_environment_mismatch')
  if (!bundle.ready) blockers.push('bundle_not_ready')
  if (!verification.bundleHashValid) blockers.push('bundle_hash_invalid')
  if (!verification.bundleSelfConsistent) blockers.push('bundle_not_self_consistent')
  if (!verification.gaReadinessReady) blockers.push('ga_readiness_incomplete')
  if (!verification.sourceIntegrityReady) blockers.push('source_integrity_incomplete')
  if (verification.missingSourceFiles.length > 0) blockers.push('source_files_missing')
  if (verification.sourceHashMismatches.length > 0) blockers.push('source_hash_mismatch')
  if (verification.sourceByteMismatches.length > 0) blockers.push('source_byte_mismatch')
  if (gateBlockers.some((gate) => gate.id === 'staging_reconciliation_beta_window')) {
    blockers.push('staging_reconciliation_incomplete')
  }
  if (gateBlockers.some((gate) => gate.id === 'external_security_review')) {
    blockers.push('external_security_review_incomplete')
  }
  if (providerPromotionBlockers.length > 0) blockers.push('provider_promotion_incomplete')

  const uniqueBlockers = unique(blockers)
  const approved = verification.ready && uniqueBlockers.length === 0

  return AgentCommerceGaPromotionDecisionSchema.parse({
    schema_version: 'agent-commerce-ga-promotion-decision:v1',
    release: bundle.release,
    environment: bundle.environment,
    target_environment: targetEnvironment,
    decided_at: input.decidedAt ?? new Date().toISOString(),
    decision: approved ? 'approved' : 'blocked',
    approved,
    blockers: uniqueBlockers,
    gate_blockers: gateBlockers,
    provider_promotion_blockers: providerPromotionBlockers,
    bundle_verification: {
      ready: verification.ready,
      bundle_hash_valid: verification.bundleHashValid,
      bundle_self_consistent: verification.bundleSelfConsistent,
      ga_readiness_ready: verification.gaReadinessReady,
      source_integrity_ready: verification.sourceIntegrityReady,
      source_hashes_valid: verification.sourceHashesValid,
      source_bytes_valid: verification.sourceBytesValid,
      expected_bundle_hash: verification.expectedBundleHash,
      actual_bundle_hash: verification.actualBundleHash,
      missing_source_file_count: verification.missingSourceFiles.length,
      source_hash_mismatch_count: verification.sourceHashMismatches.length,
      source_byte_mismatch_count: verification.sourceByteMismatches.length,
    },
    bundle_hash: bundle.bundle_hash,
  })
}

export function hashAgentCommerceGaPromotionDecision(
  decisionInput: AgentCommerceGaPromotionDecision,
): string {
  const decision = AgentCommerceGaPromotionDecisionSchema.parse(decisionInput)
  return sha256Json(decision)
}

function unsignedPromotionAttestation(
  attestation: Omit<AgentCommerceGaPromotionAttestation, 'signature'>,
): Omit<AgentCommerceGaPromotionAttestation, 'signature'> {
  return {
    schema_version: attestation.schema_version,
    release: attestation.release,
    environment: attestation.environment,
    target_environment: attestation.target_environment,
    attested_at: attestation.attested_at,
    attestor: attestation.attestor,
    approved: attestation.approved,
    statement: attestation.statement,
    promotion_decision_hash: attestation.promotion_decision_hash,
    bundle_hash: attestation.bundle_hash,
  }
}

export function createAgentCommerceGaPromotionAttestation(
  input: AgentCommerceGaPromotionAttestationInput,
): AgentCommerceGaPromotionAttestation {
  const decision = AgentCommerceGaPromotionDecisionSchema.parse(input.decision)
  if (!decision.approved) {
    throw new Error('Cannot attest a blocked Agent Commerce GA promotion decision.')
  }

  const unsigned = unsignedPromotionAttestation({
    schema_version: 'agent-commerce-ga-promotion-attestation:v1',
    release: decision.release,
    environment: decision.environment,
    target_environment: decision.target_environment,
    attested_at: input.attestedAt ?? new Date().toISOString(),
    attestor: AgentCommerceGaPromotionAttestorSchema.parse(input.attestor),
    approved: true,
    statement: AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_STATEMENT,
    promotion_decision_hash: hashAgentCommerceGaPromotionDecision(decision),
    bundle_hash: decision.bundle_hash,
  })

  return AgentCommerceGaPromotionAttestationSchema.parse({
    ...unsigned,
    signature: {
      alg: 'HMAC-SHA256',
      key_id: input.signing.keyId,
      value: hmacSha256Json(unsigned, input.signing.secret),
    },
  })
}

export function verifyAgentCommerceGaPromotionAttestation(
  attestationInput: AgentCommerceGaPromotionAttestation,
  decisionInput: AgentCommerceGaPromotionDecision,
  signingSecret: string,
): AgentCommerceGaPromotionAttestationVerificationResult {
  const attestation = AgentCommerceGaPromotionAttestationSchema.parse(attestationInput)
  const decision = AgentCommerceGaPromotionDecisionSchema.parse(decisionInput)
  const expectedDecisionHash = hashAgentCommerceGaPromotionDecision(decision)
  const actualDecisionHash = attestation.promotion_decision_hash
  const expectedSignature = hmacSha256Json(unsignedPromotionAttestation(attestation), signingSecret)
  const actualSignature = attestation.signature.value
  const decisionHashValid = expectedDecisionHash === actualDecisionHash
  const bundleHashValid = decision.bundle_hash === attestation.bundle_hash
  const releaseMatches = decision.release === attestation.release
  const environmentMatches = decision.environment === attestation.environment
  const targetEnvironmentMatches = decision.target_environment === attestation.target_environment
  const signatureValid = expectedSignature === actualSignature

  return {
    ready: decision.approved
      && decisionHashValid
      && bundleHashValid
      && releaseMatches
      && environmentMatches
      && targetEnvironmentMatches
      && signatureValid,
    decisionApproved: decision.approved,
    decisionHashValid,
    bundleHashValid,
    releaseMatches,
    environmentMatches,
    targetEnvironmentMatches,
    signatureValid,
    expectedDecisionHash,
    actualDecisionHash,
    expectedSignature,
    actualSignature,
  }
}

function attestorId(attestation: AgentCommerceGaPromotionAttestation): string {
  return attestation.attestor.identity_url
    ?? `${attestation.attestor.name}:${attestation.attestor.role}`
}

function defaultRequiredAttestations(environment: AgentCommerceGaPromotionDecision['target_environment']): number {
  return environment === 'production' ? 2 : 1
}

export function evaluateAgentCommerceGaPromotionAttestationQuorum(
  input: AgentCommerceGaPromotionAttestationQuorumInput,
): AgentCommerceGaPromotionAttestationQuorum {
  const decision = AgentCommerceGaPromotionDecisionSchema.parse(input.decision)
  const targetEnvironment = input.targetEnvironment ?? decision.target_environment
  const requiredAttestations = input.requiredAttestations
    ?? defaultRequiredAttestations(targetEnvironment)
  const requiredRoles = unique(input.requiredRoles ?? [])
  const validAttestations: AgentCommerceGaPromotionAttestationQuorum['valid_attestations'] = []
  const invalidAttestations: AgentCommerceGaPromotionAttestationQuorum['invalid_attestations'] = []

  for (const rawAttestation of input.attestations) {
    const attestation = AgentCommerceGaPromotionAttestationSchema.parse(rawAttestation)
    const keyId = attestation.signature.key_id
    const secret = input.signingKeys[keyId]
    const reasons: AgentCommerceGaPromotionAttestationInvalidReason[] = []

    if (!secret) {
      reasons.push('unknown_signing_key')
    } else {
      const verification = verifyAgentCommerceGaPromotionAttestation(attestation, decision, secret)
      if (!verification.decisionApproved) reasons.push('decision_not_approved')
      if (!verification.decisionHashValid) reasons.push('decision_hash_mismatch')
      if (!verification.bundleHashValid) reasons.push('bundle_hash_mismatch')
      if (!verification.releaseMatches) reasons.push('release_mismatch')
      if (!verification.environmentMatches) reasons.push('environment_mismatch')
      if (!verification.targetEnvironmentMatches) reasons.push('target_environment_mismatch')
      if (!verification.signatureValid) reasons.push('invalid_signature')
    }

    if (attestation.target_environment !== targetEnvironment && !reasons.includes('target_environment_mismatch')) {
      reasons.push('target_environment_mismatch')
    }

    if (reasons.length > 0) {
      invalidAttestations.push({
        key_id: keyId,
        attestor_id: attestorId(attestation),
        reasons: unique(reasons),
      })
      continue
    }

    validAttestations.push({
      key_id: keyId,
      attestor_id: attestorId(attestation),
      role: attestation.attestor.role,
      promotion_decision_hash: attestation.promotion_decision_hash,
      bundle_hash: attestation.bundle_hash,
    })
  }

  const validAttestorIds = validAttestations.map((attestation) => attestation.attestor_id)
  const distinctValidAttestorIds = unique(validAttestorIds)
  const duplicateAttestorIds = unique(
    validAttestorIds.filter((id, index) => validAttestorIds.indexOf(id) !== index),
  )
  const satisfiedRoles = unique(validAttestations.map((attestation) => attestation.role))
  const missingRoles = requiredRoles.filter((role) => !satisfiedRoles.includes(role))
  const blockers: AgentCommerceGaPromotionAttestationQuorumBlocker[] = []

  if (!decision.approved) blockers.push('decision_not_approved')
  if (targetEnvironment !== decision.target_environment) blockers.push('target_environment_mismatch')
  if (invalidAttestations.some((attestation) => attestation.reasons.includes('unknown_signing_key'))) {
    blockers.push('unknown_signing_key')
  }
  if (invalidAttestations.length > 0) blockers.push('invalid_attestation')
  if (distinctValidAttestorIds.length < requiredAttestations) {
    blockers.push('insufficient_valid_attestations')
  }
  if (missingRoles.length > 0) blockers.push('missing_required_roles')

  const uniqueBlockers = unique(blockers)

  return AgentCommerceGaPromotionAttestationQuorumSchema.parse({
    schema_version: 'agent-commerce-ga-promotion-attestation-quorum:v1',
    release: decision.release,
    environment: decision.environment,
    target_environment: targetEnvironment,
    evaluated_at: input.evaluatedAt ?? new Date().toISOString(),
    ready: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    required_attestations: requiredAttestations,
    valid_attestation_count: validAttestations.length,
    distinct_valid_attestor_count: distinctValidAttestorIds.length,
    required_roles: requiredRoles,
    satisfied_roles: satisfiedRoles,
    missing_roles: missingRoles,
    valid_attestations: validAttestations,
    invalid_attestations: invalidAttestations,
    duplicate_attestor_ids: duplicateAttestorIds,
    decision_hash: hashAgentCommerceGaPromotionDecision(decision),
    bundle_hash: decision.bundle_hash,
  })
}

export function hashAgentCommerceGaPromotionAttestationQuorum(
  quorumInput: AgentCommerceGaPromotionAttestationQuorum,
): string {
  const quorum = AgentCommerceGaPromotionAttestationQuorumSchema.parse(quorumInput)
  return sha256Json(quorum)
}

export function createAgentCommerceGaReleaseCertificate(
  input: AgentCommerceGaReleaseCertificateInput,
): AgentCommerceGaReleaseCertificate {
  const decision = AgentCommerceGaPromotionDecisionSchema.parse(input.decision)
  const quorum = AgentCommerceGaPromotionAttestationQuorumSchema.parse(input.quorum)
  const promotionDecisionHash = hashAgentCommerceGaPromotionDecision(decision)
  const blockers: AgentCommerceGaReleaseCertificateBlocker[] = []

  if (!decision.approved) blockers.push('promotion_decision_not_approved')
  if (!quorum.ready) blockers.push('attestation_quorum_not_ready')
  if (decision.release !== quorum.release) blockers.push('release_mismatch')
  if (decision.environment !== quorum.environment) blockers.push('environment_mismatch')
  if (decision.target_environment !== quorum.target_environment) blockers.push('target_environment_mismatch')
  if (decision.bundle_hash !== quorum.bundle_hash) blockers.push('bundle_hash_mismatch')
  if (promotionDecisionHash !== quorum.decision_hash) blockers.push('decision_hash_mismatch')

  const uniqueBlockers = unique(blockers)

  return AgentCommerceGaReleaseCertificateSchema.parse({
    schema_version: 'agent-commerce-ga-release-certificate:v1',
    release: decision.release,
    environment: decision.environment,
    target_environment: decision.target_environment,
    issued_at: input.issuedAt ?? new Date().toISOString(),
    ready: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    promotion_decision: decision.decision,
    promotion_decision_approved: decision.approved,
    attestation_quorum_ready: quorum.ready,
    attestation_quorum_blockers: quorum.blockers,
    promotion_decision_hash: promotionDecisionHash,
    attestation_quorum_hash: hashAgentCommerceGaPromotionAttestationQuorum(quorum),
    bundle_hash: decision.bundle_hash,
    required_attestations: quorum.required_attestations,
    valid_attestation_count: quorum.valid_attestation_count,
    distinct_valid_attestor_count: quorum.distinct_valid_attestor_count,
    required_roles: quorum.required_roles,
    satisfied_roles: quorum.satisfied_roles,
    missing_roles: quorum.missing_roles,
    attestation_key_ids: unique(quorum.valid_attestations.map((attestation) => attestation.key_id)).sort(),
    attestor_ids: unique(quorum.valid_attestations.map((attestation) => attestation.attestor_id)).sort(),
  })
}

function stableArrayMatches(left: unknown[], right: unknown[]): boolean {
  return stableAgentCommerceReleaseBundleStringify(left) === stableAgentCommerceReleaseBundleStringify(right)
}

export function verifyAgentCommerceGaReleaseCertificate(
  certificateInput: AgentCommerceGaReleaseCertificate,
  decisionInput: AgentCommerceGaPromotionDecision,
  quorumInput: AgentCommerceGaPromotionAttestationQuorum,
): AgentCommerceGaReleaseCertificateVerificationResult {
  const certificate = AgentCommerceGaReleaseCertificateSchema.parse(certificateInput)
  const decision = AgentCommerceGaPromotionDecisionSchema.parse(decisionInput)
  const quorum = AgentCommerceGaPromotionAttestationQuorumSchema.parse(quorumInput)
  const expectedCertificate = createAgentCommerceGaReleaseCertificate({
    decision,
    quorum,
    issuedAt: certificate.issued_at,
  })
  const expectedPromotionDecisionHash = expectedCertificate.promotion_decision_hash
  const actualPromotionDecisionHash = certificate.promotion_decision_hash
  const expectedAttestationQuorumHash = expectedCertificate.attestation_quorum_hash
  const actualAttestationQuorumHash = certificate.attestation_quorum_hash
  const expectedBundleHash = expectedCertificate.bundle_hash
  const actualBundleHash = certificate.bundle_hash
  const certificateSelfConsistent = stableAgentCommerceReleaseBundleStringify(expectedCertificate)
    === stableAgentCommerceReleaseBundleStringify(certificate)
  const releaseMatches = certificate.release === decision.release && decision.release === quorum.release
  const environmentMatches = certificate.environment === decision.environment && decision.environment === quorum.environment
  const targetEnvironmentMatches = certificate.target_environment === decision.target_environment
    && decision.target_environment === quorum.target_environment
  const bundleHashValid = actualBundleHash === expectedBundleHash && decision.bundle_hash === quorum.bundle_hash
  const promotionDecisionHashValid = actualPromotionDecisionHash === expectedPromotionDecisionHash
    && quorum.decision_hash === expectedPromotionDecisionHash
  const attestationQuorumHashValid = actualAttestationQuorumHash === expectedAttestationQuorumHash
  const attestationKeyIdsMatch = stableArrayMatches(
    certificate.attestation_key_ids,
    expectedCertificate.attestation_key_ids,
  )
  const attestorIdsMatch = stableArrayMatches(certificate.attestor_ids, expectedCertificate.attestor_ids)
  const requiredRolesMatch = stableArrayMatches(certificate.required_roles, expectedCertificate.required_roles)
  const satisfiedRolesMatch = stableArrayMatches(certificate.satisfied_roles, expectedCertificate.satisfied_roles)
  const missingRolesMatch = stableArrayMatches(certificate.missing_roles, expectedCertificate.missing_roles)

  return {
    ready: certificate.ready
      && expectedCertificate.ready
      && certificateSelfConsistent
      && releaseMatches
      && environmentMatches
      && targetEnvironmentMatches
      && bundleHashValid
      && promotionDecisionHashValid
      && attestationQuorumHashValid
      && attestationKeyIdsMatch
      && attestorIdsMatch
      && requiredRolesMatch
      && satisfiedRolesMatch
      && missingRolesMatch,
    certificateReady: certificate.ready,
    certificateSelfConsistent,
    promotionDecisionApproved: decision.approved,
    attestationQuorumReady: quorum.ready,
    releaseMatches,
    environmentMatches,
    targetEnvironmentMatches,
    bundleHashValid,
    promotionDecisionHashValid,
    attestationQuorumHashValid,
    attestationKeyIdsMatch,
    attestorIdsMatch,
    requiredRolesMatch,
    satisfiedRolesMatch,
    missingRolesMatch,
    expectedPromotionDecisionHash,
    actualPromotionDecisionHash,
    expectedAttestationQuorumHash,
    actualAttestationQuorumHash,
    expectedBundleHash,
    actualBundleHash,
    expectedCertificateBlockers: expectedCertificate.blockers,
    actualCertificateBlockers: certificate.blockers,
  }
}

const REQUIRED_RELEASE_ARTIFACT_KINDS: AgentCommerceGaReleaseArtifactKind[] = [
  'ga_evidence',
  'staging_reconciliation_evidence',
  'security_review_evidence',
  'ga_release_bundle',
  'ga_release_bundle_verification',
  'ga_promotion_decision',
  'ga_promotion_attestation_quorum',
  'ga_release_certificate',
  'ga_release_certificate_verification',
]

const SINGLETON_RELEASE_ARTIFACT_KINDS: AgentCommerceGaReleaseArtifactKind[] = [
  ...REQUIRED_RELEASE_ARTIFACT_KINDS,
]

function releaseArtifactIndexMetadata(input: {
  artifacts: AgentCommerceGaReleaseArtifact[]
  bundleVerificationReady: boolean
  certificateReady: boolean
  certificateVerificationReady: boolean
  requiredPromotionAttestations: number
}): {
  blockers: AgentCommerceGaReleaseArtifactIndexBlocker[]
  missingArtifactKinds: AgentCommerceGaReleaseArtifactKind[]
  duplicateSingletonArtifactKinds: AgentCommerceGaReleaseArtifactKind[]
  promotionAttestationArtifactCount: number
  artifactSecretMarkerPaths: AgentCommerceGaReleaseArtifactIndex['artifact_secret_marker_paths']
} {
  const artifactKinds = input.artifacts.map((artifact) => artifact.kind)
  const missingArtifactKinds = REQUIRED_RELEASE_ARTIFACT_KINDS.filter((kind) => !artifactKinds.includes(kind))
  const duplicateSingletonArtifactKinds = SINGLETON_RELEASE_ARTIFACT_KINDS.filter((kind) => {
    return artifactKinds.filter((artifactKind) => artifactKind === kind).length > 1
  })
  const promotionAttestationArtifactCount = artifactKinds
    .filter((artifactKind) => artifactKind === 'ga_promotion_attestation')
    .length
  const artifactSecretMarkerPaths = input.artifacts
    .filter((artifact) => artifact.secret_markers_found.length > 0)
    .map((artifact) => ({
      path: artifact.path,
      markers: artifact.secret_markers_found,
    }))
  const blockers: AgentCommerceGaReleaseArtifactIndexBlocker[] = []

  if (!input.bundleVerificationReady) blockers.push('bundle_verification_not_ready')
  if (!input.certificateReady) blockers.push('certificate_not_ready')
  if (!input.certificateVerificationReady) blockers.push('certificate_verification_not_ready')
  if (missingArtifactKinds.length > 0) blockers.push('missing_required_artifact')
  if (duplicateSingletonArtifactKinds.length > 0) blockers.push('duplicate_singleton_artifact')
  if (promotionAttestationArtifactCount < input.requiredPromotionAttestations) {
    blockers.push('insufficient_attestation_artifacts')
  }
  if (artifactSecretMarkerPaths.length > 0) blockers.push('artifact_contains_secret_marker')

  return {
    blockers: unique(blockers),
    missingArtifactKinds,
    duplicateSingletonArtifactKinds,
    promotionAttestationArtifactCount,
    artifactSecretMarkerPaths,
  }
}

function unsignedReleaseArtifactIndex(
  index: AgentCommerceGaReleaseArtifactIndex,
): Omit<AgentCommerceGaReleaseArtifactIndex, 'index_hash'> {
  return {
    schema_version: index.schema_version,
    release: index.release,
    environment: index.environment,
    target_environment: index.target_environment,
    generated_at: index.generated_at,
    ready: index.ready,
    blockers: index.blockers,
    required_artifact_kinds: index.required_artifact_kinds,
    missing_artifact_kinds: index.missing_artifact_kinds,
    duplicate_singleton_artifact_kinds: index.duplicate_singleton_artifact_kinds,
    required_promotion_attestations: index.required_promotion_attestations,
    promotion_attestation_artifact_count: index.promotion_attestation_artifact_count,
    artifact_secret_marker_paths: index.artifact_secret_marker_paths,
    bundle_verification_ready: index.bundle_verification_ready,
    certificate_verification_ready: index.certificate_verification_ready,
    certificate_summary: index.certificate_summary,
    artifacts: index.artifacts,
  }
}

export function hashAgentCommerceGaReleaseArtifactIndex(
  indexInput: AgentCommerceGaReleaseArtifactIndex,
): string {
  const index = AgentCommerceGaReleaseArtifactIndexSchema.parse(indexInput)
  return sha256Json(unsignedReleaseArtifactIndex(index))
}

export function createAgentCommerceGaReleaseArtifactIndex(
  input: AgentCommerceGaReleaseArtifactIndexInput,
): AgentCommerceGaReleaseArtifactIndex {
  const certificate = AgentCommerceGaReleaseCertificateSchema.parse(input.certificate)
  const bundleVerification = AgentCommerceGaReleaseBundleVerificationResultSchema.parse(input.bundleVerification)
  const certificateVerification = AgentCommerceGaReleaseCertificateVerificationResultSchema.parse(input.certificateVerification)
  const artifacts = input.artifacts
    .map((artifact) => AgentCommerceGaReleaseArtifactSchema.parse(artifact))
    .sort((left, right) => `${left.kind}:${left.path}`.localeCompare(`${right.kind}:${right.path}`))
  const requiredPromotionAttestations = certificate.valid_attestation_count
  const metadata = releaseArtifactIndexMetadata({
    artifacts,
    bundleVerificationReady: bundleVerification.ready,
    certificateReady: certificate.ready,
    certificateVerificationReady: certificateVerification.ready,
    requiredPromotionAttestations,
  })
  const unsigned = {
    schema_version: 'agent-commerce-ga-release-artifact-index:v1' as const,
    release: certificate.release,
    environment: certificate.environment,
    target_environment: certificate.target_environment,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    ready: metadata.blockers.length === 0,
    blockers: metadata.blockers,
    required_artifact_kinds: REQUIRED_RELEASE_ARTIFACT_KINDS,
    missing_artifact_kinds: metadata.missingArtifactKinds,
    duplicate_singleton_artifact_kinds: metadata.duplicateSingletonArtifactKinds,
    required_promotion_attestations: requiredPromotionAttestations,
    promotion_attestation_artifact_count: metadata.promotionAttestationArtifactCount,
    artifact_secret_marker_paths: metadata.artifactSecretMarkerPaths,
    bundle_verification_ready: bundleVerification.ready,
    certificate_verification_ready: certificateVerification.ready,
    certificate_summary: {
      ready: certificate.ready,
      bundle_hash: certificate.bundle_hash,
      promotion_decision_hash: certificate.promotion_decision_hash,
      attestation_quorum_hash: certificate.attestation_quorum_hash,
      required_attestations: certificate.required_attestations,
      attestation_key_ids: certificate.attestation_key_ids,
      attestor_ids: certificate.attestor_ids,
    },
    artifacts,
  }

  return AgentCommerceGaReleaseArtifactIndexSchema.parse({
    ...unsigned,
    index_hash: sha256Json(unsigned),
  })
}

export function verifyAgentCommerceGaReleaseArtifactIndex(
  indexInput: AgentCommerceGaReleaseArtifactIndex,
  actualArtifactsInput: AgentCommerceGaReleaseArtifact[],
): AgentCommerceGaReleaseArtifactIndexVerificationResult {
  const index = AgentCommerceGaReleaseArtifactIndexSchema.parse(indexInput)
  const actualArtifacts = actualArtifactsInput.map((artifact) => AgentCommerceGaReleaseArtifactSchema.parse(artifact))
  const actualByPath = new Map(actualArtifacts.map((artifact) => [artifact.path, artifact]))
  const expectedIndexHash = hashAgentCommerceGaReleaseArtifactIndex(index)
  const actualIndexHash = index.index_hash
  const expectedMetadata = releaseArtifactIndexMetadata({
    artifacts: index.artifacts,
    bundleVerificationReady: index.bundle_verification_ready,
    certificateReady: index.certificate_summary.ready,
    certificateVerificationReady: index.certificate_verification_ready,
    requiredPromotionAttestations: index.required_promotion_attestations,
  })
  const missingArtifactPaths: string[] = []
  const artifactHashMismatches: AgentCommerceGaReleaseArtifactIndexHashMismatch[] = []
  const artifactByteMismatches: AgentCommerceGaReleaseArtifactIndexByteMismatch[] = []
  const artifactSecretMarkerMismatches: AgentCommerceGaReleaseArtifactIndexSecretMarkerMismatch[] = []

  for (const expected of index.artifacts) {
    const actual = actualByPath.get(expected.path)
    if (!actual) {
      missingArtifactPaths.push(expected.path)
      continue
    }

    if (actual.sha256 !== expected.sha256) {
      artifactHashMismatches.push({
        path: expected.path,
        expected: expected.sha256,
        actual: actual.sha256,
      })
    }

    if (actual.bytes !== expected.bytes) {
      artifactByteMismatches.push({
        path: expected.path,
        expected: expected.bytes,
        actual: actual.bytes,
      })
    }

    if (!stableArrayMatches(actual.secret_markers_found, expected.secret_markers_found)) {
      artifactSecretMarkerMismatches.push({
        path: expected.path,
        expected: expected.secret_markers_found,
        actual: actual.secret_markers_found,
      })
    }
  }

  const indexHashValid = expectedIndexHash === actualIndexHash
  const expectedReady = expectedMetadata.blockers.length === 0
  const indexMetadataSelfConsistent = index.ready === expectedReady
    && stableArrayMatches(index.blockers, expectedMetadata.blockers)
    && stableArrayMatches(index.missing_artifact_kinds, expectedMetadata.missingArtifactKinds)
    && stableArrayMatches(index.duplicate_singleton_artifact_kinds, expectedMetadata.duplicateSingletonArtifactKinds)
    && index.promotion_attestation_artifact_count === expectedMetadata.promotionAttestationArtifactCount
    && stableAgentCommerceReleaseBundleStringify(index.artifact_secret_marker_paths)
      === stableAgentCommerceReleaseBundleStringify(expectedMetadata.artifactSecretMarkerPaths)
  const artifactFilesPresent = missingArtifactPaths.length === 0
  const artifactHashesValid = artifactFilesPresent && artifactHashMismatches.length === 0
  const artifactBytesValid = artifactByteMismatches.length === 0
  const artifactSecretMarkersValid = artifactSecretMarkerMismatches.length === 0
  const noArtifactSecretMarkers = index.artifact_secret_marker_paths.length === 0
    && actualArtifacts.every((artifact) => artifact.secret_markers_found.length === 0)
  const requiredArtifactsPresent = expectedMetadata.missingArtifactKinds.length === 0
  const attestationArtifactsSufficient = expectedMetadata.promotionAttestationArtifactCount
    >= index.required_promotion_attestations

  return AgentCommerceGaReleaseArtifactIndexVerificationResultSchema.parse({
    ready: index.ready
      && indexHashValid
      && indexMetadataSelfConsistent
      && artifactFilesPresent
      && artifactHashesValid
      && artifactBytesValid
      && artifactSecretMarkersValid
      && noArtifactSecretMarkers
      && requiredArtifactsPresent
      && attestationArtifactsSufficient
      && index.bundle_verification_ready
      && index.certificate_summary.ready
      && index.certificate_verification_ready,
    indexReady: index.ready,
    indexHashValid,
    indexMetadataSelfConsistent,
    artifactFilesPresent,
    artifactHashesValid,
    artifactBytesValid,
    artifactSecretMarkersValid,
    noArtifactSecretMarkers,
    requiredArtifactsPresent,
    attestationArtifactsSufficient,
    bundleVerificationReady: index.bundle_verification_ready,
    certificateReady: index.certificate_summary.ready,
    certificateVerificationReady: index.certificate_verification_ready,
    expectedIndexHash,
    actualIndexHash,
    expectedBlockers: expectedMetadata.blockers,
    actualBlockers: index.blockers,
    expectedMissingArtifactKinds: expectedMetadata.missingArtifactKinds,
    actualMissingArtifactKinds: index.missing_artifact_kinds,
    missingArtifactPaths: missingArtifactPaths.sort(),
    artifactHashMismatches,
    artifactByteMismatches,
    artifactSecretMarkerMismatches,
  })
}

function unsignedReleaseDossier(
  dossier: AgentCommerceGaReleaseDossier,
): Omit<AgentCommerceGaReleaseDossier, 'dossier_hash'> {
  return {
    schema_version: dossier.schema_version,
    release: dossier.release,
    environment: dossier.environment,
    target_environment: dossier.target_environment,
    generated_at: dossier.generated_at,
    ready: dossier.ready,
    blockers: dossier.blockers,
    index_hash: dossier.index_hash,
    expected_index_hash: dossier.expected_index_hash,
    actual_index_hash: dossier.actual_index_hash,
    verification_bound_to_index: dossier.verification_bound_to_index,
    certificate_summary: dossier.certificate_summary,
    verification_summary: dossier.verification_summary,
    artifact_counts: dossier.artifact_counts,
    artifacts: dossier.artifacts,
    public_links: dossier.public_links,
  }
}

export function hashAgentCommerceGaReleaseDossier(
  dossierInput: AgentCommerceGaReleaseDossier,
): string {
  const dossier = AgentCommerceGaReleaseDossierSchema.parse(dossierInput)
  return sha256Json(unsignedReleaseDossier(dossier))
}

function releaseDossierBlockers(input: {
  index: AgentCommerceGaReleaseArtifactIndex
  verification: AgentCommerceGaReleaseArtifactIndexVerificationResult
  verificationBoundToIndex: boolean
}): AgentCommerceGaReleaseDossierBlocker[] {
  const blockers: AgentCommerceGaReleaseDossierBlocker[] = []

  if (!input.index.ready) blockers.push('artifact_index_not_ready')
  if (!input.verification.ready) blockers.push('artifact_index_verification_not_ready')
  if (!input.verificationBoundToIndex) blockers.push('artifact_index_verification_not_bound')
  if (!input.verification.indexHashValid) blockers.push('artifact_index_hash_invalid')
  if (!input.verification.indexMetadataSelfConsistent) blockers.push('artifact_index_metadata_invalid')
  if (!input.verification.artifactFilesPresent) blockers.push('artifact_file_missing')
  if (!input.verification.artifactHashesValid) blockers.push('artifact_hash_mismatch')
  if (!input.verification.artifactBytesValid) blockers.push('artifact_byte_mismatch')
  if (!input.verification.artifactSecretMarkersValid) blockers.push('artifact_secret_marker_drift')
  if (!input.verification.noArtifactSecretMarkers) blockers.push('artifact_secret_marker_present')
  if (!input.verification.requiredArtifactsPresent) blockers.push('required_artifact_missing')
  if (!input.verification.attestationArtifactsSufficient) blockers.push('attestation_artifacts_insufficient')
  if (!input.verification.bundleVerificationReady) blockers.push('bundle_verification_not_ready')
  if (!input.verification.certificateReady) blockers.push('certificate_not_ready')
  if (!input.verification.certificateVerificationReady) blockers.push('certificate_verification_not_ready')

  return unique(blockers)
}

export function createAgentCommerceGaReleaseDossier(
  input: AgentCommerceGaReleaseDossierInput,
): AgentCommerceGaReleaseDossier {
  const index = AgentCommerceGaReleaseArtifactIndexSchema.parse(input.index)
  const verification = AgentCommerceGaReleaseArtifactIndexVerificationResultSchema.parse(input.verification)
  const expectedIndexHash = hashAgentCommerceGaReleaseArtifactIndex(index)
  const verificationBoundToIndex = verification.actualIndexHash === index.index_hash
    && verification.expectedIndexHash === expectedIndexHash
  const blockers = releaseDossierBlockers({
    index,
    verification,
    verificationBoundToIndex,
  })
  const artifacts = index.artifacts.map((artifactItem) => ({
    kind: artifactItem.kind,
    path: artifactItem.path,
    sha256: artifactItem.sha256,
    bytes: artifactItem.bytes,
    secret_marker_count: artifactItem.secret_markers_found.length,
  }))
  const publicLinks = z.record(z.string(), z.string().url()).parse(input.publicLinks ?? {})
  const unsigned = {
    schema_version: 'agent-commerce-ga-release-dossier:v1' as const,
    release: index.release,
    environment: index.environment,
    target_environment: index.target_environment,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    ready: blockers.length === 0,
    blockers,
    index_hash: index.index_hash,
    expected_index_hash: verification.expectedIndexHash,
    actual_index_hash: verification.actualIndexHash,
    verification_bound_to_index: verificationBoundToIndex,
    certificate_summary: index.certificate_summary,
    verification_summary: {
      index_ready: verification.indexReady,
      index_hash_valid: verification.indexHashValid,
      index_metadata_self_consistent: verification.indexMetadataSelfConsistent,
      artifact_files_present: verification.artifactFilesPresent,
      artifact_hashes_valid: verification.artifactHashesValid,
      artifact_bytes_valid: verification.artifactBytesValid,
      artifact_secret_markers_valid: verification.artifactSecretMarkersValid,
      no_artifact_secret_markers: verification.noArtifactSecretMarkers,
      required_artifacts_present: verification.requiredArtifactsPresent,
      attestation_artifacts_sufficient: verification.attestationArtifactsSufficient,
      bundle_verification_ready: verification.bundleVerificationReady,
      certificate_ready: verification.certificateReady,
      certificate_verification_ready: verification.certificateVerificationReady,
      missing_artifact_path_count: verification.missingArtifactPaths.length,
      artifact_hash_mismatch_count: verification.artifactHashMismatches.length,
      artifact_byte_mismatch_count: verification.artifactByteMismatches.length,
      artifact_secret_marker_mismatch_count: verification.artifactSecretMarkerMismatches.length,
    },
    artifact_counts: {
      total: index.artifacts.length,
      required: REQUIRED_RELEASE_ARTIFACT_KINDS.length,
      promotion_attestations: index.promotion_attestation_artifact_count,
      provider_promotions: index.artifacts.filter((artifactItem) => artifactItem.kind === 'provider_promotion_evidence').length,
      supporting: index.artifacts.filter((artifactItem) => artifactItem.kind === 'supporting').length,
      missing_required: index.missing_artifact_kinds.length,
      secret_marker_paths: index.artifact_secret_marker_paths.length,
      total_bytes: index.artifacts.reduce((sum, artifactItem) => sum + artifactItem.bytes, 0),
    },
    artifacts,
    public_links: publicLinks,
  }

  return AgentCommerceGaReleaseDossierSchema.parse({
    ...unsigned,
    dossier_hash: sha256Json(unsigned),
  })
}

function markdownCell(value: string | number | boolean): string {
  return String(value)
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
}

function statusCell(value: boolean): string {
  return value ? 'ready' : 'blocked'
}

export function renderAgentCommerceGaReleaseDossierMarkdown(
  dossierInput: AgentCommerceGaReleaseDossier,
): string {
  const dossier = AgentCommerceGaReleaseDossierSchema.parse(dossierInput)
  const lines: string[] = [
    `# Agent Commerce GA Release Dossier: ${dossier.release}`,
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Release | ${markdownCell(dossier.release)} |`,
    `| Environment | ${markdownCell(dossier.environment)} |`,
    `| Target environment | ${markdownCell(dossier.target_environment)} |`,
    `| Status | ${statusCell(dossier.ready)} |`,
    `| Generated at | ${markdownCell(dossier.generated_at)} |`,
    `| Dossier hash | \`${dossier.dossier_hash}\` |`,
    `| Artifact index hash | \`${dossier.index_hash}\` |`,
    `| Bundle hash | \`${dossier.certificate_summary.bundle_hash}\` |`,
    `| Promotion decision hash | \`${dossier.certificate_summary.promotion_decision_hash}\` |`,
    `| Attestation quorum hash | \`${dossier.certificate_summary.attestation_quorum_hash}\` |`,
    '',
    '## Verification Summary',
    '',
    '| Check | Result |',
    '| --- | --- |',
    `| Index ready | ${statusCell(dossier.verification_summary.index_ready)} |`,
    `| Index verification bound to index | ${statusCell(dossier.verification_bound_to_index)} |`,
    `| Index hash valid | ${statusCell(dossier.verification_summary.index_hash_valid)} |`,
    `| Index metadata self-consistent | ${statusCell(dossier.verification_summary.index_metadata_self_consistent)} |`,
    `| Artifact files present | ${statusCell(dossier.verification_summary.artifact_files_present)} |`,
    `| Artifact hashes valid | ${statusCell(dossier.verification_summary.artifact_hashes_valid)} |`,
    `| Artifact byte counts valid | ${statusCell(dossier.verification_summary.artifact_bytes_valid)} |`,
    `| Artifact secret-marker scan valid | ${statusCell(dossier.verification_summary.artifact_secret_markers_valid)} |`,
    `| No artifact secret markers | ${statusCell(dossier.verification_summary.no_artifact_secret_markers)} |`,
    `| Required artifacts present | ${statusCell(dossier.verification_summary.required_artifacts_present)} |`,
    `| Attestation artifacts sufficient | ${statusCell(dossier.verification_summary.attestation_artifacts_sufficient)} |`,
    `| Bundle verification ready | ${statusCell(dossier.verification_summary.bundle_verification_ready)} |`,
    `| Certificate ready | ${statusCell(dossier.verification_summary.certificate_ready)} |`,
    `| Certificate verification ready | ${statusCell(dossier.verification_summary.certificate_verification_ready)} |`,
    '',
    '## Artifact Counts',
    '',
    '| Metric | Count |',
    '| --- | ---: |',
    `| Total artifacts | ${dossier.artifact_counts.total} |`,
    `| Required artifact kinds | ${dossier.artifact_counts.required} |`,
    `| Promotion attestations | ${dossier.artifact_counts.promotion_attestations} |`,
    `| Provider promotion artifacts | ${dossier.artifact_counts.provider_promotions} |`,
    `| Supporting artifacts | ${dossier.artifact_counts.supporting} |`,
    `| Missing required artifact kinds | ${dossier.artifact_counts.missing_required} |`,
    `| Artifact paths with secret markers | ${dossier.artifact_counts.secret_marker_paths} |`,
    `| Total bytes | ${dossier.artifact_counts.total_bytes} |`,
    '',
    '## Attestation Summary',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Required attestations | ${dossier.certificate_summary.required_attestations} |`,
    `| Attestation key ids | ${markdownCell(dossier.certificate_summary.attestation_key_ids.join(', ') || 'none')} |`,
    `| Attestor ids | ${markdownCell(dossier.certificate_summary.attestor_ids.join(', ') || 'none')} |`,
    '',
    '## Blockers',
    '',
  ]

  if (dossier.blockers.length === 0) {
    lines.push('- none')
  } else {
    for (const blocker of dossier.blockers) lines.push(`- ${blocker}`)
  }

  lines.push(
    '',
    '## Public Links',
    '',
  )

  const linkEntries = Object.entries(dossier.public_links).sort(([left], [right]) => left.localeCompare(right))
  if (linkEntries.length === 0) {
    lines.push('- none')
  } else {
    for (const [name, url] of linkEntries) lines.push(`- ${markdownCell(name)}: ${markdownCell(url)}`)
  }

  lines.push(
    '',
    '## Artifacts',
    '',
    '| Kind | Path | SHA-256 | Bytes | Secret marker count |',
    '| --- | --- | --- | ---: | ---: |',
  )

  for (const artifactItem of dossier.artifacts) {
    lines.push(`| ${markdownCell(artifactItem.kind)} | ${markdownCell(artifactItem.path)} | \`${artifactItem.sha256}\` | ${artifactItem.bytes} | ${artifactItem.secret_marker_count} |`)
  }

  return `${lines.join('\n')}\n`
}

export function verifyAgentCommerceGaReleaseDossier(
  dossierInput: AgentCommerceGaReleaseDossier,
  indexInput: AgentCommerceGaReleaseArtifactIndex,
  indexVerificationInput: AgentCommerceGaReleaseArtifactIndexVerificationResult,
  markdownInput: string,
): AgentCommerceGaReleaseDossierVerificationResult {
  const dossier = AgentCommerceGaReleaseDossierSchema.parse(dossierInput)
  const index = AgentCommerceGaReleaseArtifactIndexSchema.parse(indexInput)
  const indexVerification = AgentCommerceGaReleaseArtifactIndexVerificationResultSchema.parse(indexVerificationInput)
  const expectedDossier = createAgentCommerceGaReleaseDossier({
    index,
    verification: indexVerification,
    generatedAt: dossier.generated_at,
    publicLinks: dossier.public_links,
  })
  const expectedDossierHash = hashAgentCommerceGaReleaseDossier(dossier)
  const actualDossierHash = dossier.dossier_hash
  const expectedUnsigned = unsignedReleaseDossier(expectedDossier)
  const actualUnsigned = unsignedReleaseDossier(dossier)
  const dossierFieldMismatches = Object.keys(expectedUnsigned)
    .filter((key) => {
      const typedKey = key as keyof typeof expectedUnsigned
      return stableAgentCommerceReleaseBundleStringify(expectedUnsigned[typedKey])
        !== stableAgentCommerceReleaseBundleStringify(actualUnsigned[typedKey])
    })
    .sort()
  const dossierHashValid = expectedDossierHash === actualDossierHash
  const dossierSelfConsistent = dossierFieldMismatches.length === 0
  const expectedIndexHash = hashAgentCommerceGaReleaseArtifactIndex(index)
  const dossierBoundToIndex = dossier.index_hash === index.index_hash
    && indexVerification.expectedIndexHash === expectedIndexHash
    && indexVerification.actualIndexHash === index.index_hash
    && dossier.expected_index_hash === indexVerification.expectedIndexHash
    && dossier.actual_index_hash === indexVerification.actualIndexHash
    && dossier.verification_bound_to_index === expectedDossier.verification_bound_to_index
  const expectedMarkdown = renderAgentCommerceGaReleaseDossierMarkdown(dossier)
  const markdownMatches = markdownInput === expectedMarkdown

  return AgentCommerceGaReleaseDossierVerificationResultSchema.parse({
    ready: dossier.ready
      && dossierHashValid
      && dossierSelfConsistent
      && dossierBoundToIndex
      && index.ready
      && indexVerification.ready
      && markdownMatches,
    dossierReady: dossier.ready,
    dossierHashValid,
    dossierSelfConsistent,
    dossierBoundToIndex,
    artifactIndexReady: index.ready,
    artifactIndexVerificationReady: indexVerification.ready,
    markdownMatches,
    expectedDossierHash,
    actualDossierHash,
    expectedMarkdownSha256: sha256Text(expectedMarkdown),
    actualMarkdownSha256: sha256Text(markdownInput),
    expectedBlockers: expectedDossier.blockers,
    actualBlockers: dossier.blockers,
    dossierFieldMismatches,
  })
}
