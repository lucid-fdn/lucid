import { describe, expect, it } from 'vitest'
import {
  createBrowserCheckoutAdapterManifest,
  createBrowserCheckoutFixture,
  merchantMatchesManifest,
  runBrowserCheckoutAdapterConformance,
  summarizeBrowserCheckoutCart,
  isBrowserCheckoutAutonomousSupported,
  type BrowserCheckoutAdapter,
} from '../index.js'

const sandboxManifest = createBrowserCheckoutAdapterManifest({
  id: 'lucid-sandbox',
  label: 'Lucid Sandbox',
  lifecycle: 'sandbox_ready',
  mode: 'sandbox',
  merchantKeys: ['lucid_sandbox'],
  merchantDomains: ['sandbox.lucid.foundation'],
  supportedProviders: ['lucid_managed', 'playwright'],
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
  },
  fixtureVersion: '2026-05-10',
  timeoutBudgetMs: 30_000,
  retryPolicy: {
    readOnlyRetries: 1,
    finalPurchaseRetries: 0,
  },
  notes: ['Sandbox only.'],
})

describe('@lucid/browser-checkout-adapter', () => {
  it('validates manifest safety constraints', () => {
    expect(() => createBrowserCheckoutAdapterManifest({
      ...sandboxManifest,
      id: 'Bad Adapter',
    })).toThrow(/id must be lowercase/)

    expect(() => createBrowserCheckoutAdapterManifest({
      ...sandboxManifest,
      lifecycle: 'planned',
      mode: 'merchant_specific',
      failClosedReason: undefined,
    })).toThrow(/failClosedReason/)

    expect(() => createBrowserCheckoutAdapterManifest({
      ...sandboxManifest,
      retryPolicy: { readOnlyRetries: 2, finalPurchaseRetries: 1 },
    })).toThrow(/finalPurchaseRetries/)

    expect(() => createBrowserCheckoutAdapterManifest({
      ...sandboxManifest,
      lifecycle: 'planned',
      reliability: {
        ...sandboxManifest.reliability,
        tier: 'live_supported',
      },
    })).toThrow(/live_supported/)

    expect(() => createBrowserCheckoutAdapterManifest({
      ...sandboxManifest,
      lifecycle: 'planned',
      reliability: {
        ...sandboxManifest.reliability,
        tier: 'assisted',
      },
    })).toThrow(/auto_buy_supported/)
  })

  it('matches merchants by key or normalized domain', () => {
    expect(merchantMatchesManifest({
      manifest: sandboxManifest,
      merchantKey: 'lucid_sandbox',
    })).toBe(true)
    expect(merchantMatchesManifest({
      manifest: sandboxManifest,
      merchant: { name: 'Sandbox', url: 'https://www.sandbox.lucid.foundation/checkout' },
    })).toBe(true)
  })

  it('summarizes cart totals in cents', () => {
    expect(summarizeBrowserCheckoutCart([
      { name: 'Milk', quantity: 2, unitPrice: 4.25, currency: 'usd' },
      { name: 'Eggs', quantity: 1, totalPrice: 6, currency: 'USD' },
    ])).toEqual({ currency: 'usd', amount: 1450 })
  })

  it('runs sandbox conformance with receipt proof', async () => {
    const fixture = createBrowserCheckoutFixture({
      manifestId: sandboxManifest.id,
      account: {
        id: 'acct-1',
        merchantKey: 'lucid_sandbox',
        merchantName: 'Lucid Sandbox',
        provider: 'lucid_managed',
        authState: 'connected',
        capabilities: ['connected_browser_account'],
      },
      run: {
        id: 'run-1',
        orgId: 'org-1',
        merchant: { name: 'Lucid Sandbox', domain: 'sandbox.lucid.foundation' },
        approvalState: 'not_required',
        idempotencyKey: 'fixture-1',
      },
      cartItems: [{ name: 'Bananas', quantity: 2, totalPrice: 5, currency: 'usd' }],
    })

    const adapter: BrowserCheckoutAdapter = {
      manifest: sandboxManifest,
      canHandle: ({ account, run }) => merchantMatchesManifest({
        manifest: sandboxManifest,
        merchantKey: account.merchantKey,
        merchant: run.merchant,
      }),
      async execute() {
        return {
          merchantOrderId: 'sandbox-order-1',
          receiptUrl: 'https://sandbox.lucid.foundation/receipts/sandbox-order-1',
          total: { amount: 500, currency: 'usd' },
          purchasedAt: '2026-05-10T00:00:00.000Z',
          rawReceipt: { orderId: 'sandbox-order-1' },
          metadata: { adapter: 'lucid-sandbox' },
        }
      },
    }

    const result = await runBrowserCheckoutAdapterConformance({ adapter, fixture })
    expect(result.ok).toBe(true)
    expect(result.checks.map((check) => check.id)).toContain('sandbox_receipt')
  })

  it('knows whether autonomous checkout is genuinely supported', () => {
    expect(isBrowserCheckoutAutonomousSupported(sandboxManifest)).toBe(true)
    const plannedManifest = createBrowserCheckoutAdapterManifest({
      ...sandboxManifest,
      id: 'planned-merchant',
      lifecycle: 'planned',
      mode: 'merchant_specific',
      reliability: {
        tier: 'assisted',
        capabilities: ['assisted_checkout_supported', 'cart_supported'],
        knownFailureReasons: ['merchant_validation_missing'],
        requiresTakeover: true,
        apiAvailable: false,
        preferredProviders: ['lucid_managed'],
      },
      failClosedReason: 'merchant_specific_adapter_not_implemented',
    })
    expect(isBrowserCheckoutAutonomousSupported(plannedManifest)).toBe(false)
  })
})
