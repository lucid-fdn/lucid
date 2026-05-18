import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CRYPTO_WALLET_PROVIDER_MANIFEST } from '../src/lib/agent-commerce/providers/crypto-wallet'
import { MACHINE_PAYMENTS_MPP_PROVIDER_MANIFEST, MACHINE_PAYMENTS_X402_PROVIDER_MANIFEST } from '../src/lib/agent-commerce/providers/machine'
import { MANUAL_AGENT_COMMERCE_PROVIDER_MANIFEST } from '../src/lib/agent-commerce/providers/manual'
import {
  STRIPE_ISSUING_AGENTS_PROVIDER_MANIFEST,
  STRIPE_LINK_AGENTS_PROVIDER_MANIFEST,
  STRIPE_SHARED_PAYMENT_TOKENS_PROVIDER_MANIFEST,
} from '../src/lib/agent-commerce/providers/stripe-link'
import {
  AgentCommerceProviderPromotionEvidencePacketSchema,
  summarizeAgentCommerceProviderPromotionEvidencePacket,
} from '../src/lib/agent-commerce/provider-promotion'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const manifests = [
  MANUAL_AGENT_COMMERCE_PROVIDER_MANIFEST,
  STRIPE_LINK_AGENTS_PROVIDER_MANIFEST,
  STRIPE_SHARED_PAYMENT_TOKENS_PROVIDER_MANIFEST,
  STRIPE_ISSUING_AGENTS_PROVIDER_MANIFEST,
  MACHINE_PAYMENTS_MPP_PROVIDER_MANIFEST,
  MACHINE_PAYMENTS_X402_PROVIDER_MANIFEST,
  CRYPTO_WALLET_PROVIDER_MANIFEST,
]

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}

function absolutePath(value: string): string {
  return path.isAbsolute(value) ? value : path.join(repoRoot, value)
}

const packetFile = process.env.AGENT_COMMERCE_PROVIDER_PROMOTION_PACKET_FILE?.trim()
if (!packetFile) {
  console.error('AGENT_COMMERCE_PROVIDER_PROMOTION_PACKET_FILE is required.')
  process.exit(1)
}

const packetPath = absolutePath(packetFile)
if (!existsSync(packetPath)) {
  console.error(`Agent Commerce provider promotion packet does not exist: ${packetFile}`)
  process.exit(1)
}

const packet = AgentCommerceProviderPromotionEvidencePacketSchema.parse(
  JSON.parse(readFileSync(packetPath, 'utf8')),
)
const summary = summarizeAgentCommerceProviderPromotionEvidencePacket({ packet, manifests })
const json = `${JSON.stringify(summary, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_OUTPUT?.trim()

if (output) {
  const absolute = absolutePath(output)
  mkdirSync(path.dirname(absolute), { recursive: true })
  writeFileSync(absolute, json)
  console.error(`Wrote Agent Commerce provider promotion evidence to ${path.relative(repoRoot, absolute)}`)
} else {
  process.stdout.write(json)
}

if (!summary.ready) {
  console.error('Agent Commerce provider promotion evidence is not ready yet:')
  console.error(`- provider=${summary.provider}`)
  console.error(`- blockers=${summary.blockers.join(',') || 'none'}`)
  console.error(`- missing evidence=${summary.missingEvidence.join(',') || 'none'}`)
}

if (truthy(process.env.AGENT_COMMERCE_PROVIDER_PROMOTION_REQUIRE_READY) && !summary.ready) {
  process.exit(1)
}
