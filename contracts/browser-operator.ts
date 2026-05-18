/**
 * Browser Operator Contracts
 *
 * Provider-neutral schemas for Lucid's governed browser runtime. These contracts
 * deliberately separate Lucid-owned account/policy/audit state from provider
 * execution handles so managed agents can rent browser capacity without putting
 * credentials or product state inside provider-specific SDKs.
 */

import { z } from 'zod'
import {
  AgentCommerceMerchantSchema,
  AgentCommerceMoneySchema,
} from './agent-commerce'

export const BROWSER_OPERATOR_CONTRACT_VERSION = '2026-05-10' as const
export const BROWSER_OPERATOR_SCHEMA_VERSION = 1 as const
export const BROWSER_OPERATOR_METADATA_MAX_BYTES = 16 * 1024
export const BROWSER_OPERATOR_METADATA_MAX_DEPTH = 6
export const BROWSER_OPERATOR_METADATA_MAX_KEYS = 80

const IsoDateTimeSchema = z.string().datetime({ offset: true })

function metadataDepth(value: unknown, depth = 0): number {
  if (!value || typeof value !== 'object') return depth
  if (Array.isArray(value)) {
    let maxDepth = depth
    for (const item of value) maxDepth = Math.max(maxDepth, metadataDepth(item, depth + 1))
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
    return value.reduce<number>((count, item) => count + metadataKeyCount(item), 0)
  }
  return Object.values(value as Record<string, unknown>)
    .reduce<number>((count, item) => count + 1 + metadataKeyCount(item), 0)
}

const MetadataSchema = z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
  let serialized = ''
  try {
    serialized = JSON.stringify(value) ?? ''
  } catch {
    ctx.addIssue({ code: 'custom', message: 'metadata must be JSON serializable' })
    return
  }

  const bytes = new TextEncoder().encode(serialized).byteLength
  if (bytes > BROWSER_OPERATOR_METADATA_MAX_BYTES) {
    ctx.addIssue({
      code: 'custom',
      message: `metadata must be ${BROWSER_OPERATOR_METADATA_MAX_BYTES} bytes or less`,
    })
  }

  const depth = metadataDepth(value)
  if (depth > BROWSER_OPERATOR_METADATA_MAX_DEPTH) {
    ctx.addIssue({
      code: 'custom',
      message: `metadata depth must be ${BROWSER_OPERATOR_METADATA_MAX_DEPTH} or less`,
    })
  }

  const keys = metadataKeyCount(value)
  if (keys > BROWSER_OPERATOR_METADATA_MAX_KEYS) {
    ctx.addIssue({
      code: 'custom',
      message: `metadata must contain ${BROWSER_OPERATOR_METADATA_MAX_KEYS} keys or fewer`,
    })
  }
}).default({})

export const BrowserOperatorProviderKindSchema = z.enum([
  'playwright',
  'browserless',
  'browserbase',
  'stagehand',
  'steel',
  'browser_use',
  'remote_cdp',
  'lucid_managed',
])

export type BrowserOperatorProviderKind = z.infer<typeof BrowserOperatorProviderKindSchema>

export const BrowserOperatorPurchasePassportStatusSchema = z.enum([
  'draft',
  'active',
  'paused',
  'revoked',
  'locked',
])

export type BrowserOperatorPurchasePassportStatus = z.infer<typeof BrowserOperatorPurchasePassportStatusSchema>

export const BrowserOperatorPurchasePassportScopeSchema = z.enum([
  'personal',
  'household',
  'team',
  'business',
  'project',
])

export type BrowserOperatorPurchasePassportScope = z.infer<typeof BrowserOperatorPurchasePassportScopeSchema>

export const BrowserOperatorPurchasePassportSchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(BROWSER_OPERATOR_CONTRACT_VERSION).default(BROWSER_OPERATOR_CONTRACT_VERSION),
  schema_version: z.literal(BROWSER_OPERATOR_SCHEMA_VERSION).default(BROWSER_OPERATOR_SCHEMA_VERSION),
  org_id: z.string().uuid(),
  owner_user_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  name: z.string().min(1).max(160),
  status: BrowserOperatorPurchasePassportStatusSchema,
  scope: BrowserOperatorPurchasePassportScopeSchema,
  default_currency: z.string().min(3).max(12).transform((value) => value.toLowerCase()),
  default_country: z.string().min(2).max(12).optional(),
  consent_policy: MetadataSchema,
  budget_policy: MetadataSchema,
  address_refs: z.array(z.record(z.string(), z.unknown())).default([]),
  payment_method_refs: z.array(z.record(z.string(), z.unknown())).default([]),
  memory_scope: MetadataSchema,
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
  metadata: MetadataSchema,
})

export type BrowserOperatorPurchasePassport = z.infer<typeof BrowserOperatorPurchasePassportSchema>

export const CreateBrowserOperatorPurchasePassportSchema = BrowserOperatorPurchasePassportSchema.pick({
  org_id: true,
  owner_user_id: true,
  project_id: true,
  name: true,
  status: true,
  scope: true,
  default_currency: true,
  default_country: true,
  consent_policy: true,
  budget_policy: true,
  address_refs: true,
  payment_method_refs: true,
  memory_scope: true,
  metadata: true,
}).partial({
  owner_user_id: true,
  project_id: true,
  status: true,
  scope: true,
  default_country: true,
  consent_policy: true,
  budget_policy: true,
  address_refs: true,
  payment_method_refs: true,
  memory_scope: true,
  metadata: true,
})

export type CreateBrowserOperatorPurchasePassport = z.input<typeof CreateBrowserOperatorPurchasePassportSchema>

export const UpdateBrowserOperatorPurchasePassportSchema = BrowserOperatorPurchasePassportSchema.pick({
  owner_user_id: true,
  project_id: true,
  name: true,
  status: true,
  scope: true,
  default_currency: true,
  default_country: true,
  consent_policy: true,
  budget_policy: true,
  address_refs: true,
  payment_method_refs: true,
  memory_scope: true,
  metadata: true,
}).partial()

