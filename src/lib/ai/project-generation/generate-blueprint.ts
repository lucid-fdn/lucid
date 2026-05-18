import type { LanguageModel } from 'ai'
import type { RuntimeBlueprint } from '@contracts/project-blueprint'
import type { AgentTemplateSpec, TemplateCatalogEntry } from '@contracts/template'
import type { UnifiedSkillItem } from '@contracts/unified-skill'
import { z } from 'zod'

import { generateStructuredObject } from '@/lib/ai/generation'
import { getTemplateRecommendationHintsBySlug } from '@/lib/templates/registry'
import { logBuilderTelemetry } from '@/lib/ai/project-generation/builder-telemetry'
import {
  decideBuilderTopology,
  extractBuilderTopologyIntent,
  shouldUseTopologyLlm,
  type BuilderTopologyDecision,
} from '@/lib/agent-builder/topology'

import { runBuilderPlanningAgent } from './builder-agent'
import {
  detectBuilderIntentProfile,
  recommendProfileCapabilities,
  summarizeBuilderIntentProfile,
  type BuilderIntentProfile,
} from './intent-profiles'
import type { BuilderTeamTopologyPlan } from './team-planner'
import { deriveGenerationIntent, extractGenerationIntent, isSimpleBuilderPrompt } from './intent'
import {
  type BuilderCapabilityRegistry,
  getBuilderCapabilityRegistry,
} from '@/lib/ai/capabilities/registry'
import {
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
  buildPatchSystemPrompt,
  buildPatchUserPrompt,
} from './prompts'
import {
  applyTemplateParamsToDraft,
  buildDraftFromTemplate,
  createBlankAgentDraft,
  applyGenerationPatch,
  projectBlueprintFromDraft,
  resolveDraftPreviewSpec,
} from './draft'
import {
  aiGenerationDraftSchema,
  aiGenerationPatchSchema,
  type BuilderClarification,
  generationDraftSchema,
  generationPatchSchema,
  normalizeGenerationDraft,
  normalizeGenerationPatch,
  type GeneratedBlueprintResult,
  type GenerationDraft,
  type GenerationIntent,
  type TemplateMatch,
} from './schemas'
import { normalizeBuilderText, normalizeBuilderToken } from './normalization'
import { shortlistTemplates } from './template-shortlist'
import { applyUnsupportedChannelNotes } from './unsupported-channel-requests'
import { validateAndRepairDraft } from './validate'
import { convertDraftToAgent, convertDraftToTeam } from './structure'

const FAST_MODEL_FALLBACK = 'openai/gpt-4.1-mini'
const MIN_PROFILE_TEMPLATE_MATCH_SCORE = 0.45

function shouldUseDeterministicFirstPass(input: {
  prompt: string
  selectedTemplateSlug?: string
  preferredMode?: 'auto' | 'template' | 'agent' | 'team'
}): boolean {
  if (process.env.LUCID_BUILDER_LLM_FIRST_PASS === 'true') return false
  if (input.selectedTemplateSlug || input.preferredMode === 'template') return true
  return true
}

function getTemplateShortlistLimit(prompt: string): number {
  return isSimpleBuilderPrompt(prompt) ? 4 : 8
}

function buildTemplateRecommendation(templateMatches: Array<{ name: string; score: number }>): string | null {
  const best = templateMatches[0]
  if (!best) return null
  if (best.score >= 0.72) {
    return `High-confidence template fit: start from "${best.name}" unless the user asks for a blank setup.`
  }
  if (best.score >= 0.48) {
    return `Medium-confidence template fit: consider "${best.name}" first, but keep blank-agent as a fallback if the structure feels too rigid.`
  }
  return null
}

function buildProfileHint(profile: BuilderIntentProfile | null) {
  if (!profile) return undefined
  return {
    id: profile.id,
    label: profile.label,
    description: profile.description,
    suggested_integrations: profile.suggestedIntegrations,
    follow_up_question: profile.followUpQuestion,
  }
}

function getSuggestedIntegrationsFromTemplates(templateMatches: Array<{ slug: string; score: number }>): string[] {
  return Array.from(new Set(
    templateMatches
      .filter((match) => match.score >= 0.48)
      .slice(0, 2)
      .flatMap((match) => getTemplateRecommendationHintsBySlug(match.slug)?.recommendedIntegrations ?? []),
  ))
}

function buildTemplateSuggestedCapabilities(input: {
  templates: TemplateCatalogEntry[]
  templateMatches: Array<{ slug: string; score: number }>
  registry: BuilderCapabilityRegistry
  selectedSkillSlugs?: string[]
  selectedPluginSlugs?: string[]
  selectedToolServerNames?: string[]
}) {
  const selectedSkills = new Set(input.selectedSkillSlugs ?? [])
  const selectedPlugins = new Set(input.selectedPluginSlugs ?? [])
  const selectedServers = new Set(input.selectedToolServerNames ?? [])
  const templatesBySlug = new Map(input.templates.map((template) => [template.slug, template]))
  const candidateTemplates = input.templateMatches
    .filter((match) => match.score >= 0.48)
    .slice(0, 2)
    .map((match) => templatesBySlug.get(match.slug))
    .filter((template): template is TemplateCatalogEntry => Boolean(template))

  if (candidateTemplates.length === 0) {
    return {
      skills: [],
      plugins: [],
      tool_servers: [],
    }
  }

  const wantedSkills = new Set<string>()
  const wantedPlugins = new Set<string>()
  const wantedServers = new Set<string>()

  for (const template of candidateTemplates) {
    if (template.spec.kind === 'agent') {
      for (const skill of template.spec.skills ?? []) wantedSkills.add(skill)
      for (const plugin of template.spec.plugins ?? []) wantedPlugins.add(plugin)
      for (const server of template.spec.tool_servers ?? []) wantedServers.add(server.name)
    } else {
      for (const member of template.spec.members) {
        for (const skill of member.skills ?? []) wantedSkills.add(skill)
        for (const plugin of member.plugins ?? []) wantedPlugins.add(plugin)
        for (const server of member.tool_servers ?? []) wantedServers.add(server.name)
      }
    }
  }

  return {
    skills: input.registry.skills
      .filter((skill) => wantedSkills.has(skill.slug) && !selectedSkills.has(skill.slug))
      .slice(0, 4)
      .map((skill) => ({
        slug: skill.slug,
        name: skill.name,
        source: skill.source,
      })),
    plugins: input.registry.plugins
      .filter((plugin) => wantedPlugins.has(plugin.slug) && !selectedPlugins.has(plugin.slug))
      .slice(0, 4)
      .map((plugin) => ({
        slug: plugin.slug,
        name: plugin.name,
        installed: plugin.installed,
        ...(plugin.iconUrl ? { icon_url: plugin.iconUrl } : {}),
      })),
    tool_servers: input.registry.toolServers
      .filter((server) => wantedServers.has(server.name) && !selectedServers.has(server.name))
      .slice(0, 3)
      .map((server) => ({
        name: server.name,
        transport: server.transport,
        url: server.url,
        source: server.source,
      })),
  }
}

function hasSuggestedCapabilities(input: {
  skills?: Array<unknown>
  plugins?: Array<unknown>
  tool_servers?: Array<unknown>
}) {
  return Boolean((input.skills?.length ?? 0) || (input.plugins?.length ?? 0) || (input.tool_servers?.length ?? 0))
}

function buildBuilderClarification(input: {
  prompt: string
  profile: BuilderIntentProfile | null
  confidence: number
  draft: GenerationDraft
  templateMatches: Array<{ slug: string; name: string; score: number }>
  suggestedCapabilities: { skills?: Array<unknown>; plugins?: Array<unknown>; tool_servers?: Array<unknown> }
  topologyDecision?: BuilderTopologyDecision | null
}): BuilderClarification | undefined {
  if (input.topologyDecision?.topology === 'clarify' && input.topologyDecision.clarification) {
    return {
      needed: true,
      level: 'medium',
      ambiguity_class: 'topology',
      reason: input.topologyDecision.rationale,
      question: input.topologyDecision.clarification.question,
      options: input.topologyDecision.clarification.options,
    }
  }

  if (input.draft.mode === 'template') return undefined

  if (input.draft.mode === 'blank-team' && input.confidence < 0.52) {
    return {
      needed: true,
      level: 'low',
      ambiguity_class: 'topology',
      reason: 'This request could work either as one operator or as a coordinated team.',
      question: 'Should this stay a single agent or become a team?',
      options: [
        {
          id: 'single-agent',
          label: 'Single agent',
          description: 'Keep it simple with one operator.',
          submit_message: 'Keep this as a single agent.',
        },
        {
          id: 'team',
          label: 'Team',
          description: 'Split responsibilities across multiple roles.',
          submit_message: 'Convert this into a coordinated team.',
        },
      ],
    }
  }

  return undefined
}

