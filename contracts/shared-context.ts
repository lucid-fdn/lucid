import { z } from 'zod'

export const SharedContextScopeTypeSchema = z.enum(['workspace', 'project', 'team', 'agent', 'user'])
export type SharedContextScopeType = z.infer<typeof SharedContextScopeTypeSchema>

export const SharedContextRecordTypeSchema = z.enum([
  'thesis',
  'signal',
  'feedback',
  'daily_intel',
  'memory',
  'decision',
  'policy',
  'risk',
  'open_question',
])
export type SharedContextRecordType = z.infer<typeof SharedContextRecordTypeSchema>

export const SharedContextStatusSchema = z.enum(['draft', 'active', 'resolved', 'superseded', 'archived'])
export type SharedContextStatus = z.infer<typeof SharedContextStatusSchema>

export const SharedContextLinkTargetTypeSchema = z.enum([
  'knowledge_page',
  'knowledge_claim',
  'knowledge_source',
  'commerce_event',
  'agent_ops_run',
  'memory',
  'heartbeat',
  'candidate',
  'doc',
  'external_signal',
])
export type SharedContextLinkTargetType = z.infer<typeof SharedContextLinkTargetTypeSchema>

export const SharedContextLinkSchema = z.object({
  id: z.string().uuid().optional(),
  record_id: z.string().uuid().optional(),
  target_type: SharedContextLinkTargetTypeSchema,
  target_id: z.string().min(1).max(500),
  label: z.string().max(240).nullable().optional(),
  url: z.string().url().nullable().optional(),
  provenance: z.string().max(1000).nullable().optional(),
  observed_at: z.string().datetime().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string().optional(),
})
export type SharedContextLink = z.infer<typeof SharedContextLinkSchema>

export const SharedContextRecordSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
  agent_id: z.string().uuid().nullable(),
  scope_type: SharedContextScopeTypeSchema,
  scope_id: z.string(),
  record_type: SharedContextRecordTypeSchema,
  title: z.string(),
  body: z.string(),
  source_type: z.string().nullable(),
  source_id: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  status: SharedContextStatusSchema,
  valid_from: z.string().nullable(),
  valid_until: z.string().nullable(),
  superseded_by_record_id: z.string().uuid().nullable().optional(),
  resolved_at: z.string().nullable().optional(),
  resolved_by: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()),
  links: z.array(SharedContextLinkSchema).default([]),
  created_by: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type SharedContextRecord = z.infer<typeof SharedContextRecordSchema>

export const CreateSharedContextRecordSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  agent_id: z.string().uuid().nullable().optional(),
  scope_type: SharedContextScopeTypeSchema,
  scope_id: z.string().min(1),
  record_type: SharedContextRecordTypeSchema,
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  source_type: z.string().max(100).nullable().optional(),
  source_id: z.string().max(200).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  status: SharedContextStatusSchema.default('active'),
  valid_from: z.string().nullable().optional(),
  valid_until: z.string().nullable().optional(),
  superseded_by_record_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  links: z.array(SharedContextLinkSchema).default([]),
})

export type CreateSharedContextRecordInput = z.infer<typeof CreateSharedContextRecordSchema>

export const UpdateSharedContextRecordSchema = z.object({
  record_type: SharedContextRecordTypeSchema.optional(),
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(10000).optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  status: SharedContextStatusSchema.optional(),
  valid_from: z.string().nullable().optional(),
  valid_until: z.string().nullable().optional(),
  superseded_by_record_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  links: z.array(SharedContextLinkSchema).optional(),
})

export type UpdateSharedContextRecordInput = z.infer<typeof UpdateSharedContextRecordSchema>

export const SharedContextScopeRefSchema = z.object({
  scope_type: SharedContextScopeTypeSchema,
  scope_id: z.string(),
  precedence: z.number().int().min(0),
})

export type SharedContextScopeRef = z.infer<typeof SharedContextScopeRefSchema>

export const ResolvedSharedContextSchema = z.object({
  workspace_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
  team_id: z.string().uuid().nullable(),
  agent_id: z.string().uuid().nullable(),
  user_id: z.string().uuid().nullable(),
  generated_at: z.string(),
  scopes: z.array(SharedContextScopeRefSchema),
  records: z.array(SharedContextRecordSchema),
  inherited_policy: z.record(z.string(), z.unknown()),
  policy_sources: z.array(z.object({
    record_id: z.string().uuid(),
    scope_type: SharedContextScopeTypeSchema,
    scope_id: z.string(),
    title: z.string(),
    keys: z.array(z.string()),
    overrides: z.array(z.string()),
  })),
  policy_conflicts: z.array(z.object({
    key: z.string(),
    winning_record_id: z.string().uuid(),
    overridden_record_ids: z.array(z.string().uuid()),
    scopes: z.array(SharedContextScopeTypeSchema),
  })),
  prompt_sections: z.array(z.string()),
})

export type ResolvedSharedContext = z.infer<typeof ResolvedSharedContextSchema>

export const GenerateDailyIntelPreviewSchema = z.object({
  lookback_hours: z.number().int().min(1).max(168).default(24),
  publish: z.boolean().default(false),
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(10000).optional(),
})

export type GenerateDailyIntelPreviewInput = z.infer<typeof GenerateDailyIntelPreviewSchema>
