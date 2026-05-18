import 'server-only'

import type { UnifiedSkillItem } from '@contracts/unified-skill'

import { generateText } from '@/lib/ai/gateway'
import { BUILDER_FAST_MODEL_ID } from '@/lib/ai/services/builder-service'
import { isUserVisibleChannelType } from '@/lib/channels/types'

import { buildProjectBuilderMetaReply } from './chat'
import { getBuilderKnowledgeFacts } from './builder-knowledge'
import { getPendingBuilderConnections } from './builder-step-utils'
import type { GenerationDraft } from './schemas'
import type { BuilderTurnClassification } from './turn-routing'

export async function generateProjectBuilderAnswer(input: {
  prompt: string
  draft?: GenerationDraft
  classification: BuilderTurnClassification
  availableUnifiedSkills?: UnifiedSkillItem[]
}): Promise<string> {
  const fallback = buildProjectBuilderMetaReply(input)

  try {
    const result = await generateText({
      model: BUILDER_FAST_MODEL_ID,
      temperature: 0.2,
      maxTokens: 180,
      system: [
        'You answer inside an agent-builder chat.',
        'This is an answer-only turn: never claim you changed the setup, updated a prompt, added a tool, or modified configuration.',
        'Use the structured facts provided. If something is missing, say exactly what is missing.',
        'Keep the answer short, direct, and operational. Do not end with generic refinement filler.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            user_question: input.prompt,
            classification: input.classification,
            facts: buildAnswerFacts(input.draft, input.availableUnifiedSkills ?? []),
            fallback_answer: fallback,
          }),
        },
      ],
    })

    const text = result.text.trim()
    return text || fallback
  } catch {
    return fallback
  }
}

function buildAnswerFacts(draft: GenerationDraft | undefined, availableUnifiedSkills: UnifiedSkillItem[]) {
  if (!draft) {
    return {
      has_draft: false,
      product_knowledge: productKnowledge,
    }
  }

  const pendingConnections = getPendingBuilderConnections(draft, availableUnifiedSkills)
  const confirmedChannels = (draft.agent?.channel_hints ?? []).filter((channel) => (
    channel.required && isUserVisibleChannelType(channel.channel_type)
  ))
  const activeSchedules = (draft.agent?.default_schedules ?? []).filter((schedule) => !schedule.optional)
  const optionalSchedules = (draft.agent?.default_schedules ?? []).filter((schedule) => schedule.optional)

  return {
    has_draft: true,
    project: draft.project,
    mode: draft.mode,
    runtime: draft.runtime ?? null,
    template: draft.template ?? null,
    selected_tools: {
      skills: draft.agent?.skills ?? [],
      plugins: draft.agent?.plugins ?? [],
    },
    channels: {
      confirmed: confirmedChannels,
      all_hints: draft.agent?.channel_hints ?? [],
    },
    schedules: {
      active: activeSchedules,
      optional: optionalSchedules,
    },
    readiness: {
      validation_requirements: [
        'valid name',
        'clear role/system prompt or team objective',
        'valid runtime and engine',
        'required template inputs when using a template',
        'app auth decision for selected tools',
        'channel decision when the agent should work outside Lucid',
      ],
      missing_before_create: [
        ...(!confirmedChannels.length ? ['choose where the agent should work'] : []),
        ...(pendingConnections.length ? [`connect ${pendingConnections.map((item) => item.name).join(', ')}`] : []),
      ],
      optional_improvements: [
        ...(!(draft.agent?.skills?.length || draft.agent?.plugins?.length) ? ['add tools if the agent should work across apps'] : []),
        ...(!activeSchedules.length ? ['add a schedule if it should run automatically'] : []),
      ],
      pending_connections: pendingConnections,
    },
    product_knowledge: productKnowledge,
  }
}

const productKnowledge = {
  ...getBuilderKnowledgeFacts(),
}
