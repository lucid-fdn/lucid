import type {
  AgentCommerceProviderId,
  AgentCommerceProviderManifest,
} from '@contracts/agent-commerce'
import { AgentCommerceProviderIdSchema } from '@contracts/agent-commerce'
import { z } from 'zod'

export type AgentCommerceProviderPromotionEvidence =
  | 'provider_adapter_registered'
  | 'idempotency_before_provider_side_effects'
  | 'ledger_budget_reservation_before_provider_side_effects'
  | 'no_raw_credential_persistence_tested'
  | 'fail_closed_provider_tests'
  | 'account_access_approved'
  | 'secret_ref_configured'
  | 'webhook_signature_verified'
  | 'webhook_dedupe_enabled'
  | 'reconciliation_mapping_tested'
  | 'atomic_proof_claim_tested'
  | 'replay_protection_tested'
  | 'lucid_l2_p0_execution_gate'
  | 'internal_hmac_only'
  | 'no_public_wallet_signing'
  | 'stripe_link_stable_api_access'
  | 'oauth_callback_verified'

export type AgentCommerceProviderPromotionBlocker =
  | 'provider_not_live'
  | 'manifest_only_provider_cannot_be_live'
  | 'live_provider_adapter_missing'
  | 'account_access_evidence_missing'
  | 'secret_ref_evidence_missing'
  | 'webhook_evidence_missing'
  | 'ledger_idempotency_evidence_missing'
  | 'credential_safety_evidence_missing'
  | 'machine_payment_replay_evidence_missing'
  | 'lucid_l2_evidence_missing'
  | 'stripe_link_access_evidence_missing'

export interface AgentCommerceProviderPromotionInput {
  manifest: AgentCommerceProviderManifest
  registeredProviderIds: Iterable<AgentCommerceProviderId>
  evidence?: Partial<Record<AgentCommerceProviderId, AgentCommerceProviderPromotionEvidence[]>>
}

export interface AgentCommerceProviderPromotionResult {
  provider: AgentCommerceProviderId
  mode: AgentCommerceProviderManifest['availability']['mode']
  live: boolean
  ready: boolean
  blockers: AgentCommerceProviderPromotionBlocker[]
  missingEvidence: AgentCommerceProviderPromotionEvidence[]
}

export interface AgentCommerceProviderHealthPromotionGuardInput {
  providerId: AgentCommerceProviderId
  requestedMode: AgentCommerceProviderManifest['availability']['mode']
  manifests: AgentCommerceProviderManifest[]
  registeredProviderIds: Iterable<AgentCommerceProviderId>
  evidence?: Partial<Record<AgentCommerceProviderId, AgentCommerceProviderPromotionEvidence[]>>
}

export interface AgentCommerceProviderHealthPromotionGuardResult {
  allowed: boolean
  reason?: 'provider_manifest_missing' | 'promotion_evidence_incomplete'
  promotion?: AgentCommerceProviderPromotionResult
}

export const AgentCommerceProviderPromotionEvidenceSchema = z.enum([
  'provider_adapter_registered',
  'idempotency_before_provider_side_effects',
  'ledger_budget_reservation_before_provider_side_effects',
  'no_raw_credential_persistence_tested',
  'fail_closed_provider_tests',
  'account_access_approved',
  'secret_ref_configured',
  'webhook_signature_verified',
  'webhook_dedupe_enabled',
  'reconciliation_mapping_tested',
  'atomic_proof_claim_tested',
  'replay_protection_tested',
  'lucid_l2_p0_execution_gate',
  'internal_hmac_only',
  'no_public_wallet_signing',
  'stripe_link_stable_api_access',
  'oauth_callback_verified',
])

export const AgentCommerceProviderPromotionEvidencePacketSchema = z.object({
  release: z.string().min(1).max(120),
  environment: z.enum(['staging', 'production']),
  provider: AgentCommerceProviderIdSchema,
  target_mode: z.literal('live'),
  adapter: z.object({
    registered: z.boolean(),
    provider_version: z.string().min(1).max(120),
    implementation_ref: z.string().min(1).max(255),
  }),
  evidence: z.array(AgentCommerceProviderPromotionEvidenceSchema),
  links: z.record(z.string(), z.string().url()).default({}),
  attestation: z.object({
    account_access_approved: z.boolean().default(false),
    no_raw_credential_persistence: z.boolean().default(false),
    idempotency_before_provider_side_effects: z.boolean().default(false),
    ledger_budget_reservation_before_provider_side_effects: z.boolean().default(false),
    webhook_signature_and_dedupe_verified: z.boolean().default(false),
    reconciliation_mapping_verified: z.boolean().default(false),
    fail_closed_paths_verified: z.boolean().default(false),
  }),
})

