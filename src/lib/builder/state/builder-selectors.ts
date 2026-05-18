import type { UnifiedSkillItem } from '@contracts/unified-skill'

import type { GenerationDraft } from '@/lib/ai/project-generation/schemas'

export function filterPublicBuilderCapabilities(items: UnifiedSkillItem[]): UnifiedSkillItem[] {
  return items.filter((item) => item.section !== 'core' && item.source_type !== 'internal')
}

export function getSelectedBuilderCapabilities(
  draft: GenerationDraft | null | undefined,
  items: UnifiedSkillItem[],
): UnifiedSkillItem[] {
  if (!draft?.agent) return []
  const selectedSkills = new Set(draft.agent.skills ?? [])
  const selectedPlugins = new Set(draft.agent.plugins ?? [])

  return filterPublicBuilderCapabilities(items).filter((item) => (
    item.item_type === 'skill'
      ? selectedSkills.has(item.slug)
      : selectedPlugins.has(item.slug)
  ))
}