function buildCapabilitySummary(
  draft: GenerationDraft,
  registry: BuilderCapabilityRegistry,
): {
  skills: Array<{ slug: string; name: string; source: 'internal' | 'catalog' | 'org-installed' }>
  plugins: Array<{ slug: string; name: string; installed: boolean; icon_url?: string | null }>
  tool_servers: Array<{ name: string; transport: 'http' | 'sse'; url: string; source: 'plugin-catalog' | 'skill-variant' }>
} {
  const selectedSkills = new Set<string>()
  const selectedPlugins = new Set<string>()
  const selectedServers = new Set<string>()

  if (draft.agent) {
    for (const skill of draft.agent.skills ?? []) selectedSkills.add(skill)
    for (const plugin of draft.agent.plugins ?? []) selectedPlugins.add(plugin)
    for (const server of draft.agent.tool_servers ?? []) selectedServers.add(server.url || server.name)
  }

  if (draft.team) {
    for (const member of draft.team.members) {
      for (const skill of member.skills ?? []) selectedSkills.add(skill)
      for (const plugin of member.plugins ?? []) selectedPlugins.add(plugin)
      for (const server of member.tool_servers ?? []) selectedServers.add(server.url || server.name)
    }
  }

  return {
    skills: registry.skills
      .filter((skill) => selectedSkills.has(skill.slug))
      .map((skill) => ({
        slug: skill.slug,
        name: skill.name,
        source: skill.source,
      })),
    plugins: registry.plugins
      .filter((plugin) => selectedPlugins.has(plugin.slug))
      .map((plugin) => ({
        slug: plugin.slug,
        name: plugin.name,
        installed: plugin.installed,
        ...(plugin.iconUrl ? { icon_url: plugin.iconUrl } : {}),
      })),
    tool_servers: registry.toolServers
      .filter((server) => selectedServers.has(server.url) || selectedServers.has(server.name))
      .map((server) => ({
        name: server.name,
        transport: server.transport,
        url: server.url,
        source: server.source,
      })),
  }
}

function filterTemplateMatchesForProfile(input: {
  matches: TemplateMatch[]
  profile: BuilderIntentProfile | null
  selectedTemplateSlug?: string
  preferredMode?: 'auto' | 'template' | 'agent' | 'team'
}): TemplateMatch[] {
  if (!input.profile) return input.matches
  if (input.preferredMode === 'template') return input.matches

  return input.matches.filter((match) => {
    if (input.selectedTemplateSlug && match.slug === input.selectedTemplateSlug) return true
    if (match.score >= 0.82) return true

    const hints = getTemplateRecommendationHintsBySlug(match.slug)
    return hints?.archetype === input.profile?.archetype
      && match.score >= MIN_PROFILE_TEMPLATE_MATCH_SCORE
  })
}

function buildDeterministicInitialResult(input: {
  prompt: string
  profile: BuilderIntentProfile | null
  preferredMode?: 'auto' | 'template' | 'agent' | 'team'
  runtimeMode?: RuntimeBlueprint['mode']
  topologyDecision: BuilderTopologyDecision
  planning: Awaited<ReturnType<typeof runBuilderPlanningAgent>>
  templatesBySlug: Map<string, TemplateCatalogEntry>
  templateMatches: TemplateMatch[]
  templateSuggestedIntegrations: string[]
}): GeneratedBlueprintResult | null {
  if (!input.profile) return null
  if (input.preferredMode === 'template' || input.preferredMode === 'team') return null
  if (input.topologyDecision.topology !== 'single-agent') return null

  const profile = input.profile
  const trustedTemplateMatch = input.templateMatches.find((match) => isTrustedProfileTemplateMatch(match, profile))
  const topTemplate = trustedTemplateMatch ? input.templatesBySlug.get(trustedTemplateMatch.slug) ?? null : null
  const agentSpec = topTemplate ? getTemplateAgentSpec(topTemplate) : null
  const projectName = getProfileProjectName(input.profile)
  const description = topTemplate?.description || input.profile.description
  const systemPrompt = agentSpec?.system_prompt
    ? normalizeTemplateSystemPrompt(agentSpec.system_prompt)
    : [
        `You are ${projectName} operating inside Lucid.`,
        '',
        `Mission: ${input.profile.description}`,
        '',
        `User request: ${input.prompt}`,
        '',
        'Keep output concise, operational, and specific. Ask one focused question when required context is missing.',
      ].join('\n')

  const draft = createBlankAgentDraft({
    prompt: input.prompt,
    projectName,
    projectDescription: description,
    starterName: projectName,
    systemPrompt,
    category: topTemplate?.category,
    runtime: {
      mode: input.runtimeMode ?? input.planning.runtimeRecommendation ?? 'shared',
    },
  })

  const templatedAgent = agentSpec
    ? {
        ...agentSpec,
        kind: 'agent' as const,
        system_prompt: systemPrompt,
        description: agentSpec.description ?? description,
      }
    : {
        ...draft.agent,
        kind: 'agent' as const,
        system_prompt: systemPrompt,
        description,
        memory_enabled: true,
        memory_strategy: 'auto' as const,
      }

  const validated = validateAndRepairDraft({
    ...draft,
    agent: templatedAgent,
  }, input.templatesBySlug)
  const finalizedDraft = finalizeBuilderDraft(validated.draft, input.prompt, {
    profile: input.profile,
    templateMatches: input.templateMatches,
  })
  const unsupportedChannels = applyUnsupportedChannelNotes(
    finalizedDraft,
    input.prompt,
    input.planning.capabilityRegistry,
  )
  const finalDraft = unsupportedChannels.draft
  const previewSpec = resolveDraftPreviewSpec(finalDraft, input.templatesBySlug)
  const capabilitySummary = buildCapabilitySummary(finalDraft, input.planning.capabilityRegistry)
  const availableCapabilities = buildAvailableCapabilities(input.planning.capabilityRegistry)
  const templateSuggestedCapabilities = buildTemplateSuggestedCapabilities({
    templates: Array.from(input.templatesBySlug.values()),
    templateMatches: input.templateMatches,
    registry: input.planning.capabilityRegistry,
    selectedSkillSlugs: finalDraft.agent?.skills,
    selectedPluginSlugs: finalDraft.agent?.plugins,
    selectedToolServerNames: finalDraft.agent?.tool_servers?.map((server) => server.name),
  })
  const profileSuggestedCapabilities = recommendProfileCapabilities({
    profile: input.profile,
    registry: input.planning.capabilityRegistry,
    selectedSkillSlugs: finalDraft.agent?.skills,
    selectedPluginSlugs: finalDraft.agent?.plugins,
    selectedToolServerNames: finalDraft.agent?.tool_servers?.map((server) => server.name),
  })
  const suggestedCapabilities = hasSuggestedCapabilities(templateSuggestedCapabilities)
    ? templateSuggestedCapabilities
    : profileSuggestedCapabilities
  const clarification = buildBuilderClarification({
    prompt: input.prompt,
    profile: input.profile,
    confidence: 0.82,
    draft: finalDraft,
    templateMatches: input.templateMatches,
    suggestedCapabilities,
    topologyDecision: input.topologyDecision,
  })

  return {
    mode: finalDraft.mode,
    draft: finalDraft,
    blueprint: projectBlueprintFromDraft(finalDraft),
    reasoning_summary: topTemplate
      ? `Started from the official ${topTemplate.name} template shape and kept the setup editable.`
      : `Started from the ${input.profile.label.toLowerCase()} profile and kept the setup editable.`,
    template_matches: hydrateMissingParams(input.templateMatches, input.templatesBySlug, finalDraft),
    ...(previewSpec ? { preview_spec: previewSpec } : {}),
    warnings: [
      ...validated.warnings,
      ...unsupportedChannels.warnings,
    ],
    missing_required_inputs: validated.missingRequiredInputs,
    suggested_integrations: input.templateSuggestedIntegrations.length > 0
      ? input.templateSuggestedIntegrations
      : input.profile.suggestedIntegrations,
    capability_summary: capabilitySummary,
    available_capabilities: availableCapabilities,
    suggested_capabilities: suggestedCapabilities,
    ...(!hasSuggestedCapabilities(templateSuggestedCapabilities) ? { profile_hint: buildProfileHint(input.profile) } : {}),
    ...(clarification ? { clarification } : {}),
    topology_decision: input.topologyDecision,
    confidence: 0.82,
  }
}

