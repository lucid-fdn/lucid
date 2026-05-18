import type {
  ClientToolDefinition,
  ToolSelectionContext,
  ToolSelectionProvider,
  ToolSelectionSummary,
} from './types.js'

const OPENAI_MAX_CLIENT_TOOLS = 128

function inferProviderFromModel(model?: string): ToolSelectionProvider {
  if (!model) return 'unknown'

  const normalized = model.toLowerCase()
  if (
    normalized.startsWith('openai/')
    || normalized.startsWith('gpt-')
    || normalized.startsWith('chatgpt-')
    || normalized.startsWith('o1')
    || normalized.startsWith('o3')
    || normalized.startsWith('o4')
    || normalized.startsWith('codex-')
  ) {
    return 'openai'
  }

  if (normalized.startsWith('anthropic/') || normalized.startsWith('claude-')) {
    return 'anthropic'
  }

  if (normalized.startsWith('google/') || normalized.startsWith('gemini-')) {
    return 'google'
  }

  return 'unknown'
}

function getMaxClientTools(provider: ToolSelectionProvider): number | undefined {
  switch (provider) {
    case 'openai':
      return OPENAI_MAX_CLIENT_TOOLS
    default:
      return undefined
  }
}

function applyReservedToolSlots(
  maxClientTools: number | undefined,
  reservedToolSlots?: number,
): number | undefined {
  if (maxClientTools === undefined) return undefined
  const reserved = Math.max(0, reservedToolSlots ?? 0)
  return Math.max(0, maxClientTools - reserved)
}

interface ToolSelectionOptions {
  prioritizedToolNames?: Set<string>
}

function prioritizeClientTools<T extends ClientToolDefinition>(
  clientTools: T[],
  options?: ToolSelectionOptions,
): T[] {
  const prioritizedToolNames = options?.prioritizedToolNames
  if (!prioritizedToolNames?.size) return clientTools

  const builtInTools: T[] = []
  const pluginTools: T[] = []

  for (const tool of clientTools) {
    if (prioritizedToolNames.has(tool.function.name)) {
      builtInTools.push(tool)
    } else {
      pluginTools.push(tool)
    }
  }

  return [...builtInTools, ...pluginTools]
}

export function selectClientTools<T extends ClientToolDefinition>(
  clientTools: T[],
  context?: ToolSelectionContext,
  options?: ToolSelectionOptions,
): { clientTools: T[]; selection: ToolSelectionSummary } {
  const provider = context?.provider ?? inferProviderFromModel(context?.model)
  const maxClientTools = applyReservedToolSlots(
    getMaxClientTools(provider),
    context?.reservedToolSlots,
  )
  const prioritized = prioritizeClientTools(clientTools, options)
  const selectedTools = maxClientTools ? prioritized.slice(0, maxClientTools) : prioritized
  const selectedNames = new Set(selectedTools.map((tool) => tool.function.name))

  return {
    clientTools: selectedTools,
    selection: {
      engine: context?.engine,
      model: context?.model,
      provider,
      originalCount: clientTools.length,
      selectedCount: selectedTools.length,
      maxClientTools,
      reservedToolSlots: context?.reservedToolSlots,
      decisions: prioritized.map((tool) => ({
        toolName: tool.function.name,
        included: selectedNames.has(tool.function.name),
        reason: maxClientTools
          ? (selectedNames.has(tool.function.name) ? 'within_budget' : 'provider_budget')
          : (provider === 'unknown' ? 'unknown_provider' : 'within_budget'),
      })),
    },
  }
}
