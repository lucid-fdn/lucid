import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only (no-op in test environment)
vi.mock('server-only', () => ({}))

// Mock dependencies
vi.mock('@/lib/plans', () => ({
  getSubscription: vi.fn(),
  getUsageStatus: vi.fn(),
}))

vi.mock('@/lib/auth/internal', () => ({
  isInternalOrg: vi.fn(),
}))

vi.mock('@/lib/pricing/plans', () => ({
  PLAN_DISPLAY_NAMES: { starter: 'Starter', pro: 'Pro', business: 'Dedicated' },
  PLAN_PRICES: { starter: { monthly: 29, yearly: 288 }, pro: { monthly: 99, yearly: 948 }, business: { monthly: 299, yearly: null } },
}))

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: vi.fn(),
}))

vi.mock('@/lib/env/e2e', () => ({
  allowsPreviewE2ERateLimitBypass: vi.fn(() => false),
}))

import { evaluateEntitlement, getEntitlementStatus } from '../evaluate'
import { getSubscription, getUsageStatus } from '@/lib/plans'
import { isInternalOrg } from '@/lib/auth/internal'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { allowsPreviewE2ERateLimitBypass } from '@/lib/env/e2e'

const mockGetSubscription = vi.mocked(getSubscription)
const mockGetUsageStatus = vi.mocked(getUsageStatus)
const mockIsInternalOrg = vi.mocked(isInternalOrg)
const mockCheckRateLimit = vi.mocked(checkRateLimit)
const mockAllowsPreviewE2ERateLimitBypass = vi.mocked(allowsPreviewE2ERateLimitBypass)

const baseSubscription = {
  plan_name: 'starter',
  features: {} as Record<string, boolean>,
  limits: {} as Record<string, number>,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsInternalOrg.mockReturnValue(false)
  mockAllowsPreviewE2ERateLimitBypass.mockReturnValue(false)
  // Default: rate limit passes
  mockCheckRateLimit.mockResolvedValue({ success: true, limit: 10, remaining: 9, resetAt: Date.now() + 60000 })
})