function buildDeterministicGenericInitialResult(input: {
  prompt: string
  profile: BuilderIntentProfile | null
  runtimeMode?: RuntimeBlueprint['mode']
  topologyDecision: BuilderTopologyDecision
  planning: Awaited<ReturnType<typeof runBuilderPlanningAgent>>
  templatesBySlug: Map<string, TemplateCatalogEntry>
  templateMatches: TemplateMatch[]
  templateSuggestedIntegrations: string[]
}): GeneratedBlueprintResult {
  const topTemplate = input.templateMatches[0]
  const matchedTemplate = topTemplate && topTemplate.score >= 0.9
    ? input.templatesBySlug.get(topTemplate.slug) ?? null
    : null

  if (
    matchedTemplate
    && matchedTemplate.kind === (input.topologyDecision.topology === 'team' ? 'team' : 'agent')
    && topTemplate?.missing_params.length === 0
  ) {
    return buildDeterministicTemplateResult({
      prompt: input.prompt,
      template: matchedTemplate,
      runtimeMode: input.runtimeMode,
      topologyDecision: input.topologyDecision,
      templatesBySlug: input.templatesBySlug,
      templateMatches: input.templateMatches,
      templateSuggestedIntegrations: input.templateSuggestedIntegrations,
      planning: input.planning,
    })
  }

  const projectName = suggestProjectName(input.prompt, {
    profile: input.profile,
    templateMatches: input.templateMatches,
  })
  const description = input.profile?.description
    ?? `Operate ${projectName} inside Lucid with direct, structured execution.`
  const baseDraft = createBlankAgentDraft({
    prompt: input.prompt,
    projectName,
    projectDescription: description,
    starterName: projectName,
    systemPrompt: [
      `You are ${projectName} operating inside Lucid.`,
      '',
      `Mission: ${description}`,
      '',
      `User request: ${input.prompt}`,
      '',
      'Keep output concise, operational, and specific. Ask one focused question when required context is missing.',
    ].join('\n'),
    runtime: {
      mode: input.runtimeMode ?? input.planning.runtimeRecommendation ?? 'shared',
    },
  })
  const plannedDraft = applyPlanningDefaults(
    input.topologyDecision.topology === 'team' ? convertDraftToTeam(baseDraft) : baseDraft,
    input.planning.teamPlan,
    input.planning.runtimeRecommendation,
  )
  const topologyConstrainedDraft = enforceTopologyDecision(plannedDraft, input.topologyDecision)
  const validated = validateAndRepairDraft(topologyConstrainedDraft, input.templatesBySlug)
  const finalizedDraft = finalizeBuilderDraft(validated.draft, input.prompt, {
    profile: input.profile,
    templateMatches: input.templateMatches,
  })
  const unsupportedChannels = applyUnsupportedChannelNotes(
    finalizedDraft,
    input.prompt,
    input.planning.capabilityRegistry,
  )
  const finalDraft = unsupportedChannels.draft
  const previewSpec = resolveDraftPreviewSpec(finalDraft, input.templatesBySlug)
  const capabilitySummary = buildCapabilitySummary(finalDraft, input.planning.capabilityRegistry)
  const availableCapabilities = buildAvailableCapabilities(input.planning.capabilityRegistry)
  const templateSuggestedCapabilities = buildTemplateSuggestedCapabilities({
    templates: Array.from(input.templatesBySlug.values()),
    templateMatches: input.templateMatches,
    registry: input.planning.capabilityRegistry,
    selectedSkillSlugs: finalDraft.agent?.skills,
    selectedPluginSlugs: finalDraft.agent?.plugins,
    selectedToolServerNames: finalDraft.agent?.tool_servers?.map((server) => server.name),
  })
  const profileSuggestedCapabilities = recommendProfileCapabilities({
    profile: input.profile,
    registry: input.planning.capabilityRegistry,
    selectedSkillSlugs: finalDraft.agent?.skills,
    selectedPluginSlugs: finalDraft.agent?.plugins,
    selectedToolServerNames: finalDraft.agent?.tool_servers?.map((server) => server.name),
  })
  const suggestedCapabilities = hasSuggestedCapabilities(templateSuggestedCapabilities)
    ? templateSuggestedCapabilities
    : profileSuggestedCapabilities
  const clarification = buildBuilderClarification({
    prompt: input.prompt,
    profile: input.profile,
    confidence: input.topologyDecision.topology === 'clarify' ? 0.56 : 0.78,
    draft: finalDraft,
    templateMatches: input.templateMatches,
    suggestedCapabilities,
    topologyDecision: input.topologyDecision,
  })

  return {
    mode: finalDraft.mode,
    draft: finalDraft,
    blueprint: projectBlueprintFromDraft(finalDraft),
    reasoning_summary: input.topologyDecision.topology === 'clarify'
      ? 'Kept a conservative single-agent draft while asking the user to choose the structure.'
      : `Started from a fast deterministic ${finalDraft.mode === 'blank-team' ? 'team' : 'agent'} setup and kept it editable.`,
    template_matches: hydrateMissingParams(input.templateMatches, input.templatesBySlug, finalDraft),
    ...(previewSpec ? { preview_spec: previewSpec } : {}),
    warnings: [
      ...validated.warnings,
      ...unsupportedChannels.warnings,
      ...buildLowConfidenceWarnings(input.topologyDecision.confidence, finalDraft.mode),
    ],
    missing_required_inputs: validated.missingRequiredInputs,
    suggested_integrations: input.templateSuggestedIntegrations.length > 0
      ? input.templateSuggestedIntegrations
      : (input.profile?.suggestedIntegrations ?? []),
    capability_summary: capabilitySummary,
    available_capabilities: availableCapabilities,
    suggested_capabilities: suggestedCapabilities,
    ...(!hasSuggestedCapabilities(templateSuggestedCapabilities) && input.profile ? { profile_hint: buildProfileHint(input.profile) } : {}),
    ...(clarification ? { clarification } : {}),
    topology_decision: input.topologyDecision,
    confidence: input.topologyDecision.topology === 'clarify' ? 0.56 : 0.78,
  }
}

function findExplicitTemplateReference(
  prompt: string,
  templates: TemplateCatalogEntry[],
): TemplateCatalogEntry | null {
  const normalizedPrompt = normalizeBuilderText(prompt)
  if (!/\btemplate\b/.test(normalizedPrompt)) return null

  return templates.find((template) => {
    const normalizedName = normalizeBuilderText(template.name)
    if (!normalizedName) return false
    return normalizedPrompt.includes(normalizedName)
  }) ?? null
}

