import { describe, expect, it } from 'vitest'
import {
  assertBrowserOperatorCheckoutAdapterExecutable,
  browserOperatorCheckoutReliabilityLabel,
  getBrowserOperatorCheckoutAdapter,
  isBrowserOperatorAutonomousCheckoutSupported,
  listBrowserOperatorCheckoutAdapterManifests,
} from '../checkout-adapters'
import type {
  BrowserOperatorAccount,
  BrowserOperatorPurchaseCartItem,
  BrowserOperatorPurchaseRun,
} from '@contracts/browser-operator'

const account: BrowserOperatorAccount = {
  id: 'bfa9dd86-44a3-4785-a0d8-a3d967b76f89',
  contract_version: '2026-05-10',
  schema_version: 1,
  org_id: '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b',
  merchant_key: 'lucid_sandbox',
  merchant_name: 'Lucid Sandbox',
  provider: 'lucid_managed',
  auth_state: 'connected',
  capabilities: [],
  created_at: '2026-05-10T00:00:00.000Z',
  updated_at: '2026-05-10T00:00:00.000Z',
  metadata: {},
}

const purchaseRun: BrowserOperatorPurchaseRun = {
  id: '44ffbd52-a4df-4e3f-97dd-f692c9207fa2',
  contract_version: '2026-05-10',
  schema_version: 1,
  org_id: account.org_id,
  browser_account_id: account.id,
  idempotency_key: 'weekly-groceries-1',
  merchant: { name: 'Lucid Sandbox', domain: 'sandbox.lucid.foundation' },
  status: 'approved',
  cart_hash: 'a'.repeat(64),
  cart_total: { amount: 1250, currency: 'usd' },
  policy_decision: {},
  approval_state: 'not_required',
  created_at: '2026-05-10T00:00:00.000Z',
  updated_at: '2026-05-10T00:00:00.000Z',
  metadata: {},
}

const cartItems: BrowserOperatorPurchaseCartItem[] = [{
  name: 'Organic bananas',
  quantity: 2,
  total_price: 12.5,
  currency: 'usd',
  category: 'food',
  policy_flags: [],
  metadata: {},
}]

describe('Browser Operator checkout adapters', () => {
  it('captures a receipt for the sandbox merchant adapter', async () => {
    const adapter = getBrowserOperatorCheckoutAdapter({ account, purchaseRun, cartItems })
    const receipt = await adapter.execute({ account, purchaseRun, cartItems })

    expect(adapter.id).toBe('sandbox')
    expect(receipt).toMatchObject({
      merchant_order_id: `lucid-sandbox-${purchaseRun.id.slice(0, 8)}`,
      total: { amount: 1250, currency: 'usd' },
      raw_receipt: {
        adapter: 'sandbox',
        item_count: 1,
      },
    })
  })

  it('fails closed when no merchant-specific adapter exists', () => {
    expect(() => getBrowserOperatorCheckoutAdapter({
      account: {
        ...account,
        merchant_key: 'unsupported_store',
        merchant_name: 'Unsupported Store',
      },
      purchaseRun: {
        ...purchaseRun,
        merchant: { name: 'Unsupported Store', domain: 'unsupported-store.example' },
      },
      cartItems,
    })).toThrow(/No checkout adapter is registered/i)
  })

  it('registers priority merchant-specific adapters but keeps them fail-closed', () => {
    const instacartRun: BrowserOperatorPurchaseRun = {
      ...purchaseRun,
      merchant: { name: 'Instacart', domain: 'instacart.com' },
    }
    const adapter = getBrowserOperatorCheckoutAdapter({
      account: {
        ...account,
        merchant_key: 'instacart',
        merchant_name: 'Instacart',
      },
      purchaseRun: instacartRun,
      cartItems,
    })

    expect(adapter.id).toBe('instacart')
    expect(adapter.manifest.status).toBe('planned')
    expect(adapter.manifest.reliability.tier).toBe('research_only')
    expect(() => assertBrowserOperatorCheckoutAdapterExecutable(adapter, {
      account,
      purchaseRun: instacartRun,
      cartItems,
    })).toThrow(/not live-enabled/i)
  })

  it('exposes a UI/API manifest for US and European merchant priorities', () => {
    const manifests = listBrowserOperatorCheckoutAdapterManifests()
    expect(manifests.map((manifest) => manifest.id)).toEqual(
      expect.arrayContaining(['sandbox', 'instacart', 'amazon', 'walmart', 'carrefour', 'shopify']),
    )
    expect(manifests.find((manifest) => manifest.id === 'sandbox')).toMatchObject({
      status: 'available',
      receiptStrategy: 'synthetic_sandbox',
      reliability: {
        tier: 'live_supported',
        capabilities: expect.arrayContaining(['auto_buy_supported', 'cart_supported', 'receipt_supported']),
      },
    })
    expect(manifests.find((manifest) => manifest.id === 'carrefour')).toMatchObject({
      status: 'planned',
      merchantDomains: expect.arrayContaining(['carrefour.fr', 'courses.carrefour.fr']),
      receiptStrategy: 'merchant_receipt_page',
      reliability: {
        tier: 'assisted',
      },
    })
    expect(manifests.find((manifest) => manifest.id === 'amazon')).toMatchObject({
      status: 'planned',
      merchantDomains: expect.arrayContaining(['amazon.com', 'amazon.fr', 'amazon.co.uk', 'amazon.de']),
      receiptStrategy: 'email_or_order_history',
      reliability: {
        tier: 'assisted',
        knownFailureReasons: expect.arrayContaining(['captcha_risk', 'mfa_risk', 'anti_bot_risk']),
      },
    })
    expect(manifests.find((manifest) => manifest.id === 'shopify')).toMatchObject({
      status: 'planned',
      merchantDomains: ['myshopify.com'],
      receiptStrategy: 'email_or_order_history',
      reliability: {
        tier: 'assisted',
        capabilities: expect.arrayContaining(['cart_supported', 'receipt_supported', 'custom_domain_supported']),
      },
    })
  })

  it('separates autonomous support from assisted/research visibility', () => {
    const manifests = listBrowserOperatorCheckoutAdapterManifests()
    const sandbox = { manifest: manifests.find((manifest) => manifest.id === 'sandbox')! }
    const amazon = { manifest: manifests.find((manifest) => manifest.id === 'amazon')! }
    const carrefour = { manifest: manifests.find((manifest) => manifest.id === 'carrefour')! }

    expect(isBrowserOperatorAutonomousCheckoutSupported(sandbox)).toBe(true)
    expect(browserOperatorCheckoutReliabilityLabel(sandbox)).toBe('Auto-buy supported')
    expect(isBrowserOperatorAutonomousCheckoutSupported(amazon)).toBe(false)
    expect(browserOperatorCheckoutReliabilityLabel(amazon)).toBe('Assisted checkout')
    expect(isBrowserOperatorAutonomousCheckoutSupported(carrefour)).toBe(false)
    expect(browserOperatorCheckoutReliabilityLabel(carrefour)).toBe('Assisted checkout')
  })
})
