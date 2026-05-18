import { z } from 'zod'

export const KnowledgeImportSourceTypeSchema = z.enum([
  'codex_session',
  'claude_code_session',
  'cursor_export',
  'channel_transcript',
  'browser_artifact',
  'meeting_notes',
  'repo_docs',
  'manual_upload',
])

export const KnowledgeImportModeSchema = z.enum(['probe', 'preview', 'commit', 'incremental'])
export const KnowledgeImportStatusSchema = z.enum(['queued', 'running', 'preview_ready', 'committed', 'failed', 'cancelled'])

export const KnowledgeImportJobSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  sourceType: KnowledgeImportSourceTypeSchema,
  mode: KnowledgeImportModeSchema,
  status: KnowledgeImportStatusSchema,
  itemCount: z.number().int().nonnegative().default(0),
  redactionCount: z.number().int().nonnegative().default(0),
  errorMessage: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type KnowledgeImportJob = z.infer<typeof KnowledgeImportJobSchema>

export const KnowledgeImportItemSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  importJobId: z.string().uuid(),
  itemKey: z.string().min(1).max(500),
  itemType: z.string().min(1).max(120),
  status: z.enum(['preview', 'skipped', 'committed', 'failed']),
  contentHash: z.string().min(16).max(160),
  title: z.string().max(500).nullable().optional(),
  preview: z.string().max(4000).nullable().optional(),
  redactions: z.array(z.record(z.string(), z.unknown())).default([]),
  outputRefs: z.array(z.record(z.string(), z.unknown())).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
})

export type KnowledgeImportItem = z.infer<typeof KnowledgeImportItemSchema>

export const KnowledgeImportPayloadItemSchema = z.object({
  key: z.string().min(1).max(500).optional(),
  type: z.string().min(1).max(120).default('document'),
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).max(100_000),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type KnowledgeImportPayloadItem = z.infer<typeof KnowledgeImportPayloadItemSchema>

export const KnowledgeImportPreviewRequestSchema = z.object({
  org_id: z.string().uuid(),
  raw_text: z.string().min(1).max(500_000).optional(),
  items: z.array(KnowledgeImportPayloadItemSchema).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).refine((value) => Boolean(value.raw_text?.trim() || value.items?.length), {
  message: 'Provide raw_text or at least one import item',
  path: ['items'],
})

export type KnowledgeImportPreviewRequest = z.infer<typeof KnowledgeImportPreviewRequestSchema>

export const KnowledgeImportCommitTargetSchema = z.enum(['claims'])

export const KnowledgeImportCommitRequestSchema = z.object({
  org_id: z.string().uuid(),
  target: KnowledgeImportCommitTargetSchema.default('claims'),
  item_keys: z.array(z.string().min(1).max(500)).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type KnowledgeImportCommitRequest = z.infer<typeof KnowledgeImportCommitRequestSchema>

export const CreateKnowledgeImportJobSchema = KnowledgeImportJobSchema.omit({
  id: true,
  status: true,
  itemCount: true,
  redactionCount: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: KnowledgeImportStatusSchema.default('queued'),
  createdByUserId: z.string().uuid().nullable().optional(),
})

export type CreateKnowledgeImportJobInput = z.infer<typeof CreateKnowledgeImportJobSchema>