function readTemplateProjectName(prompt: string, template: TemplateCatalogEntry): string {
  const subject =
    readQuoted(prompt, /for\s+"([^"]+)"/i)
    ?? prompt.match(/\bfor\s+([A-Z][\p{L}\p{N}&.' -]{1,40})(?:\s+and\b|,|\.|$)/u)?.[1]?.trim()

  if (!subject) return template.name
  const cleanedSubject = subject.replace(/\s+/g, ' ').trim()
  if (!cleanedSubject) return template.name
  if (normalizeBuilderText(template.name).includes(normalizeBuilderText(cleanedSubject))) {
    return template.name
  }
  return `${cleanedSubject} ${template.name}`
}

function buildDeterministicTemplateResult(input: {
  prompt: string
  template: TemplateCatalogEntry
  runtimeMode?: RuntimeBlueprint['mode']
  topologyDecision: BuilderTopologyDecision
  templatesBySlug: Map<string, TemplateCatalogEntry>
  templateMatches: TemplateMatch[]
  templateSuggestedIntegrations: string[]
  planning: Awaited<ReturnType<typeof runBuilderPlanningAgent>>
}): GeneratedBlueprintResult {
  const draft = buildDraftFromTemplate(input.template, {
    prompt: input.prompt,
    projectName: readTemplateProjectName(input.prompt, input.template),
    runtime: {
      mode: input.runtimeMode ?? input.planning.runtimeRecommendation ?? 'shared',
    },
    params: {},
  })
  const validated = validateAndRepairDraft(draft, input.templatesBySlug)
  const finalDraft = validated.draft
  const previewSpec = resolveDraftPreviewSpec(finalDraft, input.templatesBySlug)
  const capabilitySummary = buildCapabilitySummary(finalDraft, input.planning.capabilityRegistry)
  const availableCapabilities = buildAvailableCapabilities(input.planning.capabilityRegistry)
  const templateSuggestedCapabilities = buildTemplateSuggestedCapabilities({
    templates: Array.from(input.templatesBySlug.values()),
    templateMatches: input.templateMatches.length > 0
      ? input.templateMatches
      : [{
          slug: input.template.slug,
          name: input.template.name,
          kind: input.template.kind,
          score: 1,
          reason: 'explicit template request',
          missing_params: [],
        }],
    registry: input.planning.capabilityRegistry,
  })

  return {
    mode: finalDraft.mode,
    draft: finalDraft,
    blueprint: projectBlueprintFromDraft(finalDraft),
    reasoning_summary: `Started from the official ${input.template.name} template because the user requested it explicitly.`,
    template_matches: hydrateMissingParams(input.templateMatches, input.templatesBySlug, finalDraft),
    selected_template: finalDraft.template,
    ...(previewSpec ? { preview_spec: previewSpec } : {}),
    warnings: validated.warnings,
    missing_required_inputs: validated.missingRequiredInputs,
    suggested_integrations: input.templateSuggestedIntegrations,
    capability_summary: capabilitySummary,
    available_capabilities: availableCapabilities,
    suggested_capabilities: templateSuggestedCapabilities,
    topology_decision: input.topologyDecision,
    confidence: 0.92,
  }
}

function getTemplateAgentSpec(template: TemplateCatalogEntry): AgentTemplateSpec | null {
  return template.spec.kind === 'agent' ? template.spec : null
}

function isTrustedProfileTemplateMatch(match: TemplateMatch, profile: BuilderIntentProfile): boolean {
  if (match.kind !== 'agent') return false
  if (match.score < 0.72) return false

  const hints = getTemplateRecommendationHintsBySlug(match.slug)
  if (!hints?.archetype) return false

  return hints.archetype === getProfileTemplateArchetype(profile)
}

function getProfileTemplateArchetype(profile: BuilderIntentProfile) {
  return profile.archetype
}

function normalizeTemplateSystemPrompt(systemPrompt: string): string {
  return systemPrompt
    .replace(/\{\{\s*OWNER_NAME\s*\}\}/gu, 'the user')
    .replace(/\{\{\s*([^}]+)\s*\}\}/gu, '$1')
}

function getProfileProjectName(profile: BuilderIntentProfile): string {
  switch (profile.id) {
    case 'personal-agent':
      return 'Personal Assistant'
    case 'executive-assistant':
      return 'Executive Assistant'
    case 'research-agent':
      return 'Research Assistant'
    case 'sales-agent':
      return 'Sales Assistant'
    case 'support-agent':
      return 'Support Assistant'
  }
}

function buildAvailableCapabilities(
  registry: BuilderCapabilityRegistry,
): {
  skills: Array<{ slug: string; name: string; source: 'internal' | 'catalog' | 'org-installed' }>
  plugins: Array<{ slug: string; name: string; installed: boolean; icon_url?: string | null }>
  tool_servers: Array<{ name: string; transport: 'http' | 'sse'; url: string; source: 'plugin-catalog' | 'skill-variant' }>
} {
  return {
    skills: registry.skills.map((skill) => ({
      slug: skill.slug,
      name: skill.name,
      source: skill.source,
    })),
    plugins: registry.plugins.map((plugin) => ({
      slug: plugin.slug,
      name: plugin.name,
      installed: plugin.installed,
      ...(plugin.iconUrl ? { icon_url: plugin.iconUrl } : {}),
    })),
    tool_servers: registry.toolServers.map((server) => ({
      name: server.name,
      transport: server.transport,
      url: server.url,
      source: server.source,
    })),
  }
}

async function resolveBuilderTopologyDecision(input: {
  prompt: string
  preferredMode?: 'auto' | 'template' | 'agent' | 'team'
  selectedTemplate?: Pick<TemplateCatalogEntry, 'slug' | 'name' | 'kind'> | null
  templateMatches: TemplateMatch[]
  intent: GenerationIntent
  model: string | LanguageModel
  allowLlm?: boolean
  telemetry?: {
    userId?: string
    orgId?: string
    modelId?: string
  }
}): Promise<{ decision: BuilderTopologyDecision; llmUsed: boolean; elapsedMs: number }> {
  const startedAt = Date.now()
  const firstPass = decideBuilderTopology({
    prompt: input.prompt,
    preferredMode: input.preferredMode,
    selectedTemplate: input.selectedTemplate,
    templateMatches: input.templateMatches,
    intent: input.intent,
  })

  if (!shouldUseTopologyLlm({
    prompt: input.prompt,
    preferredMode: input.preferredMode,
    selectedTemplate: input.selectedTemplate,
    firstPass,
  }) || input.allowLlm === false) {
    return {
      decision: firstPass,
      llmUsed: false,
      elapsedMs: Date.now() - startedAt,
    }
  }

  try {
    const llmIntent = await extractBuilderTopologyIntent({
      model: input.model,
      prompt: input.prompt,
      telemetry: input.telemetry,
    })
    const decision = decideBuilderTopology({
      prompt: input.prompt,
      preferredMode: input.preferredMode,
      selectedTemplate: input.selectedTemplate,
      templateMatches: input.templateMatches,
      intent: input.intent,
      llmIntent,
    })

    return {
      decision,
      llmUsed: true,
      elapsedMs: Date.now() - startedAt,
    }
  } catch {
    return {
      decision: firstPass,
      llmUsed: false,
      elapsedMs: Date.now() - startedAt,
    }
  }
}

export async function generateProjectBlueprint(input: {
  prompt: string
  templates: TemplateCatalogEntry[]
  strongModel: string | LanguageModel
  fastModel?: string | LanguageModel
  strongModelId?: string
  preferredMode?: 'auto' | 'template' | 'agent' | 'team'
  selectedTemplateSlug?: string
  runtimeMode?: RuntimeBlueprint['mode']
  planningBackend?: 'local-orchestrator' | 'worker-agent'
  availableUnifiedSkills?: UnifiedSkillItem[]
  telemetry?: {
    userId?: string
    orgId?: string
    modelId?: string
    fastModelId?: string
  }
}): Promise<GeneratedBlueprintResult> {
  const startedAt = Date.now()
  const deterministicFirstPass = shouldUseDeterministicFirstPass(input)
  const profile = detectBuilderIntentProfile(input.prompt)
  const rawTemplateMatches = shortlistTemplates(input.templates, input.prompt, {
    preferredMode: toGenerationMode(input.preferredMode),
    selectedTemplateSlug: input.selectedTemplateSlug,
    limit: getTemplateShortlistLimit(input.prompt),
  })
  const templateMatches = filterTemplateMatchesForProfile({
    matches: rawTemplateMatches,
    profile,
    selectedTemplateSlug: input.selectedTemplateSlug,
    preferredMode: input.preferredMode,
  })
  const templatesBySlug = new Map(input.templates.map((template) => [template.slug, template]))
  const candidates = templateMatches
    .map((match) => templatesBySlug.get(match.slug))
    .filter((template): template is TemplateCatalogEntry => Boolean(template))

  const intent = deterministicFirstPass || isSimpleBuilderPrompt(input.prompt)
    ? deriveGenerationIntent({
        prompt: input.prompt,
        preferredMode: input.preferredMode,
        selectedTemplateSlug: input.selectedTemplateSlug,
      })
    : await extractGenerationIntent({
        model: input.fastModel ?? input.strongModel,
        prompt: input.prompt,
        preferredMode: input.preferredMode,
        selectedTemplateSlug: input.selectedTemplateSlug,
        telemetry: {
          userId: input.telemetry?.userId,
          orgId: input.telemetry?.orgId,
          modelId: input.telemetry?.fastModelId ?? FAST_MODEL_FALLBACK,
        },
      })

  const outputSchema = z.object({
    draft: aiGenerationDraftSchema,
    reasoning_summary: z.string().trim().min(1),
    confidence: z.number().min(0).max(1),
  })
  const intentReadyAt = Date.now()

  const planning = await runBuilderPlanningAgent({
    prompt: input.prompt,
    orgId: input.telemetry?.orgId,
    model: input.fastModel ?? input.strongModel,
    modelId: input.telemetry?.fastModelId ?? input.strongModelId ?? input.telemetry?.modelId,
    templates: input.templates,
    intent,
    templateMatches,
    preferredMode: input.preferredMode,
    runtimeMode: input.runtimeMode,
    planningBackend: input.planningBackend,
    availableUnifiedSkills: input.availableUnifiedSkills,
    deterministicOnly: deterministicFirstPass,
  })
  const planningReadyAt = Date.now()
  const intentProfileSummary = summarizeBuilderIntentProfile(profile)
  const recommendedTemplateAction = buildTemplateRecommendation(templateMatches)
  const templateSuggestedIntegrations = getSuggestedIntegrationsFromTemplates(templateMatches)
  const explicitTemplate = input.preferredMode !== 'agent' && input.preferredMode !== 'team'
    ? findExplicitTemplateReference(input.prompt, input.templates)
      ?? (/\btemplate\b/.test(normalizeBuilderText(input.prompt)) && templateMatches[0]?.score >= 0.48
        ? templatesBySlug.get(templateMatches[0].slug) ?? null
        : null)
    : null
  const selectedTemplateForTopology = explicitTemplate
    ?? (input.selectedTemplateSlug ? templatesBySlug.get(input.selectedTemplateSlug) ?? null : null)
  const topology = await resolveBuilderTopologyDecision({
    prompt: input.prompt,
    preferredMode: input.preferredMode,
    selectedTemplate: selectedTemplateForTopology,
    templateMatches,
    intent,
    model: input.fastModel ?? input.strongModel,
    allowLlm: !deterministicFirstPass,
    telemetry: {
      userId: input.telemetry?.userId,
      orgId: input.telemetry?.orgId,
      modelId: input.telemetry?.fastModelId ?? FAST_MODEL_FALLBACK,
    },
  })

  if (explicitTemplate) {
    const deterministicTemplateResult = buildDeterministicTemplateResult({
      prompt: input.prompt,
      template: explicitTemplate,
      runtimeMode: input.runtimeMode,
      topologyDecision: topology.decision,
      templatesBySlug,
      templateMatches,
      templateSuggestedIntegrations,
      planning,
    })
    logBuilderTelemetry('[builder:generate-blueprint]', {
      orgId: input.telemetry?.orgId,
      mode: deterministicTemplateResult.mode,
      planningBackend: input.planningBackend ?? 'local-orchestrator',
      source: 'deterministic-template',
      templateSlug: explicitTemplate.slug,
      templateMatches_count: templateMatches.length,
      rawTemplateMatches_count: rawTemplateMatches.length,
      topology_source: topology.decision.source,
      topology: topology.decision.topology,
      topology_confidence: topology.decision.confidence,
      topology_llm_used: topology.llmUsed,
      topology_ms: topology.elapsedMs,
      intent_ms: intentReadyAt - startedAt,
      planning_ms: planningReadyAt - intentReadyAt,
      structured_ms: 0,
      finalize_ms: Date.now() - planningReadyAt,
      total_ms: Date.now() - startedAt,
    })
    return deterministicTemplateResult
  }

  const deterministicInitialResult = buildDeterministicInitialResult({
    prompt: input.prompt,
    profile,
    preferredMode: input.preferredMode,
    runtimeMode: input.runtimeMode,
    topologyDecision: topology.decision,
    planning,
    templatesBySlug,
    templateMatches,
    templateSuggestedIntegrations,
  })
  if (deterministicInitialResult) {
    logBuilderTelemetry('[builder:generate-blueprint]', {
      orgId: input.telemetry?.orgId,
      mode: deterministicInitialResult.mode,
      planningBackend: input.planningBackend ?? 'local-orchestrator',
      source: 'deterministic-initial',
      templateMatches_count: templateMatches.length,
      rawTemplateMatches_count: rawTemplateMatches.length,
      topology_source: topology.decision.source,
      topology: topology.decision.topology,
      topology_confidence: topology.decision.confidence,
      topology_llm_used: topology.llmUsed,
      topology_ms: topology.elapsedMs,
      intent_ms: intentReadyAt - startedAt,
      planning_ms: planningReadyAt - intentReadyAt,
      structured_ms: 0,
      finalize_ms: Date.now() - planningReadyAt,
      total_ms: Date.now() - startedAt,
    })
    return deterministicInitialResult
  }

  if (deterministicFirstPass) {
    const fallback = buildDeterministicGenericInitialResult({
      prompt: input.prompt,
      profile,
      runtimeMode: input.runtimeMode,
      topologyDecision: topology.decision,
      planning,
      templatesBySlug,
      templateMatches,
      templateSuggestedIntegrations,
    })
    logBuilderTelemetry('[builder:generate-blueprint]', {
      orgId: input.telemetry?.orgId,
      mode: fallback.mode,
      planningBackend: input.planningBackend ?? 'local-orchestrator',
      source: 'deterministic-generic',
      templateMatches_count: templateMatches.length,
      rawTemplateMatches_count: rawTemplateMatches.length,
      topology_source: topology.decision.source,
      topology: topology.decision.topology,
      topology_confidence: topology.decision.confidence,
      topology_llm_used: topology.llmUsed,
      topology_ms: topology.elapsedMs,
      intent_ms: intentReadyAt - startedAt,
      planning_ms: planningReadyAt - intentReadyAt,
      structured_ms: 0,
      finalize_ms: Date.now() - planningReadyAt,
      total_ms: Date.now() - startedAt,
    })
    return fallback
  }

  const result = await generateStructuredObject({
    model: input.strongModel,
    schema: outputSchema,
    system: buildGenerationSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: buildGenerationUserPrompt({
          prompt: input.prompt,
          intent,
          templateCandidates: candidates,
          templateMatches,
          capabilitySnapshot: planning.capabilitySnapshot,
          planningMemo: planning.planningMemo,
          teamPlanJson: JSON.stringify(planning.teamPlan, null, 2),
          preferredMode: input.preferredMode,
          runtimeMode: input.runtimeMode,
          intentProfileSummary,
          recommendedTemplateAction,
          topologyDecision: topology.decision,
        }),
      },
    ],
    telemetry: {
      userId: input.telemetry?.userId,
      orgId: input.telemetry?.orgId,
      modelId: input.telemetry?.modelId,
      feature: 'project-generation-draft',
    },
  })
  const structuredReadyAt = Date.now()

  let draft = applyPlanningDefaults(
    normalizeGenerationDraft(result.object.draft),
    planning.teamPlan,
    planning.runtimeRecommendation,
  )
  if (input.runtimeMode && !draft.runtime) {
    draft = {
      ...draft,
      runtime: {
        mode: input.runtimeMode,
      },
    }
  }

  const topologyConstrainedDraft = enforceTopologyDecision(draft, topology.decision)
  const validated = validateAndRepairDraft(topologyConstrainedDraft, templatesBySlug)
  const finalizedDraft = finalizeBuilderDraft(validated.draft, input.prompt, {
    profile,
    templateMatches,
  })
  const unsupportedChannels = applyUnsupportedChannelNotes(
    finalizedDraft,
    input.prompt,
    planning.capabilityRegistry,
  )
  const finalDraft = unsupportedChannels.draft
  const blueprint = projectBlueprintFromDraft(finalDraft)
  const previewSpec = resolveDraftPreviewSpec(finalDraft, templatesBySlug)
  const capabilitySummary = buildCapabilitySummary(finalDraft, planning.capabilityRegistry)
  const availableCapabilities = buildAvailableCapabilities(planning.capabilityRegistry)
  const templateSuggestedCapabilities = buildTemplateSuggestedCapabilities({
    templates: input.templates,
    templateMatches,
    registry: planning.capabilityRegistry,
    selectedSkillSlugs: finalDraft.agent?.skills,
    selectedPluginSlugs: finalDraft.agent?.plugins,
    selectedToolServerNames: finalDraft.agent?.tool_servers?.map((server) => server.name),
  })
  const profileSuggestedCapabilities = recommendProfileCapabilities({
    profile,
    registry: planning.capabilityRegistry,
    selectedSkillSlugs: finalDraft.agent?.skills,
    selectedPluginSlugs: finalDraft.agent?.plugins,
    selectedToolServerNames: finalDraft.agent?.tool_servers?.map((server) => server.name),
  })
  const suggestedCapabilities = hasSuggestedCapabilities(templateSuggestedCapabilities)
    ? templateSuggestedCapabilities
    : profileSuggestedCapabilities
  const clarification = buildBuilderClarification({
    prompt: input.prompt,
    profile,
    confidence: clampConfidence(result.object.confidence || intent.confidence),
    draft: finalDraft,
    templateMatches,
    suggestedCapabilities,
    topologyDecision: topology.decision,
  })

  logBuilderTelemetry('[builder:generate-blueprint]', {
    orgId: input.telemetry?.orgId,
    mode: finalDraft.mode,
    planningBackend: input.planningBackend ?? 'local-orchestrator',
    templateMatches_count: templateMatches.length,
    rawTemplateMatches_count: rawTemplateMatches.length,
    topology_source: topology.decision.source,
    topology: topology.decision.topology,
    topology_confidence: topology.decision.confidence,
    topology_llm_used: topology.llmUsed,
    topology_ms: topology.elapsedMs,
    intent_ms: intentReadyAt - startedAt,
    planning_ms: planningReadyAt - intentReadyAt,
    structured_ms: structuredReadyAt - planningReadyAt,
    finalize_ms: Date.now() - structuredReadyAt,
    total_ms: Date.now() - startedAt,
  })

  return {
    mode: finalDraft.mode,
    draft: finalDraft,
    blueprint,
    reasoning_summary: result.object.reasoning_summary,
    template_matches: hydrateMissingParams(templateMatches, templatesBySlug, finalDraft),
    ...(finalDraft.template ? { selected_template: finalDraft.template } : {}),
    ...(previewSpec ? { preview_spec: previewSpec } : {}),
    warnings: [
      ...validated.warnings,
      ...unsupportedChannels.warnings,
      ...buildLowConfidenceWarnings(intent.confidence, finalDraft.mode),
    ],
    missing_required_inputs: validated.missingRequiredInputs,
    suggested_integrations: templateSuggestedIntegrations.length > 0
      ? templateSuggestedIntegrations
      : (profile?.suggestedIntegrations ?? []),
    capability_summary: capabilitySummary,
    available_capabilities: availableCapabilities,
    suggested_capabilities: suggestedCapabilities,
    ...(!hasSuggestedCapabilities(templateSuggestedCapabilities) && profile ? { profile_hint: buildProfileHint(profile) } : {}),
    ...(clarification ? { clarification } : {}),
    topology_decision: topology.decision,
    confidence: clampConfidence(result.object.confidence || intent.confidence),
  }
}

