import crypto from 'node:crypto'
import { z } from 'zod'

export const AGENT_OPS_OPERATOR_PROFILE_TYPES = [
  'developer',
  'design_taste',
  'communication',
  'release',
] as const

export type AgentOpsOperatorProfileType = (typeof AGENT_OPS_OPERATOR_PROFILE_TYPES)[number]

export const AGENT_OPS_DESIGN_FEEDBACK_TYPES = ['approval', 'rejection', 'preference', 'note'] as const

export type AgentOpsDesignFeedbackType = (typeof AGENT_OPS_DESIGN_FEEDBACK_TYPES)[number]

export const AGENT_OPS_DESIGN_VARIANT_STATUSES = [
  'proposed',
  'approved',
  'rejected',
  'promoted',
] as const

export type AgentOpsDesignVariantStatus = (typeof AGENT_OPS_DESIGN_VARIANT_STATUSES)[number]

const jsonObjectSchema = z.record(z.string(), z.unknown())

export const operatorProfileSchema = z.object({
  id: z.string().uuid().optional(),
  orgId: z.string().uuid(),
  userId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  profileType: z.enum(AGENT_OPS_OPERATOR_PROFILE_TYPES),
  declared: jsonObjectSchema.default({}),
  inferred: jsonObjectSchema.default({}),
  confidence: jsonObjectSchema.default({}),
  decayPolicy: jsonObjectSchema.default({}),
  updatedAt: z.string().optional(),
})

export type AgentOpsOperatorProfile = z.infer<typeof operatorProfileSchema>

export const designFeedbackSchema = z.object({
  id: z.string().uuid().optional(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  runId: z.string().uuid().nullable().optional(),
  artifactId: z.string().uuid().nullable().optional(),
  variantKey: z.string().min(1).max(160),
  feedbackType: z.enum(AGENT_OPS_DESIGN_FEEDBACK_TYPES),
  status: z.enum(AGENT_OPS_DESIGN_VARIANT_STATUSES).default('proposed'),
  feedback: z.string().max(4000).nullable().optional(),
  source: z.enum(['operator', 'agent', 'eval', 'imported']).default('agent'),
  metadata: jsonObjectSchema.default({}),
  createdByUserId: z.string().uuid().nullable().optional(),
  createdAt: z.string().optional(),
})

export type AgentOpsDesignFeedback = z.infer<typeof designFeedbackSchema>

export interface DesignOpsRuntimeContext {
  schemaVersion: 1
  profileTable: 'agent_ops_operator_profiles'
  feedbackTable: 'agent_ops_design_feedback'
  profileTypes: readonly AgentOpsOperatorProfileType[]
  outputContract: {
    sections: readonly ['Summary', 'Findings', 'Evidence', 'Risks', 'Next actions']
    designEvidence: readonly ['variant_board', 'mockup', 'screenshot', 'design_rationale', 'diff']
  }
  tastePolicy: {
    transparent: true
    editable: true
    decay: 'explicit_policy_or_default'
    hiddenManipulation: 'forbidden'
  }
}

export function buildDesignOpsRuntimeContext(): DesignOpsRuntimeContext {
  return {
    schemaVersion: 1,
    profileTable: 'agent_ops_operator_profiles',
    feedbackTable: 'agent_ops_design_feedback',
    profileTypes: AGENT_OPS_OPERATOR_PROFILE_TYPES,
    outputContract: {
      sections: ['Summary', 'Findings', 'Evidence', 'Risks', 'Next actions'],
      designEvidence: ['variant_board', 'mockup', 'screenshot', 'design_rationale', 'diff'],
    },
    tastePolicy: {
      transparent: true,
      editable: true,
      decay: 'explicit_policy_or_default',
      hiddenManipulation: 'forbidden',
    },
  }
}

export function serializeDesignOpsForRuntime(context: DesignOpsRuntimeContext): Record<string, unknown> {
  return {
    schema_version: context.schemaVersion,
    profile_table: context.profileTable,
    feedback_table: context.feedbackTable,
    profile_types: [...context.profileTypes],
    output_contract: {
      sections: [...context.outputContract.sections],
      design_evidence: [...context.outputContract.designEvidence],
    },
    taste_policy: {
      transparent: context.tastePolicy.transparent,
      editable: context.tastePolicy.editable,
      decay: context.tastePolicy.decay,
      hidden_manipulation: context.tastePolicy.hiddenManipulation,
    },
  }
}

export function buildDesignVariantFingerprint(input: {
  orgId: string
  projectId?: string | null
  runId?: string | null
  variantKey: string
  feedbackType: AgentOpsDesignFeedbackType
}): string {
  return crypto
    .createHash('sha256')
    .update([
      input.orgId,
      input.projectId ?? 'project:any',
      input.runId ?? 'run:any',
      input.variantKey,
      input.feedbackType,
    ].join('|'))
    .digest('hex')
}

export function normalizeDesignVariantKey(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || fallback
}
