import { z } from 'zod'
import type { UIMessage } from 'ai'
import { ProjectBlueprintSchema } from '@contracts/project-blueprint'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

import { buildBuilderActionCatalog } from './builder-action-catalog'
import { answerBuilderKnowledgeQuestion } from './builder-knowledge'
import {
  builderDecisionCardSchema,
  builderStageSchema,
  type GenerationDraft,
  generationDraftSchema,
  generatedBlueprintResultSchema,
  type BuilderDecisionCard,
  type BuilderStage,
  type GeneratedBlueprintResult,
} from './schemas'
import { classifyBuilderTurn, type BuilderTurnClassification } from './turn-routing'
import { getPendingBuilderConnections } from './builder-step-utils'
import { getUserFacingBuilderWarning } from './unsupported-channel-requests'
import { isUserVisibleChannelType } from '@/lib/channels/types'

export const projectBuilderChatResponseSchema = z.object({
  assistant_message: z.string().trim().min(1),
  follow_up_question: z.string().trim().min(1).optional(),
  result: generatedBlueprintResultSchema,
  decision_cards: z.array(builderDecisionCardSchema).default([]),
  stage_hint: builderStageSchema.default('create-agent'),
})

export type ProjectBuilderChatResponse = z.infer<typeof projectBuilderChatResponseSchema>

export const projectBuilderProgressSchema = z.object({
  draft: generationDraftSchema,
  blueprint: ProjectBlueprintSchema,
  status: z.string().trim().min(1),
})

export type ProjectBuilderProgress = z.infer<typeof projectBuilderProgressSchema>

export const projectBuilderArtifactSchema = z.object({
  format: z.literal('yaml'),
  chunk: z.string(),
  reset: z.boolean().default(false),
})

export type ProjectBuilderArtifact = z.infer<typeof projectBuilderArtifactSchema>

export const projectBuilderStreamDataSchema = projectBuilderChatResponseSchema.omit({
  assistant_message: true,
})

export type ProjectBuilderStreamData = z.infer<typeof projectBuilderStreamDataSchema>

export type ProjectBuilderUIMessage = UIMessage<
  unknown,
  {
    'builder-progress': ProjectBuilderProgress
    'builder-artifact': ProjectBuilderArtifact
    'builder-result': ProjectBuilderStreamData
  }
>

export function buildProjectBuilderStreamingPreamble(input: {
  prompt: string
  isInitial: boolean
}): string {
  void input
  return ''
}

export function buildProjectBuilderMetaReply(input: {
  prompt: string
  draft?: GenerationDraft
  classification?: BuilderTurnClassification
  availableUnifiedSkills?: UnifiedSkillItem[]
}): string {
  const classification = input.classification ?? classifyBuilderTurn({
    prompt: input.prompt,
    draft: input.draft,
  })
  const lowerPrompt = input.prompt.toLowerCase()
  const projectName = input.draft?.project.name || 'this setup'
  const mode = input.draft?.mode === 'blank-team' ? 'a team' : 'a single agent'
  const selectedToolIds = [
    ...(input.draft?.agent?.skills ?? []),
    ...(input.draft?.agent?.plugins ?? []),
  ]
  const selectedTools = selectedToolIds.slice(0, 3).map((id) => getCapabilityLabel(id, input.availableUnifiedSkills ?? []))
  const channels = (input.draft?.agent?.channel_hints ?? []).slice(0, 2).map((item) => item.channel_type)
  const schedules = input.draft?.agent?.default_schedules?.length ?? 0

  if (classification.type === 'product_question') {
    return answerBuilderKnowledgeQuestion(classification.topic ?? 'general')
  }

  if (classification.type === 'local_ui_action') {
    return 'I left the current setup unchanged.'
  }

  if (
    classification.type === 'builder_status_question'
    && /\b(missing|required|requirements?|validate|validation|valid|indicate|needed|need|before we create|before creating|ready to create|ready)\b/.test(lowerPrompt)
  ) {
    return answerBuilderReadinessQuestion({
      projectName,
      mode,
      draft: input.draft,
      availableUnifiedSkills: input.availableUnifiedSkills ?? [],
    })
  }

  const parts = [`I'm shaping ${mode} for "${projectName}".`]

  if (selectedTools.length > 0) {
    parts.push(`Right now it includes ${joinLabels(selectedTools)}.`)
  } else {
    parts.push('Right now I have not added tools yet.')
  }

  if (channels.length > 0) {
    parts.push(`It is currently pointed at ${joinLabels(channels)}.`)
  }

  if (schedules > 0) {
    parts.push('It already has a recurring schedule configured.')
  }

  parts.push('Ask for a change if you want me to update the setup.')
  return parts.join(' ')
}

