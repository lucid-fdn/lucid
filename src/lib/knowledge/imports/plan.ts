import crypto from 'node:crypto'

import { redactKnowledgeImportSecrets } from './secret-scan'
import type {
  KnowledgeImportPreviewPlan,
  KnowledgeImportPreviewPlanInput,
  KnowledgeImportPreviewPlanItem,
  ParsedKnowledgeImportItem,
} from './types'

const MAX_PREVIEW_CHARS = 4_000
const MAX_COMMIT_CONTENT_CHARS = 8_000

export function buildKnowledgeImportPreviewPlan(input: KnowledgeImportPreviewPlanInput): KnowledgeImportPreviewPlan {
  const seenContentHashes = new Set<string>()
  const items: KnowledgeImportPreviewPlanItem[] = input.items.map((item) => {
    const contentHash = hashImportContent(item.content)
    const duplicateInPayload = seenContentHashes.has(contentHash)
    const duplicateInKnowledge = input.existingContentHashes?.has(contentHash) ?? false
    seenContentHashes.add(contentHash)

    return buildPreviewItem({
      item,
      contentHash,
      skippedReason: duplicateInPayload
        ? 'duplicate_in_payload'
        : duplicateInKnowledge
          ? 'duplicate_in_previous_import'
          : null,
    })
  })

  return {
    items,
    itemCount: items.length,
    previewItemCount: items.filter((item) => item.status === 'preview').length,
    skippedItemCount: items.filter((item) => item.status === 'skipped').length,
    redactionCount: items.reduce((sum, item) => sum + item.redactions.length, 0),
    contentHashes: items.map((item) => item.contentHash),
  }
}

export function hashImportContent(content: string): string {
  return crypto
    .createHash('sha256')
    .update(normalizeHashContent(content))
    .digest('hex')
}

function buildPreviewItem(input: {
  item: ParsedKnowledgeImportItem
  contentHash: string
  skippedReason: string | null
}): KnowledgeImportPreviewPlanItem {
  const redacted = redactKnowledgeImportSecrets(input.item.content)
  const preview = toPreview(redacted.content)
  return {
    itemKey: input.item.key,
    itemType: input.item.type,
    status: input.skippedReason ? 'skipped' : 'preview',
    contentHash: input.contentHash,
    title: input.item.title,
    preview,
    redactions: redacted.redactions,
    outputRefs: [],
    metadata: {
      ...input.item.metadata,
      original_length: input.item.content.length,
      redacted_length: redacted.content.length,
      redacted_content: redacted.content.slice(0, MAX_COMMIT_CONTENT_CHARS),
      skipped_reason: input.skippedReason,
      import_safety: redacted.redactions.length > 0 ? 'redacted' : 'clean',
    },
  }
}

function toPreview(content: string): string {
  const trimmed = content.trim()
  if (trimmed.length <= MAX_PREVIEW_CHARS) return trimmed
  return `${trimmed.slice(0, MAX_PREVIEW_CHARS - 32).trimEnd()}\n\n[Preview truncated]`
}

function normalizeHashContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim()
}
