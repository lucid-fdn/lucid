import { z } from 'zod'

import { SharedContextRecordTypeSchema } from '@contracts/shared-context'

export const BrainIntakeDestinationSchema = z.enum([
  'context',
  'knowledge_fact',
  'knowledge_document',
  'knowledge_source',
  'recall_test',
])

export const BrainIntakeScopeSchema = z.enum([
  'workspace',
  'project',
  'team',
  'agent',
  'user',
])

export const BrainIntakeTrustLevelSchema = z.enum([
  'observed',
  'operator_approved',
  'system',
])

export const BrainIntakePrioritySchema = z.enum([
  'low',
  'normal',
  'high',
  'critical',
])

export const BrainIntakeFreshnessSchema = z.enum([
  'fresh',
  'aging',
  'stale',
  'unknown',
])

export const BrainIntakeRecommendedActionSchema = z.enum([
  'store',
  'review',
  'merge',
  'replace',
  'test_recall',
  'skip',
])

export const BrainIntakeKindSchema = z.enum([
  'instruction',
  'fact',
  'document',
  'source_url',
  'recall_question',
])

export const BrainIntakeFileSchema = z.object({
  name: z.string().min(1).max(500),
  type: z.string().max(120).optional().default(''),
  size: z.number().int().min(0).max(25 * 1024 * 1024),
  text: z.string().max(200_000).optional(),
})

export const BrainIntakeDraftItemSchema = z.object({
  id: z.string().min(1),
  kind: BrainIntakeKindSchema,
  destination: BrainIntakeDestinationSchema,
  selected: z.boolean().default(true),
  title: z.string().min(1).max(240),
  body: z.string().min(1).max(20_000),
  confidence: z.number().min(0).max(1),
  requiresReview: z.boolean().default(false),
  warnings: z.array(z.string()).default([]),
  url: z.string().url().nullable().optional(),
  fileName: z.string().max(500).nullable().optional(),
  mimeType: z.string().max(120).nullable().optional(),
  contextRecordType: SharedContextRecordTypeSchema.optional(),
  suggestedScope: BrainIntakeScopeSchema.default('workspace'),
  trustLevel: BrainIntakeTrustLevelSchema.default('observed'),
  priority: BrainIntakePrioritySchema.default('normal'),
  freshness: BrainIntakeFreshnessSchema.default('unknown'),
  recommendedAction: BrainIntakeRecommendedActionSchema.default('store'),
  explanation: z.string().max(1000).default('Classified by deterministic Brain intake.'),
  citations: z.array(z.object({
    label: z.string().min(1).max(240),
    url: z.string().url().optional(),
    fileName: z.string().max(500).optional(),
    quote: z.string().max(500).optional(),
    page: z.number().int().positive().optional(),
  })).default([]),
  extractedFacts: z.array(z.object({
    text: z.string().min(1).max(1000),
    confidence: z.number().min(0).max(1),
    citationKeys: z.array(z.string().min(1).max(120)).default([]),
  })).default([]),
  duplicateOf: z.object({
    kind: z.string().min(1).max(120),
    id: z.string().min(1).max(240),
    title: z.string().min(1).max(240),
    confidence: z.number().min(0).max(1),
  }).nullable().optional(),
  conflicts: z.array(z.object({
    id: z.string().min(1).max(240),
    summary: z.string().min(1).max(500),
    severity: z.enum(['low', 'medium', 'high']),
    suggestedAction: z.enum(['review', 'merge', 'replace', 'skip']),
  })).default([]),
})

export const BrainIntakeClassifyRequestSchema = z.object({
  orgId: z.string().uuid(),
  scopeId: z.string().min(1),
  text: z.string().max(200_000).default(''),
  files: z.array(BrainIntakeFileSchema).max(20).default([]),
})

export const BrainIntakeClassifyResponseSchema = z.object({
  items: z.array(BrainIntakeDraftItemSchema),
  summary: z.string(),
  quality: z.object({
    confidence: z.number().min(0).max(1),
    needsReviewCount: z.number().int().min(0),
    duplicateCount: z.number().int().min(0),
    conflictCount: z.number().int().min(0),
  }).default({
    confidence: 0,
    needsReviewCount: 0,
    duplicateCount: 0,
    conflictCount: 0,
  }),
  preview: z.object({
    affectedLayers: z.array(z.string()).default([]),
    estimatedRecallImpact: z.enum(['none', 'low', 'medium', 'high']).default('low'),
    warnings: z.array(z.string()).default([]),
  }).default({
    affectedLayers: [],
    estimatedRecallImpact: 'low',
    warnings: [],
  }),
})

export const BrainIntakeCommitRequestSchema = z.object({
  orgId: z.string().uuid(),
  scopeId: z.string().min(1),
  items: z.array(BrainIntakeDraftItemSchema).max(50),
})

export const BrainIntakeCommitResultSchema = z.object({
  itemId: z.string(),
  destination: BrainIntakeDestinationSchema,
  status: z.enum(['created', 'skipped', 'needs_upload']),
  id: z.string().nullable().optional(),
  message: z.string().optional(),
  recallQuery: z.string().optional(),
})

export const BrainIntakeCommitResponseSchema = z.object({
  results: z.array(BrainIntakeCommitResultSchema),
})

export type BrainIntakeDestination = z.infer<typeof BrainIntakeDestinationSchema>
export type BrainIntakeScope = z.infer<typeof BrainIntakeScopeSchema>
export type BrainIntakeTrustLevel = z.infer<typeof BrainIntakeTrustLevelSchema>
export type BrainIntakePriority = z.infer<typeof BrainIntakePrioritySchema>
export type BrainIntakeFreshness = z.infer<typeof BrainIntakeFreshnessSchema>
export type BrainIntakeRecommendedAction = z.infer<typeof BrainIntakeRecommendedActionSchema>
export type BrainIntakeKind = z.infer<typeof BrainIntakeKindSchema>
export type BrainIntakeFile = z.infer<typeof BrainIntakeFileSchema>
export type BrainIntakeDraftItem = z.infer<typeof BrainIntakeDraftItemSchema>
export type BrainIntakeClassifyRequest = z.infer<typeof BrainIntakeClassifyRequestSchema>
export type BrainIntakeClassifyResponse = z.infer<typeof BrainIntakeClassifyResponseSchema>
export type BrainIntakeCommitRequest = z.infer<typeof BrainIntakeCommitRequestSchema>
export type BrainIntakeCommitResponse = z.infer<typeof BrainIntakeCommitResponseSchema>