export async function refineGeneratedDraft(input: {
  prompt: string
  draft: GenerationDraft
  templates: TemplateCatalogEntry[]
  strongModel: string | LanguageModel
  strongModelId?: string
  preferredMode?: 'auto' | 'template' | 'agent' | 'team'
  planningBackend?: 'local-orchestrator' | 'worker-agent'
  availableUnifiedSkills?: UnifiedSkillItem[]
  telemetry?: {
    userId?: string
    orgId?: string
    modelId?: string
  }
}): Promise<GeneratedBlueprintResult> {
  const startedAt = Date.now()
  const profile = detectBuilderIntentProfile(input.prompt)
  const rawTemplateMatches = shortlistTemplates(input.templates, input.prompt, {
    preferredMode: input.preferredMode === 'auto' ? 'auto' : undefined,
    draft: input.draft,
    selectedTemplateSlug: input.draft.template?.slug,
    limit: getTemplateShortlistLimit(input.prompt),
  })
  const templateMatches = filterTemplateMatchesForProfile({
    matches: rawTemplateMatches,
    profile,
    selectedTemplateSlug: input.draft.template?.slug,
    preferredMode: input.preferredMode,
  })
  const templatesBySlug = new Map(input.templates.map((template) => [template.slug, template]))
  const candidates = templateMatches
    .map((match) => templatesBySlug.get(match.slug))
    .filter((template): template is TemplateCatalogEntry => Boolean(template))

  const heuristic = buildHeuristicRefinementResult(input.prompt, input.draft, templatesBySlug, templateMatches)
  const templateSuggestedIntegrations = getSuggestedIntegrationsFromTemplates(templateMatches)
  if (heuristic && (shouldPreferHeuristicRefinement(input.prompt) || input.draft.mode === 'template')) {
    return heuristic
  }

  try {
    const planning = await runBuilderPlanningAgent({
      prompt: input.prompt,
      orgId: input.telemetry?.orgId,
      model: input.strongModel,
      modelId: input.strongModelId ?? input.telemetry?.modelId,
      templates: input.templates,
      intent: {
        requested_domain: undefined,
        requested_outcome: input.prompt,
        likely_mode: input.draft.mode,
        required_integrations: [],
        runtime_preference: input.draft.runtime?.mode,
        missing_required_info: [],
        confidence: 0.72,
        team_needed: input.draft.mode === 'blank-team',
        reuse_template_likely: input.draft.mode === 'template',
      },
      templateMatches,
      draft: input.draft,
      preferredMode: input.preferredMode,
      runtimeMode: input.draft.runtime?.mode,
      planningBackend: input.planningBackend,
      availableUnifiedSkills: input.availableUnifiedSkills,
    })
    const planningReadyAt = Date.now()

    const result = await generateStructuredObject({
      model: input.strongModel,
      schema: aiGenerationPatchSchema,
      system: buildPatchSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: buildPatchUserPrompt({
            prompt: input.prompt,
            draft: input.draft,
            templateCandidates: candidates,
            templateMatches,
            capabilitySnapshot: planning.capabilitySnapshot,
            planningMemo: planning.planningMemo,
            teamPlanJson: JSON.stringify(planning.teamPlan, null, 2),
          }),
        },
      ],
      telemetry: {
        userId: input.telemetry?.userId,
        orgId: input.telemetry?.orgId,
        modelId: input.telemetry?.modelId,
        feature: 'project-generation-patch',
      },
    })
    const structuredReadyAt = Date.now()

    const normalizedPatch = normalizeGenerationPatch(result.object)
    const nextDraft = applyPlanningDefaults(
      applyGenerationPatch(input.draft, normalizedPatch),
      planning.teamPlan,
      planning.runtimeRecommendation,
    )
    const validated = validateAndRepairDraft(nextDraft, templatesBySlug)
    const finalizedDraft = finalizeBuilderDraft(validated.draft, input.prompt, {
      profile,
      templateMatches,
    })
    const unsupportedChannels = applyUnsupportedChannelNotes(
      finalizedDraft,
      input.prompt,
      planning.capabilityRegistry,
    )
    const finalDraft = unsupportedChannels.draft
    const previewSpec = resolveDraftPreviewSpec(finalDraft, templatesBySlug)
    const capabilitySummary = buildCapabilitySummary(finalDraft, planning.capabilityRegistry)
    const availableCapabilities = buildAvailableCapabilities(planning.capabilityRegistry)
    const templateSuggestedCapabilities = buildTemplateSuggestedCapabilities({
      templates: input.templates,
      templateMatches,
      registry: planning.capabilityRegistry,
      selectedSkillSlugs: finalDraft.agent?.skills,
      selectedPluginSlugs: finalDraft.agent?.plugins,
      selectedToolServerNames: finalDraft.agent?.tool_servers?.map((server) => server.name),
    })
    const profileSuggestedCapabilities = recommendProfileCapabilities({
      profile,
      registry: planning.capabilityRegistry,
      selectedSkillSlugs: finalDraft.agent?.skills,
      selectedPluginSlugs: finalDraft.agent?.plugins,
      selectedToolServerNames: finalDraft.agent?.tool_servers?.map((server) => server.name),
    })
    const suggestedCapabilities = hasSuggestedCapabilities(templateSuggestedCapabilities)
      ? templateSuggestedCapabilities
      : profileSuggestedCapabilities
    const clarification = buildBuilderClarification({
      prompt: input.prompt,
      profile,
      confidence: 0.78,
      draft: finalDraft,
      templateMatches,
      suggestedCapabilities,
    })

    logBuilderTelemetry('[builder:refine-draft]', {
      orgId: input.telemetry?.orgId,
      mode: finalDraft.mode,
      planningBackend: input.planningBackend ?? 'local-orchestrator',
      templateMatches_count: templateMatches.length,
      planning_ms: planningReadyAt - startedAt,
      structured_ms: structuredReadyAt - planningReadyAt,
      finalize_ms: Date.now() - structuredReadyAt,
      total_ms: Date.now() - startedAt,
    })

    return {
      mode: finalDraft.mode,
      draft: finalDraft,
      patch: normalizedPatch,
      blueprint: projectBlueprintFromDraft(finalDraft),
      reasoning_summary: normalizedPatch.summary,
      template_matches: hydrateMissingParams(templateMatches, templatesBySlug, finalDraft),
      ...(finalDraft.template ? { selected_template: finalDraft.template } : {}),
      ...(previewSpec ? { preview_spec: previewSpec } : {}),
      warnings: [...validated.warnings, ...unsupportedChannels.warnings],
      missing_required_inputs: validated.missingRequiredInputs,
      suggested_integrations: templateSuggestedIntegrations.length > 0
        ? templateSuggestedIntegrations
        : (profile?.suggestedIntegrations ?? []),
      capability_summary: capabilitySummary,
      available_capabilities: availableCapabilities,
      suggested_capabilities: suggestedCapabilities,
      ...(!hasSuggestedCapabilities(templateSuggestedCapabilities) && profile ? { profile_hint: buildProfileHint(profile) } : {}),
      ...(clarification ? { clarification } : {}),
      confidence: 0.78,
    }
  } catch (error) {
    const fallback = heuristic ?? buildHeuristicRefinementResult(input.prompt, input.draft, templatesBySlug, templateMatches)
    if (fallback) {
      return fallback
    }
    throw error
  }
}