export type UpdateBrowserOperatorPurchasePassport = z.input<typeof UpdateBrowserOperatorPurchasePassportSchema>

export const BrowserOperatorAccountStatusSchema = z.enum([
  'needs_connect',
  'connected',
  'expired',
  'mfa_required',
  'captcha_required',
  'revoked',
  'disabled',
  'failed',
])

export type BrowserOperatorAccountStatus = z.infer<typeof BrowserOperatorAccountStatusSchema>

export const BrowserOperatorCredentialStorageOwnerSchema = z.enum([
  'merchant_session',
  'provider_vault',
  'lucid_vault',
])

export type BrowserOperatorCredentialStorageOwner = z.infer<typeof BrowserOperatorCredentialStorageOwnerSchema>

export const BrowserOperatorCredentialKindSchema = z.enum([
  'provider_profile',
  'browser_context',
  'merchant_session',
  'provider_credential',
  'oauth_refresh_token',
  'api_token',
  'session_refresh',
  'password',
  'totp_seed',
  'recovery_code',
])

export type BrowserOperatorCredentialKind = z.infer<typeof BrowserOperatorCredentialKindSchema>

export const BROWSER_OPERATOR_RAW_CREDENTIAL_KINDS = ['password', 'totp_seed', 'recovery_code'] as const

export function isBrowserOperatorRawCredentialKind(kind: BrowserOperatorCredentialKind): boolean {
  return (BROWSER_OPERATOR_RAW_CREDENTIAL_KINDS as readonly string[]).includes(kind)
}

export const BrowserOperatorActionRiskSchema = z.enum(['read_only', 'low', 'medium', 'high'])

export type BrowserOperatorActionRisk = z.infer<typeof BrowserOperatorActionRiskSchema>

export const BrowserOperatorActionKindSchema = z.enum([
  'open',
  'navigate',
  'observe',
  'snapshot',
  'screenshot',
  'extract',
  'summarize',
  'inspect_console',
  'inspect_network',
  'click',
  'hover',
  'press',
  'type',
  'select',
  'check',
  'uncheck',
  'scroll',
  'wait_for_selector',
  'search',
  'filter',
  'paginate',
  'fill_form',
  'add_to_cart',
  'draft_message',
  'upload_file',
  'download_file',
  'submit',
  'publish',
  'delete',
  'purchase',
  'transfer',
  'approve',
  'send_message',
])

export type BrowserOperatorActionKind = z.infer<typeof BrowserOperatorActionKindSchema>

const READ_ONLY_ACTIONS = new Set<BrowserOperatorActionKind>([
  'open',
  'navigate',
  'observe',
  'snapshot',
  'screenshot',
  'extract',
  'summarize',
  'inspect_console',
  'inspect_network',
])

const LOW_RISK_ACTIONS = new Set<BrowserOperatorActionKind>([
  'click',
  'hover',
  'press',
  'type',
  'select',
  'check',
  'uncheck',
  'scroll',
  'wait_for_selector',
  'search',
  'filter',
  'paginate',
])

const MEDIUM_RISK_ACTIONS = new Set<BrowserOperatorActionKind>([
  'fill_form',
  'add_to_cart',
  'draft_message',
  'upload_file',
  'download_file',
])

export function classifyBrowserOperatorActionRisk(kind: BrowserOperatorActionKind): BrowserOperatorActionRisk {
  if (READ_ONLY_ACTIONS.has(kind)) return 'read_only'
  if (LOW_RISK_ACTIONS.has(kind)) return 'low'
  if (MEDIUM_RISK_ACTIONS.has(kind)) return 'medium'
  return 'high'
}

export function isBrowserOperatorMutatingAction(kind: BrowserOperatorActionKind): boolean {
  return classifyBrowserOperatorActionRisk(kind) !== 'read_only'
}

export const BrowserOperatorApprovalStateSchema = z.enum([
  'not_required',
  'required',
  'approved',
  'blocked',
  'expired',
])

export type BrowserOperatorApprovalState = z.infer<typeof BrowserOperatorApprovalStateSchema>

export const BrowserOperatorAccountSchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(BROWSER_OPERATOR_CONTRACT_VERSION).default(BROWSER_OPERATOR_CONTRACT_VERSION),
  schema_version: z.literal(BROWSER_OPERATOR_SCHEMA_VERSION).default(BROWSER_OPERATOR_SCHEMA_VERSION),
  org_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  merchant_key: z.string().min(1).max(160),
  merchant_name: z.string().min(1).max(160),
  provider: BrowserOperatorProviderKindSchema,
  provider_account_ref: z.string().max(255).optional(),
  org_connection_id: z.string().uuid().optional(),
  auth_provider: z.string().min(1).max(160).optional(),
  auth_connection_id: z.string().min(1).max(255).optional(),
  provider_profile_ref: z.string().max(255).optional(),
  provider_context_ref: z.string().max(255).optional(),
  auth_state: BrowserOperatorAccountStatusSchema,
  capabilities: z.array(z.string().min(1).max(120)).default([]),
  session_secret_ref: z.string().max(255).optional(),
  default_credential_ref_id: z.string().uuid().optional(),
  last_verified_at: IsoDateTimeSchema.optional(),
  expires_at: IsoDateTimeSchema.optional(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
  metadata: MetadataSchema,
})

export type BrowserOperatorAccount = z.infer<typeof BrowserOperatorAccountSchema>

export const CreateBrowserOperatorAccountSchema = BrowserOperatorAccountSchema.pick({
  org_id: true,
  user_id: true,
  project_id: true,
  merchant_key: true,
  merchant_name: true,
  provider: true,
  provider_account_ref: true,
  org_connection_id: true,
  auth_provider: true,
  auth_connection_id: true,
  provider_profile_ref: true,
  provider_context_ref: true,
  auth_state: true,
  capabilities: true,
  session_secret_ref: true,
  default_credential_ref_id: true,
  expires_at: true,
  metadata: true,
}).partial({
  user_id: true,
  project_id: true,
  provider_account_ref: true,
  org_connection_id: true,
  auth_provider: true,
  auth_connection_id: true,
  provider_profile_ref: true,
  provider_context_ref: true,
  auth_state: true,
  capabilities: true,
  session_secret_ref: true,
  default_credential_ref_id: true,
  expires_at: true,
  metadata: true,
})

