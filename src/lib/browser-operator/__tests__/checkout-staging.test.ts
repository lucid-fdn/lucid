import { describe, expect, it } from 'vitest'
import { getBrowserOperatorCheckoutAdapter } from '../checkout-adapters'
import { evaluateBrowserOperatorCheckoutStagingGate } from '../checkout-staging'
import {
  parseCarrefourCartEvidence,
  parseCarrefourReceiptEvidence,
  detectCarrefourCheckoutRisk,
} from '../checkout-adapters/carrefour'
import {
  parseShopifyCartEvidence,
  parseShopifyReceiptEvidence,
} from '../checkout-adapters/shopify'
import { carrefourStagingFixture } from '../checkout-adapters/fixtures/carrefour'
import { shopifyStagingFixture } from '../checkout-adapters/fixtures/shopify'
import type {
  BrowserOperatorAccount,
  BrowserOperatorProfile,
  BrowserOperatorPurchaseCartItem,
  BrowserOperatorPurchaseRun,
} from '@contracts/browser-operator'

const orgId = '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b'
const accountId = 'bfa9dd86-44a3-4785-a0d8-a3d967b76f89'
const purchaseRunId = '44ffbd52-a4df-4e3f-97dd-f692c9207fa2'

const cartItems: BrowserOperatorPurchaseCartItem[] = [{
  name: 'Olive oil',
  quantity: 2,
  total_price: 25.98,
  currency: 'eur',
  category: 'grocery',
  policy_flags: [],
  metadata: {},
}]

function account(overrides: Partial<BrowserOperatorAccount>): BrowserOperatorAccount {
  return {
    id: accountId,
    contract_version: '2026-05-10',
    schema_version: 1,
    org_id: orgId,
    merchant_key: 'shopify',
    merchant_name: 'Shopify Store',
    provider: 'lucid_managed',
    auth_state: 'connected',
    capabilities: [],
    created_at: '2026-05-10T00:00:00.000Z',
    updated_at: '2026-05-10T00:00:00.000Z',
    metadata: {},
    ...overrides,
  }
}

function profile(overrides: Partial<BrowserOperatorProfile> = {}): BrowserOperatorProfile {
  return {
    id: '7f986c29-c0fb-49f3-9c40-33ad2c99ef42',
    contract_version: '2026-05-10',
    schema_version: 1,
    org_id: orgId,
    browser_account_id: accountId,
    provider: 'lucid_managed',
    profile_artifact_ref: 'browser-profile://fixture/profile',
    provider_profile_ref: 'profile-fixture',
    provider_context_ref: 'context-fixture',
    status: 'active',
    last_verified_at: '2026-05-10T00:00:00.000Z',
    migration_status: 'not_required',
    created_at: '2026-05-10T00:00:00.000Z',
    updated_at: '2026-05-10T00:00:00.000Z',
    metadata: {},
    ...overrides,
  }
}

function purchaseRun(overrides: Partial<BrowserOperatorPurchaseRun>): BrowserOperatorPurchaseRun {
  return {
    id: purchaseRunId,
    contract_version: '2026-05-10',
    schema_version: 1,
    org_id: orgId,
    browser_account_id: accountId,
    idempotency_key: 'weekly-checkout-staging-1',
    merchant: { name: 'Merchant', domain: 'merchant.example' },
    status: 'approved',
    cart_hash: 'a'.repeat(64),
    cart_total: { amount: 2598, currency: 'eur' },
    policy_decision: {},
    approval_state: 'approved',
    created_at: '2026-05-10T00:00:00.000Z',
    updated_at: '2026-05-10T00:00:00.000Z',
    metadata: {},
    ...overrides,
  }
}

