import { describe, it, expect } from 'vitest'
import { CAPABILITY_REGISTRY } from '../capability-registry'
import type { DeploymentMode } from '../capabilities'

describe('CAPABILITY_REGISTRY', () => {
  it('exports a non-empty array of capabilities', () => {
    expect(Array.isArray(CAPABILITY_REGISTRY)).toBe(true)
    expect(CAPABILITY_REGISTRY.length).toBeGreaterThan(0)
  })

  it('all entries have required fields (id, label, module, modes)', () => {
    for (const entry of CAPABILITY_REGISTRY) {
      expect(entry.id).toBeTruthy()
      expect(typeof entry.id).toBe('string')
      expect(entry.label).toBeTruthy()
      expect(typeof entry.label).toBe('string')
      expect(entry.module).toBeTruthy()
      expect(typeof entry.module).toBe('string')
      expect(Array.isArray(entry.modes)).toBe(true)
      expect(entry.modes.length).toBeGreaterThan(0)
    }
  })

  it('has no duplicate capability IDs', () => {
    const ids = CAPABILITY_REGISTRY.map((e) => e.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('all entries have valid mode values (saas, self-hosted, or hybrid)', () => {
    const validModes: DeploymentMode[] = ['saas', 'self-hosted', 'hybrid']
    for (const entry of CAPABILITY_REGISTRY) {
      for (const mode of entry.modes) {
        expect(validModes).toContain(mode)
      }
    }
  })

  it('all minPlan values are valid plan tiers when present', () => {
    const validPlans = ['free', 'pro', 'business']
    for (const entry of CAPABILITY_REGISTRY) {
      if (entry.minPlan) {
        expect(validPlans).toContain(entry.minPlan)
      }
    }
  })

  describe('core capabilities', () => {
    const coreIds = [
      'core:command-center',
      'core:agents',
      'core:live-feed',
      'core:approvals',
      'core:controls',
      'core:replay',
    ]

    it.each(coreIds)('%s exists in the registry', (id) => {
      const entry = CAPABILITY_REGISTRY.find((e) => e.id === id)
      expect(entry).toBeDefined()
    })

    it('core capabilities are available in all three modes', () => {
      for (const id of coreIds) {
        const entry = CAPABILITY_REGISTRY.find((e) => e.id === id)!
        expect(entry.modes).toContain('saas')
        expect(entry.modes).toContain('self-hosted')
        expect(entry.modes).toContain('hybrid')
      }
    })

    it('core capabilities have no minPlan requirement', () => {
      for (const id of coreIds) {
        const entry = CAPABILITY_REGISTRY.find((e) => e.id === id)!
        expect(entry.minPlan).toBeUndefined()
      }
    })
  })

  describe('self-hosted capabilities', () => {
    it('selfhosted:-prefixed capabilities include self-hosted in modes', () => {
      const selfHostedEntries = CAPABILITY_REGISTRY.filter((e) => e.id.startsWith('selfhosted:'))
      expect(selfHostedEntries.length).toBeGreaterThan(0)
      for (const entry of selfHostedEntries) {
        expect(entry.modes).toContain('self-hosted')
      }
    })

    it('selfhosted:-prefixed capabilities are self-hosted + hybrid only', () => {
      const selfHostedEntries = CAPABILITY_REGISTRY.filter((e) => e.id.startsWith('selfhosted:'))
      for (const entry of selfHostedEntries) {
        expect(entry.modes).toContain('self-hosted')
        expect(entry.modes).toContain('hybrid')
        expect(entry.modes).not.toContain('saas')
      }
    })
  })

  describe('SaaS capabilities', () => {
    it('saas:-prefixed capabilities include saas in modes', () => {
      const saasEntries = CAPABILITY_REGISTRY.filter((e) => e.id.startsWith('saas:'))
      for (const entry of saasEntries) {
        expect(entry.modes).toContain('saas')
      }
    })
  })

  describe('advanced capabilities', () => {
    it('all advanced capabilities require a minPlan', () => {
      const advancedEntries = CAPABILITY_REGISTRY.filter((e) => e.id.startsWith('advanced:'))
      expect(advancedEntries.length).toBeGreaterThan(0)
      for (const entry of advancedEntries) {
        expect(entry.minPlan).toBeDefined()
      }
    })
  })

  describe('runtime capabilities', () => {
    it('runtime:dedicated exists with pro minPlan', () => {
      const entry = CAPABILITY_REGISTRY.find((e) => e.id === 'runtime:dedicated')
      expect(entry).toBeDefined()
      expect(entry!.minPlan).toBe('pro')
      expect(entry!.modes).toContain('saas')
      expect(entry!.modes).toContain('self-hosted')
      expect(entry!.modes).toContain('hybrid')
    })

    it('runtime:byo exists with business minPlan', () => {
      const entry = CAPABILITY_REGISTRY.find((e) => e.id === 'runtime:byo')
      expect(entry).toBeDefined()
      expect(entry!.minPlan).toBe('business')
      expect(entry!.modes).toContain('saas')
      expect(entry!.modes).toContain('self-hosted')
      expect(entry!.modes).toContain('hybrid')
    })

    it('runtime:managed no longer exists (renamed to runtime:dedicated)', () => {
      const entry = CAPABILITY_REGISTRY.find((e) => e.id === 'runtime:managed')
      expect(entry).toBeUndefined()
    })
  })

  describe('filtering by mode', () => {
    it('filtering for self-hosted includes self-hosted-only and tri-mode entries', () => {
      const selfHostedCaps = CAPABILITY_REGISTRY.filter((e) => e.modes.includes('self-hosted'))
      const selfHostedOnly = selfHostedCaps.filter(
        (e) => !e.modes.includes('saas')
      )
      const triMode = selfHostedCaps.filter((e) => e.modes.includes('saas'))
      expect(selfHostedOnly.length).toBeGreaterThan(0)
      expect(triMode.length).toBeGreaterThan(0)
      expect(selfHostedCaps.length).toBe(selfHostedOnly.length + triMode.length)
    })

    it('filtering for saas excludes self-hosted-only entries', () => {
      const saasCapabilities = CAPABILITY_REGISTRY.filter((e) => e.modes.includes('saas'))
      const selfHostedOnly = CAPABILITY_REGISTRY.filter(
        (e) => !e.modes.includes('saas')
      )
      for (const entry of selfHostedOnly) {
        expect(saasCapabilities.find((c) => c.id === entry.id)).toBeUndefined()
      }
    })
  })
})
