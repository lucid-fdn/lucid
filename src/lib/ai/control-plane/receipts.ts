import 'server-only'

import type { AIGenerationAdapterOutput } from './types'

export function extractProviderReceipt(output: AIGenerationAdapterOutput): Record<string, unknown> {
  return {
    provider: output.provider,
    model: output.model,
    usage: output.usage,
    receipt: output.receipt,
  }
}
