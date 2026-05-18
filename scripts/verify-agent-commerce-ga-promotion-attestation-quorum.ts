import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AgentCommerceGaPromotionAttestationSchema,
  AgentCommerceGaPromotionDecisionSchema,
  evaluateAgentCommerceGaPromotionAttestationQuorum,
} from '../src/lib/agent-commerce/ga-release-bundle'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error(`${name} is required to verify Agent Commerce GA promotion attestation quorum.`)
  return trimmed
}

function entries(value: string | undefined): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? []
}

function readJsonFile(filePath: string, envName: string): unknown {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)
  if (!existsSync(absolutePath)) throw new Error(`${envName} does not exist: ${filePath}`)
  return JSON.parse(readFileSync(absolutePath, 'utf8'))
}

function parseSigningKeys(): Record<string, string> {
  const raw = required(
    process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEYRING_JSON,
    'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEYRING_JSON',
  )
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEYRING_JSON must be a JSON object.')
  }

  const keyring: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEYRING_JSON has invalid secret for key ${key}.`)
    }
    keyring[key] = value
  }
  return keyring
}

function targetEnvironment(): 'staging' | 'production' | undefined {
  const value = process.env.AGENT_COMMERCE_GA_PROMOTION_TARGET_ENVIRONMENT?.trim()
  if (!value) return undefined
  if (value === 'staging' || value === 'production') return value
  throw new Error('AGENT_COMMERCE_GA_PROMOTION_TARGET_ENVIRONMENT must be staging or production.')
}

function requiredAttestations(): number | undefined {
  const value = process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_REQUIRED_COUNT?.trim()
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_REQUIRED_COUNT must be a positive integer.')
  }
  return parsed
}

const decisionFile = required(
  process.env.AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE,
  'AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE',
)
const attestationFiles = entries(process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_FILES)
if (attestationFiles.length === 0) {
  throw new Error('AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_FILES must include at least one attestation file.')
}

const decision = AgentCommerceGaPromotionDecisionSchema.parse(
  readJsonFile(decisionFile, 'AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE'),
)
const attestations = attestationFiles.map((filePath) => AgentCommerceGaPromotionAttestationSchema.parse(
  readJsonFile(filePath, 'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_FILES'),
))
const quorum = evaluateAgentCommerceGaPromotionAttestationQuorum({
  decision,
  attestations,
  signingKeys: parseSigningKeys(),
  targetEnvironment: targetEnvironment(),
  requiredAttestations: requiredAttestations(),
  requiredRoles: entries(process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_REQUIRED_ROLES),
  evaluatedAt: process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_EVALUATED_AT?.trim() || undefined,
})
const json = `${JSON.stringify(quorum, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_OUTPUT?.trim()

if (output) {
  const absolutePath = path.isAbsolute(output) ? output : path.join(repoRoot, output)
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, json)
  console.error(`Wrote Agent Commerce GA promotion attestation quorum to ${path.relative(repoRoot, absolutePath)}`)
} else {
  process.stdout.write(json)
}

if (!quorum.ready) {
  console.error('Agent Commerce GA promotion attestation quorum is not ready:')
  console.error(`- blockers=${quorum.blockers.join(',') || 'none'}`)
  if (quorum.missing_roles.length > 0) console.error(`- missing roles=${quorum.missing_roles.join(',')}`)
  for (const invalid of quorum.invalid_attestations) {
    console.error(`- invalid attestation ${invalid.key_id}/${invalid.attestor_id}: ${invalid.reasons.join(',')}`)
  }
}

if (truthy(process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_REQUIRE_READY) && !quorum.ready) {
  process.exit(1)
}
