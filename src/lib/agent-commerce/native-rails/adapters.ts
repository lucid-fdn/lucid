import { AgentCommerceError } from '../errors'
import {
  merchantMatchesNativeCapability,
} from '@/lib/browser-operator/native-capabilities'
import type { BrowserOperatorNativeCapabilityStatus } from '@contracts/browser-operator'
import type {
  AgentCommerceNativeCart,
  AgentCommerceNativeCheckout,
  AgentCommerceNativeOrder,
  AgentCommerceNativeRailAdapter,
  AgentCommerceNativeRailId,
  AgentCommerceNativeRailManifest,
  AgentCommerceNativeRailOperation,
  AgentCommerceNativeRailPlanInput,
  AgentCommerceNativeRailPlanResult,
  AgentCommerceNativeReceipt,
} from './types'

function missingKeys(
  keys: readonly string[],
  values: Record<string, string | undefined> | undefined,
): string[] {
  return keys.filter((key) => !values?.[key]?.trim())
}

function normalizeDomain(value: string | undefined | null): string | null {
  if (!value) return null
  try {
    const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`)
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return value.trim().replace(/^www\./, '').toLowerCase() || null
  }
}

function merchantMatchesManifest(
  input: AgentCommerceNativeRailPlanInput,
  manifest: AgentCommerceNativeRailManifest,
): boolean {
  const merchantKey = input.merchant.name?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
  if (merchantKey && manifest.merchantKeys.includes(merchantKey)) return true
  const merchantDomain = normalizeDomain(input.merchant.domain ?? input.merchant.url)
  if (!merchantDomain) return false
  return manifest.merchantDomains.some((domain) => {
    const normalized = normalizeDomain(domain)
    return normalized && (merchantDomain === normalized || merchantDomain.endsWith(`.${normalized}`))
  })
}

function capabilityForManifest(
  input: AgentCommerceNativeRailPlanInput,
  manifest: AgentCommerceNativeRailManifest,
) {
  return (input.nativeCapabilities ?? []).find((capability) => (
    capability.rail_id === manifest.id
    || merchantMatchesNativeCapability(input.merchant, capability)
  ))
}

function basePlan(
  input: AgentCommerceNativeRailPlanInput,
  manifest: AgentCommerceNativeRailManifest,
): AgentCommerceNativeRailPlanResult {
  const missingEnv = missingKeys(manifest.requiredEnv, input.env ?? process.env)
  const missingCredentialRefs = missingKeys(manifest.requiredCredentialRefs, input.credentialRefs)
  const capability = capabilityForManifest(input, manifest)
  const isExecutableStatus = manifest.status === 'sandbox' || manifest.status === 'staging' || manifest.status === 'live'
  const executable = isExecutableStatus && missingEnv.length === 0 && missingCredentialRefs.length === 0
  return {
    railId: manifest.id,
    selected: true,
    executable,
    reason: executable
      ? 'native_rail_ready'
      : manifest.failClosedReason ?? `native_rail_${manifest.status}`,
    missingEnv,
    missingCredentialRefs,
    supportedOperations: manifest.supportedOperations,
    nativeCapabilityId: capability?.id ?? null,
    evidence: {
      status: manifest.status,
      access_model: manifest.accessModel,
      capability_level: manifest.capabilityLevel,
      source_urls: manifest.sourceUrls,
      implementation_ref: manifest.implementationRef,
    },
  }
}

function failClosed(
  manifest: AgentCommerceNativeRailManifest,
  operation: AgentCommerceNativeRailOperation,
): never {
  throw new AgentCommerceError(
    'provider_unavailable',
    `${manifest.label} ${operation} is registered but not live-enabled. Native checkout remains fail-closed until provider credentials, sandbox merchant flow, approval/idempotency gates, and receipt capture are verified.`,
    501,
    {
      details: {
        rail_id: manifest.id,
        missing_promotion_boundary: manifest.failClosedReason,
        required_env: manifest.requiredEnv,
        required_credential_refs: manifest.requiredCredentialRefs,
      },
    },
  )
}

function plannedNativeRail(manifest: AgentCommerceNativeRailManifest): AgentCommerceNativeRailAdapter {
  return {
    manifest,
    canPlan(input) {
      return merchantMatchesManifest(input, manifest)
    },
    plan(input) {
      return basePlan(input, manifest)
    },
    async createCart() {
      failClosed(manifest, 'cart_create')
    },
    async createCheckout() {
      failClosed(manifest, 'checkout_create')
    },
    async placeOrder() {
      failClosed(manifest, 'order_place')
    },
    async fetchReceipt() {
      failClosed(manifest, 'receipt_fetch')
    },
  }
}

export const LUCID_SANDBOX_NATIVE_RAIL: AgentCommerceNativeRailAdapter = {
  manifest: {
    id: 'lucid_sandbox_native',
    label: 'Lucid Sandbox Native Checkout',
    provider: 'lucid',
    status: 'sandbox',
    accessModel: 'sandbox_only',
    capabilityLevel: 'native_checkout',
    supportedOperations: ['catalog_search', 'cart_create', 'checkout_create', 'order_place', 'receipt_fetch'],
    merchantKeys: ['lucid_sandbox', 'sandbox'],
    merchantDomains: ['sandbox.lucid.foundation', 'lucid.foundation', 'example.com'],
    countries: ['US', 'FR'],
    requiredEnv: [],
    requiredCredentialRefs: [],
    sourceUrls: ['https://www.lucid.foundation'],
    implementationRef: 'src/lib/agent-commerce/native-rails/adapters.ts',
    notes: [
      'Executable native rail for tests, demos, and Mission Control receipt plumbing.',
      'Does not place a real-world order.',
    ],
  },
  canPlan(input) {
    return merchantMatchesManifest(input, this.manifest)
  },
  plan(input) {
    return basePlan(input, this.manifest)
  },
  async createCart(input): Promise<AgentCommerceNativeCart> {
    return {
      cartId: `lucid-native-cart-${input.runId ?? 'sandbox'}`,
      merchant: input.merchant,
      lines: input.lines,
      subtotal: input.amount ?? undefined,
      checkoutUrl: 'https://sandbox.lucid.foundation/checkout/native',
      metadata: {
        rail_id: this.manifest.id,
        sandbox: true,
      },
    }
  },
  async createCheckout(input): Promise<AgentCommerceNativeCheckout> {
    return {
      checkoutId: `lucid-native-checkout-${input.cart.cartId}`,
      cartId: input.cart.cartId,
      checkoutUrl: input.cart.checkoutUrl,
      status: 'requires_approval',
      total: input.amount ?? input.cart.subtotal,
      metadata: {
        rail_id: this.manifest.id,
        sandbox: true,
      },
    }
  },
  async placeOrder(input): Promise<AgentCommerceNativeOrder> {
    if (!input.approvalToken) {
      throw new AgentCommerceError(
        'policy_denied',
        'Lucid sandbox native checkout still requires an approval token before order placement.',
        403,
      )
    }
    return {
      orderId: `lucid-native-order-${input.checkout.checkoutId.slice(-18)}`,
      checkoutId: input.checkout.checkoutId,
      status: 'placed',
      total: input.checkout.total,
      receiptUrl: 'https://sandbox.lucid.foundation/receipts/native',
      metadata: {
        rail_id: this.manifest.id,
        approval_token_present: true,
        sandbox: true,
      },
    }
  },
  async fetchReceipt(input): Promise<AgentCommerceNativeReceipt> {
    return {
      orderId: input.order.orderId,
      merchant: input.merchant,
      total: input.order.total,
      receiptUrl: input.order.receiptUrl,
      receiptArtifactUri: `agent-commerce://native-rails/${input.order.orderId}/receipt`,
      purchasedAt: new Date().toISOString(),
      rawReceipt: {
        rail_id: this.manifest.id,
        order_id: input.order.orderId,
        sandbox: true,
      },
    }
  },
}