export type CreateBrowserOperatorAccount = z.input<typeof CreateBrowserOperatorAccountSchema>

export const UpdateBrowserOperatorAccountSchema = BrowserOperatorAccountSchema.pick({
  project_id: true,
  merchant_name: true,
  provider_account_ref: true,
  org_connection_id: true,
  auth_provider: true,
  auth_connection_id: true,
  provider_profile_ref: true,
  provider_context_ref: true,
  auth_state: true,
  capabilities: true,
  session_secret_ref: true,
  default_credential_ref_id: true,
  last_verified_at: true,
  expires_at: true,
  metadata: true,
}).partial()

export type UpdateBrowserOperatorAccount = z.input<typeof UpdateBrowserOperatorAccountSchema>

export const BrowserOperatorConnectSessionStatusSchema = z.enum([
  'requested',
  'provider_ready',
  'active',
  'connected',
  'expired',
  'failed',
  'cancelled',
])

export type BrowserOperatorConnectSessionStatus = z.infer<typeof BrowserOperatorConnectSessionStatusSchema>

export const BrowserOperatorConnectSessionSchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(BROWSER_OPERATOR_CONTRACT_VERSION).default(BROWSER_OPERATOR_CONTRACT_VERSION),
  schema_version: z.literal(BROWSER_OPERATOR_SCHEMA_VERSION).default(BROWSER_OPERATOR_SCHEMA_VERSION),
  org_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  browser_account_id: z.string().uuid(),
  provider: BrowserOperatorProviderKindSchema,
  status: BrowserOperatorConnectSessionStatusSchema,
  takeover_url: z.string().url().optional(),
  live_view_url: z.string().url().optional(),
  provider_session_ref: z.string().max(255).optional(),
  provider_profile_ref: z.string().max(255).optional(),
  provider_context_ref: z.string().max(255).optional(),
  return_url: z.string().url().optional(),
  expires_at: IsoDateTimeSchema.optional(),
  connected_at: IsoDateTimeSchema.optional(),
  failure_reason: z.string().max(2000).optional(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
  metadata: MetadataSchema,
})

export type BrowserOperatorConnectSession = z.infer<typeof BrowserOperatorConnectSessionSchema>

export const CreateBrowserOperatorConnectSessionSchema = BrowserOperatorConnectSessionSchema.pick({
  org_id: true,
  user_id: true,
  browser_account_id: true,
  provider: true,
  status: true,
  takeover_url: true,
  live_view_url: true,
  provider_session_ref: true,
  provider_profile_ref: true,
  provider_context_ref: true,
  return_url: true,
  expires_at: true,
  failure_reason: true,
  metadata: true,
}).partial({
  user_id: true,
  status: true,
  takeover_url: true,
  live_view_url: true,
  provider_session_ref: true,
  provider_profile_ref: true,
  provider_context_ref: true,
  return_url: true,
  expires_at: true,
  failure_reason: true,
  metadata: true,
})

export type CreateBrowserOperatorConnectSession = z.input<typeof CreateBrowserOperatorConnectSessionSchema>

export const UpdateBrowserOperatorConnectSessionSchema = BrowserOperatorConnectSessionSchema.pick({
  status: true,
  takeover_url: true,
  live_view_url: true,
  provider_session_ref: true,
  provider_profile_ref: true,
  provider_context_ref: true,
  expires_at: true,
  connected_at: true,
  failure_reason: true,
  metadata: true,
}).partial()

export type UpdateBrowserOperatorConnectSession = z.input<typeof UpdateBrowserOperatorConnectSessionSchema>

const BrowserOperatorCredentialRefBaseSchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(BROWSER_OPERATOR_CONTRACT_VERSION).default(BROWSER_OPERATOR_CONTRACT_VERSION),
  schema_version: z.literal(BROWSER_OPERATOR_SCHEMA_VERSION).default(BROWSER_OPERATOR_SCHEMA_VERSION),
  org_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  browser_account_id: z.string().uuid(),
  provider: BrowserOperatorProviderKindSchema,
  storage_owner: BrowserOperatorCredentialStorageOwnerSchema,
  secret_ref: z.string().min(1).max(255),
  credential_kind: BrowserOperatorCredentialKindSchema,
  status: z.enum(['active', 'rotating', 'revoked', 'expired', 'failed']),
  requires_feature_flag: z.string().min(1).max(120).optional(),
  consent_grant_id: z.string().max(255).optional(),
  last_access_audit_id: z.string().max(255).optional(),
  last_accessed_by_run_id: z.string().uuid().optional(),
  last_used_at: IsoDateTimeSchema.optional(),
  last_rotated_at: IsoDateTimeSchema.optional(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
  metadata: MetadataSchema,
})

function refineBrowserOperatorCredentialRef(
  value: {
    credential_kind: BrowserOperatorCredentialKind
    storage_owner: BrowserOperatorCredentialStorageOwner
    requires_feature_flag?: string
    consent_grant_id?: string
  },
  ctx: z.RefinementCtx,
): void {
  if (!isBrowserOperatorRawCredentialKind(value.credential_kind)) return
  if (value.storage_owner !== 'lucid_vault') {
    ctx.addIssue({
      code: 'custom',
      path: ['storage_owner'],
      message: 'raw credential kinds must use lucid_vault storage owner',
    })
  }
  if (!value.requires_feature_flag) {
    ctx.addIssue({
      code: 'custom',
      path: ['requires_feature_flag'],
      message: 'raw credential kinds require an explicit feature flag',
    })
  }
  if (!value.consent_grant_id) {
    ctx.addIssue({
      code: 'custom',
      path: ['consent_grant_id'],
      message: 'raw credential kinds require explicit consent grant',
    })
  }
}

