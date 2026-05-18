import type { KnowledgeImportItem, KnowledgeImportPayloadItem, KnowledgeImportSourceTypeSchema } from '@contracts/knowledge-imports'
import type { z } from 'zod'

export type KnowledgeImportSourceType = z.infer<typeof KnowledgeImportSourceTypeSchema>

export interface KnowledgeImportRedaction {
  type: string
  label: string
  start: number
  end: number
  replacement: string
}

export interface ParsedKnowledgeImportItem extends KnowledgeImportPayloadItem {
  key: string
  type: string
  title: string
  content: string
  metadata: Record<string, unknown>
}

export interface KnowledgeImportPreviewPlanInput {
  sourceType: KnowledgeImportSourceType
  items: ParsedKnowledgeImportItem[]
  existingContentHashes?: Set<string>
}

export interface KnowledgeImportPreviewPlanItem {
  itemKey: string
  itemType: string
  status: KnowledgeImportItem['status']
  contentHash: string
  title: string
  preview: string
  redactions: KnowledgeImportRedaction[]
  outputRefs: Array<Record<string, unknown>>
  metadata: Record<string, unknown>
}

export interface KnowledgeImportPreviewPlan {
  items: KnowledgeImportPreviewPlanItem[]
  itemCount: number
  previewItemCount: number
  skippedItemCount: number
  redactionCount: number
  contentHashes: string[]
}

export interface KnowledgeImportCommitResult {
  committed: number
  failed: number
  skipped: number
  outputRefs: Array<Record<string, unknown>>
}
