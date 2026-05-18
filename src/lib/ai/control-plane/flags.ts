import 'server-only'

function parseFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false
  return defaultValue
}

export function isAIGenerationControlPlaneEnabled(): boolean {
  return parseFlag(process.env.AI_GENERATION_CONTROL_PLANE_ENABLED, true)
}

export function isAIGenerationImageEnabled(): boolean {
  return parseFlag(process.env.AI_GENERATION_IMAGE_ENABLED, true)
}

export function isAgentAvatarGenerationEnabled(): boolean {
  return parseFlag(process.env.AI_GENERATION_AGENT_AVATAR_ENABLED, true)
}

export function isDirectOpenAIImageFallbackEnabled(): boolean {
  return parseFlag(process.env.AI_IMAGE_DIRECT_OPENAI_FALLBACK_ENABLED, false)
}

export function assertAIGenerationFlags(input: {
  modality: string
  feature: string
}): void {
  if (!isAIGenerationControlPlaneEnabled()) {
    throw new AIGenerationFeatureDisabledError(
      'AI generation control plane is disabled.',
      'AI_GENERATION_CONTROL_PLANE_ENABLED',
    )
  }

  if (input.modality === 'image' && !isAIGenerationImageEnabled()) {
    throw new AIGenerationFeatureDisabledError(
      'AI image generation is disabled.',
      'AI_GENERATION_IMAGE_ENABLED',
    )
  }

  if (input.feature === 'agent-avatar-generation' && !isAgentAvatarGenerationEnabled()) {
    throw new AIGenerationFeatureDisabledError(
      'Agent avatar generation is disabled.',
      'AI_GENERATION_AGENT_AVATAR_ENABLED',
    )
  }
}

export class AIGenerationFeatureDisabledError extends Error {
  constructor(
    message: string,
    public readonly flag: string,
  ) {
    super(message)
    this.name = 'AIGenerationFeatureDisabledError'
  }
}

export function isAIGenerationFeatureDisabledError(
  error: unknown,
): error is AIGenerationFeatureDisabledError {
  return error instanceof AIGenerationFeatureDisabledError
}
