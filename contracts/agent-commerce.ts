/**
 * Agent Commerce Contracts
 *
 * Provider-neutral schemas for agent-mediated commerce. These contracts model
 * buyer-agent spend, seller grants, machine-payment challenges, rail routing,
 * and audit events without binding runtimes or generated apps to Stripe,
 * x402, crypto wallet, or Lucid-L2 implementation details.
 */

import { z } from 'zod'

export const AGENT_COMMERCE_CONTRACT_VERSION = '2026-05-01' as const
export const AGENT_COMMERCE_SCHEMA_VERSION = 1 as const
export const AGENT_COMMERCE_METADATA_MAX_BYTES = 16 * 1024
export const AGENT_COMMERCE_METADATA_MAX_DEPTH = 6
export const AGENT_COMMERCE_METADATA_MAX_KEYS = 80

const IsoDateTimeSchema = z.string().datetime()

function metadataDepth(value: unknown, depth = 0): number {
  if (!value || typeof value !== 'object') return depth
  if (Array.isArray(value)) {
    let maxDepth = depth
    for (const item of value) {
      maxDepth = Math.max(maxDepth, metadataDepth(item, depth + 1))
    }
    return maxDepth
  }
  let maxDepth = depth
  for (const item of Object.values(value as Record<string, unknown>)) {
    maxDepth = Math.max(maxDepth, metadataDepth(item, depth + 1))
  }
  return maxDepth
}

function metadataKeyCount(value: unknown): number {
  if (!value || typeof value !== 'object') return 0
  if (Array.isArray(value)) {
    let count = 0
    for (const item of value) count += metadataKeyCount(item)
    return count
  }
  let count = 0
  for (const item of Object.values(value as Record<string, unknown>)) {
    count += 1 + metadataKeyCount(item)
  }
  return count
}

const MetadataSchema = z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
  let serialized = ''
  try {
    serialized = JSON.stringify(value) ?? ''
  } catch {
    ctx.addIssue({
      code: 'custom',
      message: 'metadata must be JSON serializable',
    })
    return
  }

  const bytes = new TextEncoder().encode(serialized).byteLength
  if (bytes > AGENT_COMMERCE_METADATA_MAX_BYTES) {
    ctx.addIssue({
      code: 'custom',
      message: `metadata must be ${AGENT_COMMERCE_METADATA_MAX_BYTES} bytes or less`,
    })
  }

  const depth = metadataDepth(value)
  if (depth > AGENT_COMMERCE_METADATA_MAX_DEPTH) {
    ctx.addIssue({
      code: 'custom',
      message: `metadata depth must be ${AGENT_COMMERCE_METADATA_MAX_DEPTH} or less`,
    })
  }

  const keys = metadataKeyCount(value)
  if (keys > AGENT_COMMERCE_METADATA_MAX_KEYS) {
    ctx.addIssue({
      code: 'custom',
      message: `metadata must contain ${AGENT_COMMERCE_METADATA_MAX_KEYS} keys or fewer`,
    })
  }
}).default({})

export const AgentCommerceProviderIdSchema = z.enum([
  'stripe_link_agents',
  'stripe_issuing',
  'stripe_shared_payment_tokens',
  'machine_payments_mpp',
  'machine_payments_x402',
  'crypto_wallet',
  'manual',
])

export type AgentCommerceProviderId = z.infer<typeof AgentCommerceProviderIdSchema>

export const AgentCommerceRoleSchema = z.enum([
  'agent_platform',
  'seller',
  'machine_payment',
])

export type AgentCommerceRole = z.infer<typeof AgentCommerceRoleSchema>

export const AgentCommerceCapabilitySchema = z.enum([
  'wallet_oauth',
  'spend_request',
  'one_time_card',
  'shared_payment_token',
  'machine_payment',
  'catalog_feed',
  'agentic_checkout',
  'realtime_authorization',
  'manual_approval',
])

export type AgentCommerceCapability = z.infer<typeof AgentCommerceCapabilitySchema>

export const AgentCommerceCredentialKindSchema = z.enum([
  'one_time_card',
  'shared_payment_token',
  'machine_payment_receipt',
  'crypto_transaction',
  'checkout_redirect',
  'manual_receipt',
])

export type AgentCommerceCredentialKind = z.infer<typeof AgentCommerceCredentialKindSchema>

