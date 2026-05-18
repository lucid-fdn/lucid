import { describe, expect, it } from 'vitest'
import { routeBrowserGatewayProvider } from '../provider-router.js'

describe('Browser gateway provider router', () => {
  it('pins authenticated work to account provider without fallback', () => {
    expect(routeBrowserGatewayProvider({
      taskClass: 'authenticated_account',
      defaultProvider: 'playwright',
      accountProvider: 'steel',
      externalProvidersEnabled: true,
      byoProvidersEnabled: true,
      premiumFallbackEnabled: true,
      providerHealth: [
        { provider: 'playwright', healthy: true },
        { provider: 'steel', healthy: false },
      ],
    })).toMatchObject({
      provider: 'steel',
      fallbackEligible: false,
      pinned: true,
      reason: 'account_provider_unhealthy_reconnect_required',
    })
  })

  it('prefers BYO for public read-only work when policy enables it', () => {
    expect(routeBrowserGatewayProvider({
      taskClass: 'read_only_public',
      defaultProvider: 'playwright',
      externalProvidersEnabled: false,
      byoProvidersEnabled: true,
      premiumFallbackEnabled: false,
      providerHealth: [
        { provider: 'playwright', healthy: true },
        { provider: 'remote-cdp', healthy: true },
      ],
    })).toMatchObject({
      provider: 'remote-cdp',
      fallbackEligible: true,
      reason: 'byo_provider_available',
    })
  })

  it('chooses premium only for explicit proxy/captcha requirements', () => {
    expect(routeBrowserGatewayProvider({
      taskClass: 'read_only_public',
      defaultProvider: 'playwright',
      externalProvidersEnabled: true,
      byoProvidersEnabled: false,
      premiumFallbackEnabled: true,
      requiresProxy: true,
      providerHealth: [
        { provider: 'playwright', healthy: true },
        { provider: 'browserbase', healthy: true, supportsProxy: false },
        { provider: 'steel', healthy: true, supportsProxy: true, medianLatencyMs: 500 },
      ],
    })).toMatchObject({
      provider: 'steel',
      reason: 'premium_proxy_required',
    })
  })
})
