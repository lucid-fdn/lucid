import { describe, expect, it } from 'vitest'
import { explainSkillSupportExclusion } from '../resolve-skill-support.js'

describe('explainSkillSupportExclusion', () => {
  it('reports engine mismatch when no variant matches the requested engine', () => {
    const exclusion = explainSkillSupportExclusion({
      slug: 'market-intel',
      status: 'approved',
      source_type: 'mcpgate',
      source_version: '1.0.0',
      engine_support: [
        {
          engine: 'openclaw',
          support_level: 'native',
        },
      ],
    }, {
      engine: 'hermes',
      runtimeFlavor: 'shared',
      channelOwnership: 'lucid_relay',
    })

    expect(exclusion).toEqual({
      skillSlug: 'market-intel',
      reason: 'engine_mismatch',
      sourceType: 'mcpgate',
      sourceVersion: '1.0.0',
    })
  })

  it('reports legacy openclaw-only fallback for internal skills without explicit support', () => {
    const exclusion = explainSkillSupportExclusion({
      slug: 'legacy-skill',
      status: 'approved',
      source_type: 'internal',
      source_version: '1.0.0',
      engine_support: [],
    }, {
      engine: 'hermes',
      runtimeFlavor: 'shared',
      channelOwnership: 'lucid_relay',
    })

    expect(exclusion).toEqual({
      skillSlug: 'legacy-skill',
      reason: 'legacy_openclaw_only',
      sourceType: 'internal',
      sourceVersion: '1.0.0',
    })
  })
})
