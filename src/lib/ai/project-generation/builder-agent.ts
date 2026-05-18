import 'server-only'

import {
  generateText as aiGenerateText,
  stepCountIs,
  type LanguageModel,
} from 'ai'
import type { RuntimeBlueprint } from '@contracts/project-blueprint'
import type { TemplateCatalogEntry } from '@contracts/template'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

import { generateText as gatewayGenerateText } from '@/lib/ai/gateway'
import { runInternalTextAgent } from '@/lib/ai/services/internal-agent-service'
import { logBuilderTelemetry } from '@/lib/ai/project-generation/builder-telemetry'

import {
  buildBuilderCapabilityRegistryFromUnifiedSkills,
  getBuilderCapabilityRegistry,
  summarizeRelevantBuilderCapabilityRegistry,
  type BuilderCapabilityRegistry,
} from './capability-registry'
import { createBuilderPlanningTools } from './builder-tools'
import { detectBuilderIntentProfile, summarizeBuilderIntentProfile } from './intent-profiles'
import { planBuilderTeamTopology, recommendRuntimeMode, type BuilderTeamTopologyPlan } from './team-planner'
import { isSimpleBuilderPrompt } from './intent'
import type { GenerationDraft, GenerationIntent, TemplateMatch } from './schemas'

export interface BuilderPlanningResult {
  capabilityRegistry: BuilderCapabilityRegistry
  capabilitySnapshot: string
  teamPlan: BuilderTeamTopologyPlan
  runtimeRecommendation?: RuntimeBlueprint['mode']
  planningMemo: string
}

function buildPlanningSystemPrompt(): string {
  return [
    'You are Lucid Builder Planner.',
    'Your job is to decide the best capability shape before a structured draft is generated.',
    'Use the available tools when needed.',
    'Stay grounded in actual Lucid capabilities.',
    'Do not invent MCP servers, tools, or skills that are not in the registry.',
    'Return a short planning memo in plain English.',
    'Cover topology, roles/responsibilities, capability choices, runtime posture, and any open gaps.',
  ].join('\n')
}

function buildPlanningUserPrompt(input: {
  prompt: string
  intent: GenerationIntent
  draft?: GenerationDraft
  preferredMode?: 'auto' | 'template' | 'agent' | 'team'
  runtimeMode?: RuntimeBlueprint['mode']
  templateMatches: TemplateMatch[]
  teamPlan: BuilderTeamTopologyPlan
  capabilitySnapshot: string
  profileSummary?: string | null
}): string {
  return [
    `User request:\n${input.prompt}`,
    `Intent:\n${JSON.stringify(input.intent, null, 2)}`,
    input.preferredMode ? `Preferred mode: ${input.preferredMode}` : null,
    input.runtimeMode ? `Requested runtime: ${input.runtimeMode}` : null,
    input.draft ? `Current draft:\n${JSON.stringify(input.draft, null, 2)}` : null,
    `Template shortlist:\n${JSON.stringify(input.templateMatches.slice(0, 6), null, 2)}`,
    `Deterministic topology suggestion:\n${JSON.stringify(input.teamPlan, null, 2)}`,
    input.profileSummary ? `Common intent profile:\n${input.profileSummary}` : null,
    `Capability registry summary:\n${input.capabilitySnapshot}`,
  ].filter(Boolean).join('\n\n')
}

function buildDeterministicPlanningMemo(input: {
  prompt: string
  teamPlan: BuilderTeamTopologyPlan
  runtimeRecommendation?: RuntimeBlueprint['mode']
  capabilityRegistry: BuilderCapabilityRegistry
  templateMatches: TemplateMatch[]
}): string {
  const topTemplates = input.templateMatches.slice(0, 2).map((match) => `${match.slug} (${Math.round(match.score * 100)}%)`)
  const topSkills = input.capabilityRegistry.skills.slice(0, 3).map((skill) => skill.slug)
  const topServers = input.capabilityRegistry.toolServers.slice(0, 2).map((server) => server.name)

  return [
    input.teamPlan.rationale,
    topTemplates.length > 0 ? `Closest reusable templates: ${topTemplates.join(', ')}.` : 'No strong template match stood out immediately.',
    input.teamPlan.mode === 'blank-team'
      ? `Suggested team roles: ${input.teamPlan.members.map((member) => member.role).join(', ')}.`
      : 'Suggested topology: stay with a single agent.',
    topSkills.length > 0 ? `Relevant Lucid skills available: ${topSkills.join(', ')}.` : null,
    topServers.length > 0 ? `Relevant MCP/server options available: ${topServers.join(', ')}.` : null,
    input.runtimeRecommendation ? `Recommended runtime posture: ${input.runtimeRecommendation}.` : null,
  ].filter(Boolean).join(' ')
}

