import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AgentCommerceGaPromotionAttestationQuorumSchema,
  AgentCommerceGaPromotionDecisionSchema,
  createAgentCommerceGaReleaseCertificate,
} from '../src/lib/agent-commerce/ga-release-bundle'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error(`${name} is required to issue an Agent Commerce GA release certificate.`)
  return trimmed
}

function readJsonFile(filePath: string, envName: string): unknown {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)
  if (!existsSync(absolutePath)) throw new Error(`${envName} does not exist: ${filePath}`)
  return JSON.parse(readFileSync(absolutePath, 'utf8'))
}

const decisionFile = required(
  process.env.AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE,
  'AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE',
)
const quorumFile = required(
  process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_FILE,
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_FILE',
)

const certificate = createAgentCommerceGaReleaseCertificate({
  decision: AgentCommerceGaPromotionDecisionSchema.parse(
    readJsonFile(decisionFile, 'AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE'),
  ),
  quorum: AgentCommerceGaPromotionAttestationQuorumSchema.parse(
    readJsonFile(quorumFile, 'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_FILE'),
  ),
  issuedAt: process.env.AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_ISSUED_AT?.trim() || undefined,
})

const json = `${JSON.stringify(certificate, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_OUTPUT?.trim()

if (output) {
  const absolutePath = path.isAbsolute(output) ? output : path.join(repoRoot, output)
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, json)
  console.error(`Wrote Agent Commerce GA release certificate to ${path.relative(repoRoot, absolutePath)}`)
} else {
  process.stdout.write(json)
}

if (!certificate.ready) {
  console.error('Agent Commerce GA release certificate is not ready:')
  console.error(`- blockers=${certificate.blockers.join(',') || 'none'}`)
  console.error(`- promotion decision approved=${certificate.promotion_decision_approved}`)
  console.error(`- attestation quorum ready=${certificate.attestation_quorum_ready}`)
  console.error(`- attestation quorum blockers=${certificate.attestation_quorum_blockers.join(',') || 'none'}`)
  console.error(`- missing roles=${certificate.missing_roles.join(',') || 'none'}`)
}

if (truthy(process.env.AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_REQUIRE_READY) && !certificate.ready) {
  process.exit(1)
}
