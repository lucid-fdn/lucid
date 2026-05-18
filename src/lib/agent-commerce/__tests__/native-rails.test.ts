import { AgentCommerceError } from '../errors'
import {
  evaluateAgentCommerceNativeRailPromotion,
  getAgentCommerceNativeRailAdapter,
  listAgentCommerceNativeRailManifests,
  planAgentCommerceNativeRails,
  resetAgentCommerceNativeRailAdapters,
  selectAgentCommerceNativeRailPlan,
} from '../native-rails'

describe('Agent Commerce native checkout rails', () => {
  afterEach(() => {
    resetAgentCommerceNativeRailAdapters()
  })

  it('lists source-backed native rails without marking real merchants live by default', () => {
    const manifests = listAgentCommerceNativeRailManifests()

    expect(manifests.map((manifest) => manifest.id)).toEqual([
      'lucid_sandbox_native',
      'shopify_storefront',
      'kroger_cart',
      'walgreens_add_to_cart',
      'rye_checkout',
    ])
    expect(manifests.find((manifest) => manifest.id === 'lucid_sandbox_native')).toMatchObject({
      status: 'sandbox',
      capabilityLevel: 'native_checkout',
    })
    for (const manifest of manifests.filter((item) => item.id !== 'lucid_sandbox_native')) {
      expect(['requested', 'research']).toContain(manifest.status)
      expect(manifest.sourceUrls.length).toBeGreaterThan(0)
      expect(manifest.failClosedReason).toBeTruthy()
    }
  })

  it('executes only the Lucid sandbox rail with approval and receipt proof', async () => {
    const adapter = getAgentCommerceNativeRailAdapter('lucid_sandbox_native')
    expect(adapter).toBeTruthy()

    const input = {
      orgId: '00000000-0000-4000-8000-000000000001',
      merchant: {
        name: 'Lucid Sandbox',
        domain: 'sandbox.lucid.foundation',
      },
      amount: { amount: 4200, currency: 'eur' },
      runId: 'native-rail-test',
    }
    const cart = await adapter!.createCart!({
      ...input,
      lines: [{ name: 'Weekly groceries', quantity: 1 }],
    })
    const checkout = await adapter!.createCheckout!({ ...input, cart })
    await expect(adapter!.placeOrder!({ ...input, checkout })).rejects.toMatchObject({
      code: 'policy_denied',
    })

    const order = await adapter!.placeOrder!({
      ...input,
      checkout,
      approvalToken: 'approval-token-fixture',
    })
    const receipt = await adapter!.fetchReceipt!({ ...input, order })

    expect(order).toMatchObject({
      status: 'placed',
      total: { amount: 4200, currency: 'eur' },
    })
    expect(receipt).toMatchObject({
      orderId: order.orderId,
      receiptUrl: 'https://sandbox.lucid.foundation/receipts/native',
    })
  })

  it('plans Shopify as a self-serve cart handoff candidate without partner-gated rails', () => {
    const shopifyPlan = selectAgentCommerceNativeRailPlan({
      orgId: '00000000-0000-4000-8000-000000000001',
      merchant: { name: 'Shopify', domain: 'myshopify.com' },
      env: {},
      credentialRefs: {},
    })

    expect(shopifyPlan).toMatchObject({
      railId: 'shopify_storefront',
      executable: false,
      missingEnv: ['SHOPIFY_STOREFRONT_ACCESS_TOKEN'],
      missingCredentialRefs: ['shopify_storefront_domain'],
    })
  })

  it('fails closed when a self-serve cart handoff rail is called before validation', async () => {
    const adapter = getAgentCommerceNativeRailAdapter('walgreens_add_to_cart')
    expect(adapter).toBeTruthy()

    await expect(adapter!.createCart!({
      orgId: '00000000-0000-4000-8000-000000000001',
      merchant: { name: 'Walgreens', domain: 'walgreens.com' },
      lines: [{ name: 'Milk', quantity: 1 }],
    })).rejects.toBeInstanceOf(AgentCommerceError)
    await expect(adapter!.createCart!({
      orgId: '00000000-0000-4000-8000-000000000001',
      merchant: { name: 'Walgreens', domain: 'walgreens.com' },
      lines: [{ name: 'Milk', quantity: 1 }],
    })).rejects.toMatchObject({
      code: 'provider_unavailable',
      status: 501,
    })
  })

  it('uses native rail planning order without falling back to catalog-only rails for checkout', () => {
    const plans = planAgentCommerceNativeRails({
      orgId: '00000000-0000-4000-8000-000000000001',
      merchant: { name: 'Kroger', domain: 'kroger.com' },
      env: {
        KROGER_CLIENT_ID: 'client-fixture',
        KROGER_CLIENT_SECRET: 'secret-fixture',
      },
      credentialRefs: {
        kroger_user_or_org_connection: 'nango://kroger',
      },
    })

    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({
      railId: 'kroger_cart',
      executable: false,
      reason: 'kroger_checkout_requires_user_handoff',
      supportedOperations: ['catalog_search', 'cart_create'],
    })
  })

  it('blocks live native rail promotion until evidence, credentials, and source review exist', () => {
    const blocked = evaluateAgentCommerceNativeRailPromotion({
      railId: 'rye_checkout',
      target: 'live',
      env: {},
      credentialRefs: {},
      evidence: [],
    })

    expect(blocked.ready).toBe(false)
    expect(blocked.blockers).toEqual(expect.arrayContaining([
      'rail_not_live_candidate',
      'provider_credentials_missing',
      'sandbox_evidence_missing',
      'approval_evidence_missing',
      'idempotency_evidence_missing',
      'receipt_evidence_missing',
      'source_review_missing',
    ]))
  })

  it('allows the sandbox rail promotion gate only for sandbox target with fail-closed evidence', () => {
    const sandbox = evaluateAgentCommerceNativeRailPromotion({
      railId: 'lucid_sandbox_native',
      target: 'sandbox',
      evidence: ['fail_closed_paths_verified'],
    })
    const live = evaluateAgentCommerceNativeRailPromotion({
      railId: 'lucid_sandbox_native',
      target: 'live',
      evidence: ['fail_closed_paths_verified'],
    })

    expect(sandbox.ready).toBe(true)
    expect(live.ready).toBe(false)
    expect(live.missingEvidence).toEqual(expect.arrayContaining([
      'sandbox_flow_verified',
      'merchant_flow_verified',
      'receipt_parser_verified',
    ]))
  })
})