export async function runBuilderPlanningAgent(input: {
  prompt: string
  orgId?: string
  model: string | LanguageModel
  modelId?: string
  templates: TemplateCatalogEntry[]
  intent: GenerationIntent
  templateMatches: TemplateMatch[]
  draft?: GenerationDraft
  preferredMode?: 'auto' | 'template' | 'agent' | 'team'
  runtimeMode?: RuntimeBlueprint['mode']
  planningBackend?: 'local-orchestrator' | 'worker-agent'
  availableUnifiedSkills?: UnifiedSkillItem[]
  deterministicOnly?: boolean
}): Promise<BuilderPlanningResult> {
  const startedAt = Date.now()
  const capabilityRegistry = input.availableUnifiedSkills?.length
    ? buildBuilderCapabilityRegistryFromUnifiedSkills({
        items: input.availableUnifiedSkills,
        templates: input.templates,
      })
    : await getBuilderCapabilityRegistry({
        orgId: input.orgId,
        templates: input.templates,
      })
  const registryReadyAt = Date.now()
  const teamPlan = planBuilderTeamTopology({
    prompt: input.prompt,
    preferredMode: input.preferredMode,
    runtimeMode: input.runtimeMode,
    registry: capabilityRegistry,
  })
  const runtimeRecommendation = recommendRuntimeMode(input.prompt, input.runtimeMode)
  const profileSummary = summarizeBuilderIntentProfile(detectBuilderIntentProfile(input.prompt))
  const capabilitySnapshot = summarizeRelevantBuilderCapabilityRegistry({
    registry: capabilityRegistry,
    prompt: input.prompt,
    templateSlugs: input.templateMatches.map((match) => match.slug),
    mode: teamPlan.mode,
  })

  const deterministicMemo = buildDeterministicPlanningMemo({
    prompt: input.prompt,
    teamPlan,
    runtimeRecommendation,
    capabilityRegistry,
    templateMatches: input.templateMatches,
  })

  const userPrompt = buildPlanningUserPrompt({
    prompt: input.prompt,
    intent: input.intent,
    draft: input.draft,
    preferredMode: input.preferredMode,
    runtimeMode: input.runtimeMode,
    templateMatches: input.templateMatches,
    teamPlan,
    profileSummary,
    capabilitySnapshot,
  })

  try {
    let planningMemo = deterministicMemo
    let plannerSource: 'worker-agent' | 'gateway-text' | 'sdk-tools' | 'deterministic' = 'deterministic'
    const shouldSkipLlmPlanning = input.deterministicOnly
      || (input.planningBackend !== 'worker-agent'
      && !input.draft
      && isSimpleBuilderPrompt(input.prompt))

    if (shouldSkipLlmPlanning) {
      plannerSource = 'deterministic'
    } else if (input.planningBackend === 'worker-agent') {
      const result = await runInternalTextAgent({
        profile: 'builder-planner',
        orgId: input.orgId ?? 'lucid-internal',
        systemPrompt: buildPlanningSystemPrompt(),
        prompt: userPrompt,
        requestedModelId: input.modelId || (typeof input.model === 'string' ? input.model : undefined),
        temperature: 0.2,
        maxTokens: 600,
      })
      planningMemo = result.text?.trim() || deterministicMemo
      plannerSource = result.backend === 'worker-agent' ? 'worker-agent' : 'deterministic'
    } else if (typeof input.model === 'string') {
      const result = await gatewayGenerateText({
        model: input.model,
        system: buildPlanningSystemPrompt(),
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.2,
        maxTokens: 300,
      })
      planningMemo = result.text?.trim() || deterministicMemo
      plannerSource = 'gateway-text'
    } else {
      const result = await aiGenerateText({
        model: input.model,
        system: buildPlanningSystemPrompt(),
        messages: [{ role: 'user', content: userPrompt }],
        tools: createBuilderPlanningTools({
          prompt: input.prompt,
          preferredMode: input.preferredMode,
          runtimeMode: input.runtimeMode,
          draft: input.draft,
          templates: input.templates,
          registry: capabilityRegistry,
        }),
        toolChoice: 'auto',
        stopWhen: stepCountIs(4),
        temperature: 0.2,
        maxOutputTokens: 300,
      })
      planningMemo = result.text?.trim() || deterministicMemo
      plannerSource = 'sdk-tools'
    }

    logBuilderTelemetry('[builder:planning]', {
      orgId: input.orgId,
      planningBackend: input.planningBackend ?? 'local-orchestrator',
      plannerSource,
      templateMatches_count: input.templateMatches.length,
      registry_ms: registryReadyAt - startedAt,
      registrySource: input.availableUnifiedSkills?.length ? 'request' : 'database',
      planning_ms: Date.now() - registryReadyAt,
      total_ms: Date.now() - startedAt,
    })

    return {
      capabilityRegistry,
      capabilitySnapshot,
      teamPlan,
      runtimeRecommendation,
      planningMemo,
    }
  } catch {
    logBuilderTelemetry('[builder:planning]', {
      orgId: input.orgId,
      planningBackend: input.planningBackend ?? 'local-orchestrator',
      plannerSource: 'deterministic-fallback',
      registry_ms: registryReadyAt - startedAt,
      registrySource: input.availableUnifiedSkills?.length ? 'request' : 'database',
      total_ms: Date.now() - startedAt,
    }, 'warn')
    return {
      capabilityRegistry,
      capabilitySnapshot,
      teamPlan,
      runtimeRecommendation,
      planningMemo: deterministicMemo,
    }
  }
}
