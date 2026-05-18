#!/usr/bin/env tsx

import { getBrowserOperatorCheckoutAdapter } from '@/lib/browser-operator/checkout-adapters'
import { evaluateBrowserOperatorCheckoutStagingGate } from '@/lib/browser-operator/checkout-staging'
import {
  parseCarrefourCartEvidence,
  parseCarrefourReceiptEvidence,
} from '@/lib/browser-operator/checkout-adapters/carrefour'
import {
  parseShopifyCartEvidence,
  parseShopifyReceiptEvidence,
} from '@/lib/browser-operator/checkout-adapters/shopify'
import { carrefourStagingFixture } from '@/lib/browser-operator/checkout-adapters/fixtures/carrefour'
import { shopifyStagingFixture } from '@/lib/browser-operator/checkout-adapters/fixtures/shopify'
import type {
  BrowserOperatorAccount,
  BrowserOperatorProfile,
  BrowserOperatorPurchaseCartItem,
  BrowserOperatorPurchaseRun,
} from '@contracts/browser-operator'

const orgId = '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b'
const accountId = 'bfa9dd86-44a3-4785-a0d8-a3d967b76f89'

const cartItems: BrowserOperatorPurchaseCartItem[] = [{
  name: 'Olive oil',
  quantity: 2,
  total_price: 25.98,
  currency: 'eur',
  category: 'grocery',
  policy_flags: [],
  metadata: {},
}]

const profile: BrowserOperatorProfile = {
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
}

const scenarios = [
  buildShopifyScenario(),
  buildCarrefourScenario(),
]

let failed = false
for (const scenario of scenarios) {
  const adapter = getBrowserOperatorCheckoutAdapter({
    account: scenario.account,
    purchaseRun: scenario.purchaseRun,
    cartItems,
  })
  const result = evaluateBrowserOperatorCheckoutStagingGate({
    adapter,
    account: scenario.account,
    profiles: [profile],
    purchaseRun: scenario.purchaseRun,
    cartItems,
    dryRun: scenario.dryRun,
    receipt: scenario.receipt,
    verifiedAt: '2026-05-10T00:00:00.000Z',
  })
  if (!result.ok) {
    failed = true
    const failures = result.checks
      .filter((check) => !check.ok)
      .map((check) => `${check.id}: ${check.message}`)
      .join('; ')
    console.error(`FAIL ${scenario.label}: ${failures}`)
    continue
  }
  console.log(`OK   ${scenario.label}: ${result.adapterId} · ${result.currentTier} -> ${result.targetTier} · ${result.merchantDomain}`)
}

if (failed) process.exit(1)

function buildShopifyScenario() {
  const parsedCart = parseShopifyCartEvidence(shopifyStagingFixture.cartJson)
  const parsedReceipt = parseShopifyReceiptEvidence({
    url: 'https://weekly-market.example/orders/abc123',
    currency: 'EUR',
    html: shopifyStagingFixture.receiptHtml,
  })
  return {
    label: 'shopify fixture gate',
    account: account({
      merchant_key: 'shopify',
      merchant_name: 'Weekly Market',
      metadata: shopifyStagingFixture.accountMetadata,
    }),
    purchaseRun: purchaseRun({
      merchant: { name: 'Weekly Market', domain: 'weekly-market.example' },
    }),
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
  }
}

function buildCarrefourScenario() {
  const parsedCart = parseCarrefourCartEvidence({
    html: carrefourStagingFixture.cartHtml,
    currency: 'EUR',
  })
  const parsedReceipt = parseCarrefourReceiptEvidence({
    url: 'https://www.carrefour.fr/mon-compte/commandes/CRF-ABC-123456',
    currency: 'EUR',
    html: carrefourStagingFixture.receiptHtml,
  })
  return {
    label: 'carrefour fixture gate',
    account: account({
      merchant_key: 'carrefour',
      merchant_name: 'Carrefour',
      metadata: carrefourStagingFixture.accountMetadata,
    }),
    purchaseRun: purchaseRun({
      merchant: { name: 'Carrefour', domain: 'carrefour.fr' },
    }),
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
  }
}

function account(overrides: Partial<BrowserOperatorAccount>): BrowserOperatorAccount {
  return {
    id: accountId,
    contract_version: '2026-05-10',
    schema_version: 1,
    org_id: orgId,
    merchant_key: 'merchant',
    merchant_name: 'Merchant',
    provider: 'lucid_managed',
    auth_state: 'connected',
    capabilities: [],
    created_at: '2026-05-10T00:00:00.000Z',
    updated_at: '2026-05-10T00:00:00.000Z',
    metadata: {},
    ...overrides,
  }
}

function purchaseRun(overrides: Partial<BrowserOperatorPurchaseRun>): BrowserOperatorPurchaseRun {
  return {
    id: '44ffbd52-a4df-4e3f-97dd-f692c9207fa2',
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
