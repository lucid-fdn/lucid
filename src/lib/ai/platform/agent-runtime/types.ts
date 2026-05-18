import 'server-only'

import type { RuntimeBlueprint } from '@contracts/project-blueprint'
import type { GeneratedBlueprintResult, GenerationDraft } from '@/lib/ai/project-generation/schemas'
import type { ProjectBuilderModelResolution } from '@/lib/ai/services/builder-service'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

export type BuilderPlanningBackend = 'local-orchestrator' | 'worker-agent'

export interface BuilderAgentInvocationInput {
  orgId: string
  prompt: string
  draft?: GenerationDraft
  selectedTemplateSlug?: string
  preferredMode?: 'auto' | 'template' | 'agent' | 'team'
  runtimeMode?: RuntimeBlueprint['mode']
  availableUnifiedSkills?: UnifiedSkillItem[]
  telemetry?: {
    userId?: string
    orgId?: string
    modelId?: string
    fastModelId?: string
  }
  models: ProjectBuilderModelResolution
}

export interface BuilderAgentInvocationResult {
  backend: 'local-orchestrator'
  result: GeneratedBlueprintResult
}
