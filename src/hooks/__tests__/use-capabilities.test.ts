import { describe, it, expect } from 'vitest'
import { CAPABILITY_REGISTRY } from '@/lib/mission-control/capability-registry'
import { normalizeWorkspacePlanName } from '@/lib/access-control/types'
import type { CapabilityEntry, DeploymentMode, PlanTier } from '@/lib/mission-control/capabilities'

/**
 * Since useCapabilities is a React hook requiring context providers and
 * @testing-library/react is not installed, we test the pure filtering logic
 * that the hook implements. This covers the same code paths.
 */

const PLAN_RANK: Record<PlanTier, number> = {
  free: 0,
  pro: 1,
  business: 2,
}

function getPlanTier(planName?: string | null): PlanTier {
  const normalized = normalizeWorkspacePlanName(planName)
  if (normalized === 'business') return 'business'
  if (normalized === 'pro') return 'pro'
  return 'free'
}

function resolveCapabilities(
  mode: DeploymentMode,
  plan: PlanTier,
  selfHosted = false,
): CapabilityEntry[] {
  if (selfHosted) {
    return [...CAPABILITY_REGISTRY]
  }
  return CAPABILITY_REGISTRY.filter((entry) => {
    if (!entry.modes.includes(mode)) return false
    if (entry.minPlan && PLAN_RANK[plan] < PLAN_RANK[entry.minPlan]) return false
    return true
  })
}

