import { z } from 'zod'

export const KnowledgeTrajectoryPointSchema = z.object({
  claimId: z.string().uuid(),
  subject: z.string(),
  metric: z.string(),
  value: z.number().finite(),
  unit: z.string().nullable(),
  period: z.string().nullable(),
  observedAt: z.string(),
  validFrom: z.string().nullable(),
  validUntil: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  evidenceCount: z.number().int().nonnegative(),
  sourceId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  teamId: z.string().uuid().nullable(),
})

export type KnowledgeTrajectoryPoint = z.infer<typeof KnowledgeTrajectoryPointSchema>

export const KnowledgeTrajectoryRegressionSchema = z.object({
  metric: z.string(),
  fromClaimId: z.string().uuid(),
  toClaimId: z.string().uuid(),
  fromValue: z.number().finite(),
  toValue: z.number().finite(),
  dropRatio: z.number().nonnegative(),
  severity: z.enum(['watch', 'warning', 'critical']),
})

export type KnowledgeTrajectoryRegression = z.infer<typeof KnowledgeTrajectoryRegressionSchema>

export const KnowledgeTrajectoryResultSchema = z.object({
  schemaVersion: z.literal(1),
  orgId: z.string().uuid(),
  subject: z.string(),
  metric: z.string().nullable(),
  points: z.array(KnowledgeTrajectoryPointSchema),
  regressions: z.array(KnowledgeTrajectoryRegressionSchema),
  stats: z.object({
    pointCount: z.number().int().nonnegative(),
    metricCount: z.number().int().nonnegative(),
    firstObservedAt: z.string().nullable(),
    lastObservedAt: z.string().nullable(),
    weightedConfidence: z.number().min(0).max(1).nullable(),
    trendDirection: z.enum(['improving', 'declining', 'flat', 'mixed', 'insufficient_data']),
  }),
})

export type KnowledgeTrajectoryResult = z.infer<typeof KnowledgeTrajectoryResultSchema>

export const KnowledgeScorecardProfileSchema = z.enum([
  'founder',
  'company',
  'project',
  'agent',
  'wallet',
  'token',
  'customer',
  'merchant',
])

export type KnowledgeScorecardProfile = z.infer<typeof KnowledgeScorecardProfileSchema>

export const KnowledgeScorecardSignalSchema = z.object({
  id: z.string(),
  label: z.string(),
  score: z.number().min(0).max(1),
  status: z.enum(['strong', 'watch', 'weak', 'unknown']),
  summary: z.string(),
  evidenceClaimIds: z.array(z.string().uuid()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type KnowledgeScorecardSignal = z.infer<typeof KnowledgeScorecardSignalSchema>

export const KnowledgeEntityScorecardSchema = z.object({
  schemaVersion: z.literal(1),
  profile: KnowledgeScorecardProfileSchema,
  orgId: z.string().uuid(),
  subject: z.string(),
  generatedAt: z.string(),
  overallScore: z.number().min(0).max(1).nullable(),
  confidence: z.number().min(0).max(1),
  signals: z.array(KnowledgeScorecardSignalSchema),
  redFlags: z.array(KnowledgeScorecardSignalSchema),
  recommendations: z.array(z.string()).default([]),
  trajectory: KnowledgeTrajectoryResultSchema.nullable(),
  provenance: z.object({
    claimCount: z.number().int().nonnegative(),
    evidenceCount: z.number().int().nonnegative(),
    sourceCount: z.number().int().nonnegative(),
    staleClaimCount: z.number().int().nonnegative(),
    conflictCount: z.number().int().nonnegative(),
  }),
})

export type KnowledgeEntityScorecard = z.infer<typeof KnowledgeEntityScorecardSchema>
