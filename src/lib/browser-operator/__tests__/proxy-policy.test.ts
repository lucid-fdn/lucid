import { describe, expect, it } from 'vitest'
import { evaluateBrowserOperatorProxyPolicy } from '../proxy-policy'

describe('Browser Operator proxy policy', () => {
  it('allows proxy fallback only for read-only public work by default', () => {
    expect(evaluateBrowserOperatorProxyPolicy({
      taskClass: 'read_only_public',
      provider: 'playwright',
    })).toMatchObject({
      allowed: true,
      fallbackEligible: true,
      checkoutAllowed: false,
      reason: 'read_only_proxy_policy',
    })

    expect(evaluateBrowserOperatorProxyPolicy({
      taskClass: 'interactive_public',
      provider: 'playwright',
    })).toMatchObject({
      allowed: false,
      fallbackEligible: false,
      reason: 'read_only_proxy_policy',
    })
  })

  it('blocks checkout when provider, profile, or proxy drifted after approval', () => {
    expect(evaluateBrowserOperatorProxyPolicy({
      taskClass: 'commerce_checkout',
      provider: 'steel',
      policy: {
        mode: 'premium_only',
        checkout_allowed: true,
        allowed_providers: ['steel'],
      },
      proxyChangedAfterApproval: true,
    })).toMatchObject({
      allowed: false,
      checkoutAllowed: false,
      reason: 'checkout_affinity_drift_blocked',
    })
  })

  it('allows checkout only when explicit policy permits it', () => {
    expect(evaluateBrowserOperatorProxyPolicy({
      taskClass: 'commerce_checkout',
      provider: 'steel',
      policy: {
        mode: 'premium_only',
        checkout_allowed: true,
        allowed_providers: ['steel'],
        allow_datacenter: true,
      },
      usesDatacenterProxy: true,
    })).toMatchObject({
      allowed: true,
      fallbackEligible: false,
      checkoutAllowed: true,
      maxRetries: 0,
      reason: 'checkout_proxy_allowed_with_affinity',
    })
  })
})
