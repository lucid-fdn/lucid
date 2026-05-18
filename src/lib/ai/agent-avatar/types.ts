import 'server-only'

export type AgentAvatarStylePreset =
  | 'lucid-studio'
  | 'professional-portrait'
  | 'soft-3d'
  | 'editorial-illustration'
  | 'anime-editorial'
  | 'cinematic-real'
  | 'minimal-mascot'

export type AgentAvatarAngle = 'front' | 'front-three-quarter'
export type AgentAvatarCrop = 'headshot' | 'head-and-shoulders'
export type AgentAvatarExpression = 'neutral-friendly' | 'confident' | 'warm' | 'focused'
export type AgentAvatarBackground = 'clean-light' | 'clean-dark' | 'subtle-depth' | 'transparent-safe'
export type AgentAvatarLighting = 'soft-studio' | 'cinematic-soft' | 'daylight-soft'
export type AgentAvatarGenderPresentation = 'auto' | 'masculine' | 'feminine'
export type AgentAvatarPose =
  | 'standard-portrait'
  | 'confident-shoulder-turn'
  | 'thoughtful-listener'
  | 'calm-operator'
export type AgentAvatarPromptVersion = 'agent-avatar-v1'

export interface AgentAvatarSpec {
  assistantId?: string
  draftId?: string
  orgId: string
  userId: string
  name: string
  role?: string
  description?: string
  personalityTraits?: string[]
  stylePreset: AgentAvatarStylePreset
  angle: AgentAvatarAngle
  crop: AgentAvatarCrop
  expression: AgentAvatarExpression
  background: AgentAvatarBackground
  lighting: AgentAvatarLighting
  genderPresentation: AgentAvatarGenderPresentation
  pose: AgentAvatarPose
  referenceAssetId?: string
  referenceImageUrl?: string
  lockIdentity: boolean
  promptVersion: AgentAvatarPromptVersion
}

export interface AgentAvatarAsset {
  id: string
  url: string
  provider: string
  model: string
  promptVersion: AgentAvatarPromptVersion
  stylePreset: AgentAvatarStylePreset
  angle: AgentAvatarAngle
  crop: AgentAvatarCrop
  expression: AgentAvatarExpression
  background: AgentAvatarBackground
  lighting: AgentAvatarLighting
  genderPresentation?: AgentAvatarGenderPresentation
  pose?: AgentAvatarPose
  width: number
  height: number
  mimeType: string
  metadata: Record<string, unknown>
}
