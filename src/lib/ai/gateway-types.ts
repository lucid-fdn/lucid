import 'server-only'

import type {
  GenerateObjectResult,
  GenerateTextResult,
  ModelMessage,
  StreamTextResult,
  ToolSet,
} from 'ai'
import type { z, ZodTypeAny } from 'zod'
import type { ImageGenerationRequest, ImageGenerationResult } from './images/types'

export type AIGatewayProvider = 'auto' | 'trustgate' | 'openai'

export interface GenerateTextInput {
  model: string
  messages: ModelMessage[]
  provider?: AIGatewayProvider
  temperature?: number
  maxTokens?: number
  tools?: ToolSet
  system?: string
  experimentalTelemetry?: unknown
}

export interface StreamTextInput extends GenerateTextInput {}

export interface GenerateObjectInput<TSchema extends ZodTypeAny> extends GenerateTextInput {
  schema: TSchema
}

export interface EmbedInput {
  value: string
  provider?: AIGatewayProvider
  model?: string
}

export interface EmbedManyInput {
  values: string[]
  provider?: AIGatewayProvider
  model?: string
}

export type GenerateImageInput = ImageGenerationRequest & { model?: string }

export type GatewayImageResult = ImageGenerationResult

export type GatewayGenerateTextResult = GenerateTextResult<ToolSet, never>
export type GatewayStreamTextResult = StreamTextResult<ToolSet, never>
export type GatewayGenerateObjectResult<TSchema extends ZodTypeAny> = GenerateObjectResult<z.infer<TSchema>>
