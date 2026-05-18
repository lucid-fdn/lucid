import 'server-only'

import type { LanguageModel } from 'ai'
import type { RuntimeBlueprint } from '@contracts/project-blueprint'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

import { getBYOKModel } from '@/lib/ai/byok-provider'
import { DEFAULT_MODEL_ID } from '@/lib/ai/models'
import { normalizeProviderSecret } from '@/lib/ai/provider-policy'
import { isLucidConfigured } from '@/lib/ai/providers'
import type { GeneratedBlueprintResult, GenerationDraft } from '@/lib/ai/project-generation/schemas'
import { invokeBuilderAgent } from '@/lib/ai/platform/agent-runtime'
import { logBuilderTelemetry } from '@/lib/ai/project-generation/builder-telemetry'

export const BUILDER_FAST_MODEL_ID = 'openai/gpt-4.1-mini'
export const BUILDER_OPENAI_FALLBACK_MODEL_ID = 'gpt-4.1-mini'

export interface ProjectBuilderModelResolution {
  requestedModelId: string
  modelId: string
  fastModelId: string
  strongModel: string | LanguageModel
  fastModel: string | LanguageModel
  useGatewayFallback: boolean
}

export interface RunProjectBuilderTurnInput {
  orgId: string
  prompt: string
  draft?: GenerationDraft
  selectedTemplateSlug?: string
  preferredMode?: 'auto' | 'template' | 'agent' | 'team'
  runtimeMode?: RuntimeBlueprint['mode']
  availableUnifiedSkills?: UnifiedSkillItem[]
  requestedModelId?: string
  telemetry?: {
    userId?: string
    orgId?: string
  }
  resolvedModels?: ProjectBuilderModelResolution
}

function canUseOpenAIFallback() {
  return Boolean(normalizeProviderSecret(process.env.OPENAI_API_KEY))
}

export async function resolveProjectBuilderModels(
  orgId: string,
  requestedModelId = DEFAULT_MODEL_ID,
): Promise<ProjectBuilderModelResolution> {
  const startedAt = Date.now()
  const useGatewayFallback = !isLucidConfigured() && canUseOpenAIFallback()
  const modelId = useGatewayFallback ? BUILDER_OPENAI_FALLBACK_MODEL_ID : requestedModelId
  const [strongModel, fastModel] = useGatewayFallback
    ? [modelId, BUILDER_OPENAI_FALLBACK_MODEL_ID]
    : await Promise.all([
        getBYOKModel(orgId, modelId).then((result) => result.model),
        getBYOKModel(orgId, BUILDER_FAST_MODEL_ID).then((result) => result.model),
      ])

  const resolution = {
    requestedModelId,
    modelId,
    fastModelId: BUILDER_FAST_MODEL_ID,
    strongModel,
    fastModel,
    useGatewayFallback,
  }

  logBuilderTelemetry('[builder:model-resolution]', {
    orgId,
    requestedModelId,
    modelId,
    useGatewayFallback,
    duration_ms: Date.now() - startedAt,
  })

  return resolution
}

export async function runProjectBuilderTurn(
  input: RunProjectBuilderTurnInput,
): Promise<{
  result: GeneratedBlueprintResult
  models: ProjectBuilderModelResolution
}> {
  const startedAt = Date.now()
  const models = input.resolvedModels ?? await resolveProjectBuilderModels(
    input.orgId,
    input.requestedModelId ?? DEFAULT_MODEL_ID,
  )

  const result = await invokeBuilderAgent({
    orgId: input.orgId,
    prompt: input.prompt,
    draft: input.draft,
    selectedTemplateSlug: input.selectedTemplateSlug,
    preferredMode: input.preferredMode,
    runtimeMode: input.runtimeMode,
    availableUnifiedSkills: input.availableUnifiedSkills,
    telemetry: {
      userId: input.telemetry?.userId,
      orgId: input.telemetry?.orgId ?? input.orgId,
      modelId: models.modelId,
      fastModelId: models.fastModelId,
    },
    models,
  })

  logBuilderTelemetry('[builder:turn]', {
    orgId: input.orgId,
    modelId: models.modelId,
    fastModelId: models.fastModelId,
    mode: result.mode,
    usedDraftRefinement: Boolean(input.draft),
    duration_ms: Date.now() - startedAt,
  })

  return { result, models }
}
