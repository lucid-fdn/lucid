import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import {
  assertBrowserCheckoutAdapterExecutable,
  browserCheckoutReliabilityLabel,
  createBrowserCheckoutAdapterManifest,
  isBrowserCheckoutAutonomousSupported,
  merchantMatchesManifest,
  normalizeMerchantDomain,
  summarizeBrowserCheckoutCart,
  type BrowserCheckoutAdapterManifest,
  type BrowserCheckoutReliability,
} from '@lucid/browser-checkout-adapter'
import type {
  BrowserOperatorAccount,
  BrowserOperatorPurchaseCartItem,
  BrowserOperatorPurchaseReceipt,
  BrowserOperatorPurchaseRun,
} from '@contracts/browser-operator'
import {
  AMAZON_ADAPTER_ID,
  AMAZON_DOMAINS,
  amazonMerchantMatches,
} from './checkout-adapters/amazon'
import {
  CARREFOUR_ADAPTER_ID,
  CARREFOUR_DOMAINS,
  carrefourMerchantMatches,
} from './checkout-adapters/carrefour'
import {
  SHOPIFY_ADAPTER_ID,
  SHOPIFY_PLATFORM_DOMAIN,
  shopifyMerchantMatches,
} from './checkout-adapters/shopify'

export type BrowserOperatorCheckoutAdapterInput = {
  account: BrowserOperatorAccount
  purchaseRun: BrowserOperatorPurchaseRun
  cartItems: BrowserOperatorPurchaseCartItem[]
  approvalToken?: string | null
}

export type BrowserOperatorCheckoutAdapterResult = Pick<
  BrowserOperatorPurchaseReceipt,
  'merchant_order_id' | 'receipt_url' | 'receipt_artifact_uri' | 'total' | 'purchased_at' | 'raw_receipt' | 'metadata'
>

export type BrowserOperatorCheckoutAdapterStatus = 'available' | 'planned'

export type BrowserOperatorCheckoutAdapterManifest = BrowserCheckoutAdapterManifest & {
  status: BrowserOperatorCheckoutAdapterStatus
}

export interface BrowserOperatorCheckoutAdapter {
  readonly id: string
  readonly manifest: BrowserOperatorCheckoutAdapterManifest
  canHandle(input: BrowserOperatorCheckoutAdapterInput): boolean
  execute(input: BrowserOperatorCheckoutAdapterInput): Promise<BrowserOperatorCheckoutAdapterResult>
}

const SANDBOX_DOMAINS = new Set([
  'sandbox.lucid.foundation',
  'lucid.foundation',
  'example.com',
])

export function getBrowserOperatorCheckoutAdapter(
  input: BrowserOperatorCheckoutAdapterInput,
): BrowserOperatorCheckoutAdapter {
  const adapters = browserOperatorCheckoutAdapters()
  const adapter = adapters.find((candidate) => candidate.canHandle(input))
  if (!adapter) {
    throw new AgentCommerceError(
      'provider_unavailable',
      `No checkout adapter is registered for ${merchantDomain(input.purchaseRun) ?? input.purchaseRun.merchant.name}. Add a merchant-specific adapter before autonomous checkout.`,
      501,
    )
  }
  return adapter
}

export function listBrowserOperatorCheckoutAdapterManifests(): BrowserOperatorCheckoutAdapterManifest[] {
  return browserOperatorCheckoutAdapters().map((adapter) => adapter.manifest)
}

export function assertBrowserOperatorCheckoutAdapterExecutable(
  adapter: BrowserOperatorCheckoutAdapter,
  input: BrowserOperatorCheckoutAdapterInput,
): void {
  try {
    assertBrowserCheckoutAdapterExecutable(adapter.manifest)
  } catch {
    throw new AgentCommerceError(
      'provider_unavailable',
      checkoutUnavailableMessage(adapter, input),
      501,
    )
  }
}

export function browserOperatorCheckoutReliabilityLabel(
  adapter: Pick<BrowserOperatorCheckoutAdapter, 'manifest'>,
): string {
  return browserCheckoutReliabilityLabel(adapter.manifest.reliability.tier)
}

