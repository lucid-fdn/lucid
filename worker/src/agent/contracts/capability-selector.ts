import type { ActivatedPlugin } from '../plugin-types.js'

export interface CapabilityPluginSelectionDecision {
  slug: string
  selectedForTools: boolean
  reason: 'eligible' | 'missing_connection' | 'no_tools' | 'trivial_turn'
  relevance: 'explicit' | 'background'
  executionFit: 'preferred' | 'standard'
  priorityRank?: number
}

export interface CapabilitySelectionPlan {
  toolPlugins: ActivatedPlugin[]
  pluginDecisions: CapabilityPluginSelectionDecision[]
}

export interface SelectCapabilityPlanInput {
  plugins?: ActivatedPlugin[]
  userMessage?: string
  runtimeFlavor?: string | null
  channelOwnership?: string | null
}

function normalizeCapabilityText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

const TRIVIAL_TURN_TOKENS = new Set([
  'hi', 'hey', 'hello', 'yo', 'sup',
  'ok', 'okay', 'k',
  'thanks', 'thank', 'thx', 'ty',
  'bonjour', 'salut', 'coucou',
  'merci',
  'hola', 'gracias',
  'hallo', 'danke',
  'ciao', 'grazie',
  'ola', 'obrigado', 'obrigada',
  'hej', 'tack',
])

function isTrivialTurn(userMessage?: string): boolean {
  const normalized = normalizeCapabilityText(userMessage ?? '')
  if (!normalized) return false

  const tokens = normalized.split(' ').filter(Boolean)
  if (tokens.length === 0 || tokens.length > 3) return false

  return tokens.every((token) => TRIVIAL_TURN_TOKENS.has(token))
}

function inferPluginRelevance(
  plugin: ActivatedPlugin,
  userMessage?: string,
): CapabilityPluginSelectionDecision['relevance'] {
  const normalizedMessage = normalizeCapabilityText(userMessage ?? '')
  if (!normalizedMessage) return 'background'

  const slug = normalizeCapabilityText(plugin.slug)
  const name = normalizeCapabilityText(plugin.name)
  const toolNames = plugin.tools.map((tool) => normalizeCapabilityText(tool.name))

  if (
    (slug && normalizedMessage.includes(slug))
    || (name && normalizedMessage.includes(name))
    || toolNames.some((toolName) => toolName && normalizedMessage.includes(toolName))
  ) {
    return 'explicit'
  }

  return 'background'
}

function inferPluginExecutionFit(
  plugin: ActivatedPlugin,
  runtimeFlavor?: string | null,
  channelOwnership?: string | null,
): CapabilityPluginSelectionDecision['executionFit'] {
  if (
    (runtimeFlavor === 'c2a_autonomous' || channelOwnership === 'runtime_native')
    && (plugin.executionMode === 'in_process' || plugin.transport === 'embedded')
  ) {
    return 'preferred'
  }

  return 'standard'
}

export function selectCapabilityPlan(
  input: SelectCapabilityPlanInput,
): CapabilitySelectionPlan {
  const plugins = input.plugins ?? []
  const trivialTurn = isTrivialTurn(input.userMessage)
  const pluginDecisions: CapabilityPluginSelectionDecision[] = []
  const rankedPlugins: Array<{
    plugin: ActivatedPlugin
    relevance: CapabilityPluginSelectionDecision['relevance']
    executionFit: CapabilityPluginSelectionDecision['executionFit']
  }> = []

  for (const plugin of plugins) {
    const relevance = inferPluginRelevance(plugin, input.userMessage)
    const executionFit = inferPluginExecutionFit(
      plugin,
      input.runtimeFlavor,
      input.channelOwnership,
    )
    if (plugin.transport === 'nango' && !plugin.connectionId) {
      pluginDecisions.push({
        slug: plugin.slug,
        selectedForTools: false,
        reason: 'missing_connection',
        relevance,
        executionFit,
      })
      continue
    }

    if (plugin.tools.length === 0) {
      pluginDecisions.push({
        slug: plugin.slug,
        selectedForTools: false,
        reason: 'no_tools',
        relevance,
        executionFit,
      })
      continue
    }

    if (trivialTurn && relevance === 'background') {
      pluginDecisions.push({
        slug: plugin.slug,
        selectedForTools: false,
        reason: 'trivial_turn',
        relevance,
        executionFit,
      })
      continue
    }

    pluginDecisions.push({
      slug: plugin.slug,
      selectedForTools: true,
      reason: 'eligible',
      relevance,
      executionFit,
    })
    rankedPlugins.push({ plugin, relevance, executionFit })
  }

  const sortedPlugins = rankedPlugins.sort((left, right) => {
    const leftRelevance = left.relevance === 'explicit' ? 0 : 1
    const rightRelevance = right.relevance === 'explicit' ? 0 : 1
    if (leftRelevance !== rightRelevance) return leftRelevance - rightRelevance

    const leftExecutionFit = left.executionFit === 'preferred' ? 0 : 1
    const rightExecutionFit = right.executionFit === 'preferred' ? 0 : 1
    if (leftExecutionFit !== rightExecutionFit) return leftExecutionFit - rightExecutionFit

    return left.plugin.slug.localeCompare(right.plugin.slug)
  })

  const priorityBySlug = new Map(sortedPlugins.map((entry, index) => [entry.plugin.slug, index]))
  for (const decision of pluginDecisions) {
    if (decision.selectedForTools) {
      decision.priorityRank = priorityBySlug.get(decision.slug)
    }
  }

  return {
    toolPlugins: sortedPlugins.map((entry) => entry.plugin),
    pluginDecisions,
  }
}
