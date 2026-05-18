import { describe, expect, it } from 'vitest'

import type { RetailFleetAssistant } from '../ownership'
import {
  RETAIL_UPSELL_MIN_AGE_DAYS,
  shouldShowPrivateRuntimeUpsell,
} from '../upsell'

const NOW = new Date('2026-04-07T12:00:00Z')

function agent(
  overrides: Partial<RetailFleetAssistant> = {},
): RetailFleetAssistant {
  return {
    id: 'a-1',
    name: 'Test',
    createdAt: NOW.toISOString(),
    isActive: true,
    ...overrides,
  }
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

describe('shouldShowPrivateRuntimeUpsell', () => {
  it('returns false for an empty fleet', () => {
    expect(shouldShowPrivateRuntimeUpsell([], NOW)).toBe(false)
  })

  it('returns false when the oldest agent is brand new', () => {
    const fleet = [agent({ createdAt: daysAgo(1) })]
    expect(shouldShowPrivateRuntimeUpsell(fleet, NOW)).toBe(false)
  })

  it('returns false when the oldest agent is just under the threshold', () => {
    const fleet = [
      agent({ id: 'a', createdAt: daysAgo(RETAIL_UPSELL_MIN_AGE_DAYS - 1) }),
    ]
    expect(shouldShowPrivateRuntimeUpsell(fleet, NOW)).toBe(false)
  })

  it('returns true exactly at the threshold', () => {
    const fleet = [
      agent({ id: 'a', createdAt: daysAgo(RETAIL_UPSELL_MIN_AGE_DAYS) }),
    ]
    expect(shouldShowPrivateRuntimeUpsell(fleet, NOW)).toBe(true)
  })

  it('returns true when the oldest agent is well past the threshold', () => {
    const fleet = [
      agent({ id: 'old', createdAt: daysAgo(90) }),
      agent({ id: 'new', createdAt: daysAgo(1) }),
    ]
    expect(shouldShowPrivateRuntimeUpsell(fleet, NOW)).toBe(true)
  })

  it('ignores unparseable createdAt rows instead of treating them as age 0', () => {
    // A single bad row shouldn't trigger the upsell on a fresh signup —
    // `NaN` parse would otherwise masquerade as "agent from 1970".
    const fleet = [agent({ createdAt: 'not-a-date' })]
    expect(shouldShowPrivateRuntimeUpsell(fleet, NOW)).toBe(false)
  })

  it('uses the oldest agent when a mix is present', () => {
    const fleet = [
      agent({ id: 'new', createdAt: daysAgo(2) }),
      agent({ id: 'old', createdAt: daysAgo(45) }),
    ]
    expect(shouldShowPrivateRuntimeUpsell(fleet, NOW)).toBe(true)
  })
})
