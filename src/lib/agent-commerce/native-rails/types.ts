import type {
  AgentCommerceMerchantInput,
  AgentCommerceMoneyInput,
} from '@contracts/agent-commerce'
import type {
  BrowserOperatorMerchantNativeCapability,
  BrowserOperatorNativeCapabilityLevel,
  BrowserOperatorNativeCapabilityStatus,
} from '@contracts/browser-operator'

export type AgentCommerceNativeRailId =
  | 'lucid_sandbox_native'
  | 'shopify_storefront'
  | 'kroger_cart'
  | 'walgreens_add_to_cart'
  | 'rye_checkout'

export type AgentCommerceNativeRailAccessModel =
  | 'sandbox_only'
  | 'public_api'
  | 'partner_api'
  | 'merchant_api'
  | 'aggregator_api'

export type AgentCommerceNativeRailOperation =
  | 'catalog_search'
  | 'cart_create'
  | 'checkout_create'
  | 'order_place'
  | 'receipt_fetch'

export type AgentCommerceNativeRailPromotionEvidence =
  | 'provider_credentials_configured'
  | 'sandbox_flow_verified'
  | 'merchant_flow_verified'
  | 'approval_boundary_verified'
  | 'idempotency_guard_verified'
  | 'receipt_parser_verified'
  | 'reconciliation_mapping_verified'
  | 'webhook_or_polling_verified'
  | 'fail_closed_paths_verified'
  | 'source_terms_reviewed'

export type AgentCommerceNativeRailPromotionBlocker =
  | 'rail_not_live_candidate'
  | 'adapter_missing'
  | 'provider_credentials_missing'
  | 'sandbox_evidence_missing'
  | 'merchant_flow_evidence_missing'
  | 'approval_evidence_missing'
  | 'idempotency_evidence_missing'
  | 'receipt_evidence_missing'
  | 'reconciliation_evidence_missing'
  | 'fail_closed_evidence_missing'
  | 'source_review_missing'

export interface AgentCommerceNativeRailManifest {
  id: AgentCommerceNativeRailId
  label: string
  provider: string
  status: BrowserOperatorNativeCapabilityStatus
  accessModel: AgentCommerceNativeRailAccessModel
  capabilityLevel: BrowserOperatorNativeCapabilityLevel
  supportedOperations: AgentCommerceNativeRailOperation[]
  merchantKeys: string[]
  merchantDomains: string[]
  countries: string[]
  requiredEnv: string[]
  requiredCredentialRefs: string[]
  sourceUrls: string[]
  implementationRef: string
  failClosedReason?: string
  notes: string[]
}

export interface AgentCommerceNativeRailPlanInput {
  orgId: string
  projectId?: string | null
  assistantId?: string | null
  runId?: string | null
  merchant: AgentCommerceMerchantInput
  amount?: AgentCommerceMoneyInput | null
  purpose?: string | null
  env?: Record<string, string | undefined>
  credentialRefs?: Record<string, string | undefined>
  nativeCapabilities?: BrowserOperatorMerchantNativeCapability[]
  approvedPartnerRailIds?: string[]
}

export interface AgentCommerceNativeRailPlanResult {
  railId: AgentCommerceNativeRailId
  selected: boolean
  executable: boolean
  reason: string
  missingEnv: string[]
  missingCredentialRefs: string[]
  supportedOperations: AgentCommerceNativeRailOperation[]
  nativeCapabilityId?: string | null
  evidence: Record<string, unknown>
}

export interface AgentCommerceNativeCartLineInput {
  merchantItemId?: string
  name: string
  quantity: number
  unitPrice?: AgentCommerceMoneyInput
  metadata?: Record<string, unknown>
}

export interface AgentCommerceNativeCart {
  cartId: string
  merchant: AgentCommerceMerchantInput
  lines: AgentCommerceNativeCartLineInput[]
  subtotal?: AgentCommerceMoneyInput
  checkoutUrl?: string
  metadata: Record<string, unknown>
}

export interface AgentCommerceNativeCheckout {
  checkoutId: string
  cartId: string
  checkoutUrl?: string
  status: 'ready' | 'requires_approval' | 'requires_action' | 'failed'
  total?: AgentCommerceMoneyInput
  metadata: Record<string, unknown>
}

export interface AgentCommerceNativeOrder {
  orderId: string
  checkoutId: string
  status: 'placed' | 'processing' | 'requires_action' | 'failed'
  total?: AgentCommerceMoneyInput
  receiptUrl?: string
  metadata: Record<string, unknown>
}

export interface AgentCommerceNativeReceipt {
  orderId: string
  merchant: AgentCommerceMerchantInput
  total?: AgentCommerceMoneyInput
  receiptUrl?: string
  receiptArtifactUri?: string
  purchasedAt: string
  rawReceipt: Record<string, unknown>
}

export interface AgentCommerceNativeRailAdapter {
  readonly manifest: AgentCommerceNativeRailManifest
  canPlan(input: AgentCommerceNativeRailPlanInput): boolean
  plan(input: AgentCommerceNativeRailPlanInput): AgentCommerceNativeRailPlanResult
  createCart?(
    input: AgentCommerceNativeRailPlanInput & { lines: AgentCommerceNativeCartLineInput[] },
  ): Promise<AgentCommerceNativeCart>
  createCheckout?(
    input: AgentCommerceNativeRailPlanInput & { cart: AgentCommerceNativeCart },
  ): Promise<AgentCommerceNativeCheckout>
  placeOrder?(
    input: AgentCommerceNativeRailPlanInput & { checkout: AgentCommerceNativeCheckout; approvalToken?: string | null },
  ): Promise<AgentCommerceNativeOrder>
  fetchReceipt?(
    input: AgentCommerceNativeRailPlanInput & { order: AgentCommerceNativeOrder },
  ): Promise<AgentCommerceNativeReceipt>
}