describe('Browser Operator checkout staging gate', () => {
  it('passes Shopify staging promotion only for a specific connected store/profile', () => {
    const merchantAccount = account({
      merchant_key: 'shopify',
      merchant_name: 'Weekly Market',
      metadata: shopifyStagingFixture.accountMetadata,
    })
    const run = purchaseRun({
      merchant: { name: 'Weekly Market', domain: 'weekly-market.example' },
    })
    const adapter = getBrowserOperatorCheckoutAdapter({
      account: merchantAccount,
      purchaseRun: run,
      cartItems,
    })
    const parsedCart = parseShopifyCartEvidence(shopifyStagingFixture.cartJson)
    const parsedReceipt = parseShopifyReceiptEvidence({
      url: 'https://weekly-market.example/orders/abc123',
      currency: 'EUR',
      html: shopifyStagingFixture.receiptHtml,
    })

    const result = evaluateBrowserOperatorCheckoutStagingGate({
      adapter,
      account: merchantAccount,
      profiles: [profile()],
      purchaseRun: run,
      cartItems,
      dryRun: {
        provider: parsedCart.provider,
        total: parsedCart.total,
        itemCount: parsedCart.itemCount,
        rawSignals: ['cart_total', 'cart_items', 'checkout_page'],
      },
      receipt: {
        provider: parsedReceipt.provider,
        orderId: parsedReceipt.orderId,
        orderName: parsedReceipt.orderName,
        confirmationNumber: parsedReceipt.confirmationNumber,
        receiptUrl: parsedReceipt.receiptUrl,
        total: parsedReceipt.total,
        rawSignals: parsedReceipt.rawSignals,
      },
      verifiedAt: '2026-05-10T00:00:00.000Z',
    })

    expect(result.ok).toBe(true)
    expect(result.canPromoteStoreProfile).toBe(true)
    expect(result.currentTier).toBe('assisted')
    expect(result.metadataPatch).toMatchObject({
      checkout_staging: {
        adapter_id: 'shopify',
        merchant_domain: 'weekly-market.example',
        target_tier: 'live_supported',
        scope: 'store_profile',
      },
    })
  })

  it('passes Carrefour staging promotion with delivery-slot and receipt evidence', () => {
    const merchantAccount = account({
      merchant_key: 'carrefour',
      merchant_name: 'Carrefour',
      metadata: carrefourStagingFixture.accountMetadata,
    })
    const run = purchaseRun({
      merchant: { name: 'Carrefour', domain: 'carrefour.fr' },
    })
    const adapter = getBrowserOperatorCheckoutAdapter({
      account: merchantAccount,
      purchaseRun: run,
      cartItems,
    })
    const parsedCart = parseCarrefourCartEvidence({
      html: carrefourStagingFixture.cartHtml,
      currency: 'EUR',
    })
    const parsedReceipt = parseCarrefourReceiptEvidence({
      url: 'https://www.carrefour.fr/mon-compte/commandes/CRF-ABC-123456',
      currency: 'EUR',
      html: carrefourStagingFixture.receiptHtml,
    })

    const result = evaluateBrowserOperatorCheckoutStagingGate({
      adapter,
      account: merchantAccount,
      profiles: [profile()],
      purchaseRun: run,
      cartItems,
      dryRun: {
        provider: parsedCart.provider,
        total: parsedCart.estimatedTotal,
        itemCount: parsedCart.itemCount,
        rawSignals: parsedCart.rawSignals,
      },
      receipt: {
        provider: parsedReceipt.provider,
        orderId: parsedReceipt.orderId,
        receiptUrl: parsedReceipt.receiptUrl,
        total: parsedReceipt.total,
        rawSignals: parsedReceipt.rawSignals,
      },
      verifiedAt: '2026-05-10T00:00:00.000Z',
    })

    expect(adapter.id).toBe('carrefour')
    expect(result.ok).toBe(true)
    expect(result.metadataPatch).toMatchObject({
      checkout_staging: {
        adapter_id: 'carrefour',
        merchant_domain: 'carrefour.fr',
        target_tier: 'live_supported',
      },
    })
  })

  it('blocks staging promotion when profile reuse would require raw credentials', () => {
    const merchantAccount = account({
      merchant_key: 'shopify',
      merchant_name: 'Weekly Market',
      session_secret_ref: 'vault://raw-password-not-allowed',
      metadata: shopifyStagingFixture.accountMetadata,
    })
    const run = purchaseRun({
      merchant: { name: 'Weekly Market', domain: 'weekly-market.example' },
    })
    const adapter = getBrowserOperatorCheckoutAdapter({
      account: merchantAccount,
      purchaseRun: run,
      cartItems,
    })
    const parsedCart = parseShopifyCartEvidence(shopifyStagingFixture.cartJson)
    const parsedReceipt = parseShopifyReceiptEvidence({
      url: 'https://weekly-market.example/orders/abc123',
      currency: 'EUR',
      html: shopifyStagingFixture.receiptHtml,
    })

    const result = evaluateBrowserOperatorCheckoutStagingGate({
      adapter,
      account: merchantAccount,
      profiles: [profile()],
      purchaseRun: run,
      cartItems,
      dryRun: {
        provider: parsedCart.provider,
        total: parsedCart.total,
        itemCount: parsedCart.itemCount,
        rawSignals: ['cart_total', 'cart_items'],
      },
      receipt: {
        provider: parsedReceipt.provider,
        orderName: parsedReceipt.orderName,
        confirmationNumber: parsedReceipt.confirmationNumber,
        receiptUrl: parsedReceipt.receiptUrl,
        total: parsedReceipt.total,
        rawSignals: parsedReceipt.rawSignals,
      },
    })

    expect(result.ok).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({
      id: 'no_raw_credentials_required',
      ok: false,
    }))
  })

  it('detects Carrefour checkout risks that require takeover', () => {
    const risk = detectCarrefourCheckoutRisk({
      html: carrefourStagingFixture.mfaHtml + carrefourStagingFixture.captchaHtml,
    })

    expect(risk.requiresHumanTakeover).toBe(true)
    expect(risk.reasons).toEqual(expect.arrayContaining([
      'payment_auth_required',
      'captcha_or_bot_check',
    ]))
  })
})
