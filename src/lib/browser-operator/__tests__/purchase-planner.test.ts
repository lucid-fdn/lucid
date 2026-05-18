import { describe, expect, it } from 'vitest'
import { planBrowserOperatorPurchaseRail } from '../purchase-planner'
import type {
  BrowserOperatorAccount,
  BrowserOperatorMerchantNativeCapability,
  BrowserOperatorProfile,
} from '@contracts/browser-operator'

const account: BrowserOperatorAccount = {
  id: '540e9bbb-32d6-4d7a-9b94-a7a71c213d0f',
  contract_version: '2026-05-10',
  schema_version: 1,
  org_id: '0fe588af-5e1e-4bc2-8818-88445f0935d8',
  user_id: 'e175e63a-2ef9-485d-8ab4-13c4067d43a7',
  merchant_key: 'carrefour',
  merchant_name: 'Carrefour',
  provider: 'playwright',
  auth_state: 'connected',
  capabilities: [],
  created_at: '2026-05-10T00:00:00.000Z',
  updated_at: '2026-05-10T00:00:00.000Z',
  metadata: {},
}

const profile: BrowserOperatorProfile = {
  id: '299422a6-7bd2-4af0-bdd4-a8d343748f5f',
  contract_version: '2026-05-10',
  schema_version: 1,
  org_id: account.org_id,
  user_id: account.user_id,
  browser_account_id: account.id,
  provider: 'playwright',
  provider_profile_ref: 'profile-carrefour',
  status: 'active',
  migration_status: 'not_required',
  created_at: '2026-05-10T00:00:00.000Z',
  updated_at: '2026-05-10T00:00:00.000Z',
  metadata: {},
}

const partnerGatedDemo: BrowserOperatorMerchantNativeCapability = {
  id: '5580d939-5938-468a-88a3-1b4f9de355d3',
  contract_version: '2026-05-10',
  schema_version: 1,
  merchant_key: 'partner_demo_store',
  merchant_domain: 'merchant.example',
  provider: 'partner_demo',
  capability_level: 'native_checkout',
  rail_id: 'partner_demo_checkout',
  status: 'live',
  access_model: 'oauth',
  supported_operations: ['checkout_session_create', 'payment_authorize', 'order_place', 'receipt_fetch'],
  required_credentials: ['partner_oauth'],
  required_env: [],
  countries: ['US'],
  promotion_evidence: {},
  source_urls: ['https://example.com/partner-commerce'],
  created_at: '2026-05-10T00:00:00.000Z',
  updated_at: '2026-05-10T00:00:00.000Z',
  metadata: {},
}

describe('Browser Operator purchase planner', () => {
  it('prefers executable native checkout over browser execution', () => {
    expect(planBrowserOperatorPurchaseRail({
      merchant: { name: 'Partner Demo Store', domain: 'merchant.example' },
      nativeCapabilities: [partnerGatedDemo],
      nativeRailPlans: [{
        railId: 'partner_demo_checkout',
        executable: true,
        reason: 'native_rail_ready',
      }],
    })).toMatchObject({
      rail: 'native_commerce',
      executable: true,
      nativeRailId: 'partner_demo_checkout',
      checkoutCanAutoExecute: true,
      requiresHandoff: false,
    })
  })

  it('does not trust a DB native checkout row without native rail readiness', () => {
    expect(planBrowserOperatorPurchaseRail({
      merchant: { name: 'Partner Demo Store', domain: 'merchant.example' },
      nativeCapabilities: [partnerGatedDemo],
    })).toMatchObject({
      rail: 'research_only',
      executable: false,
      reason: 'native_rail_readiness_missing',
      checkoutCanAutoExecute: false,
    })
  })

  it('uses authenticated browser only when profile is usable and merchant is live for profile', () => {
    expect(planBrowserOperatorPurchaseRail({
      merchant: { name: 'Carrefour', domain: 'carrefour.fr' },
      account,
      profiles: [profile],
      merchantReliability: 'live_supported_for_profile',
      checkoutRequested: true,
      proxyPolicy: {
        mode: 'authenticated_profile',
        checkout_allowed: true,
      },
    })).toMatchObject({
      rail: 'authenticated_browser',
      executable: true,
      provider: 'playwright',
      requiresHandoff: false,
      checkoutCanAutoExecute: true,
    })
  })

  it('routes Carrefour-like merchants to assisted handoff when reliability requires it', () => {
    expect(planBrowserOperatorPurchaseRail({
      merchant: { name: 'Carrefour', domain: 'carrefour.fr' },
      account,
      profiles: [profile],
      merchantReliability: 'authenticated_or_assisted_required',
    })).toMatchObject({
      rail: 'assisted_handoff',
      executable: false,
      requiresHandoff: true,
      reason: 'merchant_requires_takeover_before_checkout',
    })
  })

  it('keeps unsupported merchants research-only instead of pretending checkout is possible', () => {
    expect(planBrowserOperatorPurchaseRail({
      merchant: { name: 'Amazon', domain: 'amazon.com' },
      nativeCapabilities: [{
        ...partnerGatedDemo,
        id: '4239356a-c0af-46b6-9dc9-c5a3841bb6ad',
        merchant_key: 'amazon',
        merchant_domain: 'amazon.com',
        provider: 'amazon_paapi',
        rail_id: 'amazon-catalog',
        capability_level: 'native_catalog_only',
        supported_operations: ['catalog_search', 'price_lookup'],
      }],
    })).toMatchObject({
      rail: 'research_only',
      executable: false,
      checkoutCanAutoExecute: false,
    })
  })
})
