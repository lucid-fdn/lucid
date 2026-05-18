import 'server-only'

import { z } from 'zod'

import { generateObject } from '@/lib/ai/gateway'
import { BUILDER_FAST_MODEL_ID } from '@/lib/ai/services/builder-service'

import type { GenerationDraft } from './schemas'
import {
  classifyBuilderTurn,
  isQuestionLikeBuilderPrompt,
  type BuilderQuestionTopic,
  type BuilderTurnClassification,
  type BuilderTurnType,
} from './turn-routing'

const turnClassifierSchema = z.object({
  type: z.enum([
    'product_question',
    'builder_status_question',
    'local_ui_action',
    'config_change',
    'clarification_answer',
  ]),
  topic: z.enum(['engine', 'runtime', 'channels', 'capabilities', 'template', 'lucid', 'company', 'workflow', 'status', 'general']),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1),
})

export async function classifyBuilderTurnWithAI(input: {
  prompt: string
  draft?: GenerationDraft
  recentMessages?: Array<{ role: string; text: string }>
}): Promise<BuilderTurnClassification> {
  const deterministic = classifyBuilderTurn({
    prompt: input.prompt,
    draft: input.draft,
  })

  if (deterministic.type === 'local_ui_action') return deterministic

  try {
    const result = await generateObject({
      model: BUILDER_FAST_MODEL_ID,
      temperature: 0,
      maxTokens: 180,
      schema: turnClassifierSchema,
      system: [
        'Classify a user turn in an agent-builder chat.',
        'Return whether the user is asking a question, answering a step, or requesting a real setup change.',
        'Only classify as config_change when the user explicitly asks to modify the agent setup.',
        'Questions about the builder, current draft, missing setup, readiness, or product concepts must be answer-only.',
        'Never treat a question as config_change unless it explicitly asks for an edit.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            user_message: input.prompt,
            current_draft: summarizeDraft(input.draft),
            recent_messages: input.recentMessages?.slice(-4) ?? [],
            allowed_types: [
              'product_question',
              'builder_status_question',
              'local_ui_action',
              'config_change',
              'clarification_answer',
            ],
          }),
        },
      ],
    })

    const classification = normalizeClassification(result.object)

    if (
      isQuestionLikeBuilderPrompt(input.prompt)
      && classification.type === 'config_change'
      && (classification.confidence ?? 0) < 0.86
    ) {
      return {
        type: 'builder_status_question',
        topic: classification.topic ?? 'status',
        confidence: classification.confidence,
        reason: `question fallback: ${classification.reason}`,
      }
    }

    return classification
  } catch (error) {
    return {
      ...deterministic,
      reason: `fallback after classifier error: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function normalizeClassification(input: z.infer<typeof turnClassifierSchema>): BuilderTurnClassification {
  return {
    type: input.type as BuilderTurnType,
    topic: input.topic as BuilderQuestionTopic,
    confidence: input.confidence,
    reason: input.reason,
  }
}

function summarizeDraft(draft: GenerationDraft | undefined) {
  if (!draft) return null
  return {
    mode: draft.mode,
    project_name: draft.project.name,
    project_description: draft.project.description ?? null,
    has_agent: Boolean(draft.agent),
    skills: draft.agent?.skills ?? [],
    plugins: draft.agent?.plugins ?? [],
    channel_hints: draft.agent?.channel_hints ?? [],
    schedules: draft.agent?.default_schedules ?? [],
    runtime: draft.runtime ?? null,
    template: draft.template
      ? {
          slug: draft.template.slug,
          name: draft.template.name,
          kind: draft.template.kind,
        }
      : null,
  }
}
