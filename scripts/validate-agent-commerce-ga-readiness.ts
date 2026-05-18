import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AGENT_COMMERCE_GA_EVIDENCE_GATES,
  evaluateAgentCommerceGaEvidence,
} from '../src/lib/agent-commerce/ga-readiness'
import {
  AgentCommerceGaEvidenceInputFileSchema,
  AgentCommerceGaReleaseBundleSchema,
} from '../src/lib/agent-commerce/ga-release-bundle'
import {
  AgentCommerceStagingReconciliationEvidenceSummarySchema,
} from '../src/lib/agent-commerce/staging-reconciliation-evidence'
import {
  AgentCommerceSecurityReviewPacketSchema,
  summarizeAgentCommerceSecurityReviewEvidence,
} from '../src/lib/agent-commerce/security-review-evidence'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const errors: string[] = []

function read(relativePath: string): string {
  const absolutePath = path.join(repoRoot, relativePath)
  if (!existsSync(absolutePath)) {
    errors.push(`${relativePath} is missing.`)
    return ''
  }
  return readFileSync(absolutePath, 'utf8')
}

function readJson(relativePath: string): unknown {
  return JSON.parse(read(relativePath))
}

function assertIncludes(source: string, phrase: string, label: string): void {
  if (!source.includes(phrase)) errors.push(`${label} must include "${phrase}".`)
}

function validateEvidenceFile(relativePath: string, label: string): void {
  const parsed = AgentCommerceGaEvidenceInputFileSchema.safeParse(readJson(relativePath))
  if (!parsed.success) {
    errors.push(`${label} has invalid shape: ${parsed.error.message}`)
    return
  }

  const report = evaluateAgentCommerceGaEvidence(parsed.data)
  if (!report.ready) {
    for (const result of report.results.filter((item) => !item.ready)) {
      errors.push(`${label} gate ${result.id} missing evidence=${result.missingEvidence.join(',') || 'none'} commands=${result.missingCommands.join(',') || 'none'}`)
    }
  }
}

const core = read('src/lib/agent-commerce/ga-readiness.ts')
const draftCore = read('src/lib/agent-commerce/ga-evidence-draft.ts')
const releaseBundleCore = read('src/lib/agent-commerce/ga-release-bundle.ts')
const finalLocalGateCore = read('src/lib/agent-commerce/ga-final-local-gate.ts')
const launchStatusCore = read('src/lib/agent-commerce/ga-launch-status.ts')
const stagingCore = read('src/lib/agent-commerce/staging-reconciliation-evidence.ts')
const securityCore = read('src/lib/agent-commerce/security-review-evidence.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_EVIDENCE_GATES',
  'manual_agent_platform_live_rail',
  'manual_seller_live_rail',
  'staging_reconciliation_beta_window',
  'production_dashboard_operational',
  'lucid_l2_p0_execution_blocked',
  'external_security_review',
  'evaluateAgentCommerceGaEvidence',
]) {
  assertIncludes(core, phrase, 'Agent Commerce GA readiness core')
}

for (const phrase of [
  'collectAgentCommerceGaEvidenceDraft',
  'includeLocalEvidence',
  'stagingReconciliation',
  'securityReview',
  'providerPromotions',
  'reconciliationHistoryUrl',
  'securityReviewUrl',
]) {
  assertIncludes(draftCore, phrase, 'Agent Commerce GA evidence draft core')
}

for (const phrase of [
  'summarizeAgentCommerceStagingReconciliationEvidence',
  'seven_day_reconciliation_job_history',
  'stale_approval_reconciliation_log',
  'stuck_credential_reconciliation_log',
  'provider_mismatch_triage_log',
  'zero_untriaged_p0_p1_commerce_incidents',
]) {
  assertIncludes(stagingCore, phrase, 'Agent Commerce staging reconciliation evidence core')
}

for (const phrase of [
  'summarizeAgentCommerceSecurityReviewEvidence',
  'AGENT_COMMERCE_SECURITY_REVIEW_REQUIRED_SCOPE',
  'reviewer_identity',
  'review_scope',
  'findings_disposition',
  'zero_open_p0_p1_findings',
]) {
  assertIncludes(securityCore, phrase, 'Agent Commerce security review evidence core')
}

