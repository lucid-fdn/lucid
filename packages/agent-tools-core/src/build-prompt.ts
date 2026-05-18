import type { EnrichedToolDefinition } from './types.js'
import { CATEGORY_ORDER } from './types.js'

/** Max when_to_use entries to render per tool (avoid prompt bloat) */
const MAX_TRIGGERS = 2

/**
 * Auto-generates the tool awareness section of the agent prompt
 * from enriched tool metadata.
 *
 * - Groups tools by category (read → reason → act → runtime → internal)
 * - Caps when_to_use at 2 entries per tool
 * - Shows first example only
 * - Marks tools requiring confirmation
 */
export function buildToolPrompt(tools: EnrichedToolDefinition[]): string {
  if (tools.length === 0) return ''

  const sorted = [...tools].sort((a, b) => {
    const orderA = CATEGORY_ORDER[a.category] ?? 99
    const orderB = CATEGORY_ORDER[b.category] ?? 99
    if (orderA !== orderB) return orderA - orderB
    return a.name.localeCompare(b.name)
  })

  return sorted
    .map((t) => {
      const lines: string[] = []
      lines.push(`- **${t.name}**: ${t.description}`)

      const triggers = t.when_to_use.slice(0, MAX_TRIGGERS)
      if (triggers.length > 0) {
        lines.push(`  Use when: ${triggers.join('; ')}`)
      }

      if (t.examples?.length) {
        lines.push(`  Example: "${t.examples[0].user}"`)
      }

      if (t.related_tools?.length) {
        lines.push(`  Related: ${t.related_tools.join(', ')}`)
      }

      if (t.requires_confirmation) {
        lines.push('  ⚠ This tool requires confirmation before execution.')
      }

      return lines.join('\n')
    })
    .join('\n')
}