export const BrowserOperatorCredentialRefSchema = BrowserOperatorCredentialRefBaseSchema
  .superRefine(refineBrowserOperatorCredentialRef)

export type BrowserOperatorCredentialRef = z.infer<typeof BrowserOperatorCredentialRefSchema>

export const CreateBrowserOperatorCredentialRefSchema = BrowserOperatorCredentialRefBaseSchema.pick({
  org_id: true,
  user_id: true,
  browser_account_id: true,
  provider: true,
  storage_owner: true,
  secret_ref: true,
  credential_kind: true,
  status: true,
  requires_feature_flag: true,
  consent_grant_id: true,
  metadata: true,
}).partial({
  user_id: true,
  status: true,
  requires_feature_flag: true,
  consent_grant_id: true,
  metadata: true,
}).superRefine(refineBrowserOperatorCredentialRef)

export type CreateBrowserOperatorCredentialRef = z.input<typeof CreateBrowserOperatorCredentialRefSchema>

export const BrowserOperatorRuntimeCredentialRefSchema = BrowserOperatorCredentialRefBaseSchema.omit({
  secret_ref: true,
  last_access_audit_id: true,
  metadata: true,
  created_at: true,
  updated_at: true,
  last_used_at: true,
  last_rotated_at: true,
}).strict()

export type BrowserOperatorRuntimeCredentialRef = z.infer<typeof BrowserOperatorRuntimeCredentialRefSchema>

export const BrowserOperatorPurchasePolicySchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(BROWSER_OPERATOR_CONTRACT_VERSION).default(BROWSER_OPERATOR_CONTRACT_VERSION),
  schema_version: z.literal(BROWSER_OPERATOR_SCHEMA_VERSION).default(BROWSER_OPERATOR_SCHEMA_VERSION),
  org_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  browser_account_id: z.string().uuid().optional(),
  name: z.string().min(1).max(160),
  status: z.enum(['draft', 'active', 'paused', 'revoked', 'expired']),
  schedule: z.record(z.string(), z.unknown()).default({}),
  max_total: AgentCommerceMoneySchema.optional(),
  allowed_merchant_domains: z.array(z.string().min(1).max(255)).default([]),
  blocked_merchant_domains: z.array(z.string().min(1).max(255)).default([]),
  allowed_categories: z.array(z.string().min(1).max(120)).default([]),
  blocked_categories: z.array(z.string().min(1).max(120)).default([]),
  max_item_count: z.number().int().positive().optional(),
  allow_substitutions: z.boolean().default(false),
  max_substitution_delta_percent: z.number().min(0).max(100).default(0),
  requires_human_approval: z.boolean().default(true),
  auto_approve_inside_policy: z.boolean().default(false),
  expires_at: IsoDateTimeSchema.optional(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
  metadata: MetadataSchema,
})

export type BrowserOperatorPurchasePolicy = z.infer<typeof BrowserOperatorPurchasePolicySchema>

export const CreateBrowserOperatorPurchasePolicySchema = BrowserOperatorPurchasePolicySchema.pick({
  org_id: true,
  user_id: true,
  project_id: true,
  browser_account_id: true,
  name: true,
  status: true,
  schedule: true,
  max_total: true,
  allowed_merchant_domains: true,
  blocked_merchant_domains: true,
  allowed_categories: true,
  blocked_categories: true,
  max_item_count: true,
  allow_substitutions: true,
  max_substitution_delta_percent: true,
  requires_human_approval: true,
  auto_approve_inside_policy: true,
  expires_at: true,
  metadata: true,
}).partial({
  user_id: true,
  project_id: true,
  browser_account_id: true,
  status: true,
  schedule: true,
  max_total: true,
  allowed_merchant_domains: true,
  blocked_merchant_domains: true,
  allowed_categories: true,
  blocked_categories: true,
  max_item_count: true,
  allow_substitutions: true,
  max_substitution_delta_percent: true,
  requires_human_approval: true,
  auto_approve_inside_policy: true,
  expires_at: true,
  metadata: true,
})

export type CreateBrowserOperatorPurchasePolicy = z.input<typeof CreateBrowserOperatorPurchasePolicySchema>

export const UpdateBrowserOperatorPurchasePolicySchema = BrowserOperatorPurchasePolicySchema.pick({
  project_id: true,
  browser_account_id: true,
  name: true,
  status: true,
  schedule: true,
  max_total: true,
  allowed_merchant_domains: true,
  blocked_merchant_domains: true,
  allowed_categories: true,
  blocked_categories: true,
  max_item_count: true,
  allow_substitutions: true,
  max_substitution_delta_percent: true,
  requires_human_approval: true,
  auto_approve_inside_policy: true,
  expires_at: true,
  metadata: true,
}).partial()

export type UpdateBrowserOperatorPurchasePolicy = z.input<typeof UpdateBrowserOperatorPurchasePolicySchema>

export const BrowserOperatorPurchaseCartItemSchema = z.object({
  id: z.string().uuid().optional(),
  merchant_item_id: z.string().max(255).optional(),
  name: z.string().min(1).max(240),
  quantity: z.number().positive(),
  unit: z.string().max(40).optional(),
  unit_price: z.number().nonnegative().optional(),
  total_price: z.number().nonnegative().optional(),
  currency: z.string().min(3).max(12).transform((value) => value.toLowerCase()),
  category: z.string().max(120).optional(),
  substitution_for: z.string().max(255).optional(),
  policy_flags: z.array(z.string().min(1).max(120)).default([]),
  metadata: MetadataSchema,
})

export type BrowserOperatorPurchaseCartItem = z.infer<typeof BrowserOperatorPurchaseCartItemSchema>

export const BrowserOperatorPurchaseRunStatusSchema = z.enum([
  'draft',
  'building_cart',
  'policy_checking',
  'requires_approval',
  'approved',
  'checkout_attempted',
  'completed',
  'blocked',
  'failed',
  'cancelled',
])

