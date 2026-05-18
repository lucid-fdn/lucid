import 'server-only'

import type { AIGenerationAdapterOutput, AIGenerationProviderReceipt, AIGenerationUsage } from '../types'

export interface StructuredGenerationAdapterInput<T> {
  execute: () => Promise<T> | T
  provider?: string
  model?: string
  usage?: AIGenerationUsage
  receipt?: AIGenerationProviderReceipt
  metadata?: Record<string, unknown>
}

export interface StructuredGenerationAdapterOutput<T> extends AIGenerationAdapterOutput {
  result: T
}

export async function structuredGenerationAdapter<T>(
  input: StructuredGenerationAdapterInput<T>,
): Promise<StructuredGenerationAdapterOutput<T>> {
  const startedAt = Date.now()
  const result = await input.execute()

  return {
    result,
    provider: input.provider,
    model: input.model,
    usage: input.usage,
    receipt: {
      ...input.receipt,
      latencyMs: input.receipt?.latencyMs ?? Date.now() - startedAt,
      metadata: input.metadata,
    },
  }
}