export function seedDraftFromPrompt(prompt: string): GenerationDraft {
  const trimmed = prompt.trim()
  const profile = detectBuilderIntentProfile(trimmed)
  const name = suggestProjectName(trimmed, { profile })

  return createBlankAgentDraft({
    prompt: trimmed,
    projectName: name,
    starterName: name,
    systemPrompt: `You are ${name} operating inside Lucid.\n\nMission:\n${trimmed}`,
  })
}

function hydrateMissingParams(
  templateMatches: GeneratedBlueprintResult['template_matches'],
  templatesBySlug: Map<string, TemplateCatalogEntry>,
  draft: GenerationDraft,
): GeneratedBlueprintResult['template_matches'] {
  return templateMatches.map((match) => {
    const template = templatesBySlug.get(match.slug)
    if (!template) return match
    const params = draft.mode === 'template' && draft.template?.slug === template.slug
      ? draft.template.params
      : {}

    const missing = (template.params ?? [])
      .filter((param) => param.required && !(params[param.key]?.trim()) && !param.default)
      .map((param) => param.key)

    return {
      ...match,
      missing_params: missing,
    }
  })
}

function buildLowConfidenceWarnings(confidence: number, mode: GenerationDraft['mode']): string[] {
  const warnings: string[] = []
  if (confidence < 0.55) {
    warnings.push('The request is ambiguous. Check the generated setup before deploying it.')
  }
  if (mode === 'blank-team' && confidence < 0.72) {
    warnings.push('This was generated as a team. Verify that you really need multiple coordinated roles.')
  }
  return warnings
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))))
}

