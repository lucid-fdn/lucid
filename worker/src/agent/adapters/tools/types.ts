import type { ClientToolDefinition, ToolSelectionSummary, ToolSurface } from '../../tool-surface/types.js'
import type { ActivatedPlugin } from '../../plugin-types.js'
import type { AssistantConfig } from '../../types.js'
import type { BuildAgentToolRuntimeInput } from '../../contracts/tool-runtime.js'

export interface OpenClawToolMount {
  clientTools: ClientToolDefinition[]
  clientToolExecutor?: (toolName: string, params: Record<string, unknown>) => Promise<string>
  toolCallCount: () => number
  additionalToolsPrompt?: string
  selection?: ToolSelectionSummary
}

export interface HermesToolMount {
  toolPrompt?: string
}

export interface OpenClawToolAdapter {
  mount(input: BuildAgentToolRuntimeInput & { surface?: ToolSurface }): Promise<OpenClawToolMount>
}

export interface HermesToolAdapter {
  mount(input: {
    assistant: AssistantConfig
    plugins?: ActivatedPlugin[]
    surface?: ToolSurface
  }): HermesToolMount
}
