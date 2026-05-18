import 'server-only'

import { validateAIGenerationContext } from './context'
import { writeAIGenerationEvent } from './events'
import { assertAIGenerationFlags } from './flags'
import { assertAIGenerationPolicy } from './policy'
import { extractProviderReceipt } from './receipts'
import type {
  AIGenerationAdapterOutput,
  AIGenerationResult,
  RunAIGenerationInput,
} from './types'

export async function runAIGeneration<TInput, TOutput extends AIGenerationAdapterOutput>(
  input: RunAIGenerationInput<TInput, TOutput>,
): Promise<AIGenerationResult<TOutput>> {
  assertAIGenerationFlags({ modality: input.modality, feature: input.feature })
  validateAIGenerationContext(input.context)
  assertAIGenerationPolicy({ context: input.context, feature: input.feature })

  try {
    const output = await input.adapter(input.input)
    let generationEventId: string | undefined
    let eventError: string | undefined

    if (input.recordSuccessEvent !== false) {
      try {
        generationEventId = await writeAIGenerationEvent({
          context: input.context,
          feature: input.feature,
          modality: input.modality,
          prompt: input.prompt,
          success: true,
          provider: output.provider,
          model: output.model ?? input.model,
          usage: output.usage,
          metadata: {
            ...input.metadata,
            receipt: extractProviderReceipt(output),
          },
        })
      } catch (error) {
        eventError = error instanceof Error ? error.message : String(error)
      }
    }

    return { output, generationEventId, eventError }
  } catch (error) {
    await writeAIGenerationEvent({
      context: input.context,
      feature: input.feature,
      modality: input.modality,
      prompt: input.prompt,
      success: false,
      model: input.model,
      metadata: input.metadata,
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => {})
    throw error
  }
}
