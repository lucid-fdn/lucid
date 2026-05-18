import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AgentCommerceGaPromotionAttestationSchema,
  AgentCommerceGaPromotionDecisionSchema,
  verifyAgentCommerceGaPromotionAttestation,
} from '../src/lib/agent-commerce/ga-release-bundle'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error(`${name} is required to verify an Agent Commerce GA promotion attestation.`)
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
const attestationFile = required(
  process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_FILE,
  'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_FILE',
)
const decision = AgentCommerceGaPromotionDecisionSchema.parse(
  readJsonFile(decisionFile, 'AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE'),
)
const attestation = AgentCommerceGaPromotionAttestationSchema.parse(
  readJsonFile(attestationFile, 'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_FILE'),
)
const verification = verifyAgentCommerceGaPromotionAttestation(
  attestation,
  decision,
  required(
    process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_SIGNING_KEY,
    'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_SIGNING_KEY',
  ),
)
const json = `${JSON.stringify(verification, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_VERIFY_OUTPUT?.trim()

if (output) {
  const absolutePath = path.isAbsolute(output) ? output : path.join(repoRoot, output)
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, json)
  console.error(`Wrote Agent Commerce GA promotion attestation verification to ${path.relative(repoRoot, absolutePath)}`)
} else {
  process.stdout.write(json)
}

if (!verification.ready) {
  console.error('Agent Commerce GA promotion attestation verification failed:')
  if (!verification.decisionApproved) console.error('- promotion decision is not approved')
  if (!verification.decisionHashValid) console.error('- promotion decision hash does not match attestation')
  if (!verification.bundleHashValid) console.error('- bundle hash does not match promotion decision')
  if (!verification.releaseMatches) console.error('- release does not match promotion decision')
  if (!verification.environmentMatches) console.error('- environment does not match promotion decision')
  if (!verification.targetEnvironmentMatches) console.error('- target environment does not match promotion decision')
  if (!verification.signatureValid) console.error('- attestation signature is invalid')
}

if (truthy(process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_VERIFY_REQUIRE_READY) && !verification.ready) {
  process.exit(1)
}
