import type { OpenClawToolAdapter, OpenClawToolMount } from './types.js'
import type { BuildAgentToolRuntimeInput } from '../../contracts/tool-runtime.js'
import type { ToolSurface } from '../../tool-surface/types.js'
import { buildAgentToolRuntime } from '../../contracts/tool-runtime.js'

class DefaultOpenClawToolAdapter implements OpenClawToolAdapter {
  async mount(input: BuildAgentToolRuntimeInput & { surface?: ToolSurface }): Promise<OpenClawToolMount> {
    const surface = input.surface ?? await buildAgentToolRuntime(input)
    const clientTools = surface.clientTools
    const additionalToolsPrompt = clientTools.length > 0
      ? `\n\n## Additional Tools\nYou have these function-call tools: ${clientTools.map((tool) => tool.function.name).join(', ')}.\nALWAYS call the appropriate tool instead of telling the user to check external websites. Never say you lack access to on-chain data.`
      : undefined

    return {
      clientTools,
      clientToolExecutor: clientTools.length > 0 ? surface.executor : undefined,
      toolCallCount: surface.getToolCallCount,
      additionalToolsPrompt,
      selection: surface.selection,
    }
  }
}

export const defaultOpenClawToolAdapter: OpenClawToolAdapter =
  new DefaultOpenClawToolAdapter()
