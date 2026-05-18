import 'server-only'

import { listDeployableTemplateCatalogEntries } from '@/lib/templates/library-server'
import { generateProjectBlueprint, refineGeneratedDraft } from '@/lib/ai/project-generation/generate-blueprint'
import type {
  BuilderAgentInvocationInput,
  BuilderAgentInvocationResult,
  BuilderPlanningBackend,
} from './types'

const TEMPLATE_CACHE_TTL_MS = 60_000
const templateCatalogCache = new Map<string, {
  expiresAt: number
  value: Awaited<ReturnType<typeof listDeployableTemplateCatalogEntries>>
}>()

export async function invokeBuilderAgentLocal(
  input: BuilderAgentInvocationInput & {
    planningBackend: BuilderPlanningBackend
  },
): Promise<BuilderAgentInvocationResult> {
  const templates = await getCachedTemplateCatalog(input.orgId)
  const result = input.draft
    ? await refineGeneratedDraft({
        prompt: input.prompt,
        draft: input.draft,
        templates,
        strongModel: input.models.strongModel,
        strongModelId: input.models.modelId,
        preferredMode: input.preferredMode,
        planningBackend: input.planningBackend,
        availableUnifiedSkills: input.availableUnifiedSkills,
        telemetry: {
          userId: input.telemetry?.userId,
          orgId: input.telemetry?.orgId ?? input.orgId,
          modelId: input.telemetry?.modelId ?? input.models.modelId,
        },
      })
    : await generateProjectBlueprint({
        prompt: input.prompt,
        templates,
        strongModel: input.models.strongModel,
        fastModel: input.models.fastModel,
        strongModelId: input.models.modelId,
        preferredMode: input.preferredMode,
        selectedTemplateSlug: input.selectedTemplateSlug,
        runtimeMode: input.runtimeMode,
        planningBackend: input.planningBackend,
        availableUnifiedSkills: input.availableUnifiedSkills,
        telemetry: {
          userId: input.telemetry?.userId,
          orgId: input.telemetry?.orgId ?? input.orgId,
          modelId: input.telemetry?.modelId ?? input.models.modelId,
          fastModelId: input.telemetry?.fastModelId ?? input.models.fastModelId,
        },
      })

  return {
    backend: 'local-orchestrator',
    result,
  }
}

async function getCachedTemplateCatalog(orgId: string) {
  const cached = templateCatalogCache.get(orgId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const value = await listDeployableTemplateCatalogEntries({ orgId })
  templateCatalogCache.set(orgId, {
    expiresAt: Date.now() + TEMPLATE_CACHE_TTL_MS,
    value,
  })
  return value
}