export type AgentCommerceProviderPromotionEvidencePacket = z.infer<
  typeof AgentCommerceProviderPromotionEvidencePacketSchema
>

export interface AgentCommerceProviderPromotionEvidenceSummary {
  ready: boolean
  release: string
  environment: AgentCommerceProviderPromotionEvidencePacket['environment']
  provider: AgentCommerceProviderId
  target_mode: 'live'
  adapter_registered: boolean
  provider_version: string
  requiredEvidence: AgentCommerceProviderPromotionEvidence[]
  suppliedEvidence: AgentCommerceProviderPromotionEvidence[]
  missingEvidence: AgentCommerceProviderPromotionEvidence[]
  blockers: AgentCommerceProviderPromotionBlocker[]
  links: Record<string, string>
}

export const AgentCommerceProviderPromotionEvidenceSummarySchema = z.object({
  ready: z.boolean(),
  release: z.string().min(1).max(120),
  environment: z.enum(['staging', 'production']),
  provider: AgentCommerceProviderIdSchema,
  target_mode: z.literal('live'),
  adapter_registered: z.boolean(),
  provider_version: z.string().min(1).max(120),
  requiredEvidence: z.array(AgentCommerceProviderPromotionEvidenceSchema),
  suppliedEvidence: z.array(AgentCommerceProviderPromotionEvidenceSchema),
  missingEvidence: z.array(AgentCommerceProviderPromotionEvidenceSchema),
  blockers: z.array(z.enum([
    'provider_not_live',
    'manifest_only_provider_cannot_be_live',
    'live_provider_adapter_missing',
    'account_access_evidence_missing',
    'secret_ref_evidence_missing',
    'webhook_evidence_missing',
    'ledger_idempotency_evidence_missing',
    'credential_safety_evidence_missing',
    'machine_payment_replay_evidence_missing',
    'lucid_l2_evidence_missing',
    'stripe_link_access_evidence_missing',
  ])),
  links: z.record(z.string(), z.string().url()),
})

const BASE_LIVE_EVIDENCE: readonly AgentCommerceProviderPromotionEvidence[] = [
  'provider_adapter_registered',
  'idempotency_before_provider_side_effects',
  'ledger_budget_reservation_before_provider_side_effects',
  'no_raw_credential_persistence_tested',
  'fail_closed_provider_tests',
]

const ACCOUNT_ACCESS_EVIDENCE: readonly AgentCommerceProviderPromotionEvidence[] = [
  'account_access_approved',
  'secret_ref_configured',
]

const WEBHOOK_EVIDENCE: readonly AgentCommerceProviderPromotionEvidence[] = [
  'webhook_signature_verified',
  'webhook_dedupe_enabled',
  'reconciliation_mapping_tested',
]

const MACHINE_PAYMENT_EVIDENCE: readonly AgentCommerceProviderPromotionEvidence[] = [
  'atomic_proof_claim_tested',
  'replay_protection_tested',
]

const CRYPTO_WALLET_EVIDENCE: readonly AgentCommerceProviderPromotionEvidence[] = [
  'lucid_l2_p0_execution_gate',
  'internal_hmac_only',
  'no_public_wallet_signing',
]

const STRIPE_LINK_EVIDENCE: readonly AgentCommerceProviderPromotionEvidence[] = [
  'stripe_link_stable_api_access',
  'oauth_callback_verified',
]

export const MANUAL_PROVIDER_LIVE_PROMOTION_EVIDENCE: readonly AgentCommerceProviderPromotionEvidence[] = [
  ...BASE_LIVE_EVIDENCE,
  ...MACHINE_PAYMENT_EVIDENCE,
] as const

function unique(items: readonly AgentCommerceProviderPromotionEvidence[]): AgentCommerceProviderPromotionEvidence[] {
  return [...new Set(items)]
}

