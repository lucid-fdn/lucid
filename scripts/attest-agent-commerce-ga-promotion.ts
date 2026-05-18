import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AgentCommerceGaPromotionDecisionSchema,
  createAgentCommerceGaPromotionAttestation,
} from '../src/lib/agent-commerce/ga-release-bundle'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error(`${name} is required to attest an Agent Commerce GA promotion.`)
  return trimmed
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

const decisionFile = required(
  process.env.AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE,
  'AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE',
)
const decisionPath = path.isAbsolute(decisionFile) ? decisionFile : path.join(repoRoot, decisionFile)
if (!existsSync(decisionPath)) {
  throw new Error(`AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE does not exist: ${decisionFile}`)
}

const decision = AgentCommerceGaPromotionDecisionSchema.parse(
  JSON.parse(readFileSync(decisionPath, 'utf8')),
)
const attestation = createAgentCommerceGaPromotionAttestation({
  decision,
  attestedAt: optional(process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTED_AT),
  attestor: {
    name: required(process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTOR_NAME, 'AGENT_COMMERCE_GA_PROMOTION_ATTESTOR_NAME'),
    role: required(process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTOR_ROLE, 'AGENT_COMMERCE_GA_PROMOTION_ATTESTOR_ROLE'),
    organization: optional(process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTOR_ORGANIZATION),
    identity_url: optional(process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTOR_IDENTITY_URL),
  },
  signing: {
    keyId: required(process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEY_ID, 'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEY_ID'),
    secret: required(process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_SIGNING_KEY, 'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_SIGNING_KEY'),
  },
})
const json = `${JSON.stringify(attestation, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_OUTPUT?.trim()

if (output) {
  const absolutePath = path.isAbsolute(output) ? output : path.join(repoRoot, output)
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, json)
  console.error(`Wrote Agent Commerce GA promotion attestation to ${path.relative(repoRoot, absolutePath)}`)
} else {
  process.stdout.write(json)
}
