import { describe, expect, it } from 'vitest'
import { getBrowserOperatorCheckoutAdapter } from '../checkout-adapters'
import {
  amazonMerchantDomains,
  detectAmazonCheckoutRisk,
  parseAmazonCartEvidence,
  parseAmazonReceiptEvidence,
} from '../checkout-adapters/amazon'
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
  merchant_key: 'amazon',
  merchant_name: 'Amazon',
  provider: 'lucid_managed',
  auth_state: 'connected',
  capabilities: [],
  created_at: '2026-05-10T00:00:00.000Z',
  updated_at: '2026-05-10T00:00:00.000Z',
  metadata: {
    amazon_marketplace_domain: 'amazon.fr',
  },
}

const purchaseRun: BrowserOperatorPurchaseRun = {
  id: '44ffbd52-a4df-4e3f-97dd-f692c9207fa2',
  contract_version: '2026-05-10',
  schema_version: 1,
  org_id: account.org_id,
  browser_account_id: account.id,
  idempotency_key: 'weekly-amazon-1',
  merchant: { name: 'Amazon France', domain: 'amazon.fr' },
  status: 'approved',
  cart_hash: 'a'.repeat(64),
  cart_total: { amount: 3298, currency: 'eur' },
  policy_decision: {},
  approval_state: 'approved',
  created_at: '2026-05-10T00:00:00.000Z',
  updated_at: '2026-05-10T00:00:00.000Z',
  metadata: {},
}

const cartItems: BrowserOperatorPurchaseCartItem[] = [{
  name: 'Coffee beans',
  quantity: 2,
  total_price: 32.98,
  currency: 'eur',
  category: 'grocery',
  policy_flags: [],
  metadata: {},
}]

describe('Amazon checkout adapter support', () => {
  it('matches regional Amazon marketplaces but remains fail-closed', async () => {
    const adapter = getBrowserOperatorCheckoutAdapter({ account, purchaseRun, cartItems })

    expect(adapter.id).toBe('amazon')
    expect(adapter.manifest.status).toBe('planned')
    await expect(adapter.execute({ account, purchaseRun, cartItems })).rejects.toThrow(/not live-enabled/i)
  })

  it('matches configured marketplace metadata and exposes known domains', () => {
    expect(amazonMerchantDomains(account)).toEqual(expect.arrayContaining(['amazon.com', 'amazon.fr']))

    const adapter = getBrowserOperatorCheckoutAdapter({
      account: {
        ...account,
        metadata: { amazon_domains: ['smile.amazon.com'] },
      },
      purchaseRun: {
        ...purchaseRun,
        merchant: { name: 'Amazon Smile', domain: 'smile.amazon.com' },
      },
      cartItems,
    })

    expect(adapter.id).toBe('amazon')
  })

  it('parses Amazon cart evidence from visible cart text', () => {
    const cart = parseAmazonCartEvidence({
      currency: 'EUR',
      text: 'Shopping Cart Subtotal (2 items): €32.98 Estimated total: €32.98',
    })

    expect(cart).toMatchObject({
      provider: 'amazon_cart_page',
      itemCount: 2,
      subtotal: { amount: 3298, currency: 'eur' },
      estimatedTotal: { amount: 3298, currency: 'eur' },
    })
    expect(cart.rawSignals).toEqual(expect.arrayContaining(['item_count', 'subtotal', 'estimated_total']))
  })

  it('parses Amazon receipt evidence from order confirmation text', () => {
    const receipt = parseAmazonReceiptEvidence({
      url: 'https://www.amazon.fr/gp/your-account/order-details?orderID=123-4567890-1234567',
      currency: 'EUR',
      html: `
        <main>
          <h1>Thank you, your order has been placed.</h1>
          <p>Order # 123-4567890-1234567</p>
          <p>Order total: EUR 32.98</p>
          <p>Arriving: Wednesday, May 13</p>
        </main>
      `,
    })

    expect(receipt).toMatchObject({
      provider: 'amazon_order_confirmation',
      orderId: '123-4567890-1234567',
      receiptUrl: 'https://www.amazon.fr/gp/your-account/order-details?orderID=123-4567890-1234567',
      total: { amount: 3298, currency: 'eur' },
    })
    expect(receipt.rawSignals).toEqual(expect.arrayContaining(['order_id', 'total', 'delivery_estimate']))
  })

  it('detects Amazon checkout conditions that require human takeover', () => {
    const risk = detectAmazonCheckoutRisk({
      text: 'Two-Step Verification required. Enter the characters you see below. Payment revision needed.',
    })

    expect(risk.requiresHumanTakeover).toBe(true)
    expect(risk.reasons).toEqual(expect.arrayContaining([
      'mfa_required',
      'captcha_or_bot_check',
      'payment_attention_required',
    ]))
  })
})