function enforceTopologyDecision(
  draft: GenerationDraft,
  topologyDecision: BuilderTopologyDecision,
): GenerationDraft {
  if (draft.mode === 'template') return draft
  if (topologyDecision.topology === 'clarify' && draft.mode === 'blank-team') {
    return convertDraftToAgent(draft)
  }
  if (topologyDecision.topology === 'single-agent' && draft.mode === 'blank-team') {
    return convertDraftToAgent(draft)
  }
  if (topologyDecision.topology === 'team' && draft.mode === 'blank-agent') {
    return convertDraftToTeam(draft)
  }
  return draft
}

function applyPlanningDefaults(
  draft: GenerationDraft,
  teamPlan: BuilderTeamTopologyPlan,
  runtimeRecommendation?: RuntimeBlueprint['mode'],
): GenerationDraft {
  const nextDraft = structuredClone(draft) as GenerationDraft

  if (runtimeRecommendation && !nextDraft.runtime?.mode) {
    nextDraft.runtime = {
      ...(nextDraft.runtime ?? {}),
      mode: runtimeRecommendation,
    }
  }

  if (nextDraft.mode === 'blank-team' && nextDraft.team && teamPlan.mode === 'blank-team') {
    if (!nextDraft.team.objective?.trim() && teamPlan.objective?.trim()) {
      nextDraft.team.objective = teamPlan.objective
    }

    nextDraft.team.members = nextDraft.team.members.map((member, index) => {
      const planned = teamPlan.members[index]
      if (!planned) return member

      return {
        ...member,
        description: member.description?.trim() ? member.description : planned.description,
        responsibilities:
          member.responsibilities?.length ? member.responsibilities : planned.responsibilities,
        ...(member.skills?.length ? {} : planned.skills?.length ? { skills: planned.skills } : {}),
      }
    })

    if (nextDraft.team.edges.length === 0 && teamPlan.edges.length > 0) {
      nextDraft.team.edges = teamPlan.edges
    }
  }

  return generationDraftSchema.parse(nextDraft)
}

function suggestProjectName(
  prompt: string,
  input?: {
    profile?: BuilderIntentProfile | null
    templateMatches?: Array<{ name: string; score: number }>
  },
): string {
  const explicitName =
    readQuoted(prompt, /name the project\s+"([^"]+)"/i) ??
    readQuoted(prompt, /project named\s+"([^"]+)"/i) ??
    readQuoted(prompt, /call the project\s+"([^"]+)"/i)
  if (explicitName) return explicitName

  const contextual = suggestContextualProjectName(prompt, input?.profile, input?.templateMatches)
  if (contextual) return contextual

  const normalized = prompt
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()

  const stripped = normalized
    .replace(/^(please\s+)?(build|create|make|start|launch|set\s*up|setup|need|want|i\s+want|i\s+need|help\s+me\s+(?:build|create|make|start)|show\s+me)\s+/i, '')
    .replace(/^(an?|the|my)\s+/i, '')
    .trim()

  return (stripped || normalized)
    .split(/\s+/)
    .slice(0, 4)
    .map((word) => normalizeSuggestedNameToken(word))
    .join(' ') || 'New Project'
}

function finalizeBuilderDraft(
  draft: GenerationDraft,
  prompt: string,
  input?: {
    profile?: BuilderIntentProfile | null
    templateMatches?: Array<{ name: string; score: number }>
  },
): GenerationDraft {
  const explicitProjectName =
    readQuoted(prompt, /name the project\s+"([^"]+)"/i) ??
    readQuoted(prompt, /project named\s+"([^"]+)"/i) ??
    readQuoted(prompt, /call the project\s+"([^"]+)"/i)
  const fallbackName = suggestProjectName(prompt, input)
  const nextProjectName = explicitProjectName ?? (shouldReplaceGenericProjectName(draft.project.name)
    ? fallbackName
    : draft.project.name)
  const nextDescription = draft.project.description?.trim()
    ? draft.project.description
    : `Operate ${nextProjectName} inside Lucid with direct, structured execution.`
  const nextStarterName = shouldReplaceGenericProjectName(draft.starterName ?? '')
    ? nextProjectName
    : draft.starterName ?? nextProjectName

  return generationDraftSchema.parse({
    ...draft,
    project: {
      ...draft.project,
      name: nextProjectName,
      description: nextDescription,
    },
    starterName: nextStarterName,
  })
  const structuredReadyAt = Date.now()
}

function shouldReplaceGenericProjectName(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return true
  return [
    /^tell me what you\b/,
    /^what you want\b/,
    /^new project\b/,
    /^project\b$/,
    /^(create|build|make|start|launch|set up|setup)\b/,
  ].some((pattern) => pattern.test(normalized))
}

function normalizeSuggestedNameToken(value: string): string {
  const corrected = normalizeBuilderToken(value)
  return corrected.charAt(0).toUpperCase() + corrected.slice(1)
}

function suggestContextualProjectName(
  prompt: string,
  profile?: BuilderIntentProfile | null,
  templateMatches?: Array<{ name: string; score: number }>,
): string | null {
  const lower = prompt.toLowerCase()

  if (/\bceo\b|\bexecutive\b|\bfounder\b|\bchief of staff\b/.test(lower)) {
    return 'Executive Assistant'
  }
  if (/\bdaily assistant\b|\bpersonal assistant\b/.test(lower)) {
    return 'Daily Assistant'
  }
  if (/\bpersonal agent\b/.test(lower)) {
    return 'Personal Agent'
  }
  if (/\bsupport\b|\bhelpdesk\b|\bcustomer support\b/.test(lower)) {
    return 'Support Agent'
  }
  if (/\bsales\b|\boutreach\b|\bprospect/.test(lower)) {
    return 'Sales Agent'
  }
  if (/\bresearch\b|\banalyst\b|\bmonitor/.test(lower)) {
    return 'Research Agent'
  }

  if (profile) {
    switch (profile.id) {
      case 'executive-assistant':
        return 'Executive Assistant'
      case 'personal-agent':
        return lower.includes('daily') ? 'Daily Assistant' : 'Personal Agent'
      case 'support-agent':
        return 'Support Agent'
      case 'sales-agent':
        return 'Sales Agent'
      case 'research-agent':
        return 'Research Agent'
    }
  }

  const topTemplate = templateMatches?.[0]
  if (topTemplate && topTemplate.score >= 0.82) {
    return topTemplate.name
  }

  return null
}

function toGenerationMode(value?: 'auto' | 'template' | 'agent' | 'team'): 'auto' | GenerationDraft['mode'] | undefined {
  if (!value) return undefined
  if (value === 'auto') return 'auto'
  if (value === 'agent') return 'blank-agent'
  if (value === 'team') return 'blank-team'
  return 'template'
}

