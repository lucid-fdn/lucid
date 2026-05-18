import { existsSync, readFileSync } from 'node:fs'
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
  evaluateAgentCommerceProviderPromotions,
  MANUAL_PROVIDER_LIVE_PROMOTION_EVIDENCE,
  summarizeAgentCommerceProviderPromotionEvidencePacket,
} from '../src/lib/agent-commerce/provider-promotion'

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

function assertIncludes(source: string, phrase: string, label: string): void {
  if (!source.includes(phrase)) errors.push(`${label} must include "${phrase}".`)
}

const manifests = [
  MANUAL_AGENT_COMMERCE_PROVIDER_MANIFEST,
  STRIPE_LINK_AGENTS_PROVIDER_MANIFEST,
  STRIPE_SHARED_PAYMENT_TOKENS_PROVIDER_MANIFEST,
  STRIPE_ISSUING_AGENTS_PROVIDER_MANIFEST,
  MACHINE_PAYMENTS_MPP_PROVIDER_MANIFEST,
  MACHINE_PAYMENTS_X402_PROVIDER_MANIFEST,
  CRYPTO_WALLET_PROVIDER_MANIFEST,
]

const results = evaluateAgentCommerceProviderPromotions({
  manifests,
  registeredProviderIds: ['manual'],
  evidence: {
    manual: [...MANUAL_PROVIDER_LIVE_PROMOTION_EVIDENCE],
  },
})

const manual = results.find((result) => result.provider === 'manual')
if (!manual?.ready) {
  errors.push(`Manual provider must remain the only current live promotion-ready adapter: ${JSON.stringify(manual)}`)
}

for (const result of results.filter((item) => item.provider !== 'manual')) {
  if (result.live || result.ready) {
    errors.push(`${result.provider} must not be live/promotion-ready without provider promotion evidence.`)
  }
  if (!result.blockers.includes('provider_not_live')) {
    errors.push(`${result.provider} must remain non-live until explicit promotion evidence exists.`)
  }
}

const core = read('src/lib/agent-commerce/provider-promotion.ts')
for (const phrase of [
  'evaluateAgentCommerceProviderPromotion',
  'summarizeAgentCommerceProviderPromotionEvidencePacket',
  'MANUAL_PROVIDER_LIVE_PROMOTION_EVIDENCE',
  'manifest_only_provider_cannot_be_live',
  'account_access_evidence_missing',
  'stripe_link_access_evidence_missing',
  'lucid_l2_evidence_missing',
]) {
  assertIncludes(core, phrase, 'Agent Commerce provider promotion core')
}

const test = read('src/lib/agent-commerce/__tests__/provider-promotion.test.ts')
for (const phrase of [
  'blocks operator live-mode health updates for providers without promotion evidence',
  'allows operator live-mode health updates for the current manual provider evidence',
  'blocks manifest-only providers from being promoted to live',
  'requires account, secret, webhook, and Stripe Link API evidence',
  'summarizes a complete Stripe Link live promotion packet as ready',
  'keeps Stripe Link promotion blocked when packet attestations are incomplete',
  'requires Lucid-L2 and public-signing evidence before crypto wallet promotion',
]) {
  assertIncludes(test, phrase, 'Agent Commerce provider promotion tests')
}

const docs = read('docs/superpowers/reference/agent-commerce-provider-promotion.md')
for (const phrase of [
  'Provider Promotion Evidence',
  'manifest-only',
  'Stripe Link Agents',
  'provider promotion packet',
  'crypto wallet',
  'provider_promotion.blocked',
  'agent-commerce:provider-promotion-evidence',
  'npm run agent-commerce:provider-promotion',
]) {
  assertIncludes(docs, phrase, 'Agent Commerce provider promotion docs')
}

const runbook = read('docs/superpowers/runbooks/2026-05-01-agent-commerce-operations.md')
assertIncludes(runbook, 'Provider Promotion Evidence', 'Agent Commerce operations runbook')
assertIncludes(runbook, 'npm run agent-commerce:provider-promotion', 'Agent Commerce operations runbook')