export const CommerceRailSchema = z.enum([
  'manual_approval',
  'stripe_link_one_time_card',
  'stripe_shared_payment_token',
  'stripe_issuing_card',
  'machine_payment_mpp',
  'machine_payment_x402',
  'crypto_wallet_transfer',
])

export type CommerceRail = z.infer<typeof CommerceRailSchema>

export const AgentSpendRequestStatusSchema = z.enum([
  'draft',
  'requires_connection',
  'requires_approval',
  'approved',
  'credential_issuing',
  'credential_issued',
  'completed',
  'declined',
  'expired',
  'failed',
  'cancelled',
])

export type AgentSpendRequestStatus = z.infer<typeof AgentSpendRequestStatusSchema>

export const AgentCommerceConnectionStatusSchema = z.enum([
  'pending',
  'active',
  'revoked',
  'expired',
  'disabled',
  'failed',
])

export type AgentCommerceConnectionStatus = z.infer<typeof AgentCommerceConnectionStatusSchema>

export const SellerPaymentGrantStatusSchema = z.enum([
  'received',
  'validating',
  'accepted',
  'processing',
  'completed',
  'rejected',
  'revoked',
  'expired',
  'failed',
])

export type SellerPaymentGrantStatus = z.infer<typeof SellerPaymentGrantStatusSchema>

export const MachinePaymentStatusSchema = z.enum([
  'challenge_created',
  'proof_claimed',
  'settlement_pending',
  'settled',
  'expired',
  'failed',
  'refunded',
])

export type MachinePaymentStatus = z.infer<typeof MachinePaymentStatusSchema>

export const AgentCommerceBudgetReservationStatusSchema = z.enum([
  'reserved',
  'captured',
  'released',
  'expired',
  'failed',
])

export type AgentCommerceBudgetReservationStatus = z.infer<typeof AgentCommerceBudgetReservationStatusSchema>

export const AgentCommerceSellerEntitlementStatusSchema = z.enum([
  'active',
  'revoked',
  'expired',
  'failed',
])

export type AgentCommerceSellerEntitlementStatus = z.infer<typeof AgentCommerceSellerEntitlementStatusSchema>

export const AgentCommerceSellerEntitlementTargetSchema = z.enum([
  'subscription',
  'payment',
  'usage_metric',
  'app_public_usage_bucket',
  'generic',
])

export type AgentCommerceSellerEntitlementTarget = z.infer<typeof AgentCommerceSellerEntitlementTargetSchema>

export const RailPolicyDecisionStateSchema = z.enum([
  'denied',
  'requires_connection',
  'requires_approval',
  'manual_review',
  'approved_to_issue_credential',
  'ready',
])

export type RailPolicyDecisionState = z.infer<typeof RailPolicyDecisionStateSchema>

export const RailPolicyReasonCodeSchema = z.enum([
  'feature_disabled',
  'kill_switch_active',
  'policy_denied',
  'amount_exceeds_limit',
  'currency_not_allowed',
  'merchant_blocked',
  'merchant_domain_required',
  'connection_missing',
  'approval_required',
  'provider_unavailable',
  'provider_preview_only',
  'provider_disabled',
  'provider_capability_missing',
  'idempotency_required',
  'identity_required',
  'seller_not_supported',
  'machine_payments_disabled',
  'lucid_l2_gate_open',
  'risk_manual_review',
])

export type RailPolicyReasonCode = z.infer<typeof RailPolicyReasonCodeSchema>

export const AgentCommerceMoneySchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().min(3).max(12).transform((value) => value.toLowerCase()),
})

export type AgentCommerceMoney = z.infer<typeof AgentCommerceMoneySchema>
export type AgentCommerceMoneyInput = z.input<typeof AgentCommerceMoneySchema>

export const AgentCommerceMerchantSchema = z.object({
  name: z.string().min(1).max(160),
  url: z.string().url().optional(),
  domain: z.string().min(1).max(255).optional(),
  country: z.string().length(2).transform((value) => value.toUpperCase()).optional(),
  category: z.string().max(120).optional(),
})

export type AgentCommerceMerchant = z.infer<typeof AgentCommerceMerchantSchema>
export type AgentCommerceMerchantInput = z.input<typeof AgentCommerceMerchantSchema>

