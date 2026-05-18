import { getPlatformTemplateSeeds, getStarterTemplateRegistryEntries, templateRegistryEntries } from './registry'
import { templateRegistrySeedSchema } from './validation'
import { resolveTemplateAgentOpsWorkflows } from '@/lib/agent-ops'
import { getTemplateCapabilityRefs } from '@/lib/capabilities/icon-resolver'
import { PLATFORM_AGENT_TEAM_TEMPLATE_PACKS } from './packs/catalog'
import { packBackedTemplateToCatalogEntry } from './pack-adapter'

describe('template registry', () => {
  it('exposes unique slugs for all platform seeds', () => {
    const slugs = getPlatformTemplateSeeds().map((template) => template.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('keeps starter templates as a subset of the platform registry', () => {
    const starters = getStarterTemplateRegistryEntries()
    expect(starters.length).toBeGreaterThan(0)
    expect(starters.every((entry) => templateRegistryEntries.includes(entry))).toBe(true)
  })

  it('tracks onboarding and advanced metadata explicitly', () => {
    expect(templateRegistryEntries.some((entry) => entry.recommendedForOnboarding)).toBe(true)
    expect(templateRegistryEntries.some((entry) => entry.advanced)).toBe(true)
  })

  it('keeps platform templates previewable with capability logos', () => {
    const missingCapabilityRefs = getPlatformTemplateSeeds()
      .filter((template) => getTemplateCapabilityRefs(template).length === 0)
      .map((template) => template.slug)

    expect(missingCapabilityRefs).toEqual([])
  })

  it('keeps declared kind aligned with the canonical spec kind', () => {
    expect(() => templateRegistryEntries.forEach((entry) => {
      templateRegistrySeedSchema.parse(entry.template)
    })).not.toThrow()
  })

  it('converts every platform agent/team template into a Lucid Pack-backed template', () => {
    const seeds = getPlatformTemplateSeeds()

    expect(PLATFORM_AGENT_TEAM_TEMPLATE_PACKS).toHaveLength(seeds.length)
    for (const manifest of PLATFORM_AGENT_TEAM_TEMPLATE_PACKS) {
      expect(manifest.metadata.template_type).toMatch(/^(agent|team)$/)
      expect(manifest.metadata.backing_lifecycle).toBe('lucid_pack')
      expect(manifest.resources).toHaveLength(1)
      const fakePack = {
        id: '11111111-1111-4111-8111-111111111111',
        orgId: null,
        packKey: manifest.key,
        name: manifest.name,
        description: manifest.description,
        version: manifest.version,
        manifest,
        status: 'active' as const,
        createdAt: '2026-05-13T00:00:00Z',
        updatedAt: '2026-05-13T00:00:00Z',
      }
      const catalogEntry = packBackedTemplateToCatalogEntry(fakePack)
      expect(catalogEntry?.slug).toBe(manifest.key)
      expect(catalogEntry?.kind).toBe(manifest.metadata.template_type)
    }
  })

  it('rejects registry seeds whose declared kind does not match the spec', () => {
    expect(() => templateRegistrySeedSchema.parse({
      slug: 'broken-seed',
      name: 'Broken Seed',
      category: 'general',
      kind: 'team',
      params: [],
      tags: [],
      spec: {
        kind: 'agent',
        system_prompt: 'You are broken.',
      },
    })).toThrow(/must match spec kind/i)
  })

  it('lets templates package Agent Ops workflows without owning runtime semantics', () => {
    const devMonitor = templateRegistryEntries.find((entry) => entry.template.slug === 'dev-monitor')

    expect(devMonitor).toBeDefined()
    const workflows = resolveTemplateAgentOpsWorkflows(devMonitor!.template.spec)
    expect(workflows.map((entry) => entry.workflow.id)).toEqual([
      'investigate',
      'review',
      'qa',
      'ship',
    ])
    expect(workflows[0].binding.launch_contexts).toContain('incident')
  })

  it('packages Agent Ops workflow entrypoints in every starter template', () => {
    const starters = getStarterTemplateRegistryEntries()

    expect(starters).not.toHaveLength(0)
    for (const entry of starters) {
      const workflows = resolveTemplateAgentOpsWorkflows(entry.template.spec)
      expect(workflows.length, `${entry.template.slug} should declare Agent Ops workflows`).toBeGreaterThan(0)
      expect(workflows.every((workflow) => workflow.binding.launch_contexts.length > 0)).toBe(true)
    }
  })

  it('rejects unknown Agent Ops workflow ids in template specs', () => {
    expect(() => templateRegistrySeedSchema.parse({
      slug: 'broken-ops-workflow',
      name: 'Broken Ops Workflow',
      category: 'general',
      kind: 'agent',
      params: [],
      tags: [],
      spec: {
        kind: 'agent',
        system_prompt: 'You are broken.',
        ops_workflows: [
          { workflow_id: 'not-a-real-workflow' },
        ],
      },
    })).toThrow(/Unknown Agent Ops workflow id/i)
  })

  it('rejects duplicate Agent Ops workflow bindings in template specs', () => {
    expect(() => templateRegistrySeedSchema.parse({
      slug: 'duplicate-ops-workflow',
      name: 'Duplicate Ops Workflow',
      category: 'general',
      kind: 'agent',
      params: [],
      tags: [],
      spec: {
        kind: 'agent',
        system_prompt: 'You are duplicated.',
        ops_workflows: [
          { workflow_id: 'review' },
          { workflow_id: 'review' },
        ],
      },
    })).toThrow(/Duplicate Agent Ops workflow binding/i)
  })
})
