import { describe, expect, it } from 'vitest'
import { normalizeMcpgateSkillPassport, resolveSkillVariant } from '@/lib/skills/package'
import {
  buildSkillVariantKey,
  enumerateSkillVariantKeys,
  resolveSkillSupport,
} from '@contracts/skill-resolution'
import { getEmbeddedInternalSkillPath, listInternalSkillPackages } from '@/lib/skills/internal-packages'

describe('skill package resolution', () => {
  it('selects the matching engine/runtime variant', () => {
    const variant = resolveSkillVariant({
      variants: [
        { engine: 'openclaw', support_level: 'native', runtime_flavors: ['shared'] },
        {
          engine: 'hermes',
          support_level: 'portable',
          runtime_flavors: ['c1_managed', 'c2a_autonomous'],
          channel_ownership: ['lucid_relay'],
        },
      ],
    }, {
      engine: 'hermes',
      runtimeFlavor: 'c1_managed',
      channelOwnership: 'lucid_relay',
    })

    expect(variant?.engine).toBe('hermes')
    expect(variant?.support_level).toBe('portable')
  })

  it('normalizes MCPGate skill passports into local packages', () => {
    const normalized = normalizeMcpgateSkillPassport({
      id: 'skill_123',
      name: 'Trading Copilot',
      description: 'Skill package',
      metadata: {
        slug: 'trading-copilot',
        category: 'trading',
        tags: ['markets'],
        version: '1.2.0',
        trust_tier: 'verified_partner',
        capability_tier: 'tool_backed',
        skill_markdown: '# Trading Copilot',
        variants: [
          {
            engine: 'openclaw',
            support_level: 'native',
            runtime_flavors: ['shared', 'c1_managed'],
            required_tools: ['trade_market'],
          },
        ],
        artifact_manifest: {
          entry: 'SKILL.md',
          checksum: 'abc123',
        },
      },
    })

    expect(normalized).not.toBeNull()
    expect(normalized?.slug).toBe('trading-copilot')
    expect(normalized?.variants[0]?.engine).toBe('openclaw')
    expect(normalized?.artifact_manifest?.entry).toBe('SKILL.md')
  })

  it('resolves internal legacy skills to OpenClaw only by default', () => {
    expect(resolveSkillSupport({
      source_type: 'internal',
      engine_support: [],
    }, {
      engine: 'openclaw',
      runtimeFlavor: 'shared',
      channelOwnership: 'lucid_relay',
    })?.support_level).toBe('native')

    expect(resolveSkillSupport({
      source_type: 'internal',
      engine_support: [],
    }, {
      engine: 'hermes',
      runtimeFlavor: 'shared',
      channelOwnership: 'lucid_relay',
    })).toBeNull()
  })

  it('builds deterministic variant keys', () => {
    expect(buildSkillVariantKey({
      engine: 'hermes',
      runtimeFlavor: 'c1_managed',
      channelOwnership: 'lucid_relay',
    })).toBe('hermes:c1_managed:lucid_relay')
  })

  it('enumerates explicit variant keys for warm installs', () => {
    expect(enumerateSkillVariantKeys({
      source_type: 'mcpgate',
      engine_support: [
        {
          engine: 'hermes',
          support_level: 'adapted',
          runtime_flavors: ['shared', 'c1_managed'],
          channel_ownership: ['lucid_relay'],
        },
      ],
    })).toEqual([
      'hermes:c1_managed:lucid_relay',
      'hermes:shared:lucid_relay',
    ])
  })

  it('exports first-party internal skills as portable packages', async () => {
    const skills = await listInternalSkillPackages()
    const hyperliquid = skills.find((skill) => skill.slug === 'hyperliquid')

    expect(hyperliquid).toBeDefined()
    expect(hyperliquid?.trust_tier).toBe('lucid_first_party')
    expect(hyperliquid?.variants.map((variant) => variant.engine)).toEqual(['openclaw', 'hermes'])
    expect(hyperliquid?.artifact_manifest?.entry).toBe('SKILL.md')
  })

  it('detects embedded first-party skill bundles for warm local execution', async () => {
    await expect(getEmbeddedInternalSkillPath('polymarket')).resolves.toBe('worker/src/skills/polymarket')
    await expect(getEmbeddedInternalSkillPath('missing-skill')).resolves.toBeNull()
  })
})
