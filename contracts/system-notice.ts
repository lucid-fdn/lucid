import { z } from 'zod'

export const SystemNoticeToneSchema = z.enum(['neutral', 'info', 'success', 'warning', 'danger'])
export type SystemNoticeTone = z.infer<typeof SystemNoticeToneSchema>

export const SystemNoticeTypeSchema = z.enum([
  'run_started',
  'run_completed',
  'run_failed',
  'run_blocked',
  'handoff_required',
  'planning_mode',
  'stale_context',
  'workspace_changed',
  'knowledge_claim_drift',
  'source_refresh_failed',
  'runtime_incompatible',
  'entitlement_fallback',
  'channel_report_ready',
  'l2_projection_failed',
  'eval_regression',
  'system_health',
])

export type SystemNoticeType = z.infer<typeof SystemNoticeTypeSchema>

export const SystemNoticeMetadataItemSchema = z.object({
  label: z.string().min(1).max(120),
  value: z.string().max(1000),
  kind: z.enum(['text', 'code', 'link', 'run', 'agent', 'source', 'claim', 'evidence']).default('text'),
  href: z.string().max(2000).optional(),
})

export const SystemNoticeActionSchema = z.object({
  label: z.string().min(1).max(120),
  action: z.string().min(1).max(160),
  href: z.string().max(2000).optional(),
  method: z.enum(['GET', 'POST']).optional(),
})

export const SystemNoticeSchema = z.object({
  id: z.string().uuid(),
  type: SystemNoticeTypeSchema,
  tone: SystemNoticeToneSchema,
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  createdAt: z.string(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  runId: z.string().uuid().nullable().optional(),
  agentId: z.string().uuid().nullable().optional(),
  channelType: z.string().max(80).nullable().optional(),
  dedupeKey: z.string().max(240).nullable().optional(),
  metadata: z.array(SystemNoticeMetadataItemSchema).default([]),
  actions: z.array(SystemNoticeActionSchema).default([]),
  details: z.record(z.string(), z.unknown()).default({}),
  acknowledgedAt: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
})

export type SystemNotice = z.infer<typeof SystemNoticeSchema>

export const CreateSystemNoticeSchema = SystemNoticeSchema.omit({
  id: true,
  createdAt: true,
  acknowledgedAt: true,
  resolvedAt: true,
}).extend({
  createdByUserId: z.string().uuid().nullable().optional(),
})

export type CreateSystemNoticeInput = z.infer<typeof CreateSystemNoticeSchema>
