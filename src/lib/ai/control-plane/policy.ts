import 'server-only'

import { AIGenerationControlPlaneError } from './errors'
import type { AIFeature, AIGenerationContext } from './types'

const ORG_SCOPED_FEATURES = new Set<AIFeature>([
  'agent-avatar-generation',
  'agent-cover-generation',
  'generic-image-generation',
  'image-generation',
  'project-generation',
  'voice-reply',
  'transcription',
  'agent-run',
])

export function assertAIGenerationPolicy(input: {
  context: AIGenerationContext
  feature: AIFeature
}): void {
  if (ORG_SCOPED_FEATURES.has(input.feature) && !input.context.orgId) {
    throw new AIGenerationControlPlaneError(
      'policy_blocked',
      `${input.feature} requires an organization context.`,
      403,
    )
  }
}
