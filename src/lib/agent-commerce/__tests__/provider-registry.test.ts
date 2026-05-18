import { describe, expect, it, beforeEach, vi } from 'vitest'
import { ManualAgentCommerceProvider } from '../providers/manual'
import {
  defaultAgentCommerceProviderManifests,
  getAgentCommerceProvider,
  hasAgentCommerceProvider,
  listAgentCommerceProviderManifests,
  registerAgentCommerceProvider,
  registerDefaultAgentCommerceProviders,
  resetAgentCommerceProviders,
} from '../provider-registry'

vi.mock('server-only', () => ({}))

describe('Agent Commerce provider registry', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    resetAgentCommerceProviders()
  })

  it('registers provider manifests without duplicate IDs', () => {
    registerDefaultAgentCommerceProviders()
    const manifests = listAgentCommerceProviderManifests()
    const ids = manifests.map((manifest) => manifest.id)

    expect(ids).toContain('manual')
    expect(ids).toContain('stripe_link_agents')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('rejects duplicate provider registration', () => {
    registerAgentCommerceProvider(new ManualAgentCommerceProvider())
    expect(() => registerAgentCommerceProvider(new ManualAgentCommerceProvider())).toThrow(/Duplicate/)
  })

  it('keeps all default manifests provider-neutral', () => {
    expect(defaultAgentCommerceProviderManifests().every((manifest) => manifest.rails.length > 0)).toBe(true)
  })

  it('registers the Stripe SPT adapter only when execution is explicitly enabled', () => {
    vi.stubEnv('AGENT_COMMERCE_STRIPE_SPT_ENABLED', 'true')
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123')

    registerDefaultAgentCommerceProviders()

    expect(hasAgentCommerceProvider('stripe_shared_payment_tokens')).toBe(true)
    expect(getAgentCommerceProvider('stripe_shared_payment_tokens').manifest.provider_version).toMatch(/^stripe-api-/)
  })

  it('registers the Stripe Link Agents adapter only when execution is explicitly enabled', () => {
    vi.stubEnv('AGENT_COMMERCE_STRIPE_LINK_AGENTS_ENABLED', 'true')
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_link')
    vi.stubEnv('AGENT_COMMERCE_STRIPE_LINK_ISSUED_TOKEN_ENDPOINT', 'https://stripe.test/shared_payment/issued_tokens')

    registerDefaultAgentCommerceProviders()

    expect(hasAgentCommerceProvider('stripe_link_agents')).toBe(true)
    expect(getAgentCommerceProvider('stripe_link_agents').manifest.provider_version).toContain('shared-payment-issued-token-preview')
  })
})
