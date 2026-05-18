# Browser Checkout Adapter SDK

Lucid Browser Checkout adapters let Browser Operator prepare and execute merchant-specific checkout flows without giving merchant logic direct control over browser infrastructure, payment policy, or credentials.

The SDK is internal today and intentionally small:

- package: `@lucid/browser-checkout-adapter`
- source: `packages/browser-checkout-adapter`
- first-party registry: `src/lib/browser-operator/checkout-adapters.ts`
- Mission Control API: `/api/browser-operator/checkout-adapters`

## Design Rules

1. Adapters never launch browsers. They receive Lucid Browser Gateway session context.
2. Adapters never handle raw payment secrets.
3. Final purchase retries must be `0`.
4. Real checkout requires Agent Commerce approval or standing policy approval.
5. Real checkout requires receipt parser verification before `live_ready`.
6. Planned adapters are visible but fail-closed.
7. Checkout execution must be reached through the Browser Operator purchase planner, not directly from workflow or channel code.
8. Browser/proxy fallback is allowed only before checkout and only when policy permits it; approved checkout is pinned to the same account/profile/provider/proxy.

## Purchase Planner And Native Rails

Checkout adapters are only one possible rail. Lucid now models autonomous buying through a planner that selects one of:

- `native_commerce`: controlled/self-serve source-linked merchant/API rail such as Shopify cart APIs, Kroger cart handoff, Walgreens add-to-cart, Rye, or approved partner APIs once access is real.
- `authenticated_browser`: connected merchant account with a reusable provider profile/context.
- `assisted_handoff`: user takeover required for CAPTCHA, MFA, payment attention, bot checks, or unreliable merchant state.
- `research_only`: browsing, comparison, or extraction only.

Native capability inventory lives in `browser_operator_merchant_native_capabilities` and is selected by `src/lib/browser-operator/native-capabilities.ts`. Browser/proxy fallback policy lives in `src/lib/browser-operator/proxy-policy.ts`. The planner in `src/lib/browser-operator/purchase-planner.ts` records its decision in purchase-run metadata so Mission Control can explain why a merchant was native-ready, browser-ready, assisted, or blocked.

Adapters should stay merchant-specific and fail-closed. If a merchant exposes a real native checkout or cart API, implement that as an Agent Commerce native rail and let Browser Operator provide evidence/replay as needed.

Agent Commerce native rails live under `src/lib/agent-commerce/native-rails/*`. They are the control-plane contract for realistic self-serve/controlled merchant/API rails. The runtime registry currently includes Lucid sandbox, Shopify Storefront cart handoff, Kroger cart handoff, Walgreens add-to-cart, and Rye. Partner-gated rails should not be added to runtime code until access is real. The registry intentionally distinguishes:

- `lucid_sandbox_native`: executable sandbox rail for tests, demos, and receipt plumbing only.
- `requested`: provider/partner API exists or is desirable, but credentials and sandbox/live promotion are not complete.
- `research`: API is useful for catalog/search only; checkout must not be inferred.
- `staging` / `live`: allowed only after promotion evidence passes.

Promotion requires `evaluateAgentCommerceNativeRailPromotion()` evidence: provider credentials, sandbox flow, merchant flow, approval boundary, idempotency guard, receipt parser, reconciliation/webhook or polling, fail-closed paths, and source/terms review. A DB native capability row alone is not enough. `planBrowserOperatorPurchaseRail()` also requires a matching native rail readiness plan before it selects `native_commerce`.

## Lifecycle

- `planned`: design exists; never executable.
- `sandbox_ready`: executable against sandbox/demo merchants only.
- `staging_ready`: executable against staging/sandbox merchant accounts.
- `live_ready`: executable for real checkout after security and receipt verification.
- `deprecated`: visible, blocked.
- `blocked`: disabled for safety.

Mission Control maps executable lifecycles to `Executable` and everything else to `Planned`.

## Merchant Reliability Tiers

Checkout support is not binary. Every adapter manifest must declare a reliability tier:

- `live_supported`: Lucid can auto-buy within an approved standing policy. This is allowed only for `live_ready` or `sandbox_ready` adapters with `auto_buy_supported`.
- `assisted`: Lucid can browse, parse evidence, build/verify carts, and guide checkout, but risky steps may require takeover.
- `research_only`: Lucid can research/compare/extract, but checkout is not supported.
- `blocked`: the merchant is disabled for safety or compliance reasons.

Capabilities make the tier concrete:

- `auto_buy_supported`
- `assisted_checkout_supported`
- `research_supported`
- `cart_supported`
- `receipt_supported`
- `risk_detection_supported`
- `custom_domain_supported`
- `official_api_available`

Known failure reasons are explicit too, for example `captcha_risk`, `mfa_risk`, `payment_attention_risk`, `anti_bot_risk`, `merchant_ui_drift_risk`, and `merchant_validation_missing`.

Mission Control shows these tiers directly as “Auto-buy supported”, “Assisted checkout”, “Research only”, or “Blocked”. Checkout never silently falls back across providers for authenticated or purchase flows.

## Adapter Shape