for (const phrase of [
  'createAgentCommerceGaReleaseBundle',
  'AgentCommerceGaReleaseBundleSchema',
  'verifyAgentCommerceGaReleaseBundle',
  'decideAgentCommerceGaPromotion',
  'AgentCommerceGaPromotionDecisionSchema',
  'createAgentCommerceGaPromotionAttestation',
  'verifyAgentCommerceGaPromotionAttestation',
  'AgentCommerceGaPromotionAttestationSchema',
  'evaluateAgentCommerceGaPromotionAttestationQuorum',
  'AgentCommerceGaPromotionAttestationQuorumSchema',
  'hashAgentCommerceGaPromotionAttestationQuorum',
  'createAgentCommerceGaReleaseCertificate',
  'AgentCommerceGaReleaseCertificateSchema',
  'verifyAgentCommerceGaReleaseCertificate',
  'createAgentCommerceGaReleaseArtifactIndex',
  'hashAgentCommerceGaReleaseArtifactIndex',
  'AgentCommerceGaReleaseArtifactIndexSchema',
  'verifyAgentCommerceGaReleaseArtifactIndex',
  'AgentCommerceGaReleaseArtifactIndexVerificationResultSchema',
  'createAgentCommerceGaReleaseDossier',
  'renderAgentCommerceGaReleaseDossierMarkdown',
  'AgentCommerceGaReleaseDossierSchema',
  'verifyAgentCommerceGaReleaseDossier',
  'AgentCommerceGaReleaseDossierVerificationResultSchema',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_SECRET_MARKERS',
  'source_integrity',
  'bundle_hash',
  'providerPromotionEnvironmentMismatches',
]) {
  assertIncludes(releaseBundleCore, phrase, 'Agent Commerce GA release bundle core')
}

for (const phrase of [
  'AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_COMMANDS',
  'createAgentCommerceGaFinalLocalGate',
  'hashAgentCommerceGaFinalLocalGate',
  'AgentCommerceGaFinalLocalGateSchema',
  'release_dossier_verification_not_ready',
  'missing_required_command',
  'required_command_failed',
  'unexpected_command_result',
]) {
  assertIncludes(finalLocalGateCore, phrase, 'Agent Commerce GA final local gate core')
}

for (const phrase of [
  'createAgentCommerceGaLaunchStatus',
  'verifyAgentCommerceGaLaunchStatus',
  'AgentCommerceGaLaunchStatusVerificationResultSchema',
  'hashAgentCommerceGaLaunchStatus',
  'AgentCommerceGaLaunchStatusSchema',
  'staging_reconciliation_summary_missing',
  'external_security_review_summary_missing',
  'required_provider_promotion_missing',
  'lucid_l2_upstream_p0_unclosed',
]) {
  assertIncludes(launchStatusCore, phrase, 'Agent Commerce GA launch status core')
}

const test = read('src/lib/agent-commerce/__tests__/ga-readiness.test.ts')
const draftTest = read('src/lib/agent-commerce/__tests__/ga-evidence-draft.test.ts')
const releaseBundleTest = read('src/lib/agent-commerce/__tests__/ga-release-bundle.test.ts')
const finalLocalGateTest = read('src/lib/agent-commerce/__tests__/ga-final-local-gate.test.ts')
const launchStatusTest = read('src/lib/agent-commerce/__tests__/ga-launch-status.test.ts')
const stagingTest = read('src/lib/agent-commerce/__tests__/staging-reconciliation-evidence.test.ts')
const securityTest = read('src/lib/agent-commerce/__tests__/security-review-evidence.test.ts')
for (const phrase of [
  'keeps GA blocked until staging and security evidence are attached',
  'passes only when every local, staging, and security gate',
  'seven_day_reconciliation_job_history',
  'zero_open_p0_p1_findings',
]) {
  assertIncludes(test, phrase, 'Agent Commerce GA readiness tests')
}

for (const phrase of [
  'auto-fills local evidence while keeping external staging and security gates open',
  'produces a ready evidence file when local checks and external artifact URLs are present',
  'uses machine-verifiable staging reconciliation evidence without requiring staging log URLs',
  'uses a reviewer packet summary to close the external security review evidence gate',
  'Agent Commerce GA evidence draft collector',
]) {
  assertIncludes(draftTest, phrase, 'Agent Commerce GA evidence draft tests')
}

