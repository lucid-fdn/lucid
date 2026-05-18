import { z } from 'zod'

export const KnowledgeClaimTypeSchema = z.enum(['fact', 'claim', 'hunch', 'bet', 'decision', 'risk', 'preference'])
export const KnowledgeClaimHolderTypeSchema = z.enum(['world', 'operator', 'agent', 'team', 'source', 'system'])
export const KnowledgeClaimStatusSchema = z.enum(['active', 'superseded', 'resolved', 'dismissed', 'archived'])
export const KnowledgeClaimResolvedOutcomeSchema = z.enum(['true', 'false', 'partial', 'obsolete', 'unknown'])
export const KnowledgeClaimEmbeddingStatusSchema = z.enum(['pending', 'ready', 'error', 'not_required'])
export const KnowledgeClaimEventTypeSchema = z.enum([
  'created',
  'corrected',
  'superseded',
  'resolved',
  'drift_flagged',
  'dismissed',
  'archived',
])

export type KnowledgeClaimType = z.infer<typeof KnowledgeClaimTypeSchema>
export type KnowledgeClaimStatus = z.infer<typeof KnowledgeClaimStatusSchema>
export type KnowledgeClaimResolvedOutcome = z.infer<typeof KnowledgeClaimResolvedOutcomeSchema>
export type KnowledgeClaimEmbeddingStatus = z.infer<typeof KnowledgeClaimEmbeddingStatusSchema>

export const KnowledgeClaimEvidenceSchema = z.object({
  kind: z.enum(['run', 'channel_event', 'message', 'file', 'url', 'screenshot', 'transcript', 'diff', 'log', 'approval', 'l2_proof', 'commerce_event']),
  runId: z.string().uuid().nullable().optional(),
  artifactId: z.string().uuid().nullable().optional(),
  messageId: z.string().nullable().optional(),
  url: z.string().url().nullable().optional(),
  label: z.string().max(240).nullable().optional(),
})

export type KnowledgeClaimEvidence = z.infer<typeof KnowledgeClaimEvidenceSchema>

export const KnowledgeClaimMetricSchema = z.object({
  metric: z.string().min(1).max(120),
  value: z.number().finite(),
  unit: z.string().max(80).nullable().optional(),
  period: z.string().max(80).nullable().optional(),
  observedAt: z.string().nullable().optional(),
})

export type KnowledgeClaimMetric = z.infer<typeof KnowledgeClaimMetricSchema>

export const KnowledgeClaimEvidenceRowSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  claimId: z.string().uuid(),
  evidenceKind: KnowledgeClaimEvidenceSchema.shape.kind,
  evidenceRef: z.string().nullable(),
  artifactId: z.string().uuid().nullable(),
  runId: z.string().uuid().nullable(),
  url: z.string().nullable(),
  label: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
})

export type KnowledgeClaimEvidenceRow = z.infer<typeof KnowledgeClaimEvidenceRowSchema>

export const KnowledgeClaimEventSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  claimId: z.string().uuid(),
  eventType: KnowledgeClaimEventTypeSchema,
  summary: z.string(),
  patch: z.record(z.string(), z.unknown()).default({}),
  evidence: z.array(KnowledgeClaimEvidenceSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
})

export type KnowledgeClaimEvent = z.infer<typeof KnowledgeClaimEventSchema>

export const KnowledgeClaimSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  assistantId: z.string().uuid().nullable().optional(),
  sourceId: z.string().uuid().nullable().optional(),
  pageId: z.string().uuid().nullable().optional(),
  claimType: KnowledgeClaimTypeSchema,
  subject: z.string().min(1).max(240),
  claim: z.string().min(1).max(8000),
  holderType: KnowledgeClaimHolderTypeSchema,
  holderId: z.string().max(240).nullable().optional(),
  confidence: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  status: KnowledgeClaimStatusSchema,
  validFrom: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  claimMetric: z.string().max(120).nullable().optional(),
  claimValue: z.number().finite().nullable().optional(),
  claimUnit: z.string().max(80).nullable().optional(),
  claimPeriod: z.string().max(80).nullable().optional(),
  observedAt: z.string().nullable().optional(),
  resolvedOutcome: KnowledgeClaimResolvedOutcomeSchema.nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  supersededBy: z.string().uuid().nullable().optional(),
  embeddingStatus: KnowledgeClaimEmbeddingStatusSchema.default('pending'),
  embeddingModel: z.string().max(120).nullable().optional(),
  embeddingProviderId: z.string().max(160).nullable().optional(),
  semanticFingerprint: z.string().max(128).nullable().optional(),
  semanticClusterKey: z.string().max(128).nullable().optional(),
  evidence: z.array(KnowledgeClaimEvidenceSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type KnowledgeClaim = z.infer<typeof KnowledgeClaimSchema>

export const KnowledgeClaimExplanationSchema = z.object({
  claim: KnowledgeClaimSchema,
  evidenceRows: z.array(KnowledgeClaimEvidenceRowSchema),
  events: z.array(KnowledgeClaimEventSchema),
  summary: z.string(),
  provenance: z.object({
    evidenceCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    hasReplacement: z.boolean(),
    hasExpiry: z.boolean(),
    status: KnowledgeClaimStatusSchema,
  }),
})

export type KnowledgeClaimExplanation = z.infer<typeof KnowledgeClaimExplanationSchema>

export const CreateKnowledgeClaimSchema = KnowledgeClaimSchema.omit({
  id: true,
  status: true,
  resolvedOutcome: true,
  resolvedAt: true,
  supersededBy: true,
  embeddingStatus: true,
  embeddingModel: true,
  embeddingProviderId: true,
  semanticFingerprint: true,
  semanticClusterKey: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: KnowledgeClaimStatusSchema.default('active'),
  createdByUserId: z.string().uuid().nullable().optional(),
  createdByAgentId: z.string().uuid().nullable().optional(),
})

export type CreateKnowledgeClaimInput = z.infer<typeof CreateKnowledgeClaimSchema>