function buildHeuristicRefinementResult(
  prompt: string,
  draft: GenerationDraft,
  templatesBySlug: Map<string, TemplateCatalogEntry>,
  templateMatches: GeneratedBlueprintResult['template_matches'],
): GeneratedBlueprintResult | null {
  const templateSuggestedIntegrations = getSuggestedIntegrationsFromTemplates(templateMatches)
  const nextDraft = structuredClone(draft) as GenerationDraft
  const summaryParts: string[] = []

  if (nextDraft.mode === 'template' && nextDraft.template?.slug) {
    const template = templatesBySlug.get(nextDraft.template.slug)
    if (template) {
      const extractedParams = extractTemplateParamAnswers(prompt, template, nextDraft.template.params)
      if (Object.keys(extractedParams).length > 0) {
        const updatedDraft = applyTemplateParamsToDraft(nextDraft, template, {
          ...nextDraft.template.params,
          ...extractedParams,
        })
        const validated = validateAndRepairDraft(updatedDraft, templatesBySlug)
        const finalDraft = validated.draft
        const previewSpec = resolveDraftPreviewSpec(finalDraft, templatesBySlug)
        const paramLabels = Object.keys(extractedParams)
          .map((key) => template.params.find((param) => param.key === key)?.label ?? key)

        return {
          mode: finalDraft.mode,
          draft: finalDraft,
          blueprint: projectBlueprintFromDraft(finalDraft),
          reasoning_summary: `Updated ${joinLabels(paramLabels)} for the ${template.name} template.`,
          template_matches: hydrateMissingParams(templateMatches, templatesBySlug, finalDraft),
          ...(finalDraft.template ? { selected_template: finalDraft.template } : {}),
          ...(previewSpec ? { preview_spec: previewSpec } : {}),
          warnings: validated.warnings,
          missing_required_inputs: validated.missingRequiredInputs,
          suggested_integrations: templateSuggestedIntegrations.length > 0
            ? templateSuggestedIntegrations
            : [],
          confidence: 0.86,
        }
      }
    }
  }

  const rename = readQuoted(prompt, /rename the team to\s+"([^"]+)"/i)
    ?? readQuoted(prompt, /name the project\s+"([^"]+)"/i)
    ?? readQuoted(prompt, /set the name(?: exactly)? to\s+"([^"]+)"/i)
  if (rename) {
    nextDraft.project.name = rename
    nextDraft.starterName = rename
    summaryParts.push(`renamed to "${rename}"`)
  }

  const description = readQuoted(prompt, /set the description(?: exactly)? to\s+"([^"]+)"/i)
  if (description) {
    nextDraft.project.description = description
    summaryParts.push('updated the description')
  }

  const objective = readQuoted(prompt, /set the objective to\s+"([^"]+)"/i)
  if (objective && nextDraft.mode === 'blank-team' && nextDraft.team) {
    nextDraft.team.objective = objective
    summaryParts.push('updated the objective')
  }

  const systemPrompt = readQuoted(prompt, /replace the system prompt with:\s*"([^"]+)"/i)
    ?? readQuoted(prompt, /set the system prompt(?: exactly)? to\s*"([^"]+)"/i)
  if (systemPrompt && nextDraft.mode === 'blank-agent' && nextDraft.agent) {
    nextDraft.agent.system_prompt = systemPrompt
    summaryParts.push('updated the system prompt')
  }

  if (nextDraft.mode === 'blank-team' && nextDraft.team) {
    const firstSecondRoles = prompt.match(/set the first member role to\s+([^,]+),\s+the second to\s+([^,.]+)(?:[.,]|$)/i)
    if (firstSecondRoles && nextDraft.team.members.length >= 2) {
      nextDraft.team.members[0] = {
        ...nextDraft.team.members[0],
        role: firstSecondRoles[1].trim(),
      }
      nextDraft.team.members[1] = {
        ...nextDraft.team.members[1],
        role: firstSecondRoles[2].trim(),
      }
      summaryParts.push('updated the member roles')
    }

    const keepRoles = prompt.match(/keep the roles as\s+([^,]+)\s+and\s+([^,]+),\s+with\s+([^,]+)\s+as coordinator/i)
    if (keepRoles && nextDraft.team.members.length >= 2) {
      nextDraft.team.members[0] = {
        ...nextDraft.team.members[0],
        role: keepRoles[1].trim(),
      }
      nextDraft.team.members[1] = {
        ...nextDraft.team.members[1],
        role: keepRoles[2].trim(),
      }
      const coordinatorRole = keepRoles[3].trim()
      nextDraft.team.members = nextDraft.team.members.map((member) => ({
        ...member,
        is_coordinator: member.role === coordinatorRole,
      }))
      summaryParts.push('rebalanced coordinator ownership')
    } else if (/keep the first member as coordinator/i.test(prompt) && nextDraft.team.members.length > 0) {
      nextDraft.team.members = nextDraft.team.members.map((member, index) => ({
        ...member,
        is_coordinator: index === 0,
      }))
      summaryParts.push('kept the first member as coordinator')
    }

    if (nextDraft.team.members.length >= 2) {
      const coordinator = nextDraft.team.members.find((member) => member.is_coordinator) ?? nextDraft.team.members[0]
      nextDraft.team.members = nextDraft.team.members.map((member, index) => ({
        ...member,
        is_coordinator: member.role === coordinator.role ? true : Boolean(member.is_coordinator && index === 0 && member.role === coordinator.role),
      }))
      nextDraft.team.edges = nextDraft.team.members
        .filter((member) => member.role !== coordinator.role)
        .map((member) => ({
          from: coordinator.role,
          to: member.role,
        }))
    }
  }

  if (summaryParts.length === 0) {
    return null
  }

  const validated = validateAndRepairDraft(nextDraft, templatesBySlug)
  const unsupportedChannels = applyUnsupportedChannelNotes(validated.draft, prompt)
  const finalDraft = unsupportedChannels.draft
  const previewSpec = resolveDraftPreviewSpec(finalDraft, templatesBySlug)

  return {
    mode: finalDraft.mode,
    draft: finalDraft,
    blueprint: projectBlueprintFromDraft(finalDraft),
    reasoning_summary: `Applied a direct edit pass that ${summaryParts.join(', ')}.`,
    template_matches: hydrateMissingParams(templateMatches, templatesBySlug, finalDraft),
    ...(finalDraft.template ? { selected_template: finalDraft.template } : {}),
    ...(previewSpec ? { preview_spec: previewSpec } : {}),
      warnings: [...validated.warnings, ...unsupportedChannels.warnings],
      missing_required_inputs: validated.missingRequiredInputs,
      suggested_integrations: templateSuggestedIntegrations.length > 0
        ? templateSuggestedIntegrations
        : [],
      confidence: 0.72,
    }
}

function extractTemplateParamAnswers(
  prompt: string,
  template: TemplateCatalogEntry,
  existingParams: Record<string, string>,
): Record<string, string> {
  const missingRequiredParams = template.params.filter((param) => (
    param.required && !existingParams[param.key]?.trim()
  ))
  if (missingRequiredParams.length === 0) return {}

  const extracted: Record<string, string> = {}
  for (const param of missingRequiredParams) {
    const labels = [
      param.label,
      param.key,
      param.label.replace(/\b(?:or|and)\b/gi, ' '),
    ]
      .flatMap((label) => [
        label,
        label.replace(/[_-]/g, ' '),
        label.replace(/\s+/g, ' ').trim(),
      ])
      .map(escapeRegExp)
      .filter(Boolean)

    for (const label of Array.from(new Set(labels))) {
      const pattern = new RegExp(
        `(?:^|[\\n,;.]\\s*)(?:${label})\\s*(?:is|=|:|-)\\s*([^\\n,;.]+)`,
        'i',
      )
      const match = prompt.match(pattern)
      const value = match?.[1]?.trim()
      if (value) {
        extracted[param.key] = value
        break
      }
    }
  }

  if (Object.keys(extracted).length > 0) return extracted

  if (missingRequiredParams.length === 1) {
    const directValue = prompt.trim().replace(/^["']|["']$/g, '')
    if (directValue.length >= 2 && directValue.length <= 160) {
      extracted[missingRequiredParams[0]!.key] = directValue
    }
  }

  return extracted
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function joinLabels(labels: string[]): string {
  if (labels.length === 0) return 'the template inputs'
  if (labels.length === 1) return labels[0]!
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`
}

function readQuoted(input: string, pattern: RegExp): string | null {
  const match = input.match(pattern)
  return match?.[1]?.trim() || null
}

function shouldPreferHeuristicRefinement(prompt: string): boolean {
  return [
    /set the description(?: exactly)? to\s+"/i,
    /replace the system prompt with:\s*"/i,
    /set the system prompt(?: exactly)? to\s*"/i,
    /rename the team to\s+"/i,
    /set the objective to\s+"/i,
    /set the first member role to\s+/i,
    /keep the roles as\s+/i,
    /keep the first member as coordinator/i,
  ].some((pattern) => pattern.test(prompt))
}