for (const phrase of [
  'creates a ready release bundle when GA evidence and external source hashes are present',
  'fails closed when ready GA evidence lacks staging or security source artifacts',
  'requires provider-specific source hashes for included provider promotion summaries',
  'fails closed when provider promotion evidence targets a different environment',
  'verifies bundle hash and source hashes against the release artifacts',
  'rejects tampered bundle hashes and changed source artifacts',
  'approves promotion only from a verified ready bundle for the target environment',
  'blocks promotion when bundle verification, target environment, or GA gates are not ready',
  'creates and verifies a signed operator attestation for an approved promotion decision',
  'rejects blocked decisions and invalid attestation signatures',
  'requires a distinct multi-operator quorum for production promotion',
  'blocks attestation quorum on duplicate signers, unknown keys, and missing roles',
  'creates a ready public release certificate from approved decision and ready quorum',
  'blocks release certificate when decision and quorum are not bound to the same artifacts',
  'verifies a public release certificate against its decision and quorum artifacts',
  'rejects tampered public release certificate artifacts',
  'creates a ready release artifact index for the public GA release dossier',
  'blocks release artifact index on missing artifacts, insufficient attestations, and secret markers',
  'verifies the public release artifact index against current artifact files',
  'rejects drifted release artifact index files and content',
  'creates a non-secret release dossier from a verified artifact index',
  'blocks release dossiers when artifact index verification is missing or unbound',
  'verifies release dossier JSON and Markdown against the artifact index',
  'rejects tampered release dossier JSON and Markdown',
]) {
  assertIncludes(releaseBundleTest, phrase, 'Agent Commerce GA release bundle tests')
}

for (const phrase of [
  'creates a ready final local gate from dossier verification and command results',
  'blocks final local gate on unready dossier, missing commands, failed commands, or command drift',
]) {
  assertIncludes(finalLocalGateTest, phrase, 'Agent Commerce GA final local gate tests')
}

for (const phrase of [
  'creates a ready launch status when local and external gates are complete',
  'stays blocked until required real-world launch evidence is attached',
  'verifies launch status against the current release evidence inputs',
  'rejects tampered launch status hashes and copied status drift',
]) {
  assertIncludes(launchStatusTest, phrase, 'Agent Commerce GA launch status tests')
}

for (const phrase of [
  'proves a clean seven-day reconciliation beta window from durable events',
  'keeps the gate open when run history, checks, or incident disposition are missing',
]) {
  assertIncludes(stagingTest, phrase, 'Agent Commerce staging reconciliation evidence tests')
}

for (const phrase of [
  'proves external security review readiness from a complete reviewer packet',
  'keeps the gate open for incomplete scope or open P0/P1 findings',
]) {
  assertIncludes(securityTest, phrase, 'Agent Commerce security review evidence tests')
}

