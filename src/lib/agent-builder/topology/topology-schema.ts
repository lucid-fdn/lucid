import { z } from 'zod'

export const builderTopologySchema = z.enum(['single-agent', 'team', 'clarify'])
export type BuilderTopology = z.infer<typeof builderTopologySchema>

export const builderTopologyRoleSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  mission: z.string().trim().min(1),
  responsibilities: z.array(z.string().trim().min(1)).default([]),
  required_capabilities: z.array(z.string().trim().min(1)).default([]),
})

export type BuilderTopologyRole = z.infer<typeof builderTopologyRoleSchema>

export const builderTopologyClarificationSchema = z.object({
  ambiguity_class: z.literal('topology'),
  question: z.string().trim().min(1),
  options: z.array(z.object({
    id: z.enum(['single-agent', 'team']),
    label: z.string().trim().min(1),
    description: z.string().trim().optional(),
    submit_message: z.string().trim().min(1),
  })).length(2),
})

export type BuilderTopologyClarification = z.infer<typeof builderTopologyClarificationSchema>

export const builderTopologyDecisionSchema = z.object({
  topology: builderTopologySchema,
  confidence: z.number().min(0).max(1),
  source: z.enum(['explicit-user', 'template', 'policy', 'llm', 'user-override']),
  rationale: z.string().trim().min(1),
  suggested_roles: z.array(builderTopologyRoleSchema).default([]),
  clarification: builderTopologyClarificationSchema.optional(),
  warnings: z.array(z.string().trim().min(1)).default([]),
})

export type BuilderTopologyDecision = z.infer<typeof builderTopologyDecisionSchema>

export const aiBuilderTopologyIntentSchema = z.object({
  recommended_topology: builderTopologySchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1),
  work_units: z.array(z.string().trim().min(1)).default([]),
  handoffs: z.array(z.string().trim().min(1)).default([]),
  suggested_roles: z.array(builderTopologyRoleSchema).default([]),
  ambiguity_reason: z.string().trim().optional(),
})

export type AiBuilderTopologyIntent = z.infer<typeof aiBuilderTopologyIntentSchema>
