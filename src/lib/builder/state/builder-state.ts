import type { UnifiedSkillItem } from '@contracts/unified-skill'

import type {
  BuilderDecisionCard,
  GeneratedBlueprintResult,
  GenerationDraft,
  TemplateMatch,
} from '@/lib/ai/project-generation/schemas'
import type { ProjectBuilderProgress } from '@/lib/ai/project-generation/chat'

export type BuilderAsyncStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

export interface BuilderTemplateEnrichment {
  status: BuilderAsyncStatus
  prompt: string | null
  match: TemplateMatch | null
  error: string | null
  updatedAt: number | null
}

export interface BuilderCapabilityMetadataEnrichment {
  status: BuilderAsyncStatus
  items: UnifiedSkillItem[]
  error: string | null
  updatedAt: number | null
}

export interface BuilderState {
  draft: GenerationDraft | null
  result: GeneratedBlueprintResult | null
  progress: ProjectBuilderProgress | null
  decisionCards: BuilderDecisionCard[]
  dismissedDecisionCardKeys: string[]
  templateSuggestion: BuilderTemplateEnrichment
  capabilityMetadata: BuilderCapabilityMetadataEnrichment
}

export const initialBuilderTemplateEnrichment: BuilderTemplateEnrichment = {
  status: 'idle',
  prompt: null,
  match: null,
  error: null,
  updatedAt: null,
}

export const initialBuilderCapabilityMetadataEnrichment: BuilderCapabilityMetadataEnrichment = {
  status: 'idle',
  items: [],
  error: null,
  updatedAt: null,
}
