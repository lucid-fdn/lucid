import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AgentCommerceGaPromotionAttestationQuorumSchema,
  AgentCommerceGaPromotionDecisionSchema,
  AgentCommerceGaReleaseCertificateSchema,
  verifyAgentCommerceGaReleaseCertificate,
} from '../src/lib/agent-commerce/ga-release-bundle'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error(`${name} is required to verify an Agent Commerce GA release certificate.`)
  return trimmed
}

function readJsonFile(filePath: string, envName: string): unknown {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)
  if (!existsSync(absolutePath)) throw new Error(`${envName} does not exist: ${filePath}`)
  return JSON.parse(readFileSync(absolutePath, 'utf8'))
}

const certificateFile = required(
  process.env.AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_FILE,
  'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_FILE',
)
const decisionFile = required(
  process.env.AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE,
  'AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE',
)
const quorumFile = required(
  process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_FILE,
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_FILE',
)

const verification = verifyAgentCommerceGaReleaseCertificate(
  AgentCommerceGaReleaseCertificateSchema.parse(
    readJsonFile(certificateFile, 'AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_FILE'),
  ),
  AgentCommerceGaPromotionDecisionSchema.parse(
    readJsonFile(decisionFile, 'AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE'),
  ),
  AgentCommerceGaPromotionAttestationQuorumSchema.parse(
    readJsonFile(quorumFile, 'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_FILE'),
  ),
)

const json = `${JSON.stringify(verification, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_OUTPUT?.trim()

if (output) {
  const absolutePath = path.isAbsolute(output) ? output : path.join(repoRoot, output)
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, json)
  console.error(`Wrote Agent Commerce GA release certificate verification to ${path.relative(repoRoot, absolutePath)}`)
} else {
  process.stdout.write(json)
}

if (!verification.ready) {
  console.error('Agent Commerce GA release certificate verification failed:')
  console.error(`- certificate ready=${verification.certificateReady}`)
  console.error(`- certificate self consistent=${verification.certificateSelfConsistent}`)
  console.error(`- promotion decision hash valid=${verification.promotionDecisionHashValid}`)
  console.error(`- attestation quorum hash valid=${verification.attestationQuorumHashValid}`)
  console.error(`- bundle hash valid=${verification.bundleHashValid}`)
  console.error(`- actual blockers=${verification.actualCertificateBlockers.join(',') || 'none'}`)
  console.error(`- expected blockers=${verification.expectedCertificateBlockers.join(',') || 'none'}`)
}

if (truthy(process.env.AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_REQUIRE_READY) && !verification.ready) {
  process.exit(1)
}