export function isBrowserOperatorAutonomousCheckoutSupported(
  adapter: Pick<BrowserOperatorCheckoutAdapter, 'manifest'>,
): boolean {
  return isBrowserCheckoutAutonomousSupported(adapter.manifest)
}

function browserOperatorCheckoutAdapters(): BrowserOperatorCheckoutAdapter[] {
  return [
    sandboxCheckoutAdapter,
    plannedMerchantAdapter({
      id: 'instacart',
      label: 'Instacart',
      merchantKeys: ['instacart'],
      merchantDomains: ['instacart.com'],
      receiptStrategy: 'merchant_receipt_page',
      notes: [
        'Priority grocery adapter for US users.',
        'Requires a connected browser profile, final-cart verification, delivery-slot confirmation, and receipt/order-history parser.',
      ],
    }),
    amazonCheckoutAdapter,
    plannedMerchantAdapter({
      id: 'walmart',
      label: 'Walmart',
      merchantKeys: ['walmart'],
      merchantDomains: ['walmart.com'],
      receiptStrategy: 'merchant_receipt_page',
      notes: [
        'Priority US grocery/general-commerce adapter.',
        'Requires substitution policy mapping, pickup/delivery-slot parser, and post-checkout receipt parser.',
      ],
    }),
    carrefourCheckoutAdapter,
    shopifyCheckoutAdapter,
  ]
}

const sandboxManifest = operatorManifest({
  id: 'sandbox',
  label: 'Lucid Sandbox',
  lifecycle: 'sandbox_ready',
  mode: 'sandbox',
  merchantKeys: ['lucid_sandbox', 'sandbox'],
  merchantDomains: Array.from(SANDBOX_DOMAINS),
  supportedProviders: ['lucid_managed', 'playwright', 'browserless', 'browserbase', 'steel', 'remote_cdp'],
  countries: ['US', 'FR'],
  requiredEnv: [],
  requiredAccountCapabilities: [
    'connected_browser_account',
    'active_provider_profile',
    'approval_boundary_verified',
    'receipt_parser_verified',
  ],
  receiptStrategy: 'synthetic_sandbox',
  reliability: {
    tier: 'live_supported',
    capabilities: ['auto_buy_supported', 'cart_supported', 'receipt_supported'],
    knownFailureReasons: [],
    requiresTakeover: false,
    apiAvailable: false,
    preferredProviders: ['lucid_managed', 'playwright'],
    lastVerifiedAt: '2026-05-10T00:00:00.000Z',
  },
  fixtureVersion: '2026-05-10',
  timeoutBudgetMs: 30_000,
  retryPolicy: {
    readOnlyRetries: 1,
    finalPurchaseRetries: 0,
  },
  notes: [
    'Executable adapter for demos, local tests, staging smoke, and receipt plumbing.',
    'Does not place a real order.',
  ],
})

const sandboxCheckoutAdapter: BrowserOperatorCheckoutAdapter = {
  id: 'sandbox',
  manifest: sandboxManifest,
  canHandle(input) {
    return merchantMatchesManifest({
      manifest: sandboxManifest,
      merchantKey: input.account.merchant_key,
      merchant: input.purchaseRun.merchant,
    })
  },
  async execute(input) {
    const total = input.purchaseRun.cart_total ?? summarizeCart(input.cartItems)
    const orderId = `lucid-sandbox-${input.purchaseRun.id.slice(0, 8)}`
    const purchasedAt = new Date().toISOString()
    return {
      merchant_order_id: orderId,
      receipt_url: `https://sandbox.lucid.foundation/receipts/${orderId}`,
      receipt_artifact_uri: `browser-operator://receipts/${input.purchaseRun.id}`,
      total: total ?? undefined,
      purchased_at: purchasedAt,
      raw_receipt: {
        adapter: 'sandbox',
        order_id: orderId,
        merchant: input.purchaseRun.merchant,
        item_count: input.cartItems.length,
        purchased_at: purchasedAt,
      },
      metadata: {
        checkout_adapter: 'sandbox',
        browser_account_id: input.account.id,
        provider: input.account.provider,
      },
    }
  },
}

