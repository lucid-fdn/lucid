import { describe, expect, it } from 'vitest'
import { decideBrowserOperatorProvider } from '../provider-routing'

describe('Browser Operator provider routing', () => {
  it('uses Lucid Playwright by default even when premium providers are healthy', () => {
    expect(decideBrowserOperatorProvider({
      taskClass: 'read_only_public',
      healthyProviders: ['playwright', 'steel', 'browserbase'],
      externalProvidersEnabled: false,
      premiumFallbackEnabled: true,
    })).toMatchObject({
      provider: 'playwright',
      fallbackEligible: false,
      reason: 'lucid_default_provider',
      blockedProviders: ['steel', 'browserbase'],
    })
  })

  it('pins authenticated account work to the account provider and disables fallback', () => {
    expect(decideBrowserOperatorProvider({
      taskClass: 'authenticated_account',
      accountProvider: 'steel',
      externalProvidersEnabled: true,
      premiumFallbackEnabled: true,
      healthyProviders: ['playwright', 'steel'],
    })).toMatchObject({
      provider: 'steel',
      pinned: true,
      fallbackEligible: false,
      reason: 'account_provider_affinity',
    })
  })

  it('never falls back commerce checkout when account provider is disabled', () => {
    expect(decideBrowserOperatorProvider({
      taskClass: 'commerce_checkout',
      accountProvider: 'steel',
      externalProvidersEnabled: false,
      premiumFallbackEnabled: true,
      healthyProviders: ['playwright', 'steel'],
    })).toMatchObject({
      provider: 'steel',
      pinned: true,
      fallbackEligible: false,
      reason: 'account_provider_disabled_reconnect_required',
    })
  })

  it('allows BYO CDP only when BYO providers are enabled', () => {
    expect(decideBrowserOperatorProvider({
      taskClass: 'read_only_public',
      byoProviderAvailable: true,
      byoProvidersEnabled: true,
      healthyProviders: ['playwright', 'remote_cdp'],
    })).toMatchObject({
      provider: 'remote_cdp',
      reason: 'byo_provider_available',
    })
  })

  it('uses premium providers only for premium requirements when enabled', () => {
    expect(decideBrowserOperatorProvider({
      taskClass: 'read_only_public',
      requiresProxy: true,
      externalProvidersEnabled: true,
      premiumFallbackEnabled: true,
      healthyProviders: ['playwright', 'steel'],
    })).toMatchObject({
      provider: 'steel',
      fallbackEligible: true,
      reason: 'premium_proxy_required',
    })
  })
})