export const AgentCommercePolicySchema = z.object({
  max_amount: AgentCommerceMoneySchema.optional(),
  allowed_currencies: z.array(z.string().min(3).max(12).transform((value) => value.toLowerCase())).default([]),
  allowed_merchant_domains: z.array(z.string().min(1).max(255)).default([]),
  blocked_merchant_domains: z.array(z.string().min(1).max(255)).default([]),
  allowed_providers: z.array(AgentCommerceProviderIdSchema).default([]),
  allowed_rails: z.array(CommerceRailSchema).default([]),
  requires_human_approval: z.boolean().default(true),
  allow_preview_providers: z.boolean().default(false),
  allow_free_on_provider_outage: z.boolean().default(false),
  expires_at: IsoDateTimeSchema.optional(),
})

export type AgentCommercePolicy = z.infer<typeof AgentCommercePolicySchema>
export type AgentCommercePolicyInput = z.input<typeof AgentCommercePolicySchema>

export const DEFAULT_AGENT_COMMERCE_POLICY: AgentCommercePolicy = {
  allowed_currencies: [],
  allowed_merchant_domains: [],
  blocked_merchant_domains: [],
  allowed_providers: [],
  allowed_rails: [],
  requires_human_approval: true,
  allow_preview_providers: false,
  allow_free_on_provider_outage: false,
}

export const AgentCommerceConnectionSchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(AGENT_COMMERCE_CONTRACT_VERSION).default(AGENT_COMMERCE_CONTRACT_VERSION),
  schema_version: z.literal(AGENT_COMMERCE_SCHEMA_VERSION).default(AGENT_COMMERCE_SCHEMA_VERSION),
  org_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  provider: AgentCommerceProviderIdSchema,
  provider_account_id: z.string().max(255).optional(),
  provider_connection_id: z.string().max(255).optional(),
  status: AgentCommerceConnectionStatusSchema,
  capabilities: z.array(AgentCommerceCapabilitySchema).default([]),
  secret_ref: z.string().min(1).max(255).optional(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
  expires_at: IsoDateTimeSchema.optional(),
  metadata: MetadataSchema,
})

export type AgentCommerceConnection = z.infer<typeof AgentCommerceConnectionSchema>

export const CreateAgentCommerceConnectionSchema = AgentCommerceConnectionSchema.pick({
  org_id: true,
  user_id: true,
  provider: true,
  provider_account_id: true,
  provider_connection_id: true,
  status: true,
  capabilities: true,
  secret_ref: true,
  expires_at: true,
  metadata: true,
}).partial({
  user_id: true,
  provider_account_id: true,
  provider_connection_id: true,
  status: true,
  capabilities: true,
  secret_ref: true,
  expires_at: true,
  metadata: true,
})

export type CreateAgentCommerceConnection = z.input<typeof CreateAgentCommerceConnectionSchema>

export const AgentCommerceIntentSchema = z.object({
  intent_id: z.string().uuid().optional(),
  contract_version: z.literal(AGENT_COMMERCE_CONTRACT_VERSION).default(AGENT_COMMERCE_CONTRACT_VERSION),
  schema_version: z.literal(AGENT_COMMERCE_SCHEMA_VERSION).default(AGENT_COMMERCE_SCHEMA_VERSION),
  org_id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  assistant_id: z.string().uuid().optional(),
  actor_user_id: z.string().uuid().optional(),
  run_id: z.string().max(255).optional(),
  tool_call_id: z.string().max(255).optional(),
  merchant: AgentCommerceMerchantSchema,
  amount: AgentCommerceMoneySchema,
  purpose: z.string().min(1).max(2_000),
  resource: z.object({
    type: z.string().min(1).max(120),
    id: z.string().min(1).max(255).optional(),
    url: z.string().url().optional(),
  }).optional(),
  seller: z.object({
    org_id: z.string().uuid().optional(),
    name: z.string().min(1).max(160).optional(),
    domain: z.string().min(1).max(255).optional(),
  }).optional(),
  requested_capabilities: z.array(AgentCommerceCapabilitySchema).default(['spend_request']),
  preferred_provider: AgentCommerceProviderIdSchema.optional(),
  preferred_rail: CommerceRailSchema.optional(),
  idempotency_key: z.string().min(8).max(255),
  created_at: IsoDateTimeSchema.optional(),
  expires_at: IsoDateTimeSchema.optional(),
  metadata: MetadataSchema,
})

