import { describe, expect, it, vi } from 'vitest'
import { MANUAL_AGENT_COMMERCE_PROVIDER_MANIFEST } from '../providers/manual'
import { STRIPE_LINK_AGENTS_PROVIDER_MANIFEST } from '../providers/stripe-link'
import { summarizeAgentCommerceRailReadiness } from '../rail-readiness'

vi.mock('server-only', () => ({}))

describe('Agent Commerce rail readiness', () => {
  it('counts only live provider-adapter rails for GA readiness', () => {
    const summary = summarizeAgentCommerceRailReadiness([
      MANUAL_AGENT_COMMERCE_PROVIDER_MANIFEST,
      STRIPE_LINK_AGENTS_PROVIDER_MANIFEST,
    ])

    expect(summary.has_live_agent_platform_rail).toBe(true)
    expect(summary.has_live_seller_rail).toBe(true)
    expect(summary.agent_platform).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: 'manual',
        rail: 'manual_approval',
        requiresAccountAccess: false,
      }),
    ]))
    expect(summary.seller).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: 'manual',
        rail: 'manual_approval',
      }),
    ]))
    expect(summary.agent_platform).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: 'stripe_link_agents',
      }),
    ]))
  })
})
