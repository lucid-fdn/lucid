import 'server-only'

import { AGENT_AVATAR_STYLE_PRESETS } from './styles'
import type { AgentAvatarSpec } from './types'

function compact(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function genderPresentationLine(value: AgentAvatarSpec['genderPresentation']): string {
  switch (value) {
    case 'masculine':
      return 'Gender presentation: masculine / male-presenting.'
    case 'feminine':
      return 'Gender presentation: feminine / woman-presenting.'
    case 'auto':
    default:
      return 'Gender presentation: infer naturally from the agent name, role, and description without stereotypes.'
  }
}

function poseLine(value: AgentAvatarSpec['pose']): string {
  switch (value) {
    case 'confident-shoulder-turn':
      return 'Pose: subtle confident shoulder turn, upright posture, face still clearly visible.'
    case 'thoughtful-listener':
      return 'Pose: thoughtful listener posture, calm attentive head position, natural shoulders.'
    case 'calm-operator':
      return 'Pose: calm operator posture, composed head-and-shoulders stance, steady presence.'
    case 'standard-portrait':
    default:
      return 'Pose: standard premium portrait pose, symmetrical shoulders, relaxed upright posture.'
  }
}

export function buildAgentAvatarPrompt(spec: AgentAvatarSpec): string {
  const lines = [
    'Create a square profile picture for a Lucid AI agent.',
    `Agent name: ${spec.name.trim() || 'Lucid Agent'}.`,
    compact(spec.role) ? `Agent role: ${compact(spec.role)}.` : null,
    compact(spec.description) ? `Agent description: ${compact(spec.description)}.` : null,
    spec.personalityTraits?.length
      ? `Personality traits: ${spec.personalityTraits.map((trait) => trait.trim()).filter(Boolean).join(', ')}.`
      : null,
    `Visual style: ${AGENT_AVATAR_STYLE_PRESETS[spec.stylePreset]}.`,
    genderPresentationLine(spec.genderPresentation),
    `Camera angle: ${spec.angle === 'front' ? 'front-facing portrait' : 'front three-quarter portrait'}.`,
    `Crop: ${spec.crop === 'headshot' ? 'tight headshot' : 'head-and-shoulders portrait'}.`,
    poseLine(spec.pose),
    `Expression: ${spec.expression.replace(/-/g, ' ')}.`,
    `Background: ${spec.background.replace(/-/g, ' ')}.`,
    `Lighting: ${spec.lighting.replace(/-/g, ' ')}.`,
    'Composition rules: centered face, consistent pose and framing, safe circular-avatar margins, eyes clearly visible, balanced shoulders, no cropped forehead or chin.',
    'Brand rules: polished modern technology aesthetic, readable at 40px, distinctive but not cluttered.',
    'Hard exclusions: no text, no letters, no logos, no watermarks, no UI, no badges, no busy background, no copyrighted characters.',
    spec.lockIdentity && (spec.referenceImageUrl || spec.referenceAssetId)
      ? 'Identity lock: keep the same face, facial structure, age range, expression family, pose family, camera angle, and overall character identity from the reference image while applying only the requested style/framing changes.'
      : null,
  ].filter(Boolean)

  return lines.join('\n')
}

export function hashAvatarPrompt(prompt: string): string {
  // Fast deterministic hash for database dedupe/debug metadata; not security-sensitive.
  let hash = 5381
  for (let index = 0; index < prompt.length; index += 1) {
    hash = ((hash << 5) + hash) ^ prompt.charCodeAt(index)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