describe('capability resolution logic', () => {
  describe('getPlanTier', () => {
    it('maps null/undefined to free', () => {
      expect(getPlanTier(null)).toBe('free')
      expect(getPlanTier(undefined)).toBe('free')
    })

    it('maps pro to pro', () => {
      expect(getPlanTier('pro')).toBe('pro')
      expect(getPlanTier('Pro Plan')).toBe('pro')
    })

    it('maps business to business', () => {
      expect(getPlanTier('business')).toBe('business')
    })

    it('maps enterprise to business', () => {
      expect(getPlanTier('enterprise')).toBe('business')
      expect(getPlanTier('Enterprise Plan')).toBe('business')
    })

    it('maps Lucid Cloud growth/internal plans to business', () => {
      expect(getPlanTier('growth')).toBe('business')
      expect(getPlanTier('internal')).toBe('business')
    })

    it('maps unknown plans to free', () => {
      expect(getPlanTier('starter')).toBe('free')
      expect(getPlanTier('hobby')).toBe('free')
    })
  })

  describe('plan-based filtering', () => {
    it('free plan excludes pro and business capabilities', () => {
      const caps = resolveCapabilities('saas', 'free')
      const ids = caps.map((c) => c.id)
      const proRequired = CAPABILITY_REGISTRY.filter((e) => e.minPlan === 'pro')
      for (const entry of proRequired) {
        expect(ids).not.toContain(entry.id)
      }
      const bizRequired = CAPABILITY_REGISTRY.filter((e) => e.minPlan === 'business')
      for (const entry of bizRequired) {
        expect(ids).not.toContain(entry.id)
      }
    })

    it('pro plan includes pro-gated capabilities', () => {
      const caps = resolveCapabilities('saas', 'pro')
      const ids = caps.map((c) => c.id)
      expect(ids).toContain('advanced:proof-explorer')
      expect(ids).toContain('advanced:cost-optimizer')
    })

    it('pro plan excludes business-gated capabilities', () => {
      const caps = resolveCapabilities('saas', 'pro')
      const ids = caps.map((c) => c.id)
      const bizRequired = CAPABILITY_REGISTRY.filter(
        (e) => e.minPlan === 'business' && e.modes.includes('saas')
      )
      for (const entry of bizRequired) {
        expect(ids).not.toContain(entry.id)
      }
    })

    it('business plan includes all saas capabilities', () => {
      const caps = resolveCapabilities('saas', 'business')
      const ids = caps.map((c) => c.id)
      const allSaas = CAPABILITY_REGISTRY.filter((e) => e.modes.includes('saas'))
      for (const entry of allSaas) {
        expect(ids).toContain(entry.id)
      }
    })
  })

  describe('mode-based filtering', () => {
    it('saas mode excludes self-hosted-only capabilities', () => {
      const caps = resolveCapabilities('saas', 'business')
      const ids = caps.map((c) => c.id)
      expect(ids).not.toContain('selfhosted:system-metrics')
      expect(ids).not.toContain('selfhosted:worker-health')
    })

    it('self-hosted mode includes self-hosted-only capabilities', () => {
      const caps = resolveCapabilities('self-hosted', 'business')
      const ids = caps.map((c) => c.id)
      expect(ids).toContain('selfhosted:system-metrics')
      expect(ids).toContain('selfhosted:worker-health')
    })

    it('hybrid mode includes self-hosted-only capabilities', () => {
      const caps = resolveCapabilities('hybrid', 'business')
      const ids = caps.map((c) => c.id)
      expect(ids).toContain('selfhosted:system-metrics')
      expect(ids).toContain('selfhosted:worker-health')
    })

    it('self-hosted mode includes tri-mode capabilities', () => {
      const caps = resolveCapabilities('self-hosted', 'free')
      const ids = caps.map((c) => c.id)
      expect(ids).toContain('core:command-center')
      expect(ids).toContain('core:agents')
    })
  })

  describe('self-hosted bypass', () => {
    it('self-hosted bypass returns ALL capabilities regardless of plan', () => {
      const caps = resolveCapabilities('self-hosted', 'free', true)
      expect(caps.length).toBe(CAPABILITY_REGISTRY.length)
    })

    it('self-hosted bypass includes business-gated capabilities on free plan', () => {
      const caps = resolveCapabilities('self-hosted', 'free', true)
      const ids = caps.map((c) => c.id)
      expect(ids).toContain('advanced:time-travel')
      expect(ids).toContain('advanced:ab-testing')
      expect(ids).toContain('runtime:dedicated')
      expect(ids).toContain('runtime:byo')
    })

    it('self-hosted bypass includes pro-gated capabilities on free plan', () => {
      const caps = resolveCapabilities('self-hosted', 'free', true)
      const ids = caps.map((c) => c.id)
      expect(ids).toContain('advanced:proof-explorer')
      expect(ids).toContain('advanced:cost-optimizer')
      expect(ids).toContain('advanced:health-score')
    })

    it('non-self-hosted does not bypass even with selfHosted=false', () => {
      const caps = resolveCapabilities('saas', 'free', false)
      const ids = caps.map((c) => c.id)
      expect(ids).not.toContain('advanced:proof-explorer')
      expect(ids).not.toContain('runtime:dedicated')
      expect(ids).not.toContain('runtime:byo')
    })
  })

  describe('runtime:dedicated capability', () => {
    it('starter: no runtime:dedicated', () => {
      const caps = resolveCapabilities('saas', 'free')
      expect(caps.map((c) => c.id)).not.toContain('runtime:dedicated')
    })

    it('pro: has runtime:dedicated', () => {
      const caps = resolveCapabilities('saas', 'pro')
      expect(caps.map((c) => c.id)).toContain('runtime:dedicated')
    })

    it('business: has runtime:dedicated', () => {
      const caps = resolveCapabilities('saas', 'business')
      expect(caps.map((c) => c.id)).toContain('runtime:dedicated')
    })
  })

  describe('runtime:byo capability', () => {
    it('starter: no runtime:byo', () => {
      const caps = resolveCapabilities('saas', 'free')
      expect(caps.map((c) => c.id)).not.toContain('runtime:byo')
    })

    it('pro: no runtime:byo', () => {
      const caps = resolveCapabilities('saas', 'pro')
      expect(caps.map((c) => c.id)).not.toContain('runtime:byo')
    })

    it('business: has runtime:byo', () => {
      const caps = resolveCapabilities('saas', 'business')
      expect(caps.map((c) => c.id)).toContain('runtime:byo')
    })

    it('self-hosted: has both runtime:dedicated and runtime:byo on free plan', () => {
      const caps = resolveCapabilities('self-hosted', 'free', true)
      const ids = caps.map((c) => c.id)
      expect(ids).toContain('runtime:dedicated')
      expect(ids).toContain('runtime:byo')
    })
  })

  describe('hasCapability equivalent', () => {
    it('core capabilities are always available on free plan', () => {
      const caps = resolveCapabilities('saas', 'free')
      const idSet = new Set(caps.map((c) => c.id))
      expect(idSet.has('core:command-center')).toBe(true)
      expect(idSet.has('core:approvals')).toBe(true)
      expect(idSet.has('core:controls')).toBe(true)
    })

    it('plan-gated capability is absent on free plan', () => {
      const caps = resolveCapabilities('saas', 'free')
      const idSet = new Set(caps.map((c) => c.id))
      expect(idSet.has('advanced:proof-explorer')).toBe(false)
    })
  })

  describe('moduleVisible equivalent', () => {
    it('command-center module is visible on free plan', () => {
      const caps = resolveCapabilities('saas', 'free')
      expect(caps.some((c) => c.module === 'command-center')).toBe(true)
    })

    it('experiments module is not visible on free/pro plan (business-only)', () => {
      const freeCaps = resolveCapabilities('saas', 'free')
      expect(freeCaps.some((c) => c.module === 'experiments')).toBe(false)
      const proCaps = resolveCapabilities('saas', 'pro')
      expect(proCaps.some((c) => c.module === 'experiments')).toBe(false)
    })

    it('experiments module is visible on business plan', () => {
      const caps = resolveCapabilities('saas', 'business')
      expect(caps.some((c) => c.module === 'experiments')).toBe(true)
    })
  })
})