export function requiredPromotionEvidenceForManifest(
  manifest: AgentCommerceProviderManifest,
): AgentCommerceProviderPromotionEvidence[] {
  const required: AgentCommerceProviderPromotionEvidence[] = [...BASE_LIVE_EVIDENCE]

  if (manifest.requires_account_access) required.push(...ACCOUNT_ACCESS_EVIDENCE)
  if (
    manifest.provider_version?.includes('stripe')
    || manifest.capabilities.includes('realtime_authorization')
    || manifest.capabilities.includes('shared_payment_token')
  ) {
    required.push(...WEBHOOK_EVIDENCE)
  }
  if (manifest.capabilities.includes('machine_payment')) required.push(...MACHINE_PAYMENT_EVIDENCE)
  if (manifest.id === 'crypto_wallet') required.push(...CRYPTO_WALLET_EVIDENCE)
  if (manifest.id === 'stripe_link_agents') required.push(...STRIPE_LINK_EVIDENCE)

  return unique(required)
}

function missingEvidence(
  required: AgentCommerceProviderPromotionEvidence[],
  actual: readonly AgentCommerceProviderPromotionEvidence[],
): AgentCommerceProviderPromotionEvidence[] {
  const actualSet = new Set(actual)
  return required.filter((item) => !actualSet.has(item))
}

function hasAnyMissing(
  missing: AgentCommerceProviderPromotionEvidence[],
  group: readonly AgentCommerceProviderPromotionEvidence[],
): boolean {
  return group.some((item) => missing.includes(item))
}

export function evaluateAgentCommerceProviderPromotion(
  input: AgentCommerceProviderPromotionInput,
): AgentCommerceProviderPromotionResult {
  const live = input.manifest.availability.mode === 'live'
  const registered = new Set(input.registeredProviderIds)
  const actualEvidence = input.evidence?.[input.manifest.id] ?? []
  const requiredEvidence = requiredPromotionEvidenceForManifest(input.manifest)
  const missing = live ? missingEvidence(requiredEvidence, actualEvidence) : []
  const blockers: AgentCommerceProviderPromotionBlocker[] = []

  if (!live) blockers.push('provider_not_live')
  if (live && input.manifest.provider_version?.startsWith('manifest-only')) {
    blockers.push('manifest_only_provider_cannot_be_live')
  }
  if (live && !registered.has(input.manifest.id)) blockers.push('live_provider_adapter_missing')
  if (live && hasAnyMissing(missing, ['idempotency_before_provider_side_effects', 'ledger_budget_reservation_before_provider_side_effects'])) {
    blockers.push('ledger_idempotency_evidence_missing')
  }
  if (live && hasAnyMissing(missing, ['no_raw_credential_persistence_tested', 'fail_closed_provider_tests'])) {
    blockers.push('credential_safety_evidence_missing')
  }
  if (live && hasAnyMissing(missing, ['account_access_approved'])) {
    blockers.push('account_access_evidence_missing')
  }
  if (live && hasAnyMissing(missing, ['secret_ref_configured'])) {
    blockers.push('secret_ref_evidence_missing')
  }
  if (live && hasAnyMissing(missing, WEBHOOK_EVIDENCE)) {
    blockers.push('webhook_evidence_missing')
  }
  if (live && hasAnyMissing(missing, MACHINE_PAYMENT_EVIDENCE)) {
    blockers.push('machine_payment_replay_evidence_missing')
  }
  if (live && hasAnyMissing(missing, CRYPTO_WALLET_EVIDENCE)) {
    blockers.push('lucid_l2_evidence_missing')
  }
  if (live && hasAnyMissing(missing, STRIPE_LINK_EVIDENCE)) {
    blockers.push('stripe_link_access_evidence_missing')
  }

  return {
    provider: input.manifest.id,
    mode: input.manifest.availability.mode,
    live,
    ready: live && blockers.length === 0 && missing.length === 0,
    blockers,
    missingEvidence: missing,
  }
}

export function evaluateAgentCommerceProviderPromotions(params: {
  manifests: AgentCommerceProviderManifest[]
  registeredProviderIds: Iterable<AgentCommerceProviderId>
  evidence?: Partial<Record<AgentCommerceProviderId, AgentCommerceProviderPromotionEvidence[]>>
}): AgentCommerceProviderPromotionResult[] {
  return params.manifests.map((manifest) => evaluateAgentCommerceProviderPromotion({
    manifest,
    registeredProviderIds: params.registeredProviderIds,
    evidence: params.evidence,
  }))
}