const route = read('src/app/api/mission-control/commerce/route.ts')
for (const phrase of [
  'provider_promotion',
  'evaluateAgentCommerceProviderPromotions',
  'MANUAL_PROVIDER_LIVE_PROMOTION_EVIDENCE',
  'listAgentCommerceProviders',
]) {
  assertIncludes(route, phrase, 'Mission Control Commerce provider promotion API')
}

const client = read('src/app/(app)/[workspace-slug]/mission-control/commerce/commerce-client.tsx')
for (const phrase of [
  'provider_promotion',
  'AgentCommerceProviderPromotionResult',
  'promotion ready',
  'promotion blocked',
  'Promotion evidence pending',
  'Promotion Blocks',
  'provider_promotion_block_events',
]) {
  assertIncludes(client, phrase, 'Mission Control Commerce provider promotion UI')
}

const healthRoute = read('src/app/api/mission-control/commerce/providers/[provider]/health/route.ts')
for (const phrase of [
  'evaluateAgentCommerceProviderHealthPromotionGuard',
  'provider_promotion_blocked',
  'provider_promotion.blocked',
  'appendAgentCommerceEvent',
  'provider_promotion_blocked_audit',
  'Provider cannot be marked live until Agent Commerce promotion evidence is complete.',
  'MANUAL_PROVIDER_LIVE_PROMOTION_EVIDENCE',
]) {
  assertIncludes(healthRoute, phrase, 'Mission Control provider health promotion guard')
}

const plan = read('docs/superpowers/plans/2026-05-01-agent-commerce-link-and-machine-payments-plan.md')
assertIncludes(plan, 'Provider promotion gates implemented', 'Agent Commerce plan')
assertIncludes(plan, 'Mission Control Commerce surfaces provider promotion readiness', 'Agent Commerce plan')
assertIncludes(plan, 'Provider health live-mode updates are blocked unless promotion evidence is complete', 'Agent Commerce plan')
assertIncludes(plan, 'Blocked live-mode attempts emit provider_promotion.blocked audit events', 'Agent Commerce plan')
assertIncludes(plan, 'Blocked promotion audit events are counted in production dashboard failures', 'Agent Commerce plan')
assertIncludes(plan, 'npm run agent-commerce:provider-promotion', 'Agent Commerce plan')

const backlog = read('docs/BACKLOG.md')
assertIncludes(backlog, 'COMMERCE-P2-014 Add Agent Commerce provider promotion gates', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-015 Surface provider promotion readiness in Mission Control', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-016 Block provider health live-mode promotion without evidence', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-017 Audit blocked provider live-mode promotion attempts', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-018 Surface blocked promotion audit events in Mission Control', 'Agent Commerce backlog')
assertIncludes(backlog, 'COMMERCE-P2-027 Add typed live provider promotion evidence packets', 'Agent Commerce backlog')

const packageJson = read('package.json')
assertIncludes(packageJson, '"agent-commerce:provider-promotion"', 'package.json')
assertIncludes(packageJson, '"agent-commerce:provider-promotion-evidence"', 'package.json')

const promotionPacket = AgentCommerceProviderPromotionEvidencePacketSchema.safeParse(
  JSON.parse(read('ops/agent-commerce/evidence/provider-promotion.stripe-link-agents.example.json')),
)
if (!promotionPacket.success) {
  errors.push(`Stripe Link provider promotion example packet has invalid shape: ${promotionPacket.error.message}`)
} else {
  const summary = summarizeAgentCommerceProviderPromotionEvidencePacket({ packet: promotionPacket.data, manifests })
  if (!summary.ready) {
    errors.push(`Stripe Link provider promotion example packet must summarize as ready: ${JSON.stringify(summary)}`)
  }
}

const ci = read('.github/workflows/ci.yml')
assertIncludes(ci, 'npm run agent-commerce:provider-promotion', 'CI workflow')

if (errors.length > 0) {
  console.error('Agent Commerce provider promotion validation failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('Agent Commerce provider promotion gates are valid.')
