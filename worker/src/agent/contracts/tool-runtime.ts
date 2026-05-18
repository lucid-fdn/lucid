import { buildToolPrompt } from '@lucid-fdn/agent-tools-core'
import type { EnrichedToolDefinition } from '@lucid-fdn/agent-tools-core'
import type { ToolSurface } from '../tool-surface/types.js'
import { buildToolSurface, type BuildToolSurfaceInput } from '../tool-surface/index.js'
import { CommandsAllowlist } from '../CommandsAllowlist.js'
import type { AssistantConfig } from '../types.js'
import type { ActivatedPlugin } from '../plugin-types.js'
import { REVERSE_TOOL_NAME_MAP } from '../tool-surface/compat-names.js'

export type BuildAgentToolRuntimeInput = BuildToolSurfaceInput

export interface ToolAwarenessPromptInput {
  assistant: AssistantConfig
  plugins?: ActivatedPlugin[]
  surface?: ToolSurface
}

export interface AgentToolRuntime {
  buildSurface(input: BuildAgentToolRuntimeInput): Promise<ToolSurface>
  buildAwarenessPrompt(input: ToolAwarenessPromptInput): string
}

class DefaultAgentToolRuntime implements AgentToolRuntime {
  async buildSurface(input: BuildAgentToolRuntimeInput): Promise<ToolSurface> {
    return buildToolSurface(input)
  }

  buildAwarenessPrompt(input: ToolAwarenessPromptInput): string {
    if (input.surface?.awarenessPrompt) {
      return input.surface.awarenessPrompt
    }

    const allowlist = new CommandsAllowlist(input.assistant.policy_config)
    if (input.assistant.wallet_enabled) {
      allowlist.stripWalletAddressParams()
    }

    const oldNamesToExclude = new Set(Object.values(REVERSE_TOOL_NAME_MAP))
    const enrichedTools = allowlist.getAllowedTools()
      .filter((tool) => !oldNamesToExclude.has(tool.name))
      .filter((tool): tool is EnrichedToolDefinition => Array.isArray(tool.when_to_use))

    const sections: string[] = []
    const builtInPrompt = buildToolPrompt(enrichedTools)
    if (builtInPrompt) {
      sections.push(`Lucid platform tools:\n${builtInPrompt}`)
    }

    if (input.plugins?.length) {
      const pluginLines = input.plugins.flatMap((plugin) =>
        plugin.tools.map((tool) => `- **${plugin.slug}__${tool.name}**: ${tool.description}`),
      )
      if (pluginLines.length > 0) {
        sections.push(`Activated plugin tools:\n${pluginLines.join('\n')}`)
      }
    }

    if (input.assistant.approval_required_tools?.length) {
      sections.push(
        `Approval-gated tools: ${input.assistant.approval_required_tools.join(', ')}. ` +
        'Lucid governance will pause and request approval before these actions execute.',
      )
    }

    if (sections.length === 0) return ''
    return `## Tooling\n${sections.join('\n\n')}`
  }
}

export const defaultAgentToolRuntime: AgentToolRuntime = new DefaultAgentToolRuntime()

export async function buildAgentToolRuntime(
  input: BuildAgentToolRuntimeInput,
): Promise<ToolSurface> {
  return defaultAgentToolRuntime.buildSurface(input)
}

export function buildAgentToolAwarenessPrompt(
  input: ToolAwarenessPromptInput,
): string {
  return defaultAgentToolRuntime.buildAwarenessPrompt(input)
}
