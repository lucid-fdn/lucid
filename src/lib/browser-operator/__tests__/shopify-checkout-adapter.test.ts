import { describe, expect, it } from 'vitest'
import { getBrowserOperatorCheckoutAdapter } from '../checkout-adapters'
import {
  parseShopifyCartEvidence,
  parseShopifyReceiptEvidence,
  shopifyStorefrontDomains,
} from '../checkout-adapters/shopify'
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
  merchant_key: 'shopify',
  merchant_name: 'Shopify Store',
  provider: 'lucid_managed',
  auth_state: 'connected',
  capabilities: [],
  created_at: '2026-05-10T00:00:00.000Z',
  updated_at: '2026-05-10T00:00:00.000Z',
  metadata: {
    shopify_domains: ['https://weekly-market.example'],
  },
}

const purchaseRun: BrowserOperatorPurchaseRun = {
  id: '44ffbd52-a4df-4e3f-97dd-f692c9207fa2',
  contract_version: '2026-05-10',
  schema_version: 1,
  org_id: account.org_id,
  browser_account_id: account.id,
  idempotency_key: 'weekly-shopify-1',
  merchant: { name: 'Weekly Market', domain: 'weekly-market.example' },
  status: 'approved',
  cart_hash: 'a'.repeat(64),
  cart_total: { amount: 1250, currency: 'usd' },
  policy_decision: {},
  approval_state: 'approved',
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

describe('Shopify checkout adapter support', () => {
  it('matches Shopify custom storefront domains from account metadata but remains fail-closed', async () => {
    const adapter = getBrowserOperatorCheckoutAdapter({ account, purchaseRun, cartItems })

    expect(adapter.id).toBe('shopify')
    expect(adapter.manifest.status).toBe('planned')
    await expect(adapter.execute({ account, purchaseRun, cartItems })).rejects.toThrow(/not live-enabled/i)
  })

  it('matches platform myshopify domains without custom metadata', () => {
    const adapter = getBrowserOperatorCheckoutAdapter({
      account: {
        ...account,
        metadata: {},
      },
      purchaseRun: {
        ...purchaseRun,
        merchant: { name: 'Weekly Market', domain: 'weekly-market.myshopify.com' },
      },
      cartItems,
    })

    expect(adapter.id).toBe('shopify')
  })

  it('normalizes Shopify custom domains from metadata', () => {
    expect(shopifyStorefrontDomains(account)).toEqual(['weekly-market.example'])
  })

  it('parses Shopify ajax cart evidence without leaking cart token value', () => {
    const cart = parseShopifyCartEvidence({
      token: 'sensitive-cart-token',
      currency: 'EUR',
      item_count: 2,
      total_price: 2598,
      original_total_price: 2998,
      total_discount: 400,
      items: [{
        id: 123,
        product_id: 456,
        variant_id: 789,
        product_title: 'Olive oil',
        quantity: 2,
        price: 1299,
        final_line_price: 2598,
        vendor: 'Local Grocer',
        product_type: 'Pantry',
      }],
    })

    expect(cart).toMatchObject({
      provider: 'shopify_ajax_cart',
      cartTokenPresent: true,
      itemCount: 2,
      total: { amount: 2598, currency: 'eur' },
      discount: { amount: 400, currency: 'eur' },
      items: [{
        productId: '456',
        variantId: '789',
        title: 'Olive oil',
        lineTotal: { amount: 2598, currency: 'eur' },
      }],
    })
    expect(JSON.stringify(cart)).not.toContain('sensitive-cart-token')
  })

  it('parses Shopify receipt evidence from order-status text/html', () => {
    const receipt = parseShopifyReceiptEvidence({
      url: 'https://weekly-market.example/orders/abc123',
      currency: 'EUR',
      html: `
        <main>
          <h1>Thank you Quentin</h1>
          <p>Order #1042</p>
          <p>Confirmation number: SHOP-ABC-42</p>
          <p>Total: €25.98</p>
        </main>
      `,
    })

    expect(receipt).toMatchObject({
      provider: 'shopify_order_status',
      orderName: '#1042',
      confirmationNumber: 'SHOP-ABC-42',
      receiptUrl: 'https://weekly-market.example/orders/abc123',
      total: { amount: 2598, currency: 'eur' },
    })
    expect(receipt.rawSignals).toEqual(expect.arrayContaining(['order_name', 'confirmation_number', 'total']))
  })
})