export type AgentCommerceIntent = z.infer<typeof AgentCommerceIntentSchema>
export type AgentCommerceIntentInput = z.input<typeof AgentCommerceIntentSchema>

export const RailPolicyDecisionSchema = z.object({
  contract_version: z.literal(AGENT_COMMERCE_CONTRACT_VERSION).default(AGENT_COMMERCE_CONTRACT_VERSION),
  schema_version: z.literal(AGENT_COMMERCE_SCHEMA_VERSION).default(AGENT_COMMERCE_SCHEMA_VERSION),
  decision: RailPolicyDecisionStateSchema,
  selected_provider: AgentCommerceProviderIdSchema.optional(),
  selected_rail: CommerceRailSchema.optional(),
  reason_codes: z.array(RailPolicyReasonCodeSchema).default([]),
  policy_snapshot: AgentCommercePolicySchema.default(DEFAULT_AGENT_COMMERCE_POLICY),
  evidence: MetadataSchema,
})

export type RailPolicyDecision = z.infer<typeof RailPolicyDecisionSchema>

export const AgentSpendRequestSchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(AGENT_COMMERCE_CONTRACT_VERSION).default(AGENT_COMMERCE_CONTRACT_VERSION),
  schema_version: z.literal(AGENT_COMMERCE_SCHEMA_VERSION).default(AGENT_COMMERCE_SCHEMA_VERSION),
  provider_version: z.string().max(80).optional(),
  provider: AgentCommerceProviderIdSchema,
  rail: CommerceRailSchema.default('manual_approval'),
  org_id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  assistant_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  run_id: z.string().max(255).optional(),
  tool_call_id: z.string().max(255).optional(),
  idempotency_key: z.string().min(8).max(255).optional(),
  status: AgentSpendRequestStatusSchema,
  merchant: AgentCommerceMerchantSchema,
  amount: AgentCommerceMoneySchema,
  context: z.string().min(1).max(2_000),
  policy: AgentCommercePolicySchema.default(DEFAULT_AGENT_COMMERCE_POLICY),
  router_decision: RailPolicyDecisionSchema.optional(),
  credential_kind: AgentCommerceCredentialKindSchema.optional(),
  provider_request_id: z.string().max(255).optional(),
  provider_credential_id: z.string().max(255).optional(),
  approval_required: z.boolean().default(true),
  approved_by: z.string().uuid().optional(),
  approved_at: IsoDateTimeSchema.optional(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
  completed_at: IsoDateTimeSchema.optional(),
  expires_at: IsoDateTimeSchema.optional(),
  metadata: MetadataSchema,
})

export type AgentSpendRequest = z.infer<typeof AgentSpendRequestSchema>

export const CreateAgentSpendRequestSchema = AgentSpendRequestSchema.pick({
  provider: true,
  rail: true,
  org_id: true,
  project_id: true,
  assistant_id: true,
  user_id: true,
  run_id: true,
  tool_call_id: true,
  idempotency_key: true,
  merchant: true,
  amount: true,
  context: true,
  policy: true,
  router_decision: true,
  expires_at: true,
  metadata: true,
}).partial({
  provider: true,
  rail: true,
  project_id: true,
  assistant_id: true,
  user_id: true,
  run_id: true,
  tool_call_id: true,
  idempotency_key: true,
  policy: true,
  router_decision: true,
  expires_at: true,
  metadata: true,
})

export type CreateAgentSpendRequest = z.input<typeof CreateAgentSpendRequestSchema>

export const AgentCommerceCredentialSchema = z.object({
  id: z.string().uuid().optional(),
  kind: AgentCommerceCredentialKindSchema,
  provider: AgentCommerceProviderIdSchema,
  spend_request_id: z.string().uuid(),
  org_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'issued', 'revoked', 'expired', 'failed']).default('issued'),
  expires_at: IsoDateTimeSchema.optional(),
  usage_limits: AgentCommercePolicySchema.default(DEFAULT_AGENT_COMMERCE_POLICY),
  display: z.object({
    label: z.string().max(120),
    last4: z.string().max(8).optional(),
  }).optional(),
  // Raw provider credentials must never be stored or returned from public APIs.
  secret_ref: z.string().min(1).max(255).optional(),
  metadata: MetadataSchema,
})