const shopifyManifest = operatorManifest({
  id: SHOPIFY_ADAPTER_ID,
  label: 'Shopify Storefronts',
  lifecycle: 'planned',
  mode: 'merchant_specific',
  merchantKeys: ['shopify'],
  merchantDomains: [SHOPIFY_PLATFORM_DOMAIN],
  supportedProviders: ['lucid_managed', 'playwright', 'browserbase', 'steel', 'browserless', 'remote_cdp'],
  countries: ['US', 'CA', 'GB', 'FR', 'DE', 'EU'],
  requiredEnv: [
    'BROWSER_QA_CONTROL_URL',
    'BROWSER_QA_CONTROL_TOKEN',
    'BROWSER_OPERATOR_LIVE_CHECKOUT_ENABLED',
  ],
  requiredAccountCapabilities: [
    'connected_browser_account',
    'active_provider_profile',
    'approval_boundary_verified',
    'idempotency_guard_verified',
    'merchant_flow_verified',
    'receipt_parser_verified',
    'shopify_storefront_domain_verified',
  ],
  receiptStrategy: 'email_or_order_history',
  reliability: {
    tier: 'assisted',
    capabilities: [
      'assisted_checkout_supported',
      'research_supported',
      'cart_supported',
      'receipt_supported',
      'risk_detection_supported',
      'custom_domain_supported',
    ],
    knownFailureReasons: [
      'merchant_validation_missing',
      'receipt_parse_risk',
      'profile_expiry_risk',
      'merchant_ui_drift_risk',
    ],
    requiresTakeover: true,
    apiAvailable: false,
    preferredProviders: ['lucid_managed', 'playwright', 'browserbase', 'steel'],
  },
  fixtureVersion: '2026-05-10',
  timeoutBudgetMs: 120_000,
  retryPolicy: {
    readOnlyRetries: 1,
    finalPurchaseRetries: 0,
  },
  failClosedReason: 'shopify_checkout_adapter_requires_store_validation',
  notes: [
    'Generic adapter family for Shopify-powered DTC/local stores.',
    'Matches platform domains plus per-account custom storefront domains in account metadata.',
    'Checkout remains fail-closed until cart, payment, receipt, and store-specific policy fixtures pass.',
  ],
})

const shopifyCheckoutAdapter: BrowserOperatorCheckoutAdapter = {
  id: SHOPIFY_ADAPTER_ID,
  manifest: shopifyManifest,
  canHandle(input) {
    return shopifyMerchantMatches({
      manifest: shopifyManifest,
      account: input.account,
      purchaseRun: input.purchaseRun,
    })
  },
  async execute(candidate) {
    throw new AgentCommerceError(
      'provider_unavailable',
      checkoutUnavailableMessage({ manifest: shopifyManifest }, candidate),
      501,
    )
  },
}

const amazonManifest = operatorManifest({
  id: AMAZON_ADAPTER_ID,
  label: 'Amazon',
  lifecycle: 'planned',
  mode: 'merchant_specific',
  merchantKeys: ['amazon', 'amazon_fresh'],
  merchantDomains: Array.from(AMAZON_DOMAINS),
  supportedProviders: ['lucid_managed', 'playwright', 'browserbase', 'steel', 'browserless', 'remote_cdp'],
  countries: ['US', 'CA', 'GB', 'FR', 'DE', 'ES', 'IT', 'NL', 'SE', 'PL', 'BE', 'AU', 'JP', 'IN'],
  requiredEnv: [
    'BROWSER_QA_CONTROL_URL',
    'BROWSER_QA_CONTROL_TOKEN',
    'BROWSER_OPERATOR_LIVE_CHECKOUT_ENABLED',
  ],
  requiredAccountCapabilities: [
    'connected_browser_account',
    'active_provider_profile',
    'approval_boundary_verified',
    'idempotency_guard_verified',
    'merchant_flow_verified',
    'receipt_parser_verified',
    'amazon_marketplace_verified',
    'duplicate_order_guard_verified',
  ],
  receiptStrategy: 'email_or_order_history',
  reliability: {
    tier: 'assisted',
    capabilities: [
      'assisted_checkout_supported',
      'research_supported',
      'cart_supported',
      'receipt_supported',
      'risk_detection_supported',
    ],
    knownFailureReasons: [
      'captcha_risk',
      'mfa_risk',
      'payment_attention_risk',
      'address_attention_risk',
      'anti_bot_risk',
      'merchant_ui_drift_risk',
      'profile_expiry_risk',
      'merchant_validation_missing',
    ],
    requiresTakeover: true,
    apiAvailable: false,
    preferredProviders: ['lucid_managed', 'playwright', 'browserbase', 'steel'],
  },
  fixtureVersion: '2026-05-10',
  timeoutBudgetMs: 180_000,
  retryPolicy: {
    readOnlyRetries: 1,
    finalPurchaseRetries: 0,
  },
  failClosedReason: 'amazon_checkout_adapter_requires_marketplace_validation',
  notes: [
    'Useful for general shopping and Amazon Fresh.',
    'Matches regional Amazon marketplaces plus per-account marketplace domain metadata.',
    'Checkout remains fail-closed until duplicate-order protection, saved-payment verification, and order-history receipt parsing are verified.',
  ],
})