export type BrowserOperatorPurchaseRunStatus = z.infer<typeof BrowserOperatorPurchaseRunStatusSchema>

export const BrowserOperatorPurchaseRunSchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(BROWSER_OPERATOR_CONTRACT_VERSION).default(BROWSER_OPERATOR_CONTRACT_VERSION),
  schema_version: z.literal(BROWSER_OPERATOR_SCHEMA_VERSION).default(BROWSER_OPERATOR_SCHEMA_VERSION),
  org_id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  assistant_id: z.string().uuid().optional(),
  ops_run_id: z.string().uuid().optional(),
  browser_account_id: z.string().uuid().optional(),
  purchase_policy_id: z.string().uuid().optional(),
  agent_commerce_spend_request_id: z.string().uuid().optional(),
  idempotency_key: z.string().min(8).max(255),
  merchant: AgentCommerceMerchantSchema,
  status: BrowserOperatorPurchaseRunStatusSchema,
  cart_hash: z.string().min(32).max(128).optional(),
  cart_total: AgentCommerceMoneySchema.optional(),
  policy_decision: z.record(z.string(), z.unknown()).default({}),
  approval_state: BrowserOperatorApprovalStateSchema.default('required'),
  receipt_ref: z.string().max(255).optional(),
  failure_reason: z.string().max(2000).optional(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
  metadata: MetadataSchema,
})

export type BrowserOperatorPurchaseRun = z.infer<typeof BrowserOperatorPurchaseRunSchema>

export const BrowserOperatorPurchaseReceiptSchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(BROWSER_OPERATOR_CONTRACT_VERSION).default(BROWSER_OPERATOR_CONTRACT_VERSION),
  schema_version: z.literal(BROWSER_OPERATOR_SCHEMA_VERSION).default(BROWSER_OPERATOR_SCHEMA_VERSION),
  org_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  browser_account_id: z.string().uuid().optional(),
  purchase_run_id: z.string().uuid(),
  provider: BrowserOperatorProviderKindSchema,
  merchant_order_id: z.string().max(255).optional(),
  receipt_url: z.string().url().optional(),
  receipt_artifact_uri: z.string().max(2000).optional(),
  total: AgentCommerceMoneySchema.optional(),
  purchased_at: IsoDateTimeSchema.optional(),
  raw_receipt: MetadataSchema,
  created_at: IsoDateTimeSchema,
  metadata: MetadataSchema,
})

export type BrowserOperatorPurchaseReceipt = z.infer<typeof BrowserOperatorPurchaseReceiptSchema>

export const BrowserOperatorProfileStatusSchema = z.enum([
  'active',
  'degraded',
  'expired',
  'migration_required',
  'revoked',
])

export type BrowserOperatorProfileStatus = z.infer<typeof BrowserOperatorProfileStatusSchema>

export const BrowserOperatorProfileSchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(BROWSER_OPERATOR_CONTRACT_VERSION).default(BROWSER_OPERATOR_CONTRACT_VERSION),
  schema_version: z.literal(BROWSER_OPERATOR_SCHEMA_VERSION).default(BROWSER_OPERATOR_SCHEMA_VERSION),
  org_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  browser_account_id: z.string().uuid(),
  provider: BrowserOperatorProviderKindSchema,
  profile_artifact_ref: z.string().max(2000).optional(),
  provider_profile_ref: z.string().max(255).optional(),
  provider_context_ref: z.string().max(255).optional(),
  status: BrowserOperatorProfileStatusSchema,
  last_verified_at: IsoDateTimeSchema.optional(),
  expires_at: IsoDateTimeSchema.optional(),
  migration_status: z.enum(['not_required', 'pending', 'in_progress', 'completed', 'failed']).default('not_required'),
  degraded_reason: z.string().max(2000).optional(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
  metadata: MetadataSchema,
})

export type BrowserOperatorProfile = z.infer<typeof BrowserOperatorProfileSchema>

export const CreateBrowserOperatorProfileSchema = BrowserOperatorProfileSchema.pick({
  org_id: true,
  user_id: true,
  browser_account_id: true,
  provider: true,
  profile_artifact_ref: true,
  provider_profile_ref: true,
  provider_context_ref: true,
  status: true,
  last_verified_at: true,
  expires_at: true,
  migration_status: true,
  degraded_reason: true,
  metadata: true,
}).partial({
  user_id: true,
  profile_artifact_ref: true,
  provider_profile_ref: true,
  provider_context_ref: true,
  status: true,
  last_verified_at: true,
  expires_at: true,
  migration_status: true,
  degraded_reason: true,
  metadata: true,
})

export type CreateBrowserOperatorProfile = z.input<typeof CreateBrowserOperatorProfileSchema>

export const UpdateBrowserOperatorProfileSchema = BrowserOperatorProfileSchema.pick({
  profile_artifact_ref: true,
  provider_profile_ref: true,
  provider_context_ref: true,
  status: true,
  last_verified_at: true,
  expires_at: true,
  migration_status: true,
  degraded_reason: true,
  metadata: true,
}).partial()

export type UpdateBrowserOperatorProfile = z.input<typeof UpdateBrowserOperatorProfileSchema>

export const BrowserOperatorAlertTypeSchema = z.enum([
  'account_needs_connect',
  'account_expired',
  'account_mfa_required',
  'account_captcha_required',
  'account_failed',
  'profile_degraded',
  'connect_session_expiring',
  'handoff_required',
  'purchase_blocked',
  'receipt_missing',
  'provider_unhealthy',
  'policy_attention',
])

export type BrowserOperatorAlertType = z.infer<typeof BrowserOperatorAlertTypeSchema>

export const BrowserOperatorAlertSeveritySchema = z.enum([
  'info',
  'needs_attention',
  'warning',
  'critical',
])

export type BrowserOperatorAlertSeverity = z.infer<typeof BrowserOperatorAlertSeveritySchema>

export const BrowserOperatorAlertStatusSchema = z.enum([
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
])