export function evaluateAgentCommerceProviderHealthPromotionGuard(
  input: AgentCommerceProviderHealthPromotionGuardInput,
): AgentCommerceProviderHealthPromotionGuardResult {
  if (input.requestedMode !== 'live') return { allowed: true }

  const manifest = input.manifests.find((item) => item.id === input.providerId)
  if (!manifest) {
    return {
      allowed: false,
      reason: 'provider_manifest_missing',
    }
}

  const promotion = evaluateAgentCommerceProviderPromotion({
    manifest: {
      ...manifest,
      availability: {
        ...manifest.availability,
        mode: 'live',
      },
    },
    registeredProviderIds: input.registeredProviderIds,
    evidence: input.evidence,
  })

  return promotion.ready
    ? { allowed: true, promotion }
    : {
        allowed: false,
        reason: 'promotion_evidence_incomplete',
        promotion,
      }
}

export function summarizeAgentCommerceProviderPromotionEvidencePacket(params: {
  packet: AgentCommerceProviderPromotionEvidencePacket
  manifests: AgentCommerceProviderManifest[]
}): AgentCommerceProviderPromotionEvidenceSummary {
  const packet = AgentCommerceProviderPromotionEvidencePacketSchema.parse(params.packet)
  const manifest = params.manifests.find((item) => item.id === packet.provider)
  if (!manifest) {
    return {
      ready: false,
      release: packet.release,
      environment: packet.environment,
      provider: packet.provider,
      target_mode: packet.target_mode,
      adapter_registered: packet.adapter.registered,
      provider_version: packet.adapter.provider_version,
      requiredEvidence: [],
      suppliedEvidence: packet.evidence,
      missingEvidence: [],
      blockers: ['live_provider_adapter_missing'],
      links: packet.links,
    } satisfies AgentCommerceProviderPromotionEvidenceSummary
  }

  const supplied = new Set<AgentCommerceProviderPromotionEvidence>(packet.evidence)
  if (packet.adapter.registered) supplied.add('provider_adapter_registered')
  if (!packet.attestation.account_access_approved) supplied.delete('account_access_approved')
  if (!packet.attestation.no_raw_credential_persistence) supplied.delete('no_raw_credential_persistence_tested')
  if (!packet.attestation.idempotency_before_provider_side_effects) {
    supplied.delete('idempotency_before_provider_side_effects')
  }
  if (!packet.attestation.ledger_budget_reservation_before_provider_side_effects) {
    supplied.delete('ledger_budget_reservation_before_provider_side_effects')
  }
  if (!packet.attestation.webhook_signature_and_dedupe_verified) {
    supplied.delete('webhook_signature_verified')
    supplied.delete('webhook_dedupe_enabled')
  }
  if (!packet.attestation.reconciliation_mapping_verified) supplied.delete('reconciliation_mapping_tested')
  if (!packet.attestation.fail_closed_paths_verified) supplied.delete('fail_closed_provider_tests')

  const suppliedEvidence = [...supplied]
  const requiredEvidence = requiredPromotionEvidenceForManifest({
    ...manifest,
    provider_version: packet.adapter.provider_version,
  })
  const promotion = evaluateAgentCommerceProviderPromotion({
    manifest: {
      ...manifest,
      provider_version: packet.adapter.provider_version,
      availability: {
        ...manifest.availability,
        mode: packet.target_mode,
      },
    },
    registeredProviderIds: packet.adapter.registered ? [packet.provider] : [],
    evidence: {
      [packet.provider]: suppliedEvidence,
    },
  })

  return {
    ready: promotion.ready,
    release: packet.release,
    environment: packet.environment,
    provider: packet.provider,
    target_mode: packet.target_mode,
    adapter_registered: packet.adapter.registered,
    provider_version: packet.adapter.provider_version,
    requiredEvidence,
    suppliedEvidence,
    missingEvidence: promotion.missingEvidence,
    blockers: promotion.blockers,
    links: packet.links,
  } satisfies AgentCommerceProviderPromotionEvidenceSummary
}
