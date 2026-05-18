import type { UnifiedSkillItem } from '@contracts/unified-skill'
import { isUserVisibleChannelType } from '@/lib/channels/types'
import { buildScheduleTaskDraftSeed } from '@/lib/assistants/schedule-task-defaults'

import type { BuilderDecisionCard, GeneratedBlueprintResult } from './schemas'
import { getDraftCapabilities } from './structure'

export function buildBuilderActionCatalog(input: {
  result: GeneratedBlueprintResult
  availableUnifiedSkills?: UnifiedSkillItem[]
}): {
  decisionCards: BuilderDecisionCard[]
} {
  const { result, availableUnifiedSkills = [] } = input
  const cards: BuilderDecisionCard[] = []
  const primaryAgent = result.draft.agent
  const primaryTeam = result.draft.team
  const isInitialBlankAgentResult = result.mode === 'blank-agent' && !result.patch
  const capabilityOptions = buildCapabilityDecisionOptions(result, availableUnifiedSkills)
  const shouldShowClarificationFirst = Boolean(
    result.clarification?.needed
      && result.clarification.ambiguity_class === 'topology',
  )

  if (shouldShowClarificationFirst && result.clarification?.needed) {
    cards.push({
      kind: 'clarification_select',
      ambiguity_class: result.clarification.ambiguity_class,
      title: result.clarification.question,
      description: result.clarification.reason,
      options: result.clarification.options,
    })
  }

  if (result.draft.mode === 'template' && result.missing_required_inputs.length > 0) {
    cards.push(
      ...result.missing_required_inputs.map((item) => ({
        kind: 'template_param' as const,
        key: item.key,
        label: item.label,
        reason: item.reason,
        placeholder: item.reason,
      })),
    )
  }

  if (capabilityOptions.length > 0) {
    cards.push({
      kind: 'capability_multi_select',
      title: 'Choose what to add next',
      description: 'Start with the likely capabilities below or open the full list.',
      browse_action_label: 'Browse all skills',
      options: capabilityOptions,
    })
  }

  if (primaryAgent && (isInitialBlankAgentResult || !hasResolvedScheduleStep(primaryAgent))) {
    const suggestedSchedule = buildSuggestedSchedule(result)
    cards.push({
      kind: 'configuration_panel',
      panel: 'tasks',
      title: 'Add a schedule if this should run on its own',
      description: 'I did not add a recurring schedule by default because not every assistant should run automatically.',
      action_label: 'Edit schedule',
      apply_action_label: 'Add suggested schedule',
      suggested_schedule: suggestedSchedule,
    })
  }

  if (primaryAgent && (isInitialBlankAgentResult || !hasResolvedChannelStep(primaryAgent))) {
    cards.push({
      kind: 'configuration_panel',
      panel: 'channels',
      title: 'Choose where this agent should work',
      description: 'I left channels open for now because that depends on where you want this agent to operate.',
      action_label: 'Set channels',
    })
  }

  if (!primaryAgent && primaryTeam && !hasResolvedTeamChannelStep(primaryTeam)) {
    cards.push({
      kind: 'configuration_panel',
      panel: 'channels',
      title: 'Choose where this team should work',
      description: 'I left channels open for now because that depends on where this team should operate.',
      action_label: 'Set channels',
    })
  }

  if (result.mode === 'blank-team' && result.confidence < 0.72) {
    cards.push({
      kind: 'team_mode',
      title: 'Do you want this to stay a team?',
      description: 'This request could also work as a single agent depending on how much coordination you want.',
      options: [
        {
          id: 'team',
          label: 'Keep team',
          description: 'Preserve separate roles and handoffs.',
        },
        {
          id: 'single-agent',
          label: 'Use one agent',
          description: 'Simpler setup with one operator.',
        },
      ],
    })
  }

  return { decisionCards: cards }
}

function buildSuggestedSchedule(result: GeneratedBlueprintResult) {
  const existingOptionalSchedule = (result.draft.agent?.default_schedules ?? []).find((schedule) => schedule.optional)
  if (existingOptionalSchedule) {
    return existingOptionalSchedule
  }

  const seed = buildScheduleTaskDraftSeed({
    projectName: result.draft.project.name,
    projectDescription: result.draft.project.description,
    systemPrompt: result.draft.agent?.system_prompt,
    skills: result.draft.agent?.skills ?? [],
    plugins: result.draft.agent?.plugins ?? [],
    channelHints: result.draft.agent?.channel_hints ?? [],
  })

  return {
    cron: seed.cron,
    prompt: seed.prompt,
    description: seed.description,
    optional: true,
  } as const
}

function hasResolvedChannelStep(agent: NonNullable<GeneratedBlueprintResult['draft']['agent']>): boolean {
  return (agent.channel_hints ?? []).some((channel) => (
    channel.required && isUserVisibleChannelType(channel.channel_type)
  ))
}

function hasResolvedTeamChannelStep(team: NonNullable<GeneratedBlueprintResult['draft']['team']>): boolean {
  return (team.channel_hints ?? []).some((channel) => (
    channel.required && isUserVisibleChannelType(channel.channel_type)
  ))
}

function hasResolvedScheduleStep(agent: NonNullable<GeneratedBlueprintResult['draft']['agent']>): boolean {
  return (agent.default_schedules ?? []).some((schedule) => !schedule.optional)
}

