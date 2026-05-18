import 'server-only'

import { AIGenerationControlPlaneError } from './errors'
import type { AIGenerationContext } from './types'

export function validateAIGenerationContext(context: AIGenerationContext): void {
  if (!context.userId?.trim()) {
    throw new AIGenerationControlPlaneError('invalid_context', 'AI generation requires an authenticated user.', 401)
  }
}
