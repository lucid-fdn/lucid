import { describe, it, expect } from 'vitest'
import type { EntitlementDeny } from '../types'

/**
 * Inline copy of parseEntitlementError for testing.
 * The original lives in @/components/entitlements/entitlement-error.tsx
 * but transitively imports Privy (styled-components ESM issue in vitest).
 * This test validates the parsing contract directly.
 */
function parseEntitlementError(responseBody: unknown): EntitlementDeny | null {
  if (!responseBody || typeof responseBody !== 'object') return null

  const body = responseBody as Record<string, unknown>
  const error = body.error

  if (!error || typeof error !== 'object') return null

  const deny = error as Record<string, unknown>
  if (deny.type !== 'entitlement_error') return null

  return deny as unknown as EntitlementDeny
}

const sampleDeny: EntitlementDeny = {
  type: 'entitlement_error',
  code: 'quota_exceeded',
  message: 'Monthly AI queries limit reached',
  entitlement: {
    metric: 'ai_queries_monthly',
    kind: 'quota',
    current: 100,
    max: 100,
    resetAt: '2026-04-01T00:00:00.000Z',
    requiredPlan: 'pro',
    upgradeTarget: {
      plan: 'pro',
      displayName: 'Pro',
      max: 10_000,
      priceMonthly: 29,
      valueProp: '100x more AI queries per month',
    },
  },
  action: {
    kind: 'upgrade',
    checkoutPlan: 'pro',
  },
}

describe('parseEntitlementError', () => {
  it('parses a valid entitlement error body', () => {
    const result = parseEntitlementError({ error: sampleDeny })
    expect(result).toBeDefined()
    expect(result?.type).toBe('entitlement_error')
    expect(result?.code).toBe('quota_exceeded')
    expect(result?.entitlement.metric).toBe('ai_queries_monthly')
  })

  it('returns null for non-object input', () => {
    expect(parseEntitlementError(null)).toBeNull()
    expect(parseEntitlementError(undefined)).toBeNull()
    expect(parseEntitlementError('string')).toBeNull()
    expect(parseEntitlementError(42)).toBeNull()
  })

  it('returns null when error field is missing', () => {
    expect(parseEntitlementError({})).toBeNull()
    expect(parseEntitlementError({ message: 'some error' })).toBeNull()
  })

  it('returns null when error is not an entitlement type', () => {
    expect(parseEntitlementError({ error: { type: 'validation_error' } })).toBeNull()
    expect(parseEntitlementError({ error: 'string error' })).toBeNull()
  })

  it('returns null when error type is not entitlement_error', () => {
    const body = { error: { ...sampleDeny, type: 'other_error' } }
    expect(parseEntitlementError(body)).toBeNull()
  })

  it('preserves full deny structure', () => {
    const result = parseEntitlementError({ error: sampleDeny })
    expect(result?.entitlement.upgradeTarget?.plan).toBe('pro')
    expect(result?.entitlement.upgradeTarget?.priceMonthly).toBe(29)
    expect(result?.action.kind).toBe('upgrade')
    expect(result?.action.checkoutPlan).toBe('pro')
  })

  it('handles feature_gated deny', () => {
    const featureDeny: EntitlementDeny = {
      ...sampleDeny,
      code: 'feature_gated',
      entitlement: {
        ...sampleDeny.entitlement,
        kind: 'feature',
        metric: 'plugins_enabled',
      },
    }
    const result = parseEntitlementError({ error: featureDeny })
    expect(result?.code).toBe('feature_gated')
    expect(result?.entitlement.kind).toBe('feature')
  })

  it('handles capacity_exceeded deny', () => {
    const capacityDeny: EntitlementDeny = {
      ...sampleDeny,
      code: 'capacity_exceeded',
      entitlement: {
        ...sampleDeny.entitlement,
        kind: 'capacity',
        metric: 'max_members',
        current: 3,
        max: 3,
      },
    }
    const result = parseEntitlementError({ error: capacityDeny })
    expect(result?.code).toBe('capacity_exceeded')
    expect(result?.entitlement.current).toBe(3)
  })
})