const docs = read('docs/superpowers/reference/agent-commerce-ga-readiness.md')
for (const phrase of [
  'AGENT_COMMERCE_GA_EVIDENCE_FILE',
  'npm run agent-commerce:ga-evidence',
  'npm run agent-commerce:staging-reconciliation-evidence',
  'npm run agent-commerce:security-review-evidence',
  'AGENT_COMMERCE_GA_EVIDENCE_OUTPUT',
  'AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE',
  'AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE',
  'AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES',
  'npm run agent-commerce:ga-release-bundle',
  'npm run agent-commerce:ga-release-bundle:verify',
  'npm run agent-commerce:ga-promotion',
  'npm run agent-commerce:ga-promotion:attest',
  'npm run agent-commerce:ga-promotion:attest:verify',
  'npm run agent-commerce:ga-promotion:attest:quorum',
  'npm run agent-commerce:ga-release-certificate',
  'npm run agent-commerce:ga-release-certificate:verify',
  'npm run agent-commerce:ga-release-artifact-index',
  'npm run agent-commerce:ga-release-artifact-index:verify',
  'npm run agent-commerce:ga-release-dossier',
  'npm run agent-commerce:ga-release-dossier:verify',
  'npm run agent-commerce:ga-final-local-gate',
  'npm run agent-commerce:ga-launch-status',
  'npm run agent-commerce:ga-launch-status:verify',
  'AGENT_COMMERCE_GA_RELEASE_BUNDLE_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_BUNDLE_REQUIRE_READY',
  'AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_REQUIRE_READY',
  'AGENT_COMMERCE_GA_PROMOTION_REQUIRE_APPROVED',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_VERIFY_REQUIRE_READY',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_REQUIRE_READY',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_FILE',
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_ISSUED_AT',
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_REQUIRE_READY',
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_FILE',
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_REQUIRE_READY',
  'AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_FILE',
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_FILE',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_GENERATED_AT',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_REQUIRE_READY',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_SUPPORTING_FILES',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_REQUIRE_READY',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_FILE',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_MARKDOWN_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_GENERATED_AT',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_LINKS_JSON',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_REQUIRE_READY',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_FILE',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_MARKDOWN_FILE',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_REQUIRE_READY',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_FILE',
  'AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_OUTPUT',
  'AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_EVALUATED_AT',
  'AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_REQUIRE_READY',
  'AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_FILE',
  'AGENT_COMMERCE_GA_REQUIRED_PROVIDER_PROMOTIONS',
  'AGENT_COMMERCE_GA_REQUIRE_LUCID_L2_EXECUTION',
  'AGENT_COMMERCE_LUCID_L2_P0_CLOSURE_URLS_JSON',
  'AGENT_COMMERCE_GA_LAUNCH_STATUS_OUTPUT',
  'AGENT_COMMERCE_GA_LAUNCH_STATUS_EVALUATED_AT',
  'AGENT_COMMERCE_GA_LAUNCH_STATUS_REQUIRE_READY',
  'AGENT_COMMERCE_GA_LAUNCH_STATUS_FILE',
  'AGENT_COMMERCE_GA_LAUNCH_STATUS_VERIFY_OUTPUT',
  'AGENT_COMMERCE_GA_LAUNCH_STATUS_VERIFY_REQUIRE_READY',
  'AGENT_COMMERCE_RECONCILIATION_HISTORY_URL',
  'Evidence Gates',
  'Command Gates',
  'staging_reconciliation_beta_window',
  'external_security_review',
  'Provider Access',
]) {
  assertIncludes(docs, phrase, 'Agent Commerce GA readiness docs')
}

const runbook = read('docs/superpowers/runbooks/2026-05-01-agent-commerce-operations.md')
assertIncludes(runbook, 'Agent Commerce GA Readiness Evidence', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:ga-readiness', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:staging-reconciliation-evidence', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:security-review-evidence', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:ga-release-bundle', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:ga-release-bundle:verify', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:ga-promotion', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:ga-promotion:attest', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:ga-promotion:attest:verify', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:ga-promotion:attest:quorum', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:ga-release-certificate', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:ga-release-certificate:verify', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:ga-release-artifact-index', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:ga-release-artifact-index:verify', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:ga-release-dossier', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:ga-release-dossier:verify', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:ga-final-local-gate', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:ga-launch-status', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:ga-launch-status:verify', 'Agent Commerce operations runbook')

const plan = read('docs/superpowers/plans/2026-05-01-agent-commerce-link-and-machine-payments-plan.md')
assertIncludes(plan, 'npm run agent-commerce:ga-readiness', 'Agent Commerce plan')
assertIncludes(plan, 'AGENT_COMMERCE_GA_EVIDENCE_FILE', 'Agent Commerce plan')
assertIncludes(plan, 'durable clean-run reconciliation audit events', 'Agent Commerce plan')
assertIncludes(plan, 'security-review packet validator implemented', 'Agent Commerce plan')
assertIncludes(plan, 'GA release-bundle hash manifest', 'Agent Commerce plan')
assertIncludes(plan, 'GA release-bundle hash manifest/verifier/final promotion decision/operator attestation/quorum/release certificate/verifier/artifact index/verifier/dossier/verifier/final local gate/launch status/verifier', 'Agent Commerce plan')

