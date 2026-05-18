import 'server-only'

import type { ZodTypeAny } from 'zod'
import { generateObject as aiGenerateObject, type LanguageModel, type ModelMessage } from 'ai'

import { generateObject } from '@/lib/ai/gateway'
import { getAITelemetry } from '@/lib/ai/telemetry'

export interface StructuredAIGenerationInput<TSchema extends ZodTypeAny> {
  model: string | LanguageModel
  schema: TSchema
  messages: ModelMessage[]
  system?: string
  temperature?: number
  maxTokens?: number
  provider?: 'auto' | 'trustgate' | 'openai'
  telemetry?: {
    userId?: string
    orgId?: string
    modelId?: string
    feature: string
    metadata?: Record<string, string>
  }
}

export async function generateStructuredObject<TSchema extends ZodTypeAny>(
  input: StructuredAIGenerationInput<TSchema>,
) {
  const telemetry = input.telemetry
    ? getAITelemetry({
        userId: input.telemetry.userId,
        orgId: input.telemetry.orgId,
        modelId: input.telemetry.modelId,
        feature: input.telemetry.feature,
        metadata: input.telemetry.metadata,
      })
    : undefined

  if (typeof input.model === 'string') {
    return generateObject({
      model: input.model,
      schema: input.schema,
      messages: input.messages,
      ...(input.system ? { system: input.system } : {}),
      ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
      ...(typeof input.maxTokens === 'number' ? { maxTokens: input.maxTokens } : {}),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(telemetry ? { experimentalTelemetry: telemetry } : {}),
    })
  }

  return aiGenerateObject({
    model: input.model,
    schema: input.schema,
    messages: input.messages,
    ...(input.system ? { system: input.system } : {}),
    ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
    ...(typeof input.maxTokens === 'number' ? { maxTokens: input.maxTokens } : {}),
    ...(telemetry ? { experimental_telemetry: telemetry } : {}),
  })
}