```ts
import {
  createBrowserCheckoutAdapterManifest,
  merchantMatchesManifest,
  type BrowserCheckoutAdapter,
} from '@lucid/browser-checkout-adapter'

export const manifest = createBrowserCheckoutAdapterManifest({
  id: 'carrefour',
  label: 'Carrefour',
  lifecycle: 'planned',
  mode: 'merchant_specific',
  merchantKeys: ['carrefour'],
  merchantDomains: ['carrefour.fr'],
  supportedProviders: ['lucid_managed', 'playwright', 'browserbase', 'steel', 'browserless', 'remote_cdp'],
  countries: ['FR'],
  requiredEnv: ['BROWSER_QA_CONTROL_URL', 'BROWSER_QA_CONTROL_TOKEN', 'BROWSER_OPERATOR_LIVE_CHECKOUT_ENABLED'],
  requiredAccountCapabilities: [
    'connected_browser_account',
    'active_provider_profile',
    'approval_boundary_verified',
    'idempotency_guard_verified',
    'merchant_flow_verified',
    'receipt_parser_verified',
  ],
  receiptStrategy: 'merchant_receipt_page',
  reliability: {
    tier: 'research_only',
    capabilities: ['research_supported'],
    knownFailureReasons: ['merchant_validation_missing'],
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
  notes: ['Locale-aware cart, delivery slot, consent, and receipt parsing required.'],
})

export const adapter: BrowserCheckoutAdapter = {
  manifest,
  canHandle(input) {
    return merchantMatchesManifest({
      manifest,
      merchantKey: input.account.merchantKey,
      merchant: input.run.merchant,
    })
  },
  async execute() {
    throw new Error('Carrefour checkout is planned but not live-ready.')
  },
}
```

## Creating An Adapter

```bash
npm run browser-checkout:adapter:create carrefour
npm run browser-checkout:adapter:conformance
npm run browser-checkout:adapter:conformance carrefour
npm run browser-checkout:staging-gate
```

The generator creates:

```text
adapters/browser-checkout/<adapter-id>/
  manifest.ts
  adapter.ts
  fixtures/cart.json
  README.md
```

## Required Fixtures

Before `staging_ready`, an adapter should add:

- `cart.json`
- checkout-page HTML fixture
- confirmation-page HTML fixture
- receipt-page or order-history HTML fixture
- failure fixture for expired session
- failure fixture for MFA/CAPTCHA
- failure fixture for cart mismatch

## Staging Promotion Gate

Store/profile promotion is separate from global adapter promotion. `evaluateBrowserOperatorCheckoutStagingGate()` validates:

- the adapter matches the concrete merchant account/domain
- the account was connected through takeover/session reuse
- an active profile/context/artifact ref exists
- no raw credential secret is needed for reuse
- dry-run cart evidence matches the purchase run total and cart items
- receipt evidence has an order id/name/confirmation number, receipt URL/artifact, total, and proof signals
- risk checks did not require takeover
- the promotion scope is `store_profile`, never a global adapter flip

When this passes, Lucid may store a per-account metadata patch that marks the specific merchant domain/profile as a `live_supported` candidate. The manifest remains `assisted` until a deliberate release changes the global adapter lifecycle.

The deterministic local smoke is:

```bash
npm run browser-checkout:staging-gate
```

It currently validates the Shopify and Carrefour fixture packs against the shared staging gate.

## Current First-Party Registry

- `sandbox`: `live_supported` sandbox adapter, no real order.
- `instacart`: `research_only`, US grocery priority.
- `amazon`: `assisted`, general/Amazon Fresh priority with regional marketplace matching and high anti-bot/MFA risk.
- `walmart`: `research_only`, US grocery/general-commerce priority.
- `carrefour`: `assisted`, European grocery priority with locale/delivery-slot receipt parsing.
- `shopify`: `assisted`, generic Shopify storefront family. Custom storefront domains must be registered per merchant account; `myshopify.com` is the default platform-domain match.

## Shopify Adapter Family

Shopify is treated as an adapter family, not one merchant. The registry matches:

- `*.myshopify.com` platform domains
- custom storefront domains stored on the Browser Operator account metadata, for example `shopify_domains`, `storefront_domains`, or `custom_domains`

The current implementation includes:

- Shopify `/cart.js` evidence parsing for cart totals and line items
- order-status/receipt evidence parsing for order number, confirmation number, receipt URL, and total
- token redaction by design: cart tokens are reduced to a boolean signal before evidence is stored
- fail-closed execution until a store-specific profile, payment, receipt, and approval-boundary fixture pack passes

This lets us support many DTC/local storefronts through one normalized contract while still requiring per-store validation before autonomous buying.

## Amazon Adapter Family

Amazon is a high-risk adapter family because regional marketplaces, anti-bot checks, saved payment state, delivery promises, and duplicate order prevention vary heavily by account and locale.

The current implementation includes:

- regional domain matching for `amazon.com`, `amazon.fr`, `amazon.co.uk`, `amazon.de`, and other common marketplaces
- optional account metadata overrides such as `amazon_marketplace_domain`, `amazon_domains`, and `amazon_marketplace_domains`
- cart text evidence parsing for item count, subtotal, and estimated total
- order-confirmation/order-history evidence parsing for Amazon order ids, receipt URL, total, and delivery estimate
- human-takeover risk detection for MFA, CAPTCHA/bot checks, payment attention, and shipping-address attention
- fail-closed execution until marketplace-specific duplicate-order, saved-payment, receipt, and approval-boundary fixture packs pass

Amazon checkout must never retry the final purchase action. If an order confirmation is ambiguous or a page asks for MFA/CAPTCHA/payment/address attention, the adapter must block and request takeover instead of continuing.

## Release Checklist

Before a merchant adapter can become `live_ready`:

- profile connection works in production provider mode
- cart extraction matches merchant UI total
- final submit action is approval-gated
- duplicate idempotency key cannot place a second order
- receipt parser captures order id, total, timestamp, and receipt URL/artifact
- sensitive fields are redacted from evidence
- Mission Control shows adapter status and missing requirements
- conformance passes
- live smoke passes with a merchant sandbox or explicitly approved live test account