const amazonCheckoutAdapter: BrowserOperatorCheckoutAdapter = {
  id: AMAZON_ADAPTER_ID,
  manifest: amazonManifest,
  canHandle(input) {
    return amazonMerchantMatches({
      manifest: amazonManifest,
      account: input.account,
      purchaseRun: input.purchaseRun,
    })
  },
  async execute(candidate) {
    throw new AgentCommerceError(
      'provider_unavailable',
      checkoutUnavailableMessage({ manifest: amazonManifest }, candidate),
      501,
    )
  },
}

const carrefourManifest = operatorManifest({
  id: CARREFOUR_ADAPTER_ID,
  label: 'Carrefour',
  lifecycle: 'planned',
  mode: 'merchant_specific',
  merchantKeys: ['carrefour'],
  merchantDomains: Array.from(CARREFOUR_DOMAINS),
  supportedProviders: ['lucid_managed', 'playwright', 'browserbase', 'steel', 'browserless', 'remote_cdp'],
  countries: ['FR', 'ES', 'IT', 'BE'],
  requiredEnv: [
    'BROWSER_QA_CONTROL_URL',
    'BROWSER_QA_CONTROL_TOKEN',
    'BROWSER_OPERATOR_LIVE_CHECKOUT_ENABLED',
  ],
  requiredAccountCapabilities: [
    'connected_browser_account',
    'active_provider_profile',
    'approval_boundary_verified',
    'idempotency_guard_verified',
    'merchant_flow_verified',
    'receipt_parser_verified',
    'carrefour_locale_verified',
    'delivery_slot_verified',
  ],
  receiptStrategy: 'merchant_receipt_page',
  reliability: {
    tier: 'assisted',
    capabilities: [
      'assisted_checkout_supported',
      'research_supported',
      'cart_supported',
      'receipt_supported',
      'risk_detection_supported',
    ],
    knownFailureReasons: [
      'payment_attention_risk',
      'address_attention_risk',
      'merchant_ui_drift_risk',
      'profile_expiry_risk',
      'merchant_validation_missing',
    ],
    requiresTakeover: true,
    apiAvailable: false,
    preferredProviders: ['lucid_managed', 'playwright', 'browserbase', 'steel'],
  },
  fixtureVersion: '2026-05-10',
  timeoutBudgetMs: 180_000,
  retryPolicy: {
    readOnlyRetries: 1,
    finalPurchaseRetries: 0,
  },
  failClosedReason: 'carrefour_checkout_adapter_requires_store_validation',
  notes: [
    'Priority European grocery adapter.',
    'Parses cart/receipt/delivery-slot evidence for staging dry-runs.',
    'Checkout remains fail-closed until locale-specific delivery, payment, approval, and receipt fixtures pass.',
  ],
})

const carrefourCheckoutAdapter: BrowserOperatorCheckoutAdapter = {
  id: CARREFOUR_ADAPTER_ID,
  manifest: carrefourManifest,
  canHandle(input) {
    return carrefourMerchantMatches({
      manifest: carrefourManifest,
      account: input.account,
      purchaseRun: input.purchaseRun,
    })
  },
  async execute(candidate) {
    throw new AgentCommerceError(
      'provider_unavailable',
      checkoutUnavailableMessage({ manifest: carrefourManifest }, candidate),
      501,
    )
  },
}

