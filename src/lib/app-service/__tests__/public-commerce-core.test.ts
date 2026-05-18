import { describe, expect, it } from 'vitest'
import {
  isPublicActionCommerceEnforced,
  publicActionCommerceConfigForAction,
  publicActionCommerceResourceId,
  publicCommerceConfigForManifest,
} from '../public-commerce-core'

describe('public commerce core', () => {
  it('prefers workflow commerce config over top-level paid action defaults', () => {
    const manifest = {
      commerce: {
        paid_actions: {
          report: {
            mode: 'enforce',
            amount: { amount: 100, currency: 'usd' },
            resource_type: 'generated_app_action',
            refund_policy: 'manual_review',
          },
        },
      },
      workflows: [{
        key: 'report',
        name: 'Report',
        trigger: 'public_action',
        public_action_key: 'report',
        commerce: {
          mode: 'enforce',
          amount: { amount: 250, currency: 'eur' },
          provider: 'machine_payments_x402',
          rail: 'machine_payment_x402',
          resource_type: 'generated_app_action',
          refund_policy: 'provider_supported',
        },
      }],
    }

    const config = publicActionCommerceConfigForAction(manifest, 'report')

    expect(config).toMatchObject({
      mode: 'enforce',
      amount: { amount: 250, currency: 'eur' },
      provider: 'machine_payments_x402',
      rail: 'machine_payment_x402',
      refund_policy: 'provider_supported',
    })
    expect(isPublicActionCommerceEnforced(config)).toBe(true)
    expect(publicActionCommerceResourceId('app-123', 'report', config!)).toBe('app:app-123:action:report')
  })

  it('exposes only normalized paid action commerce configs', () => {
    const manifest = {
      commerce: {
        paid_actions: {
          lookup: {
            mode: 'shadow',
            resource_type: 'generated_app_api',
            refund_policy: 'manual_review',
          },
          broken: {
            mode: 'enforce',
          },
          off: {
            mode: 'off',
          },
        },
      },
    }

    expect(publicCommerceConfigForManifest(manifest)).toEqual({
      paid_actions: {
        lookup: {
          mode: 'shadow',
          resource_type: 'generated_app_api',
          refund_policy: 'manual_review',
        },
      },
    })
  })
})
