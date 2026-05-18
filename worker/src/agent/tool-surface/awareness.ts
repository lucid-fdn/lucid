import type { ActivatedPlugin } from '../plugin-types.js'
import type {
  ClientToolDefinition,
  ToolSelectionSummary,
} from './types.js'
import { toWireToolName } from '../plugin-types.js'

interface BuildToolAwarenessPromptInput {
  selectedClientTools: ClientToolDefinition[]
  selectedBuiltInTools: Array<{
    name: string
    description?: string
    when_to_use?: unknown
  }>
  plugins?: ActivatedPlugin[]
  approvalRequiredTools?: string[] | null
  selection?: ToolSelectionSummary
}

export function buildToolAwarenessPrompt(
  input: BuildToolAwarenessPromptInput,
): string {
  const sections: string[] = []
  const selectedNames = new Set(input.selectedClientTools.map((tool) => tool.function.name))

  const builtInLines = input.selectedBuiltInTools
    .map((tool) => `- **${tool.name}**: ${tool.description ?? 'Available in this run.'}`)
  if (builtInLines.length > 0) {
    sections.push(`Lucid platform tools:\n${builtInLines.join('\n')}`)
  }

  if (input.plugins?.length) {
    const pluginLines = input.plugins.flatMap((plugin) =>
      plugin.tools
        .filter((tool) => selectedNames.has(toWireToolName(plugin.slug, tool.name)))
        .map((tool) => `- **${plugin.slug}__${tool.name}**: ${tool.description}`),
    )
    if (pluginLines.length > 0) {
      sections.push(`Activated plugin tools:\n${pluginLines.join('\n')}`)
    }
  }

  const hiddenToolCount = input.selection?.decisions.filter((decision) => !decision.included).length ?? 0
  if (hiddenToolCount > 0) {
    sections.push(
      `Run-scoped capability limits: ${hiddenToolCount} eligible tools are hidden for this run to stay within engine/provider limits.`,
    )
  }

  const selectedApprovalTools = (input.approvalRequiredTools ?? []).filter((toolName) => selectedNames.has(toolName))
  if (selectedApprovalTools.length > 0) {
    sections.push(
      `Approval-gated tools: ${selectedApprovalTools.join(', ')}. ` +
      'Lucid governance will pause and request approval before these actions execute.',
    )
  }

  if (sections.length === 0) return ''
  return `## Tooling\n${sections.join('\n\n')}`
}