describe('evaluateEntitlement', () => {
  describe('internal org bypass', () => {
    it('allows everything for internal orgs', async () => {
      mockIsInternalOrg.mockReturnValue(true)
      const result = await evaluateEntitlement({ orgId: 'internal-org', action: 'ai_query' })
      expect(result.allowed).toBe(true)
      expect(result.status).toBe('normal')
      expect(mockGetSubscription).not.toHaveBeenCalled()
    })
  })

  describe('feature checks', () => {
    it('denies feature-gated actions when not enabled', async () => {
      mockGetSubscription.mockResolvedValue({
        ...baseSubscription,
        features: { plugins_enabled: false },
      })

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'use_plugins' })
      expect(result.allowed).toBe(false)
      expect(result.deny?.code).toBe('feature_gated')
      expect(result.deny?.entitlement.metric).toBe('plugins_enabled')
    })

    it('allows feature-gated actions when enabled', async () => {
      mockGetSubscription.mockResolvedValue({
        ...baseSubscription,
        plan_name: 'pro',
        features: { plugins_enabled: true },
      })

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'use_plugins' })
      expect(result.allowed).toBe(true)
    })

    it('denies feature for users with no subscription', async () => {
      mockGetSubscription.mockResolvedValue(null)

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'use_sso' })
      expect(result.allowed).toBe(false)
      expect(result.deny?.code).toBe('feature_gated')
      expect(result.deny?.message).toContain('not available on your current plan')
    })

    it('shows subscription-required message for feature-gated actions without subscription', async () => {
      mockGetSubscription.mockResolvedValue(null)

      // install_plugin has featureGate: 'plugins_enabled', triggers the noSubscription path
      const result = await evaluateEntitlement({ orgId: 'org1', action: 'install_plugin', currentUsage: 0 })
      expect(result.allowed).toBe(false)
      expect(result.deny?.code).toBe('feature_gated')
      expect(result.deny?.message).toContain('requires a subscription')
    })
  })

  describe('quota checks', () => {
    it('allows when under limit', async () => {
      mockGetSubscription.mockResolvedValue(baseSubscription)
      mockGetUsageStatus.mockResolvedValue({
        current: 50,
        limit: 100,
        allowed: true,
        isUnlimited: false,
      })

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'ai_query' })
      expect(result.allowed).toBe(true)
    })

    it('denies when over limit', async () => {
      mockGetSubscription.mockResolvedValue(baseSubscription)
      mockGetUsageStatus.mockResolvedValue({
        current: 100,
        limit: 100,
        allowed: false,
        isUnlimited: false,
      })

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'ai_query' })
      expect(result.allowed).toBe(false)
      expect(result.deny?.code).toBe('quota_exceeded')
      expect(result.deny?.entitlement.metric).toBe('ai_queries_monthly')
      expect(result.deny?.entitlement.resetAt).toBeDefined()
    })

    it('always allows unlimited quotas', async () => {
      mockGetSubscription.mockResolvedValue({
        ...baseSubscription,
        plan_name: 'business',
      })
      mockGetUsageStatus.mockResolvedValue({
        current: 999999,
        limit: -1,
        allowed: true,
        isUnlimited: true,
      })

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'ai_query' })
      expect(result.allowed).toBe(true)
      expect(result.status).toBe('normal')
    })

    it('returns warning_80 status at 80% usage', async () => {
      mockGetSubscription.mockResolvedValue(baseSubscription)
      mockGetUsageStatus.mockResolvedValue({
        current: 82,
        limit: 100,
        allowed: true,
        isUnlimited: false,
      })

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'ai_query' })
      expect(result.allowed).toBe(true)
      expect(result.status).toBe('warning_80')
    })

    it('returns warning_95 status at 95% usage', async () => {
      mockGetSubscription.mockResolvedValue(baseSubscription)
      mockGetUsageStatus.mockResolvedValue({
        current: 96,
        limit: 100,
        allowed: true,
        isUnlimited: false,
      })

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'ai_query' })
      expect(result.allowed).toBe(true)
      expect(result.status).toBe('warning_95')
    })
  })

  describe('capacity checks', () => {
    it('allows when under capacity', async () => {
      mockGetSubscription.mockResolvedValue({
        ...baseSubscription,
        limits: { max_members: 3 },
      })

      const result = await evaluateEntitlement({
        orgId: 'org1',
        action: 'invite_member',
        currentUsage: 2,
      })
      expect(result.allowed).toBe(true)
    })

    it('denies when at capacity', async () => {
      mockGetSubscription.mockResolvedValue({
        ...baseSubscription,
        limits: { max_members: 3 },
      })

      const result = await evaluateEntitlement({
        orgId: 'org1',
        action: 'invite_member',
        currentUsage: 3,
      })
      expect(result.allowed).toBe(false)
      expect(result.deny?.code).toBe('capacity_exceeded')
      expect(result.deny?.entitlement.current).toBe(3)
      expect(result.deny?.entitlement.max).toBe(3)
    })

    it('allows unlimited capacity (-1)', async () => {
      mockGetSubscription.mockResolvedValue({
        ...baseSubscription,
        plan_name: 'business',
        limits: { max_members: -1 },
      })

      const result = await evaluateEntitlement({
        orgId: 'org1',
        action: 'invite_member',
        currentUsage: 100,
      })
      expect(result.allowed).toBe(true)
    })

    it('uses plan defaults when limit not in subscription', async () => {
      // Starter plan default: maxMembers = 3
      mockGetSubscription.mockResolvedValue({
        ...baseSubscription,
        limits: {},
      })

      const result = await evaluateEntitlement({
        orgId: 'org1',
        action: 'invite_member',
        currentUsage: 3,
      })
      expect(result.allowed).toBe(false)
      expect(result.deny?.entitlement.max).toBe(3)
    })
  })

  describe('deny payload structure', () => {
    it('includes upgrade target for starter plan', async () => {
      mockGetSubscription.mockResolvedValue(baseSubscription)
      mockGetUsageStatus.mockResolvedValue({
        current: 100,
        limit: 100,
        allowed: false,
        isUnlimited: false,
      })

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'ai_query' })
      expect(result.deny?.entitlement.upgradeTarget).toBeDefined()
      expect(result.deny?.entitlement.upgradeTarget?.plan).toBe('pro')
      expect(result.deny?.entitlement.upgradeTarget?.priceMonthly).toBe(99)
      expect(result.deny?.entitlement.upgradeTarget?.valueProp).toBeTruthy()
    })

    it('includes upgrade target for pro plan', async () => {
      mockGetSubscription.mockResolvedValue({
        ...baseSubscription,
        plan_name: 'pro',
        features: {},
      })

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'use_sso' })
      expect(result.deny?.entitlement.upgradeTarget?.plan).toBe('business')
    })

    it('sets action kind to upgrade for starter/pro', async () => {
      mockGetSubscription.mockResolvedValue(baseSubscription)
      mockGetUsageStatus.mockResolvedValue({
        current: 100,
        limit: 100,
        allowed: false,
        isUnlimited: false,
      })

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'ai_query' })
      expect(result.deny?.action.kind).toBe('upgrade')
      expect(result.deny?.action.checkoutPlan).toBe('pro')
    })

    it('sets action kind to contact_sales for business plan', async () => {
      mockGetSubscription.mockResolvedValue({
        ...baseSubscription,
        plan_name: 'business',
        features: {},
      })

      // SSO is the only feature that requires business (not available on pro)
      const result = await evaluateEntitlement({ orgId: 'org1', action: 'use_sso' })
      // If sso_enabled is false even on business, contact_sales
      expect(result.deny?.action.kind).toBe('contact_sales')
    })

    it('includes type=entitlement_error in deny', async () => {
      mockGetSubscription.mockResolvedValue(baseSubscription)
      mockGetUsageStatus.mockResolvedValue({
        current: 100,
        limit: 100,
        allowed: false,
        isUnlimited: false,
      })

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'ai_query' })
      expect(result.deny?.type).toBe('entitlement_error')
    })
  })

  describe('feature gate + capacity combo', () => {
    it('denies on feature gate before checking capacity', async () => {
      mockGetSubscription.mockResolvedValue({
        ...baseSubscription,
        features: { plugins_enabled: false },
      })

      const result = await evaluateEntitlement({
        orgId: 'org1',
        action: 'install_plugin',
        currentUsage: 0,
      })
      expect(result.allowed).toBe(false)
      expect(result.deny?.code).toBe('feature_gated')
    })

    it('checks capacity after feature gate passes', async () => {
      mockGetSubscription.mockResolvedValue({
        ...baseSubscription,
        plan_name: 'pro',
        features: { plugins_enabled: true },
        limits: { max_plugins_per_assistant: 3 },
      })

      const result = await evaluateEntitlement({
        orgId: 'org1',
        action: 'install_plugin',
        currentUsage: 3,
      })
      expect(result.allowed).toBe(false)
      expect(result.deny?.code).toBe('capacity_exceeded')
    })
  })
})

  describe('grace period', () => {
    it('allows pro plan users in grace period (at 100-110% usage)', async () => {
      mockGetSubscription.mockResolvedValue({
        ...baseSubscription,
        plan_name: 'pro',
      })
      mockGetUsageStatus.mockResolvedValue({
        current: 105,
        limit: 100,
        allowed: false,
        isUnlimited: false,
      })

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'ai_query' })
      expect(result.allowed).toBe(true)
      expect(result.status).toBe('grace')
    })

    it('does NOT grant grace to starter plan users', async () => {
      mockGetSubscription.mockResolvedValue(baseSubscription)
      mockGetUsageStatus.mockResolvedValue({
        current: 105,
        limit: 100,
        allowed: false,
        isUnlimited: false,
      })

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'ai_query' })
      expect(result.allowed).toBe(false)
      expect(result.deny?.code).toBe('quota_exceeded')
    })

    it('blocks when over grace overage (>110%)', async () => {
      mockGetSubscription.mockResolvedValue({
        ...baseSubscription,
        plan_name: 'pro',
      })
      mockGetUsageStatus.mockResolvedValue({
        current: 115,
        limit: 100,
        allowed: false,
        isUnlimited: false,
      })

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'ai_query' })
      expect(result.allowed).toBe(false)
      expect(result.deny?.code).toBe('quota_exceeded')
    })
  })

  describe('rate limiting (burst protection)', () => {
    it('blocks when rate limit exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue({
        success: false,
        limit: 10,
        remaining: 0,
        resetAt: Date.now() + 30000,
      })
      mockGetSubscription.mockResolvedValue(baseSubscription)

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'ai_query' })
      expect(result.allowed).toBe(false)
      expect(result.deny?.code).toBe('rate_limited')
      expect(result.deny?.action.kind).toBe('wait')
      expect(result.deny?.action.retryAfter).toBeGreaterThan(0)
    })

    it('allows when under rate limit', async () => {
      mockCheckRateLimit.mockResolvedValue({
        success: true,
        limit: 10,
        remaining: 5,
        resetAt: Date.now() + 60000,
      })
      mockGetSubscription.mockResolvedValue(baseSubscription)
      mockGetUsageStatus.mockResolvedValue({
        current: 50,
        limit: 100,
        allowed: true,
        isUnlimited: false,
      })

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'ai_query' })
      expect(result.allowed).toBe(true)
    })

    it('rate limit check runs before quota check', async () => {
      mockCheckRateLimit.mockResolvedValue({
        success: false,
        limit: 10,
        remaining: 0,
        resetAt: Date.now() + 30000,
      })
      mockGetSubscription.mockResolvedValue(baseSubscription)
      // Even if quota would pass, rate limit should block first
      mockGetUsageStatus.mockResolvedValue({
        current: 1,
        limit: 100,
        allowed: true,
        isUnlimited: false,
      })

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'ai_query' })
      expect(result.allowed).toBe(false)
      expect(result.deny?.code).toBe('rate_limited')
      // getUsageStatus should NOT have been called
      expect(mockGetUsageStatus).not.toHaveBeenCalled()
    })

    it('allows explicit preview/local E2E harnesses through burst protection', async () => {
      mockAllowsPreviewE2ERateLimitBypass.mockReturnValue(true)
      mockCheckRateLimit.mockResolvedValue({
        success: false,
        limit: 10,
        remaining: 0,
        resetAt: Date.now() + 30000,
      })
      mockGetSubscription.mockResolvedValue(baseSubscription)

      const result = await evaluateEntitlement({ orgId: 'org1', action: 'ai_query' })
      expect(result.allowed).toBe(true)
      expect(result.status).toBe('normal')
      expect(mockGetUsageStatus).not.toHaveBeenCalled()
    })

    it('skips rate limit for internal orgs', async () => {
      mockIsInternalOrg.mockReturnValue(true)

      const result = await evaluateEntitlement({ orgId: 'internal', action: 'ai_query' })
      expect(result.allowed).toBe(true)
      expect(mockCheckRateLimit).not.toHaveBeenCalled()
    })
  })

describe('getEntitlementStatus', () => {
  it('returns internal status for internal orgs', async () => {
    mockIsInternalOrg.mockReturnValue(true)

    const status = await getEntitlementStatus('internal-org')
    expect(status.plan).toBe('internal')
    expect(status.items.every(i => i.isUnlimited)).toBe(true)
  })

  it('returns items for regular orgs', async () => {
    mockIsInternalOrg.mockReturnValue(false)
    mockGetSubscription.mockResolvedValue(baseSubscription)
    mockGetUsageStatus.mockResolvedValue({
      current: 50,
      limit: 100,
      allowed: true,
      isUnlimited: false,
    })

    const status = await getEntitlementStatus('org1')
    expect(status.plan).toBe('starter')
    expect(status.items.length).toBeGreaterThan(0)
    expect(status.items[0].current).toBe(50)
    expect(status.items[0].max).toBe(100)
  })
})
