import { z } from 'zod'

const uuidSchema = z.string().uuid()
const nullableUuidSchema = uuidSchema.nullable().optional()

export const BrainLayerSchema = z.enum([
  'facts',
  'guidance',
  'documents',
  'sources',
  'graph',
  'evidence',
])

export const BrainQueryModeSchema = z.enum(['summary', 'evidence', 'full', 'context_packet']).default('evidence')

export const BrainQueryRequestSchema = z.object({
  org_id: uuidSchema,
  project_id: nullableUuidSchema,
  team_id: nullableUuidSchema,
  assistant_id: nullableUuidSchema,
  scoped_user_id: z.string().nullable().optional(),
  source_id: nullableUuidSchema,
  source_key: z.string().min(1).max(240).nullable().optional(),
  query: z.string().min(1).max(8000),
  mode: BrainQueryModeSchema.optional(),
  layers: z.array(BrainLayerSchema).optional(),
  budget: z.object({
    max_latency_ms: z.number().int().positive().max(10_000).optional(),
    max_prompt_tokens: z.number().int().positive().max(40_000).optional(),
    max_items_per_layer: z.number().int().positive().max(100).optional(),
  }).optional(),
  eval_capture: z.object({
    enabled: z.boolean().optional(),
    case_id: uuidSchema.nullable().optional(),
    expected_item_ids: z.array(z.string()).optional(),
    expected_citation_keys: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
})

export const BrainRememberKindSchema = z.enum([
  'fact',
  'guidance',
  'document',
  'source',
  'recall_test',
])

export const BrainGuidanceKindSchema = z.enum([
  'policy',
  'decision',
  'risk',
  'preference',
  'thesis',
  'signal',
  'open_question',
  'memory',
  'take',
  'bet',
  'hunch',
])

export const BrainRememberRequestSchema = z.object({
  org_id: uuidSchema,
  source_id: nullableUuidSchema,
  source_key: z.string().min(1).max(240).nullable().optional(),
  kind: BrainRememberKindSchema,
  title: z.string().min(1).max(240),
  body: z.string().min(1).max(200_000),
  project_id: nullableUuidSchema,
  team_id: nullableUuidSchema,
  assistant_id: nullableUuidSchema,
  url: z.string().url().nullable().optional(),
  file_name: z.string().max(500).nullable().optional(),
  mime_type: z.string().max(120).nullable().optional(),
  guidance_kind: BrainGuidanceKindSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type BrainLayer = z.infer<typeof BrainLayerSchema>
export type BrainQueryRequest = z.infer<typeof BrainQueryRequestSchema>
export type BrainRememberRequest = z.infer<typeof BrainRememberRequestSchema>
export type BrainRememberKind = z.infer<typeof BrainRememberKindSchema>
export type BrainGuidanceKind = z.infer<typeof BrainGuidanceKindSchema>
