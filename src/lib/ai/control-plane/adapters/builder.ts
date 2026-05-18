import 'server-only'

import {
  runProjectBuilderTurn,
  type ProjectBuilderModelResolution,
  type RunProjectBuilderTurnInput,
} from '@/lib/ai/services/builder-service'
import type { GeneratedBlueprintResult } from '@/lib/ai/project-generation/schemas'
import type { AIGenerationAdapterOutput } from '../types'

export interface BuilderGenerationOutput extends AIGenerationAdapterOutput {
  result: GeneratedBlueprintResult
  models: ProjectBuilderModelResolution
  mode?: string
}

export async function builderGenerationAdapter(
  input: RunProjectBuilderTurnInput,
): Promise<BuilderGenerationOutput> {
  const startedAt = Date.now()
  const { result, models } = await runProjectBuilderTurn(input)
  const provider = models.useGatewayFallback ? 'openai' : 'trustgate'

  return {
    result,
    models,
    mode: result.mode,
    provider,
    model: models.modelId,
    receipt: {
      provider,
      model: models.modelId,
      latencyMs: Date.now() - startedAt,
      metadata: {
        fastModelId: models.fastModelId,
        requestedModelId: models.requestedModelId,
        useGatewayFallback: models.useGatewayFallback,
        mode: result.mode,
        usedDraftRefinement: Boolean(input.draft),
        preferredMode: input.preferredMode,
        runtimeMode: input.runtimeMode,
      },
    },
  }
}