export type BrowserOperatorAlertStatus = z.infer<typeof BrowserOperatorAlertStatusSchema>

export const BrowserOperatorAlertCtaSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  href: z.string().max(2000).optional(),
  action: z.string().min(1).max(120).optional(),
}).default({})

export type BrowserOperatorAlertCta = z.infer<typeof BrowserOperatorAlertCtaSchema>

export const BrowserOperatorAlertSchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(BROWSER_OPERATOR_CONTRACT_VERSION).default(BROWSER_OPERATOR_CONTRACT_VERSION),
  schema_version: z.literal(BROWSER_OPERATOR_SCHEMA_VERSION).default(BROWSER_OPERATOR_SCHEMA_VERSION),
  org_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  browser_account_id: z.string().uuid().optional(),
  purchase_run_id: z.string().uuid().optional(),
  ops_run_id: z.string().uuid().optional(),
  alert_type: BrowserOperatorAlertTypeSchema,
  severity: BrowserOperatorAlertSeveritySchema,
  status: BrowserOperatorAlertStatusSchema.default('open'),
  dedupe_key: z.string().min(1).max(255),
  title: z.string().min(1).max(180),
  message: z.string().max(2000).optional(),
  primary_cta: BrowserOperatorAlertCtaSchema,
  href: z.string().max(2000).optional(),
  resolved_at: IsoDateTimeSchema.optional(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
  metadata: MetadataSchema,
})

export type BrowserOperatorAlert = z.infer<typeof BrowserOperatorAlertSchema>

export const CreateBrowserOperatorAlertSchema = BrowserOperatorAlertSchema.pick({
  org_id: true,
  user_id: true,
  browser_account_id: true,
  purchase_run_id: true,
  ops_run_id: true,
  alert_type: true,
  severity: true,
  status: true,
  dedupe_key: true,
  title: true,
  message: true,
  primary_cta: true,
  href: true,
  resolved_at: true,
  metadata: true,
}).partial({
  user_id: true,
  browser_account_id: true,
  purchase_run_id: true,
  ops_run_id: true,
  severity: true,
  status: true,
  message: true,
  primary_cta: true,
  href: true,
  resolved_at: true,
  metadata: true,
})

export type CreateBrowserOperatorAlert = z.input<typeof CreateBrowserOperatorAlertSchema>

export const UpdateBrowserOperatorAlertSchema = BrowserOperatorAlertSchema.pick({
  severity: true,
  status: true,
  title: true,
  message: true,
  primary_cta: true,
  href: true,
  resolved_at: true,
  metadata: true,
}).partial()

export type UpdateBrowserOperatorAlert = z.input<typeof UpdateBrowserOperatorAlertSchema>

export const BrowserOperatorAccountHealthStateSchema = z.enum([
  'ready',
  'needs_login',
  'needs_attention',
  'expired',
  'blocked',
  'revoked',
  'unknown',
])

export type BrowserOperatorAccountHealthState = z.infer<typeof BrowserOperatorAccountHealthStateSchema>

export const BrowserOperatorAccountHealthSnapshotSchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(BROWSER_OPERATOR_CONTRACT_VERSION).default(BROWSER_OPERATOR_CONTRACT_VERSION),
  schema_version: z.literal(BROWSER_OPERATOR_SCHEMA_VERSION).default(BROWSER_OPERATOR_SCHEMA_VERSION),
  org_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  browser_account_id: z.string().uuid(),
  health_state: BrowserOperatorAccountHealthStateSchema,
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string().min(1).max(240)).default([]),
  profile_status: BrowserOperatorProfileStatusSchema.optional(),
  last_successful_run_at: IsoDateTimeSchema.optional(),
  last_failed_run_at: IsoDateTimeSchema.optional(),
  last_handoff_at: IsoDateTimeSchema.optional(),
  last_receipt_at: IsoDateTimeSchema.optional(),
  captcha_rate: z.number().min(0).max(1).optional(),
  handoff_rate: z.number().min(0).max(1).optional(),
  checkout_success_rate: z.number().min(0).max(1).optional(),
  receipt_success_rate: z.number().min(0).max(1).optional(),
  average_run_ms: z.number().int().nonnegative().optional(),
  recommended_action: z.string().max(500).optional(),
  created_at: IsoDateTimeSchema,
  metadata: MetadataSchema,
})

export type BrowserOperatorAccountHealthSnapshot = z.infer<typeof BrowserOperatorAccountHealthSnapshotSchema>

export const CreateBrowserOperatorAccountHealthSnapshotSchema = BrowserOperatorAccountHealthSnapshotSchema.pick({
  org_id: true,
  user_id: true,
  browser_account_id: true,
  health_state: true,
  score: true,
  reasons: true,
  profile_status: true,
  last_successful_run_at: true,
  last_failed_run_at: true,
  last_handoff_at: true,
  last_receipt_at: true,
  captcha_rate: true,
  handoff_rate: true,
  checkout_success_rate: true,
  receipt_success_rate: true,
  average_run_ms: true,
  recommended_action: true,
  metadata: true,
}).partial({
  user_id: true,
  score: true,
  reasons: true,
  profile_status: true,
  last_successful_run_at: true,
  last_failed_run_at: true,
  last_handoff_at: true,
  last_receipt_at: true,
  captcha_rate: true,
  handoff_rate: true,
  checkout_success_rate: true,
  receipt_success_rate: true,
  average_run_ms: true,
  recommended_action: true,
  metadata: true,
})

export type CreateBrowserOperatorAccountHealthSnapshot = z.input<typeof CreateBrowserOperatorAccountHealthSnapshotSchema>

export const BrowserOperatorByoRuntimeStatusSchema = z.enum([
  'draft',
  'healthy',
  'degraded',
  'disabled',
  'failed',
])

export type BrowserOperatorByoRuntimeStatus = z.infer<typeof BrowserOperatorByoRuntimeStatusSchema>

export const BrowserOperatorByoRuntimeSchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(BROWSER_OPERATOR_CONTRACT_VERSION).default(BROWSER_OPERATOR_CONTRACT_VERSION),
  schema_version: z.literal(BROWSER_OPERATOR_SCHEMA_VERSION).default(BROWSER_OPERATOR_SCHEMA_VERSION),
  org_id: z.string().uuid(),
  name: z.string().min(1).max(160),
  provider: z.literal('remote_cdp'),
  cdp_endpoint_ref: z.string().min(1).max(255),
  token_ref: z.string().max(255).optional(),
  org_connection_id: z.string().uuid().optional(),
  auth_provider: z.string().min(1).max(160).optional(),
  auth_connection_id: z.string().min(1).max(255).optional(),
  status: BrowserOperatorByoRuntimeStatusSchema,
  allowlisted_domains: z.array(z.string().min(1).max(255)).default([]),
  privacy_mode: z.enum(['standard', 'isolated', 'customer_managed']).default('customer_managed'),
  cost_policy: z.record(z.string(), z.unknown()).default({}),
  health: z.record(z.string(), z.unknown()).default({}),
  last_checked_at: IsoDateTimeSchema.optional(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
  metadata: MetadataSchema,
})

export type BrowserOperatorByoRuntime = z.infer<typeof BrowserOperatorByoRuntimeSchema>

export const CreateBrowserOperatorByoRuntimeSchema = BrowserOperatorByoRuntimeSchema.pick({
  org_id: true,
  name: true,
  cdp_endpoint_ref: true,
  token_ref: true,
  org_connection_id: true,
  auth_provider: true,
  auth_connection_id: true,
  status: true,
  allowlisted_domains: true,
  privacy_mode: true,
  cost_policy: true,
  health: true,
  metadata: true,
}).partial({
  token_ref: true,
  org_connection_id: true,
  auth_provider: true,
  auth_connection_id: true,
  status: true,
  allowlisted_domains: true,
  privacy_mode: true,
  cost_policy: true,
  health: true,
  metadata: true,
})

export type CreateBrowserOperatorByoRuntime = z.input<typeof CreateBrowserOperatorByoRuntimeSchema>

export const UpdateBrowserOperatorByoRuntimeSchema = BrowserOperatorByoRuntimeSchema.pick({
  name: true,
  cdp_endpoint_ref: true,
  token_ref: true,
  org_connection_id: true,
  auth_provider: true,
  auth_connection_id: true,
  status: true,
  allowlisted_domains: true,
  privacy_mode: true,
  cost_policy: true,
  health: true,
  last_checked_at: true,
  metadata: true,
}).partial()

export type UpdateBrowserOperatorByoRuntime = z.input<typeof UpdateBrowserOperatorByoRuntimeSchema>

export const CreateBrowserOperatorPurchaseReceiptSchema = BrowserOperatorPurchaseReceiptSchema.pick({
  org_id: true,
  user_id: true,
  browser_account_id: true,
  purchase_run_id: true,
  provider: true,
  merchant_order_id: true,
  receipt_url: true,
  receipt_artifact_uri: true,
  total: true,
  purchased_at: true,
  raw_receipt: true,
  metadata: true,
}).partial({
  user_id: true,
  browser_account_id: true,
  merchant_order_id: true,
  receipt_url: true,
  receipt_artifact_uri: true,
  total: true,
  purchased_at: true,
  raw_receipt: true,
  metadata: true,
})

export type CreateBrowserOperatorPurchaseReceipt = z.input<typeof CreateBrowserOperatorPurchaseReceiptSchema>

export const BrowserOperatorNativeCapabilityLevelSchema = z.enum([
  'native_checkout',
  'native_cart_handoff',
  'native_catalog_only',
  'partner_only',
  'browser_required',
  'research_only',
])

export type BrowserOperatorNativeCapabilityLevel = z.infer<typeof BrowserOperatorNativeCapabilityLevelSchema>

export const BrowserOperatorNativeCapabilityStatusSchema = z.enum([
  'research',
  'requested',
  'sandbox',
  'staging',
  'live',
  'blocked',
  'deprecated',
])

export type BrowserOperatorNativeCapabilityStatus = z.infer<typeof BrowserOperatorNativeCapabilityStatusSchema>

export const BrowserOperatorNativeAccessModelSchema = z.enum([
  'public',
  'oauth',
  'partner_contract',
  'invite_only',
  'merchant_specific',
  'third_party',
])

export type BrowserOperatorNativeAccessModel = z.infer<typeof BrowserOperatorNativeAccessModelSchema>

export const BrowserOperatorNativeOperationSchema = z.enum([
  'catalog_search',
  'price_lookup',
  'availability_lookup',
  'cart_create',
  'cart_update',
  'cart_handoff',
  'checkout_session_create',
  'payment_authorize',
  'order_place',
  'order_status',
  'receipt_fetch',
  'refund_or_cancel',
])

export type BrowserOperatorNativeOperation = z.infer<typeof BrowserOperatorNativeOperationSchema>

