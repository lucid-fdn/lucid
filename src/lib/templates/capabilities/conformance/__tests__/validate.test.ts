import { describe, expect, it } from 'vitest'
import {
  WEB3_CAPABILITY_TEMPLATES,
  smartWalletCopyDeskTemplate,
} from '@/lib/templates/capabilities/catalog'
import { validateCapabilityTemplateManifest } from '../validate'

describe('capability template conformance', () => {
  it('accepts all first-party Web3 capability templates', () => {
    for (const template of WEB3_CAPABILITY_TEMPLATES) {
      expect(validateCapabilityTemplateManifest(template)).toEqual({ ok: true, issues: [] })
    }
  })

  it('rejects high-risk templates without an approval policy', () => {
    const result = validateCapabilityTemplateManifest({
      ...smartWalletCopyDeskTemplate,
      resources: smartWalletCopyDeskTemplate.resources.filter((resource) => resource.kind !== 'policy'),
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      code: 'missing_high_risk_policy',
      path: 'resources',
      message: 'High-risk capabilities must ship with an explicit approval policy resource.',
    })
  })

  it('rejects medium-risk Web3 automation templates without a review policy', () => {
    const result = validateCapabilityTemplateManifest({
      ...WEB3_CAPABILITY_TEMPLATES.find((template) => template.key === 'web3-prediction-market-alpha-desk')!,
      resources: WEB3_CAPABILITY_TEMPLATES
        .find((template) => template.key === 'web3-prediction-market-alpha-desk')!
        .resources
        .filter((resource) => resource.kind !== 'policy'),
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      code: 'missing_trade_policy',
      path: 'resources',
      message: 'Web3 trading or automation capabilities must ship with an explicit review or approval policy resource.',
    })
  })
})
