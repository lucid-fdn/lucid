import type { ToolSurface } from '../tool-surface/types.js'
import { buildAgentToolRuntime, type BuildAgentToolRuntimeInput } from './tool-runtime.js'
import { fetchMountedSkills } from '../skills/fetch-active-skills.js'
import { getEngineSkillAdapter } from '../adapters/skills/index.js'
import type {
  EngineMountedSkills,
  SkillExclusionDecision,
  SkillSelectionDecision,
} from '../adapters/skills/types.js'
import type { WorkerAgentEngine } from '../engines/types.js'
import { toWireToolName } from '../plugin-types.js'
import {
  selectCapabilityPlan,
  type CapabilityPluginSelectionDecision,
} from './capability-selector.js'

export interface BuildAgentCapabilitySurfaceInput extends BuildAgentToolRuntimeInput {
  engine: WorkerAgentEngine
  runtimeFlavor?: string | null
  channelOwnership?: string | null
  userMessage?: string
}

export interface AgentCapabilitySurface {
  tools: ToolSurface
  skills: EngineMountedSkills
  awarenessPrompt: string
  introspection: AgentCapabilitySurfaceIntrospection
}

export interface AgentCapabilitySurfaceIntrospection {
  engine: WorkerAgentEngine
  runtimeFlavor?: string | null
  channelOwnership?: string | null
  model?: string
  provider?: string
  awarenessPromptChars: number
  tools: {
    selectedCount: number
    eligibleCount: number
    hiddenCount: number
    maxClientTools?: number
    selectedToolNames: string[]
    hiddenToolNames: string[]
  }
  skills: {
    mountedCount: number
    excludedCount: number
    mounted: SkillSelectionDecision[]
    excluded: SkillExclusionDecision[]
  }
  integrations: {
    eligibleCount: number
    activeCount: number
    hiddenCount: number
    entries: CapabilityIntegrationIntrospection[]
  }
}

export interface CapabilityIntegrationIntrospection {
  slug: string
  kind: 'plugin' | 'integration'
  transport: 'embedded' | 'remote-mcp' | 'rest' | 'nango'
  trustLevel: 'internal' | 'verified' | 'community'
  executionMode: 'in_process' | 'gateway'
  relevance: 'explicit' | 'background'
  executionFit: 'preferred' | 'standard'
  priorityRank?: number
  selectedToolCount: number
  hiddenToolCount: number
  selectedToolNames: string[]
  hiddenToolNames: string[]
  status: 'active' | 'partial' | 'hidden' | 'skipped'
  reason: 'mounted' | 'provider_budget' | 'missing_connection' | 'no_tools'
    | 'trivial_turn'
}

function buildEmptyMountedSkills(engine: WorkerAgentEngine): EngineMountedSkills {
  return getEngineSkillAdapter(engine).mountSkills([])
}