export const BrowserOperatorMerchantNativeCapabilitySchema = z.object({
  id: z.string().uuid(),
  contract_version: z.literal(BROWSER_OPERATOR_CONTRACT_VERSION).default(BROWSER_OPERATOR_CONTRACT_VERSION),
  schema_version: z.literal(BROWSER_OPERATOR_SCHEMA_VERSION).default(BROWSER_OPERATOR_SCHEMA_VERSION),
  merchant_key: z.string().min(1).max(160),
  merchant_domain: z.string().min(1).max(255).optional(),
  country: z.string().min(2).max(12).optional(),
  provider: z.string().min(1).max(160),
  capability_level: BrowserOperatorNativeCapabilityLevelSchema,
  rail_id: z.string().min(1).max(160),
  status: BrowserOperatorNativeCapabilityStatusSchema,
  access_model: BrowserOperatorNativeAccessModelSchema,
  supported_operations: z.array(BrowserOperatorNativeOperationSchema).default([]),
  required_credentials: z.array(z.string().min(1).max(120)).default([]),
  required_env: z.array(z.string().min(1).max(120)).default([]),
  countries: z.array(z.string().min(2).max(12)).default([]),
  promotion_evidence: MetadataSchema,
  source_urls: z.array(z.string().url()).default([]),
  last_verified_at: IsoDateTimeSchema.optional(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
  metadata: MetadataSchema,
})

export type BrowserOperatorMerchantNativeCapability = z.infer<typeof BrowserOperatorMerchantNativeCapabilitySchema>

export const CreateBrowserOperatorMerchantNativeCapabilitySchema = BrowserOperatorMerchantNativeCapabilitySchema.pick({
  merchant_key: true,
  merchant_domain: true,
  country: true,
  provider: true,
  capability_level: true,
  rail_id: true,
  status: true,
  access_model: true,
  supported_operations: true,
  required_credentials: true,
  required_env: true,
  countries: true,
  promotion_evidence: true,
  source_urls: true,
  last_verified_at: true,
  metadata: true,
}).partial({
  merchant_domain: true,
  country: true,
  status: true,
  supported_operations: true,
  required_credentials: true,
  required_env: true,
  countries: true,
  promotion_evidence: true,
  source_urls: true,
  last_verified_at: true,
  metadata: true,
})

export type CreateBrowserOperatorMerchantNativeCapability = z.input<typeof CreateBrowserOperatorMerchantNativeCapabilitySchema>

export const UpdateBrowserOperatorMerchantNativeCapabilitySchema = BrowserOperatorMerchantNativeCapabilitySchema.pick({
  merchant_domain: true,
  country: true,
  provider: true,
  capability_level: true,
  rail_id: true,
  status: true,
  access_model: true,
  supported_operations: true,
  required_credentials: true,
  required_env: true,
  countries: true,
  promotion_evidence: true,
  source_urls: true,
  last_verified_at: true,
  metadata: true,
}).partial()

export type UpdateBrowserOperatorMerchantNativeCapability = z.input<typeof UpdateBrowserOperatorMerchantNativeCapabilitySchema>

export const BrowserOperatorProxyPolicyModeSchema = z.enum([
  'disabled',
  'read_only_only',
  'authenticated_profile',
  'premium_only',
  'byo_only',
])

export type BrowserOperatorProxyPolicyMode = z.infer<typeof BrowserOperatorProxyPolicyModeSchema>

export const BrowserOperatorProxyFallbackScopeSchema = z.enum([
  'read_only',
  'cart_building',
  'never',
])

export type BrowserOperatorProxyFallbackScope = z.infer<typeof BrowserOperatorProxyFallbackScopeSchema>

export const BrowserOperatorProxyPolicySchema = z.object({
  mode: BrowserOperatorProxyPolicyModeSchema.default('read_only_only'),
  allowed_providers: z.array(BrowserOperatorProviderKindSchema).default([]),
  allowed_countries: z.array(z.string().min(2).max(12)).default([]),
  allow_residential: z.boolean().default(false),
  allow_datacenter: z.boolean().default(true),
  allow_byo_proxy: z.boolean().default(false),
  checkout_allowed: z.boolean().default(false),
  max_retries: z.number().int().min(0).max(5).default(1),
  session_affinity_required: z.boolean().default(true),
  fallback_allowed_for: BrowserOperatorProxyFallbackScopeSchema.default('read_only'),
  audit_level: z.enum(['summary', 'full']).default('summary'),
})

export type BrowserOperatorProxyPolicy = z.infer<typeof BrowserOperatorProxyPolicySchema>

export const BrowserOperatorCheckoutAdapterKindSchema = z.enum([
  'sandbox',
  'merchant_specific',
])

export type BrowserOperatorCheckoutAdapterKind = z.infer<typeof BrowserOperatorCheckoutAdapterKindSchema>

export const BrowserOperatorActionRequestSchema = z.object({
  action_id: z.string().uuid().optional(),
  action_kind: BrowserOperatorActionKindSchema,
  risk_level: BrowserOperatorActionRiskSchema.optional(),
  session_key: z.string().min(1).max(255),
  target_id: z.string().max(255).optional(),
  url: z.string().url().optional(),
  instruction: z.string().max(4_000).optional(),
  selector: z.string().max(2_000).optional(),
  value: z.string().max(8_000).optional(),
  browser_account_id: z.string().uuid().optional(),
  credential_ref: BrowserOperatorRuntimeCredentialRefSchema.optional(),
  metadata: MetadataSchema,
})

export type BrowserOperatorActionRequest = z.infer<typeof BrowserOperatorActionRequestSchema>

export const BrowserOperatorActionResultSchema = z.object({
  ok: z.boolean(),
  action_id: z.string(),
  action_kind: BrowserOperatorActionKindSchema,
  risk_level: BrowserOperatorActionRiskSchema,
  approval_state: BrowserOperatorApprovalStateSchema,
  provider: BrowserOperatorProviderKindSchema,
  action_layer: z.string().max(120).optional(),
  session_key: z.string(),
  before_url: z.string().url().optional(),
  after_url: z.string().url().optional(),
  screenshot_uri: z.string().optional(),
  dom_snapshot_uri: z.string().optional(),
  extracted_data: z.unknown().optional(),
  latency_ms: z.number().int().nonnegative().optional(),
  error: z.string().max(2000).optional(),
  metadata: MetadataSchema,
})

export type BrowserOperatorActionResult = z.infer<typeof BrowserOperatorActionResultSchema>

export const BrowserOperatorTrustDecisionSchema = z.object({
  decision: z.enum(['allow', 'require_approval', 'block']),
  reason_codes: z.array(z.string().min(1).max(120)).default([]),
  action_kind: BrowserOperatorActionKindSchema,
  risk_level: BrowserOperatorActionRiskSchema,
  approval_state: BrowserOperatorApprovalStateSchema,
  evidence: MetadataSchema,
})

export type BrowserOperatorTrustDecision = z.infer<typeof BrowserOperatorTrustDecisionSchema>
