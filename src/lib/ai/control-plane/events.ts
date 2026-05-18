import 'server-only'

import { supabase } from '@/lib/db/client'
import type { AIFeature, AIGenerationContext, AIModality, AIGenerationUsage } from './types'

export async function writeAIGenerationEvent(input: {
  context: AIGenerationContext
  feature: AIFeature
  modality: AIModality
  prompt: string
  success: boolean
  model?: string
  provider?: string
  usage?: AIGenerationUsage
  metadata?: Record<string, unknown>
  error?: string
}): Promise<string | undefined> {
  const { data, error } = await supabase
    .from('ai_generation_events')
    .insert({
      user_id: input.context.userId,
      feature: input.feature,
      prompt: input.prompt,
      success: input.success,
      tokens_used: input.usage?.totalTokens,
      metadata: {
        ...input.metadata,
        modality: input.modality,
        orgId: input.context.orgId,
        assistantId: input.context.assistantId,
        projectId: input.context.projectId,
        provider: input.provider,
        model: input.model,
        usage: input.usage,
        error: input.error,
      },
    })
    .select('id')
    .single()

  if (error) throw error
  return data?.id
}
