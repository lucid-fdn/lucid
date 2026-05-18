import 'server-only'

export type AIModality =
  | 'text'
  | 'structured'
  | 'embedding'
  | 'image'
  | 'transcription'
  | 'speech'
  | 'builder'
  | 'agent-run'

export type AIFeature =
  | 'ai-chat'
  | 'workflow-generation'
  | 'project-generation'
  | 'image-generation'
  | 'agent-avatar-generation'
  | 'agent-cover-generation'
  | 'generic-image-generation'
  | 'voice-preview'
  | 'voice-reply'
  | 'transcription'
  | 'agent-run'

export interface AIGenerationContext {
  userId: string
  orgId?: string | null
  assistantId?: string | null
  projectId?: string | null
}

export interface AIGenerationUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  imageTokens?: number
  textTokens?: number
  bytes?: number
  estimatedCostUsd?: number
}

export interface AIGenerationProviderReceipt {
  provider?: string
  model?: string
  latencyMs?: number
  requestId?: string
  metadata?: Record<string, unknown>
}

export interface AIGenerationAdapterOutput {
  provider?: string
  model?: string
  usage?: AIGenerationUsage
  receipt?: AIGenerationProviderReceipt | Record<string, unknown>
}

export type AIGenerationAdapter<TInput, TOutput extends AIGenerationAdapterOutput> =
  (input: TInput) => Promise<TOutput>

export interface RunAIGenerationInput<TInput, TOutput extends AIGenerationAdapterOutput> {
  context: AIGenerationContext
  feature: AIFeature
  modality: AIModality
  model?: string
  prompt: string
  input: TInput
  metadata?: Record<string, unknown>
  adapter: AIGenerationAdapter<TInput, TOutput>
  recordSuccessEvent?: boolean
}

export interface AIGenerationResult<TOutput extends AIGenerationAdapterOutput> {
  output: TOutput
  generationEventId?: string
  eventError?: string
}