const backlog = read('docs/BACKLOG.md')
assertIncludes(backlog, 'COMMERCE-P2-012 Add Agent Commerce GA readiness evidence gate', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-025 Add machine-verifiable staging reconciliation GA evidence', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-026 Add external security review evidence packet gate', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-028 Compose provider promotion summaries into GA evidence', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-029 Add typed GA release bundle hash manifest', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-030 Add GA release bundle verifier', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-031 Add final GA promotion decision artifact', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-032 Add signed GA promotion operator attestation', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-033 Add GA promotion multi-attestation quorum', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-034 Add final GA release certificate artifact', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-035 Add GA release certificate verifier', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-036 Add GA release artifact index', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-037 Add GA release artifact index verifier', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-038 Add GA release-ticket dossier generator', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-039 Add GA release-ticket dossier verifier', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-040 Add final local GA release gate', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-041 Add final external GA launch status', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-042 Add final external GA launch status verifier', 'Agent Commerce backlog')

const packageJson = read('package.json')
assertIncludes(packageJson, '"agent-commerce:ga-readiness"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:ga-evidence"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:ga-release-bundle"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:ga-release-bundle:verify"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:ga-promotion"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:ga-promotion:attest"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:ga-promotion:attest:verify"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:ga-promotion:attest:quorum"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:ga-release-certificate"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:ga-release-certificate:verify"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:ga-release-artifact-index"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:ga-release-artifact-index:verify"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:ga-release-dossier"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:ga-release-dossier:verify"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:ga-final-local-gate"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:ga-launch-status"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:ga-launch-status:verify"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:staging-reconciliation-evidence"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:security-review-evidence"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:provider-promotion-evidence"', 'package.json')

const collector = read('scripts/collect-agent-commerce-ga-evidence.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_LOCAL_CHECKS_PASSED',
  'AGENT_COMMERCE_GA_EVIDENCE_OUTPUT',
  'AGENT_COMMERCE_GA_EVIDENCE_REQUIRE_READY',
  'AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE',
  'AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE',
  'AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES',
  'collectAgentCommerceGaEvidenceDraft',
]) {
  assertIncludes(collector, phrase, 'Agent Commerce GA evidence collector')
}

const releaseBundleCollector = read('scripts/collect-agent-commerce-ga-release-bundle.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_EVIDENCE_FILE',
  'AGENT_COMMERCE_GA_RELEASE_BUNDLE_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_BUNDLE_REQUIRE_READY',
  'AGENT_COMMERCE_GA_RELEASE_SOURCE_FILES',
  'createAgentCommerceGaReleaseBundle',
]) {
  assertIncludes(releaseBundleCollector, phrase, 'Agent Commerce GA release bundle collector')
}

const releaseBundleVerifier = read('scripts/verify-agent-commerce-ga-release-bundle.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_RELEASE_BUNDLE_FILE',
  'AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_REQUIRE_READY',
  'verifyAgentCommerceGaReleaseBundle',
]) {
  assertIncludes(releaseBundleVerifier, phrase, 'Agent Commerce GA release bundle verifier')
}

const promotionDecision = read('scripts/decide-agent-commerce-ga-promotion.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_RELEASE_BUNDLE_FILE',
  'AGENT_COMMERCE_GA_PROMOTION_TARGET_ENVIRONMENT',
  'AGENT_COMMERCE_GA_PROMOTION_DECISION_OUTPUT',
  'AGENT_COMMERCE_GA_PROMOTION_REQUIRE_APPROVED',
  'decideAgentCommerceGaPromotion',
]) {
  assertIncludes(promotionDecision, phrase, 'Agent Commerce GA promotion decision collector')
}

const promotionAttestation = read('scripts/attest-agent-commerce-ga-promotion.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTOR_NAME',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEY_ID',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_SIGNING_KEY',
  'createAgentCommerceGaPromotionAttestation',
]) {
  assertIncludes(promotionAttestation, phrase, 'Agent Commerce GA promotion attestation collector')
}

const promotionAttestationVerifier = read('scripts/verify-agent-commerce-ga-promotion-attestation.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_FILE',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_SIGNING_KEY',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_VERIFY_REQUIRE_READY',
  'verifyAgentCommerceGaPromotionAttestation',
]) {
  assertIncludes(promotionAttestationVerifier, phrase, 'Agent Commerce GA promotion attestation verifier')
}

const promotionAttestationQuorum = read('scripts/verify-agent-commerce-ga-promotion-attestation-quorum.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_FILES',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEYRING_JSON',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_REQUIRED_COUNT',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_REQUIRED_ROLES',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_REQUIRE_READY',
  'evaluateAgentCommerceGaPromotionAttestationQuorum',
]) {
  assertIncludes(promotionAttestationQuorum, phrase, 'Agent Commerce GA promotion attestation quorum verifier')
}