export type AgentCommerceCredential = z.infer<typeof AgentCommerceCredentialSchema>

export const AgentCommerceBudgetReservationSchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(AGENT_COMMERCE_CONTRACT_VERSION).default(AGENT_COMMERCE_CONTRACT_VERSION),
  schema_version: z.literal(AGENT_COMMERCE_SCHEMA_VERSION).default(AGENT_COMMERCE_SCHEMA_VERSION),
  org_id: z.string().uuid(),
  spend_request_id: z.string().uuid(),
  amount: AgentCommerceMoneySchema,
  status: AgentCommerceBudgetReservationStatusSchema,
  reason: z.string().max(255).optional(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
  expires_at: IsoDateTimeSchema.optional(),
  captured_at: IsoDateTimeSchema.optional(),
  released_at: IsoDateTimeSchema.optional(),
  metadata: MetadataSchema,
})

export type AgentCommerceBudgetReservation = z.infer<typeof AgentCommerceBudgetReservationSchema>

export const SellerPaymentGrantSchema = z.object({
  id: z.string().uuid().optional(),
  contract_version: z.literal(AGENT_COMMERCE_CONTRACT_VERSION).default(AGENT_COMMERCE_CONTRACT_VERSION),
  schema_version: z.literal(AGENT_COMMERCE_SCHEMA_VERSION).default(AGENT_COMMERCE_SCHEMA_VERSION),
  provider: AgentCommerceProviderIdSchema,
  rail: CommerceRailSchema.default('manual_approval'),
  org_id: z.string().uuid(),
  customer_reference: z.string().max(255).optional(),
  grant_id: z.string().max(255),
  status: SellerPaymentGrantStatusSchema.default('received'),
  resource_type: z.string().min(1).max(120).default('unknown'),
  resource_id: z.string().max(255).optional(),
  amount: AgentCommerceMoneySchema,
  usage_limits: AgentCommercePolicySchema.default(DEFAULT_AGENT_COMMERCE_POLICY),
  provider_payment_id: z.string().max(255).optional(),
  entitlement_ref: z.string().max(255).optional(),
  expires_at: IsoDateTimeSchema.optional(),
  metadata: MetadataSchema,
})

export type SellerPaymentGrant = z.infer<typeof SellerPaymentGrantSchema>
export type SellerPaymentGrantInput = z.input<typeof SellerPaymentGrantSchema>

export const AgentCommerceSellerEntitlementSchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(AGENT_COMMERCE_CONTRACT_VERSION).default(AGENT_COMMERCE_CONTRACT_VERSION),
  schema_version: z.literal(AGENT_COMMERCE_SCHEMA_VERSION).default(AGENT_COMMERCE_SCHEMA_VERSION),
  org_id: z.string().uuid(),
  seller_grant_id: z.string().uuid(),
  provider: AgentCommerceProviderIdSchema,
  resource_type: z.string().min(1).max(120),
  resource_id: z.string().max(255).optional(),
  status: AgentCommerceSellerEntitlementStatusSchema,
  target_type: AgentCommerceSellerEntitlementTargetSchema.default('generic'),
  target_id: z.string().uuid().optional(),
  payment_id: z.string().uuid().optional(),
  effective_at: IsoDateTimeSchema,
  expires_at: IsoDateTimeSchema.optional(),
  revoked_at: IsoDateTimeSchema.optional(),
  revoke_reason: z.string().max(255).optional(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
  metadata: MetadataSchema,
})

export type AgentCommerceSellerEntitlement = z.infer<typeof AgentCommerceSellerEntitlementSchema>

export const MachinePaymentChallengeSchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(AGENT_COMMERCE_CONTRACT_VERSION).default(AGENT_COMMERCE_CONTRACT_VERSION),
  schema_version: z.literal(AGENT_COMMERCE_SCHEMA_VERSION).default(AGENT_COMMERCE_SCHEMA_VERSION),
  org_id: z.string().uuid(),
  provider: AgentCommerceProviderIdSchema,
  rail: CommerceRailSchema,
  resource_type: z.string().min(1).max(120),
  resource_id: z.string().min(1).max(255),
  amount: AgentCommerceMoneySchema,
  challenge_hash: z.string().min(16).max(255),
  challenge_body: z.record(z.string(), z.unknown()),
  status: MachinePaymentStatusSchema.default('challenge_created'),
  created_at: IsoDateTimeSchema,
  expires_at: IsoDateTimeSchema,
  metadata: MetadataSchema,
})

