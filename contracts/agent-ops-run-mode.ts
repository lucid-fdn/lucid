import { z } from 'zod'

export const AgentOpsRunModeSchema = z.enum(['plan_only', 'execute', 'review', 'qa', 'blocked', 'handoff'])
export type AgentOpsRunMode = z.infer<typeof AgentOpsRunModeSchema>

export const AgentOpsRequiredQuestionSchema = z.object({
  id: z.string().min(1).max(128),
  prompt: z.string().min(1).max(1000),
  reason: z.string().min(1).max(1000),
  requiredBefore: z.enum(['plan', 'execute', 'ship', 'promote']),
})

export const AgentOpsRunModePolicySchema = z.object({
  requestedMode: AgentOpsRunModeSchema,
  effectiveMode: AgentOpsRunModeSchema,
  reason: z.string().min(1).max(1000),
  allowedMutations: z.array(z.string().min(1)).default([]),
  requiredQuestions: z.array(AgentOpsRequiredQuestionSchema).default([]),
  antiShortcutApplied: z.boolean().default(false),
})

export type AgentOpsRunModePolicy = z.infer<typeof AgentOpsRunModePolicySchema>

export function isMutationAllowedByRunMode(mode: AgentOpsRunMode): boolean {
  return mode === 'execute'
}
