import { describe, expect, it } from 'vitest'
import { getEngineSkillAdapter } from '../index.js'

describe('EngineSkillAdapter', () => {
  it('keeps legacy internal fallback OpenClaw-only when no explicit engine support exists', () => {
    const adapter = getEngineSkillAdapter('openclaw')

    const resolved = adapter.selectCatalogSkill({
      slug: 'legacy-skill',
      name: 'Legacy Skill',
      description: 'OpenClaw-only implicit skill',
      sanitized_content: 'Use this carefully.',
      frontmatter: {},
      content_chars: 18,
      source_type: 'internal',
      source_version: '1.0.0',
      engine_support: [],
      status: 'approved',
    }, {
      engine: 'openclaw',
      runtimeFlavor: 'shared',
      channelOwnership: 'lucid_relay',
    }, 100)

    expect(resolved?.skill_slug).toBe('legacy-skill')
    expect(resolved?.selection_meta).toEqual({
      source: 'catalog',
      reason: 'engine_support',
      engine: 'openclaw',
      support_level: 'native',
    })
  })

  it('does not treat legacy internal fallback as Hermes-compatible', () => {
    const adapter = getEngineSkillAdapter('hermes')

    const resolved = adapter.selectCatalogSkill({
      slug: 'legacy-skill',
      name: 'Legacy Skill',
      description: 'OpenClaw-only implicit skill',
      sanitized_content: 'Use this carefully.',
      frontmatter: {},
      content_chars: 18,
      source_type: 'internal',
      source_version: '1.0.0',
      engine_support: [],
      status: 'approved',
    }, {
      engine: 'hermes',
      runtimeFlavor: 'shared',
      channelOwnership: 'lucid_relay',
    }, 100)

    expect(resolved).toBeNull()
  })

  it('mounts Hermes skills as prompt content instead of OpenClaw snapshots', () => {
    const adapter = getEngineSkillAdapter('hermes')
    const mounted = adapter.mountSkills([{
      skill_slug: 'market-intel',
      skill_name: 'Market Intelligence',
      skill_description: 'Analyze markets',
      sanitized_content: 'Always check the market first.',
      frontmatter: {},
      sort_order: 100,
      content_chars: 31,
      source_type: 'mcpgate',
      source_version: '1.0.0',
    }])

    expect(mounted.promptSection).toContain('<available_skills>')
    expect(mounted.promptSection).toContain('market-intel')
    expect(mounted.snapshot.resolvedSkills).toEqual([])
    expect(mounted.selectionSummary).toEqual({
      selectedCount: 1,
      decisions: [
        {
          skillSlug: 'market-intel',
          source: 'catalog',
          reason: 'engine_support',
          engine: undefined,
          supportLevel: undefined,
          sourceType: 'mcpgate',
          sourceVersion: '1.0.0',
        },
      ],
    })
    expect(mounted.exclusionSummary).toEqual({
      excludedCount: 0,
      decisions: [],
    })
  })
})