export type MachinePaymentChallenge = z.infer<typeof MachinePaymentChallengeSchema>

export const CreateMachinePaymentChallengeSchema = MachinePaymentChallengeSchema.pick({
  org_id: true,
  provider: true,
  rail: true,
  resource_type: true,
  resource_id: true,
  amount: true,
  challenge_body: true,
  expires_at: true,
  metadata: true,
}).partial({
  provider: true,
  rail: true,
  expires_at: true,
  metadata: true,
})

export type CreateMachinePaymentChallenge = z.input<typeof CreateMachinePaymentChallengeSchema>

export const MachinePaymentProofClaimSchema = z.object({
  id: z.string().uuid(),
  challenge_id: z.string().uuid(),
  org_id: z.string().uuid(),
  provider: AgentCommerceProviderIdSchema,
  proof_hash: z.string().min(16).max(255),
  status: MachinePaymentStatusSchema.default('proof_claimed'),
  provider_payment_id: z.string().max(255).optional(),
  claimed_at: IsoDateTimeSchema,
  settled_at: IsoDateTimeSchema.optional(),
  metadata: MetadataSchema,
})

export type MachinePaymentProofClaim = z.infer<typeof MachinePaymentProofClaimSchema>

export const MachinePaymentProofClaimInputSchema = z.object({
  challenge_id: z.string().uuid(),
  org_id: z.string().uuid(),
  provider: AgentCommerceProviderIdSchema,
  proof_hash: z.string().min(16).max(255),
  provider_payment_id: z.string().max(255).optional(),
  metadata: MetadataSchema,
})

export type MachinePaymentProofClaimInput = z.input<typeof MachinePaymentProofClaimInputSchema>

export const AgentCommerceEventSchema = z.object({
  id: z.string().uuid().optional(),
  contract_version: z.literal(AGENT_COMMERCE_CONTRACT_VERSION).default(AGENT_COMMERCE_CONTRACT_VERSION),
  schema_version: z.literal(AGENT_COMMERCE_SCHEMA_VERSION).default(AGENT_COMMERCE_SCHEMA_VERSION),
  stack_id: z.literal('commerce').default('commerce'),
  org_id: z.string().uuid(),
  entity_type: z.enum([
    'connection',
    'spend_request',
    'credential',
    'seller_grant',
    'seller_entitlement',
    'machine_challenge',
    'proof_claim',
    'provider_health',
  ]),
  entity_id: z.string().uuid(),
  event_type: z.string().min(1).max(160),
  provider: AgentCommerceProviderIdSchema.optional(),
  provider_event_id: z.string().max(255).optional(),
  actor_type: z.enum(['user', 'agent', 'runtime', 'provider', 'system']).default('system'),
  actor_id: z.string().max(255).optional(),
  request_id: z.string().max(255).optional(),
  run_id: z.string().max(255).optional(),
  payload: MetadataSchema,
  created_at: IsoDateTimeSchema.optional(),
})

export type AgentCommerceEvent = z.infer<typeof AgentCommerceEventSchema>
export type AgentCommerceEventInput = z.input<typeof AgentCommerceEventSchema>

export const AgentCommerceProviderManifestSchema = z.object({
  id: AgentCommerceProviderIdSchema,
  label: z.string().min(1).max(80),
  roles: z.array(AgentCommerceRoleSchema).min(1),
  capabilities: z.array(AgentCommerceCapabilitySchema).min(1),
  rails: z.array(CommerceRailSchema).default([]),
  requires_account_access: z.boolean().default(false),
  provider_version: z.string().max(80).optional(),
  availability: z.object({
    mode: z.enum(['live', 'preview', 'waitlist', 'disabled']),
    countries: z.array(z.string().length(2)).default([]),
  }).default({ mode: 'disabled', countries: [] }),
})

export type AgentCommerceProviderManifest = z.infer<typeof AgentCommerceProviderManifestSchema>