function buildCapabilityDecisionOptions(
  result: GeneratedBlueprintResult,
  availableUnifiedSkills: UnifiedSkillItem[],
) {
  const curatedByKey = new Map(
    availableUnifiedSkills.map((item) => [`${item.item_type}:${item.slug}`, item] as const),
  )
  const selectedCapabilities = getDraftCapabilities(result.draft)
  const selectedSkillSlugs = new Set(selectedCapabilities.skills)
  const selectedPluginSlugs = new Set(selectedCapabilities.plugins)
  const options: Array<{
    id: string
    slug: string
    item_type: 'skill' | 'plugin'
    label: string
    category?: string
    description?: string
  }> = []
  const seen = new Set<string>()

  const pushOption = (item: UnifiedSkillItem) => {
    const itemType = item.item_type ?? 'skill'
    const key = `${itemType}:${item.slug}`
    if (seen.has(key)) return
    if (itemType === 'skill' && selectedSkillSlugs.has(item.slug)) return
    if (itemType === 'plugin' && selectedPluginSlugs.has(item.slug)) return
    seen.add(key)
    options.push({
      id: key,
      slug: item.slug,
      item_type: itemType,
      label: item.name,
      category: item.category,
      description: itemType === 'plugin'
        ? (item.installed ? 'Plugin - installed' : 'Plugin')
        : `Skill - ${item.source}`,
    })
  }

  for (const item of result.suggested_capabilities?.skills ?? []) {
    const curated = curatedByKey.get(`skill:${item.slug}`)
    if (curated) {
      pushOption(curated)
    }
  }

  for (const item of result.suggested_capabilities?.plugins ?? []) {
    const curated = curatedByKey.get(`plugin:${item.slug}`)
    if (curated) {
      pushOption(curated)
    }
  }

  if (options.length < 4 && availableUnifiedSkills.length > 0) {
    const keywords = expandCapabilityKeywords(result)

    const rankedFallbacks = availableUnifiedSkills
      .filter((item) => !seen.has(`${item.item_type}:${item.slug}`))
      .map((item) => {
        const haystack = [item.name, item.description ?? '', item.category]
          .join(' ')
          .toLowerCase()
        const score = [...keywords].reduce((total, keyword) => total + (haystack.includes(keyword) ? 1 : 0), 0)
          + scoreProviderAndSlugMatches(item, keywords)
        return { item, score }
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name))

    for (const entry of rankedFallbacks) {
      pushOption(entry.item)
      if (options.length >= 4) break
    }
  }

  return options.slice(0, 5)
}

function expandCapabilityKeywords(result: GeneratedBlueprintResult): Set<string> {
  const keywords = new Set<string>()

  const rawTerms = [
    ...(result.suggested_integrations ?? []),
    ...(result.profile_hint?.suggested_integrations ?? []),
  ]

  for (const value of rawTerms) {
    for (const token of value.toLowerCase().split(/[\s/-]+/).filter((part) => part.length >= 3)) {
      keywords.add(token)
    }
    for (const alias of CAPABILITY_ALIASES[value.toLowerCase()] ?? []) {
      keywords.add(alias)
    }
  }

  if (keywords.size === 0) {
    const fallbackText = [
      result.draft.project.name,
      result.draft.project.description ?? '',
      result.draft.agent?.system_prompt ?? '',
      result.draft.team?.objective ?? '',
      ...(result.draft.team?.members.map((member) => [
        member.role,
        member.description ?? '',
        member.system_prompt,
        ...(member.responsibilities ?? []),
      ].join(' ')) ?? []),
      result.reasoning_summary ?? '',
      result.profile_hint?.label ?? '',
      result.profile_hint?.description ?? '',
    ]
      .join(' ')
      .toLowerCase()

    for (const token of fallbackText.split(/[^a-z0-9]+/).filter((part) => part.length >= 3)) {
      keywords.add(token)
    }

    if (/\b(personal|assistant|daily|calendar|email|task|tasks|note|notes|reminder|reminders|schedule|scheduling)\b/.test(fallbackText)) {
      for (const implied of ['email', 'calendar', 'tasks', 'notes']) {
        keywords.add(implied)
        for (const alias of CAPABILITY_ALIASES[implied] ?? []) {
          keywords.add(alias)
        }
      }
    }
  }

  return keywords
}

const CAPABILITY_ALIASES: Record<string, string[]> = {
  email: ['gmail', 'google', 'outlook', 'mail', 'inbox'],
  calendar: ['google', 'google calendar', 'outlook', 'schedule', 'scheduling'],
  tasks: ['task', 'todo', 'todoist', 'asana', 'clickup', 'linear'],
  notes: ['note', 'notion', 'bear', 'docs'],
  reminders: ['reminder', 'todo', 'task'],
  briefings: ['brief', 'report', 'notion'],
  crm: ['hubspot', 'salesforce', 'pipedrive'],
}

function scoreProviderAndSlugMatches(item: UnifiedSkillItem, keywords: Set<string>): number {
  const haystack = [
    item.slug,
    item.auth_provider ?? '',
    item.source,
  ]
    .join(' ')
    .toLowerCase()

  let score = 0
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) {
      score += 2
    }
  }

  return score
}
