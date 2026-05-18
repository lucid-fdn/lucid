import { z } from 'zod'

import { looksInstructionLike, wrapUntrustedContent } from '@/lib/security/untrusted-content'

export const PROJECT_LEARNING_TYPES = [
  'pattern',
  'pitfall',
  'preference',
  'architecture',
  'tool',
  'operational',
  'release',
  'security',
  'quality',
] as const

export const PROJECT_LEARNING_TRUST_LEVELS = [
  'user_stated',
  'operator_approved',
  'observed',
  'inferred',
] as const

export const DECISION_RISK_LEVELS = ['low', 'medium', 'high', 'one_way_door'] as const

export const projectLearningInputSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  assistantId: z.string().uuid().nullable().optional(),
  opsRunId: z.string().uuid().nullable().optional(),
  type: z.enum(PROJECT_LEARNING_TYPES),
  trustLevel: z.enum(PROJECT_LEARNING_TRUST_LEVELS).default('observed'),
  title: z.string().min(1).max(240),
  body: z.string().min(1).max(4000),
  sourceKind: z.enum(['agent_ops_run', 'manual', 'channel', 'repo', 'deploy', 'incident', 'memory']).default('agent_ops_run'),
  sourceRef: z.string().max(1000).nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.7),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdBy: z.string().uuid().nullable().optional(),
}).refine((value) => value.projectId || value.assistantId, {
  message: 'projectId or assistantId is required',
  path: ['projectId'],
})

export type ProjectLearningInput = z.infer<typeof projectLearningInputSchema>

export const decisionPreferenceInputSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  key: z.string().min(1).max(160),
  questionPattern: z.string().min(1).max(1000),
  preferredDecision: z.string().min(1).max(1000),
  riskLevel: z.enum(DECISION_RISK_LEVELS).default('low'),
  sourceKind: z.enum(['manual', 'retro', 'operator_approved']).default('manual'),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdBy: z.string().uuid().nullable().optional(),
}).refine((value) => value.riskLevel !== 'one_way_door' || value.sourceKind === 'operator_approved', {
  message: 'one-way-door preferences require operator approval',
  path: ['sourceKind'],
})

export type DecisionPreferenceInput = z.infer<typeof decisionPreferenceInputSchema>

export function sanitizeProjectLearning(input: ProjectLearningInput): ProjectLearningInput {
  const parsed = projectLearningInputSchema.parse(input)
  if (looksInstructionLike(parsed.body) && parsed.trustLevel !== 'user_stated' && parsed.trustLevel !== 'operator_approved') {
    throw new Error('Instruction-like project learnings require user-stated or operator-approved trust')
  }

  const envelope = wrapUntrustedContent({
    kind: 'user_input',
    source: parsed.sourceRef ?? parsed.sourceKind,
    content: parsed.body,
    maxChars: 4000,
  })

  return {
    ...parsed,
    body: envelope.content,
    metadata: {
      ...parsed.metadata,
      untrusted_source: parsed.sourceKind,
      truncated: envelope.truncated,
    },
  }
}

export function buildProjectLearningFingerprint(input: Pick<ProjectLearningInput, 'orgId' | 'projectId' | 'assistantId' | 'type' | 'title' | 'body'>): string {
  return `agent-ops:learning:v1:${[
    input.orgId,
    input.projectId ?? input.assistantId ?? 'global',
    input.type,
    normalize(input.title),
    normalize(input.body).slice(0, 200),
  ].join(':')}`
}

export function shouldAutoApplyDecisionPreference(input: Pick<DecisionPreferenceInput, 'riskLevel' | 'sourceKind'>): boolean {
  if (input.riskLevel === 'one_way_door') return false
  if (input.riskLevel === 'high') return input.sourceKind === 'operator_approved'
  return true
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}