const releaseCertificate = read('scripts/collect-agent-commerce-ga-release-certificate.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_FILE',
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_ISSUED_AT',
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_REQUIRE_READY',
  'createAgentCommerceGaReleaseCertificate',
]) {
  assertIncludes(releaseCertificate, phrase, 'Agent Commerce GA release certificate collector')
}

const releaseCertificateVerifier = read('scripts/verify-agent-commerce-ga-release-certificate.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_FILE',
  'AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE',
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_FILE',
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_REQUIRE_READY',
  'verifyAgentCommerceGaReleaseCertificate',
]) {
  assertIncludes(releaseCertificateVerifier, phrase, 'Agent Commerce GA release certificate verifier')
}

const releaseArtifactIndex = read('scripts/collect-agent-commerce-ga-release-artifact-index.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_EVIDENCE_FILE',
  'AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE',
  'AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE',
  'AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_FILE',
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_FILE',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_REQUIRE_READY',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_SUPPORTING_FILES',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_SECRET_MARKERS',
  'createAgentCommerceGaReleaseArtifactIndex',
]) {
  assertIncludes(releaseArtifactIndex, phrase, 'Agent Commerce GA release artifact index collector')
}

const releaseArtifactIndexVerifier = read('scripts/verify-agent-commerce-ga-release-artifact-index.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_REQUIRE_READY',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_SECRET_MARKERS',
  'verifyAgentCommerceGaReleaseArtifactIndex',
]) {
  assertIncludes(releaseArtifactIndexVerifier, phrase, 'Agent Commerce GA release artifact index verifier')
}

const releaseDossierCollector = read('scripts/collect-agent-commerce-ga-release-dossier.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_FILE',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_MARKDOWN_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_GENERATED_AT',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_LINKS_JSON',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_REQUIRE_READY',
  'createAgentCommerceGaReleaseDossier',
  'renderAgentCommerceGaReleaseDossierMarkdown',
]) {
  assertIncludes(releaseDossierCollector, phrase, 'Agent Commerce GA release dossier collector')
}

const releaseDossierVerifier = read('scripts/verify-agent-commerce-ga-release-dossier.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_FILE',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_MARKDOWN_FILE',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE',
  'AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_FILE',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_OUTPUT',
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_REQUIRE_READY',
  'verifyAgentCommerceGaReleaseDossier',
]) {
  assertIncludes(releaseDossierVerifier, phrase, 'Agent Commerce GA release dossier verifier')
}

const finalLocalGateRunner = read('scripts/run-agent-commerce-ga-final-local-gate.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_FILE',
  'AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_OUTPUT',
  'AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_EVALUATED_AT',
  'AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_REQUIRE_READY',
  'AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_COMMANDS',
  'createAgentCommerceGaFinalLocalGate',
]) {
  assertIncludes(finalLocalGateRunner, phrase, 'Agent Commerce GA final local gate runner')
}

const launchStatusCollector = read('scripts/collect-agent-commerce-ga-launch-status.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_EVIDENCE_FILE',
  'AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_FILE',
  'AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE',
  'AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE',
  'AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES',
  'AGENT_COMMERCE_GA_REQUIRED_PROVIDER_PROMOTIONS',
  'AGENT_COMMERCE_GA_REQUIRE_LUCID_L2_EXECUTION',
  'AGENT_COMMERCE_LUCID_L2_P0_CLOSURE_URLS_JSON',
  'AGENT_COMMERCE_GA_LAUNCH_STATUS_OUTPUT',
  'AGENT_COMMERCE_GA_LAUNCH_STATUS_EVALUATED_AT',
  'AGENT_COMMERCE_GA_LAUNCH_STATUS_REQUIRE_READY',
  'createAgentCommerceGaLaunchStatus',
]) {
  assertIncludes(launchStatusCollector, phrase, 'Agent Commerce GA launch status collector')
}

