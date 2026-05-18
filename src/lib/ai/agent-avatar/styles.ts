import 'server-only'

import type {
  AgentAvatarAngle,
  AgentAvatarBackground,
  AgentAvatarCrop,
  AgentAvatarExpression,
  AgentAvatarGenderPresentation,
  AgentAvatarLighting,
  AgentAvatarPose,
  AgentAvatarStylePreset,
} from './types'

export const AGENT_AVATAR_STYLE_PRESETS: Record<AgentAvatarStylePreset, string> = {
  'lucid-studio':
    'polished Lucid studio portrait, modern AI agent identity, clean premium product aesthetic, crisp details',
  'professional-portrait':
    'professional editorial portrait, realistic but not photo-identical, refined workplace presence, premium lighting',
  'soft-3d':
    'soft 3D character portrait, tactile materials, subtle depth, polished modern assistant avatar',
  'editorial-illustration':
    'high-end editorial illustration, refined linework and painterly polish, sophisticated technology brand style',
  'anime-editorial':
    'premium anime editorial portrait, refined character design, crisp linework, expressive eyes, soft studio rendering, modern SaaS avatar polish',
  'cinematic-real':
    'cinematic realistic portrait, controlled lens perspective, premium studio lighting, grounded and expressive',
  'minimal-mascot':
    'minimal friendly mascot portrait, simple readable shapes, premium app icon clarity, restrained personality',
}

export const AGENT_AVATAR_STYLE_LABELS: Record<AgentAvatarStylePreset, string> = {
  'lucid-studio': 'Lucid Studio',
  'professional-portrait': 'Professional',
  'soft-3d': 'Soft 3D',
  'editorial-illustration': 'Editorial',
  'anime-editorial': 'Anime',
  'cinematic-real': 'Cinematic',
  'minimal-mascot': 'Mascot',
}

export function normalizeAvatarStyle(value?: string | null): AgentAvatarStylePreset {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, '-')
  if (normalized && normalized in AGENT_AVATAR_STYLE_PRESETS) {
    return normalized as AgentAvatarStylePreset
  }

  switch (normalized) {
    case 'realistic':
      return 'professional-portrait'
    case '3d':
    case 'soft-3-d':
      return 'soft-3d'
    case 'anime':
    case 'anime-portrait':
    case 'anime-style':
      return 'anime-editorial'
    case 'cartoon':
      return 'editorial-illustration'
    default:
      return 'lucid-studio'
  }
}

export function normalizeAvatarAngle(value?: string | null): AgentAvatarAngle {
  return value === 'front' || value === 'front-three-quarter' ? value : 'front-three-quarter'
}

export function normalizeAvatarCrop(value?: string | null): AgentAvatarCrop {
  return value === 'headshot' || value === 'head-and-shoulders' ? value : 'head-and-shoulders'
}

export function normalizeAvatarExpression(value?: string | null): AgentAvatarExpression {
  switch (value) {
    case 'confident':
    case 'warm':
    case 'focused':
    case 'neutral-friendly':
      return value
    default:
      return 'neutral-friendly'
  }
}

export function normalizeAvatarBackground(value?: string | null): AgentAvatarBackground {
  switch (value) {
    case 'clean-dark':
    case 'subtle-depth':
    case 'transparent-safe':
    case 'clean-light':
      return value
    default:
      return 'subtle-depth'
  }
}

export function normalizeAvatarLighting(value?: string | null): AgentAvatarLighting {
  switch (value) {
    case 'cinematic-soft':
    case 'daylight-soft':
    case 'soft-studio':
      return value
    default:
      return 'soft-studio'
  }
}

export function normalizeAvatarGenderPresentation(value?: string | null): AgentAvatarGenderPresentation {
  const normalized = value?.trim().toLowerCase()
  switch (normalized) {
    case 'male':
    case 'man':
    case 'masculine':
      return 'masculine'
    case 'female':
    case 'woman':
    case 'feminine':
      return 'feminine'
    case 'auto':
    default:
      return 'auto'
  }
}

export function normalizeAvatarPose(value?: string | null): AgentAvatarPose {
  switch (value) {
    case 'confident-shoulder-turn':
    case 'thoughtful-listener':
    case 'calm-operator':
    case 'standard-portrait':
      return value
    default:
      return 'standard-portrait'
  }
}