const nativeRailManifests: AgentCommerceNativeRailManifest[] = [
  {
    id: 'shopify_storefront',
    label: 'Shopify Storefront / Cart',
    provider: 'shopify',
    status: 'requested',
    accessModel: 'merchant_api',
    capabilityLevel: 'native_cart_handoff',
    supportedOperations: ['catalog_search', 'cart_create', 'checkout_create', 'receipt_fetch'],
    merchantKeys: ['shopify'],
    merchantDomains: ['myshopify.com', 'shop.app'],
    countries: ['US', 'CA', 'GB', 'FR', 'DE', 'EU'],
    requiredEnv: ['SHOPIFY_STOREFRONT_ACCESS_TOKEN'],
    requiredCredentialRefs: ['shopify_storefront_domain'],
    sourceUrls: [
      'https://shopify.dev/docs/api/storefront',
      'https://shopify.dev/docs/apps/build/checkout',
    ],
    implementationRef: 'src/lib/agent-commerce/native-rails/adapters.ts',
    failClosedReason: 'shopify_storefront_merchant_credentials_required',
    notes: [
      'Strongest generic merchant-native path for Shopify stores with merchant permission.',
      'Generic browser Shopify adapter remains separate for stores without API access.',
    ],
  },
  {
    id: 'kroger_cart',
    label: 'Kroger Cart Handoff',
    provider: 'kroger',
    status: 'research',
    accessModel: 'public_api',
    capabilityLevel: 'native_cart_handoff',
    supportedOperations: ['catalog_search', 'cart_create'],
    merchantKeys: ['kroger'],
    merchantDomains: ['kroger.com'],
    countries: ['US'],
    requiredEnv: ['KROGER_CLIENT_ID', 'KROGER_CLIENT_SECRET'],
    requiredCredentialRefs: ['kroger_user_or_org_connection'],
    sourceUrls: ['https://developer.kroger.com/'],
    implementationRef: 'src/lib/agent-commerce/native-rails/adapters.ts',
    failClosedReason: 'kroger_checkout_requires_user_handoff',
    notes: [
      'Self-serve candidate for product search and authenticated cart handoff.',
      'Final checkout is intentionally not modeled as autonomous buying.',
    ],
  },
  {
    id: 'walgreens_add_to_cart',
    label: 'Walgreens Add To Cart',
    provider: 'walgreens',
    status: 'research',
    accessModel: 'public_api',
    capabilityLevel: 'native_cart_handoff',
    supportedOperations: ['catalog_search', 'cart_create'],
    merchantKeys: ['walgreens'],
    merchantDomains: ['walgreens.com'],
    countries: ['US'],
    requiredEnv: ['WALGREENS_API_KEY'],
    requiredCredentialRefs: ['walgreens_api_key'],
    sourceUrls: ['https://developer.walgreens.com/api/addtocart'],
    implementationRef: 'src/lib/agent-commerce/native-rails/adapters.ts',
    failClosedReason: 'walgreens_checkout_requires_user_handoff',
    notes: [
      'Self-serve add-to-cart and transfer-to-checkout rail.',
      'Final checkout remains user handoff, not autonomous order placement.',
    ],
  },
  {
    id: 'rye_checkout',
    label: 'Rye Commerce API',
    provider: 'rye',
    status: 'requested',
    accessModel: 'aggregator_api',
    capabilityLevel: 'native_checkout',
    supportedOperations: ['catalog_search', 'cart_create', 'checkout_create', 'order_place', 'receipt_fetch'],
    merchantKeys: ['rye'],
    merchantDomains: ['rye.com'],
    countries: ['US'],
    requiredEnv: ['RYE_API_KEY'],
    requiredCredentialRefs: ['rye_api_access'],
    sourceUrls: ['https://docs.rye.com/'],
    implementationRef: 'src/lib/agent-commerce/native-rails/adapters.ts',
    failClosedReason: 'rye_api_credentials_and_sandbox_required',
    notes: ['Aggregator-native checkout candidate; requires sandbox/live validation and economics review.'],
  },
]

export const PLANNED_NATIVE_RAIL_ADAPTERS: AgentCommerceNativeRailAdapter[] = nativeRailManifests.map(plannedNativeRail)

export function defaultAgentCommerceNativeRailAdapters(): AgentCommerceNativeRailAdapter[] {
  return [
    LUCID_SANDBOX_NATIVE_RAIL,
    ...PLANNED_NATIVE_RAIL_ADAPTERS,
  ]
}

export function isExecutableNativeRailStatus(status: BrowserOperatorNativeCapabilityStatus): boolean {
  return status === 'sandbox' || status === 'staging' || status === 'live'
}

export function nativeRailIdFromString(value: string): AgentCommerceNativeRailId | null {
  return defaultAgentCommerceNativeRailAdapters().some((adapter) => adapter.manifest.id === value)
    ? value as AgentCommerceNativeRailId
    : null
}