const launchStatusVerifier = read('scripts/verify-agent-commerce-ga-launch-status.ts')
for (const phrase of [
  'AGENT_COMMERCE_GA_LAUNCH_STATUS_FILE',
  'AGENT_COMMERCE_GA_EVIDENCE_FILE',
  'AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_FILE',
  'AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE',
  'AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE',
  'AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES',
  'AGENT_COMMERCE_GA_LAUNCH_STATUS_VERIFY_OUTPUT',
  'AGENT_COMMERCE_GA_LAUNCH_STATUS_VERIFY_REQUIRE_READY',
  'verifyAgentCommerceGaLaunchStatus',
]) {
  assertIncludes(launchStatusVerifier, phrase, 'Agent Commerce GA launch status verifier')
}

const stagingCollector = read('scripts/collect-agent-commerce-staging-reconciliation-evidence.ts')
for (const phrase of [
  'AGENT_COMMERCE_STAGING_ORG_ID',
  'AGENT_COMMERCE_STAGING_RECONCILIATION_EVENTS_FILE',
  'AGENT_COMMERCE_STAGING_RECONCILIATION_INCIDENT_COUNT',
  'summarizeAgentCommerceStagingReconciliationEvidence',
]) {
  assertIncludes(stagingCollector, phrase, 'Agent Commerce staging reconciliation evidence collector')
}

const securityCollector = read('scripts/collect-agent-commerce-security-review-evidence.ts')
for (const phrase of [
  'AGENT_COMMERCE_SECURITY_REVIEW_PACKET_FILE',
  'AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_OUTPUT',
  'AGENT_COMMERCE_SECURITY_REVIEW_REQUIRE_READY',
  'summarizeAgentCommerceSecurityReviewEvidence',
]) {
  assertIncludes(securityCollector, phrase, 'Agent Commerce security review evidence collector')
}

const ci = read('.github/workflows/ci.yml')
assertIncludes(ci, 'npm run agent-commerce:ga-readiness', 'CI workflow')

validateEvidenceFile('ops/agent-commerce/evidence/ga-readiness.example.json', 'Example Agent Commerce GA evidence file')

const stagingExample = AgentCommerceStagingReconciliationEvidenceSummarySchema.safeParse(
  readJson('ops/agent-commerce/evidence/staging-reconciliation.example.json'),
)
if (!stagingExample.success) {
  errors.push(`Example Agent Commerce staging reconciliation evidence file has invalid shape: ${stagingExample.error.message}`)
} else if (!stagingExample.data.ready) {
  errors.push('Example Agent Commerce staging reconciliation evidence file must be ready.')
}

const securityExample = AgentCommerceSecurityReviewPacketSchema.safeParse(
  readJson('ops/agent-commerce/evidence/security-review.example.json'),
)
if (!securityExample.success) {
  errors.push(`Example Agent Commerce security review packet has invalid shape: ${securityExample.error.message}`)
} else if (!summarizeAgentCommerceSecurityReviewEvidence(securityExample.data).ready) {
  errors.push('Example Agent Commerce security review packet must summarize as ready.')
}

const realEvidenceFile = process.env.AGENT_COMMERCE_GA_EVIDENCE_FILE
if (realEvidenceFile?.trim()) {
  const evidencePath = realEvidenceFile.trim()
  if (!existsSync(path.join(repoRoot, evidencePath))) {
    errors.push(`AGENT_COMMERCE_GA_EVIDENCE_FILE does not exist: ${evidencePath}`)
  } else {
    validateEvidenceFile(evidencePath, 'Agent Commerce GA evidence file')
  }
}

const realReleaseBundleFile = process.env.AGENT_COMMERCE_GA_RELEASE_BUNDLE_FILE
if (realReleaseBundleFile?.trim()) {
  const bundlePath = realReleaseBundleFile.trim()
  if (!existsSync(path.join(repoRoot, bundlePath))) {
    errors.push(`AGENT_COMMERCE_GA_RELEASE_BUNDLE_FILE does not exist: ${bundlePath}`)
  } else {
    const parsed = AgentCommerceGaReleaseBundleSchema.safeParse(readJson(bundlePath))
    if (!parsed.success) {
      errors.push(`Agent Commerce GA release bundle has invalid shape: ${parsed.error.message}`)
    } else if (!parsed.data.ready) {
      errors.push('Agent Commerce GA release bundle is not ready.')
    }
  }
}

if (errors.length > 0) {
  console.error('Agent Commerce GA readiness validation failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('Agent Commerce GA readiness is valid.')