function buildCapabilitySurfaceIntrospection(
  input: BuildAgentCapabilitySurfaceInput,
  tools: ToolSurface,
  skills: EngineMountedSkills,
  awarenessPrompt: string,
  pluginDecisions: CapabilityPluginSelectionDecision[],
): AgentCapabilitySurfaceIntrospection {
  const selectedTools = tools.selection?.decisions.filter((decision) => decision.included) ?? []
  const hiddenTools = tools.selection?.decisions.filter((decision) => !decision.included) ?? []
  const selectedToolNames = new Set(selectedTools.map((decision) => decision.toolName))
  const hiddenToolNames = new Set(hiddenTools.map((decision) => decision.toolName))
  const pluginDecisionMap = new Map(pluginDecisions.map((decision) => [decision.slug, decision]))
  const integrationEntries = input.plugins.map((plugin) => {
    const pluginToolNames = plugin.tools.map((tool) => toWireToolName(plugin.slug, tool.name))
    const pluginSelectedToolNames = pluginToolNames.filter((toolName) => selectedToolNames.has(toolName))
    const pluginHiddenToolNames = pluginToolNames.filter((toolName) => hiddenToolNames.has(toolName))
    const pluginDecision = pluginDecisionMap.get(plugin.slug)

    let status: CapabilityIntegrationIntrospection['status'] = 'hidden'
    let reason: CapabilityIntegrationIntrospection['reason'] = 'no_tools'
    if (pluginDecision?.reason === 'missing_connection') {
      status = 'skipped'
      reason = 'missing_connection'
    } else if (pluginDecision?.reason === 'no_tools') {
      status = 'skipped'
      reason = 'no_tools'
    } else if (pluginDecision?.reason === 'trivial_turn') {
      status = 'hidden'
      reason = 'trivial_turn'
    } else if (pluginSelectedToolNames.length > 0 && pluginHiddenToolNames.length > 0) {
      status = 'partial'
      reason = 'provider_budget'
    } else if (pluginSelectedToolNames.length > 0) {
      status = 'active'
      reason = 'mounted'
    } else if (pluginHiddenToolNames.length > 0) {
      status = 'hidden'
      reason = 'provider_budget'
    }

    return {
      slug: plugin.slug,
      kind: plugin.kind,
      transport: plugin.transport,
      trustLevel: plugin.trustLevel,
      executionMode: plugin.executionMode,
      relevance: pluginDecision?.relevance ?? 'background',
      executionFit: pluginDecision?.executionFit ?? 'standard',
      priorityRank: pluginDecision?.priorityRank,
      selectedToolCount: pluginSelectedToolNames.length,
      hiddenToolCount: pluginHiddenToolNames.length,
      selectedToolNames: pluginSelectedToolNames,
      hiddenToolNames: pluginHiddenToolNames,
      status,
      reason,
    }
  })

  return {
    engine: input.engine,
    runtimeFlavor: input.runtimeFlavor ?? 'shared',
    channelOwnership: input.channelOwnership ?? 'lucid_relay',
    model: tools.selection?.model,
    provider: tools.selection?.provider,
    awarenessPromptChars: awarenessPrompt.length,
    tools: {
      selectedCount: tools.selection?.selectedCount ?? tools.clientTools.length,
      eligibleCount: tools.selection?.originalCount ?? tools.clientTools.length,
      hiddenCount: hiddenTools.length,
      maxClientTools: tools.selection?.maxClientTools,
      selectedToolNames: selectedTools.map((decision) => decision.toolName),
      hiddenToolNames: hiddenTools.map((decision) => decision.toolName),
    },
    skills: {
      mountedCount: skills.selectionSummary.selectedCount,
      excludedCount: skills.exclusionSummary.excludedCount,
      mounted: skills.selectionSummary.decisions,
      excluded: skills.exclusionSummary.decisions,
    },
    integrations: {
      eligibleCount: integrationEntries.length,
      activeCount: integrationEntries.filter((entry) => entry.status === 'active' || entry.status === 'partial').length,
      hiddenCount: integrationEntries.filter((entry) => entry.status === 'hidden' || entry.status === 'skipped').length,
      entries: integrationEntries,
    },
  }
}

export async function buildAgentCapabilitySurface(
  input: BuildAgentCapabilitySurfaceInput,
): Promise<AgentCapabilitySurface> {
  const selectionPlan = selectCapabilityPlan({
    plugins: input.plugins,
    userMessage: input.userMessage,
    runtimeFlavor: input.runtimeFlavor,
    channelOwnership: input.channelOwnership,
  })
  const tools = await buildAgentToolRuntime({
    ...input,
    plugins: selectionPlan.toolPlugins,
  })

  const skills = input.supabase
    ? await fetchMountedSkills(input.supabase, input.assistant.id, {
        engine: input.engine,
        runtime_flavor: input.runtimeFlavor ?? 'shared',
        channel_ownership: input.channelOwnership ?? 'lucid_relay',
        wallet_enabled: input.assistant.wallet_enabled,
        plugins: input.plugins,
      })
    : buildEmptyMountedSkills(input.engine)

  const awarenessPrompt = [skills.promptSection, tools.awarenessPrompt]
    .filter(Boolean)
    .join('\n\n')

  return {
    tools,
    skills,
    awarenessPrompt,
    introspection: buildCapabilitySurfaceIntrospection(
      input,
      tools,
      skills,
      awarenessPrompt,
      selectionPlan.pluginDecisions,
    ),
  }
}
