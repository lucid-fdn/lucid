import type { ActiveSkillRow } from '../../skills/types.js'
import { buildMountedSkillSelection, buildSkillsSnapshotFromRows, renderInlineSkillsPrompt } from '../../skills/snapshot-builder.js'
import type {
  CatalogSkillRecord,
  EngineMountedSkills,
  EngineSkillAdapter,
  EngineSkillMountContext,
} from './types.js'
import { resolveSkillSupport } from './resolve-skill-support.js'

export class HermesSkillAdapter implements EngineSkillAdapter {
  readonly engine = 'hermes' as const

  selectCatalogSkill(
    skill: CatalogSkillRecord,
    ctx: EngineSkillMountContext,
    sortOrder: number,
  ): ActiveSkillRow | null {
    if (skill.status !== 'approved') return null

    const resolved = resolveSkillSupport({
      source_type: skill.source_type ?? 'internal',
      engine_support: Array.isArray(skill.engine_support) ? skill.engine_support : [],
    }, {
      engine: ctx.engine,
      runtimeFlavor: ctx.runtimeFlavor ?? 'shared',
      channelOwnership: ctx.channelOwnership ?? 'lucid_relay',
    })
    if (!resolved) return null

    return {
      skill_slug: skill.slug,
      skill_name: skill.name,
      skill_description: skill.description ?? '',
      sanitized_content: skill.sanitized_content,
      frontmatter: skill.frontmatter ?? {},
      sort_order: sortOrder,
      content_chars: skill.content_chars ?? skill.sanitized_content.length,
      source_type: skill.source_type ?? null,
      source_version: skill.source_version ?? null,
      selection_meta: {
        source: 'catalog',
        reason: 'engine_support',
        engine: resolved.engine,
        support_level: resolved.support_level,
      },
    }
  }

  mountSkills(rows: ActiveSkillRow[]): EngineMountedSkills {
    return {
      rows,
      promptSection: renderInlineSkillsPrompt(rows),
      snapshot: buildSkillsSnapshotFromRows([]),
      selectionSummary: buildMountedSkillSelection(rows),
      exclusionSummary: {
        excludedCount: 0,
        decisions: [],
      },
    }
  }
}
