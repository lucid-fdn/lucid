/**
 * Runtime Tier System — Smoke Tests
 *
 * Validates that the runtime tier system (managed vs BYO) is wired correctly
 * across schemas, constants, capabilities, and the DB layer.
 * These tests catch drift between layers without hitting real infrastructure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createRuntimeSchema,
  runtimeTierSchema,
  runtimeProviderSchema,
} from '../schemas'
import {
  MANAGED_PROVIDERS,
  BYO_PROVIDERS,
  DEPLOYMENT_MODE_CONFIG,
  PROVIDER_LABELS,
} from '../constants'
import { CAPABILITY_REGISTRY } from '../capability-registry'

// ─── Schema: runtimeTierSchema ───

describe('runtimeTierSchema', () => {
  it.each(['dedicated', 'byo'])('accepts valid tier: %s', (tier) => {
    expect(runtimeTierSchema.safeParse(tier).success).toBe(true)
  })

  it.each(['shared', 'managed', 'free', ''])('rejects invalid tier: %s', (tier) => {
    expect(runtimeTierSchema.safeParse(tier).success).toBe(false)
  })
})

// ─── Schema: createRuntimeSchema with runtimeTier ───

describe('createRuntimeSchema — runtimeTier field', () => {
  it('accepts dedicated tier', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'prod-dedicated',
      provider: 'railway',
      runtimeTier: 'dedicated',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.runtimeTier).toBe('dedicated')
  })

  it('accepts byo tier', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'my-docker-runtime',
      provider: 'docker',
      runtimeTier: 'byo',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.runtimeTier).toBe('byo')
  })

  it('accepts omitted runtimeTier (backward compat)', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'legacy-runtime',
      provider: 'railway',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.runtimeTier).toBeUndefined()
  })

  it('rejects invalid runtimeTier', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'test',
      provider: 'railway',
      runtimeTier: 'managed',
    })
    expect(result.success).toBe(false)
  })

  it('accepts pendingAgentName with runtimeTier', () => {
    const result = createRuntimeSchema.safeParse({
      displayName: 'deploy-with-agent',
      provider: 'railway',
      runtimeTier: 'dedicated',
      pendingAgentName: 'My Agent',
    })
    expect(result.success).toBe(true)
  })
})

// ─── Constants: Provider Allowlists ───

describe('provider allowlists', () => {
  it('MANAGED_PROVIDERS contains only railway', () => {
    expect(MANAGED_PROVIDERS).toEqual(['railway'])
  })

  it('BYO_PROVIDERS contains all 7 providers', () => {
    expect(BYO_PROVIDERS).toHaveLength(7)
    expect(BYO_PROVIDERS).toContain('railway')
    expect(BYO_PROVIDERS).toContain('manual')
    expect(BYO_PROVIDERS).toContain('akash')
    expect(BYO_PROVIDERS).toContain('docker')
  })

  it('all BYO_PROVIDERS are valid per runtimeProviderSchema', () => {
    for (const p of BYO_PROVIDERS) {
      expect(runtimeProviderSchema.safeParse(p).success).toBe(true)
    }
  })

  it('all MANAGED_PROVIDERS are valid per runtimeProviderSchema', () => {
    for (const p of MANAGED_PROVIDERS) {
      expect(runtimeProviderSchema.safeParse(p).success).toBe(true)
    }
  })

  it('MANAGED_PROVIDERS is a subset of BYO_PROVIDERS', () => {
    for (const p of MANAGED_PROVIDERS) {
      expect((BYO_PROVIDERS as readonly string[]).includes(p)).toBe(true)
    }
  })

  it('every provider in BYO_PROVIDERS has a label', () => {
    for (const p of BYO_PROVIDERS) {
      expect(PROVIDER_LABELS[p]).toBeTruthy()
    }
  })
})

// ─── Constants: Deployment Mode Config ───

describe('DEPLOYMENT_MODE_CONFIG', () => {
  it('has all 3 modes', () => {
    expect(Object.keys(DEPLOYMENT_MODE_CONFIG)).toEqual(['shared', 'dedicated', 'byo'])
  })

  it.each(['shared', 'dedicated', 'byo'] as const)('%s has label and description', (mode) => {
    const config = DEPLOYMENT_MODE_CONFIG[mode]
    expect(config.label).toBeTruthy()
    expect(config.description).toBeTruthy()
    expect(config.description.length).toBeGreaterThan(10)
  })
})

// ─── Capability Registry: runtime:dedicated and runtime:byo ───

describe('capability registry — runtime tiers', () => {
  const dedicatedCap = CAPABILITY_REGISTRY.find((c) => c.id === 'runtime:dedicated')
  const byoCap = CAPABILITY_REGISTRY.find((c) => c.id === 'runtime:byo')

  it('runtime:dedicated exists in registry', () => {
    expect(dedicatedCap).toBeDefined()
  })

  it('runtime:byo exists in registry', () => {
    expect(byoCap).toBeDefined()
  })

  it('runtime:dedicated requires pro plan', () => {
    expect(dedicatedCap!.minPlan).toBe('pro')
  })

  it('runtime:byo requires business plan', () => {
    expect(byoCap!.minPlan).toBe('business')
  })

  it('runtime:managed does NOT exist (removed)', () => {
    const managedCap = CAPABILITY_REGISTRY.find((c) => c.id === 'runtime:managed')
    expect(managedCap).toBeUndefined()
  })

  it('both runtime capabilities support all deployment modes', () => {
    for (const cap of [dedicatedCap!, byoCap!]) {
      expect(cap.modes).toContain('saas')
      expect(cap.modes).toContain('self-hosted')
      expect(cap.modes).toContain('hybrid')
    }
  })

  it('dedicated has lower plan requirement than byo', () => {
    const planOrder = ['free', 'pro', 'business']
    const dedicatedIdx = planOrder.indexOf(dedicatedCap!.minPlan!)
    const byoIdx = planOrder.indexOf(byoCap!.minPlan!)
    expect(dedicatedIdx).toBeLessThan(byoIdx)
  })
})

// ─── Cross-layer consistency ───

describe('cross-layer consistency', () => {
  it('runtimeTierSchema values match DEPLOYMENT_MODE_CONFIG keys (minus shared)', () => {
    const tierValues = runtimeTierSchema.options
    const configKeys = Object.keys(DEPLOYMENT_MODE_CONFIG).filter((k) => k !== 'shared')
    expect(tierValues.sort()).toEqual(configKeys.sort())
  })

  it('runtimeTierSchema values match capability suffixes', () => {
    const tierValues = runtimeTierSchema.options
    const capIds = CAPABILITY_REGISTRY
      .filter((c) => c.id.startsWith('runtime:'))
      .map((c) => c.id.replace('runtime:', ''))
    expect(tierValues.sort()).toEqual(capIds.sort())
  })
})