function answerBuilderReadinessQuestion(input: {
  projectName: string
  mode: string
  draft?: GenerationDraft
  availableUnifiedSkills: UnifiedSkillItem[]
}): string {
  const { draft, availableUnifiedSkills, projectName, mode } = input
  if (!draft?.agent) {
    return `I'm still shaping ${mode} for "${projectName}". The next thing I need is the core setup itself before I can say what is missing.`
  }

  const hasSelectedTools = (draft.agent.skills?.length ?? 0) > 0 || (draft.agent.plugins?.length ?? 0) > 0
  const hasConfirmedSchedule = (draft.agent.default_schedules ?? []).some((schedule) => !schedule.optional)
  const hasConfirmedChannels = (draft.agent.channel_hints ?? []).some((channel) => (
    channel.required && isUserVisibleChannelType(channel.channel_type)
  ))
  const pendingConnections = getPendingBuilderConnections(draft, availableUnifiedSkills)

  const blockers: string[] = []
  const suggestions: string[] = []

  if (!hasConfirmedChannels) {
    blockers.push('choose where it should work')
  }
  if (pendingConnections.length > 0) {
    blockers.push(`connect ${joinLabels(pendingConnections.map((item) => item.name))}`)
  }
  if (!hasSelectedTools) {
    suggestions.push('add tools if you want it to work across apps')
  }
  if (!hasConfirmedSchedule) {
    suggestions.push('add a schedule if you want it to run on its own')
  }

  if (blockers.length === 0 && suggestions.length === 0) {
    return 'Nothing critical is missing. The setup is ready to create now.'
  }

  const parts: string[] = []
  if (blockers.length > 0) {
    parts.push(`Before creating "${projectName}", I would still ${joinLabels(blockers)}.`)
  } else {
    parts.push(`Nothing critical is blocking creation for "${projectName}" right now.`)
  }

  if (suggestions.length > 0) {
    parts.push(`Optional next improvements: ${joinLabels(suggestions)}.`)
  }

  return parts.join(' ')
}

function getCapabilityLabel(id: string, availableUnifiedSkills: UnifiedSkillItem[]): string {
  return availableUnifiedSkills.find((item) => item.id === id || item.slug === id)?.name ?? id
}

export function buildProjectBuilderAssistantMessage(input: {
  prompt: string
  result: GeneratedBlueprintResult
  isInitial: boolean
}): string {
  const { result, isInitial } = input
  const summary = cleanSentence(result.patch?.summary || result.reasoning_summary)
  const suggestedLabels = result.suggested_integrations.slice(0, 3)
  const intro = isInitial
    ? suggestedLabels.length > 0
      ? `I drafted ${describeStarter(result)} for "${result.draft.project.name}" and started it with ${joinLabels(suggestedLabels)} in mind.`
      : `I drafted ${describeStarter(result)} for "${result.draft.project.name}".`
    : summary

  const parts = [intro]
  const userFacingWarning = getUserFacingBuilderWarning(result.warnings)

  if (result.selected_template) {
    parts.push(`Base: ${result.selected_template.name}.`)
  } else if (result.template_matches[0] && result.template_matches[0].score >= 0.48) {
    parts.push(`Closest base: ${result.template_matches[0].name}.`)
  }

  if (userFacingWarning) {
    parts.push(userFacingWarning)
  }

  if (result.missing_required_inputs.length > 0) {
    const labels = result.missing_required_inputs.map((item) => item.label)
    parts.push(`I still need ${joinLabels(labels)} before this is ready to create.`)
  } else if (shouldEmphasizeClarification(result)) {
    parts.push('I need one quick choice to sharpen the setup.')
  } else if (isInitial && suggestedLabels.length > 0) {
    parts.push('Add any of the likely tools below, or skip them if you want to keep the setup lighter.')
  } else if (result.mode === 'blank-team') {
    parts.push('Refine roles, handoffs, tools, or runtime next if you want.')
  } else {
    parts.push('Refine tone, tools, runtime, or structure next if you want.')
  }

  return parts.join(' ')
}

export function buildProjectBuilderFollowUpQuestion(input: {
  prompt: string
  result: GeneratedBlueprintResult
}): string | undefined {
  const lower = input.prompt.toLowerCase()
  if (input.result.missing_required_inputs.length > 0) return undefined
  if (input.result.clarification?.needed) return undefined
  if (input.result.profile_hint?.follow_up_question) {
    return input.result.profile_hint.follow_up_question
  }

  if (/\b(ceo|executive|founder)\b/.test(lower)) {
    return 'Should it focus more on calendar management, email handling, or strategic insights?'
  }
  if (/\b(support|helpdesk|customer)\b/.test(lower)) {
    return 'Should it prioritize fast triage, deeper troubleshooting, or escalation handling?'
  }
  if (/\b(sales|prospect|crm|lead)\b/.test(lower)) {
    return 'Should it optimize more for outreach, follow-up, or pipeline hygiene?'
  }
  if (input.result.mode === 'blank-team') {
    return 'Do you want me to refine the roles, the handoffs, or the tool stack next?'
  }
  return 'Do you want me to refine the tone, the tools, or the workflow next?'
}

export function deriveBuilderDecisionCards(
  result: GeneratedBlueprintResult,
  availableUnifiedSkills: UnifiedSkillItem[] = [],
): BuilderDecisionCard[] {
  return buildBuilderActionCatalog({
    result,
    availableUnifiedSkills,
  }).decisionCards
}

export function deriveBuilderStage(input: {
  result: GeneratedBlueprintResult | null
  decisionCards?: BuilderDecisionCard[]
}): BuilderStage {
  if (!input.result) return 'create-agent'
  return 'create-agent'
}

function describeStarter(result: GeneratedBlueprintResult): string {
  if (result.selected_template) {
    return `a template-based ${result.selected_template.kind}`
  }

  switch (result.mode) {
    case 'blank-team':
      return 'a team'
    case 'blank-agent':
      return 'a single agent'
    default:
      return 'a template-based setup'
  }
}

function cleanSentence(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'I updated the setup.'
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function joinLabels(labels: string[]): string {
  if (labels.length === 0) return 'a few required details'
  if (labels.length === 1) return labels[0]!
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`
}

function shouldEmphasizeClarification(result: GeneratedBlueprintResult): boolean {
  if (!result.clarification?.needed) return false
  return result.clarification.ambiguity_class === 'topology'
}
