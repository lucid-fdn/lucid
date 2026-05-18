import { z } from 'zod'

export const EvalReceiptSourceTypeSchema = z.enum(['agent_ops_run', 'knowledge_think', 'browser_procedure', 'claim', 'manual'])
export const EvalReceiptVerdictSchema = z.enum(['pass', 'fail', 'inconclusive'])

export const EvalJudgeResultSchema = z.object({
  providerClass: z.string().min(1).max(80),
  model: z.string().min(1).max(160),
  ok: z.boolean(),
  scores: z.record(z.string(), z.number().min(0).max(10)).optional(),
  error: z.string().max(1000).optional(),
  durationMs: z.number().int().nonnegative(),
})

export const EvalReceiptSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  runId: z.string().uuid().nullable().optional(),
  sourceType: EvalReceiptSourceTypeSchema,
  sourceId: z.string().min(1).max(240),
  task: z.string().min(1).max(4000),
  outputHash: z.string().min(16).max(160),
  dimensions: z.array(z.string().min(1).max(240)).default([]),
  judges: z.array(EvalJudgeResultSchema).default([]),
  verdict: EvalReceiptVerdictSchema,
  aggregate: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
})

export type EvalReceipt = z.infer<typeof EvalReceiptSchema>

export const CreateEvalReceiptSchema = EvalReceiptSchema.omit({
  id: true,
  createdAt: true,
})

export type CreateEvalReceiptInput = z.infer<typeof CreateEvalReceiptSchema>
