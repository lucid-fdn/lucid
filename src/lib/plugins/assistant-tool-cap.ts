import type { UnifiedSkillItem } from '../../../contracts/unified-skill'

export const HARD_MAX_TOOLS_PER_AGENT = 100

export function getEnabledToolCount(
  enabledTools: string[] | null | undefined,
  fallbackCount: number,
): number {
  if (Array.isArray(enabledTools)) {
    return enabledTools.length
  }

  return Math.max(0, fallbackCount)
}

export function getUnifiedSkillToolCount(item: Pick<UnifiedSkillItem, 'enabled_tools' | 'tool_count'>): number {
  return getEnabledToolCount(item.enabled_tools, item.tool_count)
}

export function getActiveUnifiedSkillToolCount(
  items: Array<Pick<UnifiedSkillItem, 'item_type' | 'is_active' | 'enabled_tools' | 'tool_count'>>,
): number {
  return items.reduce((sum, item) => {
    if (item.item_type !== 'plugin' || !item.is_active) {
      return sum
    }

    return sum + getUnifiedSkillToolCount(item)
  }, 0)
}

export function formatAssistantToolCapMessage(current: number, limit: number = HARD_MAX_TOOLS_PER_AGENT): string {
  if (current > limit) {
    return `This agent currently has ${current} active tools, but the hard limit is ${limit}. Turn tools off until you are below that cap before enabling more.`
  }

  return `This agent has reached the hard limit of ${limit} active tools. Turn tools off before enabling more.`
}
