import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AGENT_COMMERCE_GA_RELEASE_ARTIFACT_SECRET_MARKERS,
  AgentCommerceGaReleaseBundleVerificationResultSchema,
  AgentCommerceGaReleaseCertificateSchema,
  AgentCommerceGaReleaseCertificateVerificationResultSchema,
  createAgentCommerceGaReleaseArtifactIndex,
  type AgentCommerceGaReleaseArtifact,
  type AgentCommerceGaReleaseArtifactKind,
} from '../src/lib/agent-commerce/ga-release-bundle'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error(`${name} is required to build an Agent Commerce GA release artifact index.`)
  return trimmed
}

function entries(value: string | undefined): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? []
}

function absolutePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)
}

function displayPath(filePath: string): string {
  const absolute = absolutePath(filePath)
  const relative = path.relative(repoRoot, absolute)
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) return relative.split(path.sep).join('/')
  return absolute
}

function readJsonFile(filePath: string, envName: string): unknown {
  const absolute = absolutePath(filePath)
  if (!existsSync(absolute)) throw new Error(`${envName} does not exist: ${filePath}`)
  return JSON.parse(readFileSync(absolute, 'utf8'))
}

function artifact(filePath: string, kind: AgentCommerceGaReleaseArtifactKind): AgentCommerceGaReleaseArtifact {
  const absolute = absolutePath(filePath)
  if (!existsSync(absolute)) throw new Error(`Agent Commerce GA release artifact does not exist: ${filePath}`)

  const contents = readFileSync(absolute)
  const text = contents.toString('utf8')
  const stats = statSync(absolute)
  const secretMarkers = AGENT_COMMERCE_GA_RELEASE_ARTIFACT_SECRET_MARKERS
    .filter((marker) => text.includes(marker))

  return {
    kind,
    path: displayPath(filePath),
    sha256: createHash('sha256').update(contents).digest('hex'),
    bytes: stats.size,
    secret_markers_found: secretMarkers,
  }
}

const certificateFile = required(
  process.env.AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_FILE,
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_FILE',
)
const releaseBundleVerificationFile = required(
  process.env.AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_FILE,
  'AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_FILE',
)
const certificateVerificationFile = required(
  process.env.AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_FILE,
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_FILE',
)

const artifacts: AgentCommerceGaReleaseArtifact[] = [
  artifact(required(process.env.AGENT_COMMERCE_GA_EVIDENCE_FILE, 'AGENT_COMMERCE_GA_EVIDENCE_FILE'), 'ga_evidence'),
  artifact(
    required(
      process.env.AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE,
      'AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE',
    ),
    'staging_reconciliation_evidence',
  ),
  artifact(
    required(process.env.AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE, 'AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE'),
    'security_review_evidence',
  ),
  artifact(required(process.env.AGENT_COMMERCE_GA_RELEASE_BUNDLE_FILE, 'AGENT_COMMERCE_GA_RELEASE_BUNDLE_FILE'), 'ga_release_bundle'),
  artifact(releaseBundleVerificationFile, 'ga_release_bundle_verification'),
  artifact(required(process.env.AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE, 'AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE'), 'ga_promotion_decision'),
  artifact(
    required(
      process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_FILE,
      'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_FILE',
    ),
    'ga_promotion_attestation_quorum',
  ),
  artifact(certificateFile, 'ga_release_certificate'),
  artifact(certificateVerificationFile, 'ga_release_certificate_verification'),
]

for (const attestationFile of entries(process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_FILES)) {
  artifacts.push(artifact(attestationFile, 'ga_promotion_attestation'))
}

for (const providerPromotionFile of entries(process.env.AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES)) {
  artifacts.push(artifact(providerPromotionFile, 'provider_promotion_evidence'))
}

for (const supportingFile of entries(process.env.AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_SUPPORTING_FILES)) {
  artifacts.push(artifact(supportingFile, 'supporting'))
}

const index = createAgentCommerceGaReleaseArtifactIndex({
  certificate: AgentCommerceGaReleaseCertificateSchema.parse(
    readJsonFile(certificateFile, 'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_FILE'),
  ),
  bundleVerification: AgentCommerceGaReleaseBundleVerificationResultSchema.parse(
    readJsonFile(releaseBundleVerificationFile, 'AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_FILE'),
  ),
  certificateVerification: AgentCommerceGaReleaseCertificateVerificationResultSchema.parse(
    readJsonFile(certificateVerificationFile, 'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_FILE'),
  ),
  artifacts,
  generatedAt: process.env.AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_GENERATED_AT?.trim() || undefined,
})

const json = `${JSON.stringify(index, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_OUTPUT?.trim()

if (output) {
  const absolute = absolutePath(output)
  mkdirSync(path.dirname(absolute), { recursive: true })
  writeFileSync(absolute, json)
  console.error(`Wrote Agent Commerce GA release artifact index to ${path.relative(repoRoot, absolute)}`)
} else {
  process.stdout.write(json)
}

if (!index.ready) {
  console.error('Agent Commerce GA release artifact index is not ready:')
  console.error(`- blockers=${index.blockers.join(',') || 'none'}`)
  console.error(`- missing artifact kinds=${index.missing_artifact_kinds.join(',') || 'none'}`)
  console.error(`- duplicate singleton kinds=${index.duplicate_singleton_artifact_kinds.join(',') || 'none'}`)
  console.error(`- attestation artifacts=${index.promotion_attestation_artifact_count}/${index.required_promotion_attestations}`)
  for (const leak of index.artifact_secret_marker_paths) {
    console.error(`- secret marker leak in ${leak.path}: ${leak.markers.join(',')}`)
  }
}

if (truthy(process.env.AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_REQUIRE_READY) && !index.ready) {
  process.exit(1)
}
