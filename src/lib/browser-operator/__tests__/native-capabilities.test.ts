import { describe, expect, it } from 'vitest'
import { selectBestBrowserOperatorNativeCapability } from '../native-capabilities'
import type { BrowserOperatorMerchantNativeCapability } from '@contracts/browser-operator'

const baseCapability: BrowserOperatorMerchantNativeCapability = {
  id: '5d0b32a7-e68f-4c47-9355-ff6c28191418',
  contract_version: '2026-05-10',
  schema_version: 1,
  merchant_key: 'shopify',
  merchant_domain: 'example-store.com',
  provider: 'shopify_storefront',
  capability_level: 'native_cart_handoff',
  rail_id: 'shopify-storefront',
  status: 'live',
  access_model: 'public',
  supported_operations: ['cart_create', 'cart_update', 'cart_handoff'],
  required_credentials: [],
  required_env: [],
  countries: ['US', 'FR'],
  promotion_evidence: {},
  source_urls: ['https://shopify.dev/docs/api/storefront/latest/mutations/cartCreate'],
  created_at: '2026-05-10T00:00:00.000Z',
  updated_at: '2026-05-10T00:00:00.000Z',
  metadata: {},
}

describe('Browser Operator native capability selection', () => {
  it('selects the best executable native cart handoff capability', () => {
    const decision = selectBestBrowserOperatorNativeCapability({
      merchant: { name: 'Example Store', domain: 'www.example-store.com' },
      capabilities: [baseCapability],
      country: 'FR',
    })

    expect(decision).toMatchObject({
      executable: true,
      reason: 'native_capability_selected',
      capability: {
        rail_id: 'shopify-storefront',
        capability_level: 'native_cart_handoff',
      },
    })
  })

  it('blocks partner-only rails until the org has an approved connection', () => {
    const partnerCapability: BrowserOperatorMerchantNativeCapability = {
      ...baseCapability,
      id: '731a377f-56dc-4144-87a0-72a6e850c426',
      merchant_key: 'ebay',
      merchant_domain: 'ebay.com',
      provider: 'ebay',
      rail_id: 'ebay-buy-order',
      capability_level: 'partner_only',
      access_model: 'partner_contract',
      supported_operations: ['checkout_session_create', 'order_place', 'receipt_fetch'],
    }

    expect(selectBestBrowserOperatorNativeCapability({
      merchant: { name: 'eBay', domain: 'ebay.com' },
      capabilities: [partnerCapability],
    })).toMatchObject({
      executable: false,
      reason: 'partner_rail_not_approved',
    })

    expect(selectBestBrowserOperatorNativeCapability({
      merchant: { name: 'eBay', domain: 'ebay.com' },
      capabilities: [partnerCapability],
      approvedPartnerRailIds: ['ebay-buy-order'],
    })).toMatchObject({
      executable: true,
      reason: 'native_capability_selected',
    })
  })

  it('does not execute research-only merchant rows', () => {
    expect(selectBestBrowserOperatorNativeCapability({
      merchant: { name: 'Amazon', domain: 'amazon.com' },
      capabilities: [{
        ...baseCapability,
        id: '5c545d08-1a77-4fa4-98ac-730936732987',
        merchant_key: 'amazon',
        merchant_domain: 'amazon.com',
        provider: 'amazon_paapi',
        rail_id: 'amazon-catalog',
        capability_level: 'native_catalog_only',
        status: 'live',
        access_model: 'public',
        supported_operations: ['catalog_search', 'price_lookup'],
      }],
    })).toMatchObject({
      executable: false,
      reason: 'native_native_catalog_only',
    })
  })
})