function plannedMerchantAdapter(input: {
  id: string
  label: string
  merchantKeys: string[]
  merchantDomains: string[]
  receiptStrategy: BrowserOperatorCheckoutAdapterManifest['receiptStrategy']
  reliability?: BrowserCheckoutReliability
  notes: string[]
}): BrowserOperatorCheckoutAdapter {
  const manifest = operatorManifest({
    id: input.id,
    label: input.label,
    lifecycle: 'planned',
    mode: 'merchant_specific',
    merchantKeys: input.merchantKeys,
    merchantDomains: input.merchantDomains,
    supportedProviders: ['lucid_managed', 'playwright', 'browserbase', 'steel', 'browserless', 'remote_cdp'],
    countries: input.id === 'carrefour' ? ['FR'] : ['US'],
    requiredEnv: [
      'BROWSER_QA_CONTROL_URL',
      'BROWSER_QA_CONTROL_TOKEN',
      'BROWSER_OPERATOR_LIVE_CHECKOUT_ENABLED',
    ],
    requiredAccountCapabilities: [
      'connected_browser_account',
      'active_provider_profile',
      'approval_boundary_verified',
      'idempotency_guard_verified',
      'merchant_flow_verified',
      'receipt_parser_verified',
    ],
    receiptStrategy: input.receiptStrategy,
    reliability: input.reliability ?? {
      tier: 'research_only',
      capabilities: ['research_supported'],
      knownFailureReasons: ['merchant_validation_missing', 'receipt_parse_risk', 'merchant_ui_drift_risk'],
      requiresTakeover: true,
      apiAvailable: false,
      preferredProviders: ['lucid_managed', 'playwright'],
    },
    fixtureVersion: '2026-05-10',
    timeoutBudgetMs: 120_000,
    retryPolicy: {
      readOnlyRetries: 1,
      finalPurchaseRetries: 0,
    },
    failClosedReason: 'merchant_specific_adapter_not_implemented',
    notes: input.notes,
  })
  return {
    id: input.id,
    manifest,
    canHandle(candidate) {
      return merchantMatchesManifest({
        manifest,
        merchantKey: candidate.account.merchant_key,
        merchant: candidate.purchaseRun.merchant,
      })
    },
    async execute(candidate) {
      throw new AgentCommerceError(
        'provider_unavailable',
        checkoutUnavailableMessage({ manifest }, candidate),
        501,
      )
    },
  }
}

function checkoutUnavailableMessage(
  adapter: Pick<BrowserOperatorCheckoutAdapter, 'manifest'>,
  input: BrowserOperatorCheckoutAdapterInput,
): string {
  return [
    `${adapter.manifest.label} checkout is registered but not live-enabled.`,
    'Autonomous buying remains fail-closed until the merchant-specific flow, connected profile, approval boundary, idempotency guard, and receipt parser are verified.',
    `Merchant: ${merchantDomain(input.purchaseRun) ?? input.purchaseRun.merchant.name}.`,
    `Missing: ${adapter.manifest.requiredAccountCapabilities.join(', ')}.`,
  ].join(' ')
}

function operatorManifest(
  input: Parameters<typeof createBrowserCheckoutAdapterManifest>[0],
): BrowserOperatorCheckoutAdapterManifest {
  const manifest = createBrowserCheckoutAdapterManifest(input)
  return {
    ...manifest,
    status: manifest.lifecycle === 'planned' || manifest.lifecycle === 'blocked' || manifest.lifecycle === 'deprecated'
      ? 'planned'
      : 'available',
  }
}

export function browserOperatorMerchantDomain(run: BrowserOperatorPurchaseRun): string | null {
  return merchantDomain(run)
}

function merchantDomain(run: BrowserOperatorPurchaseRun): string | null {
  return normalizeMerchantDomain(run.merchant.domain ?? run.merchant.url)
}

function summarizeCart(cartItems: BrowserOperatorPurchaseCartItem[]): { amount: number; currency: string } | null {
  return summarizeBrowserCheckoutCart(cartItems.map((item) => ({
    merchantItemId: item.merchant_item_id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unit_price,
    totalPrice: item.total_price,
    currency: item.currency,
    category: item.category,
    substitutionFor: item.substitution_for,
    policyFlags: item.policy_flags,
    metadata: item.metadata,
  })))
}
