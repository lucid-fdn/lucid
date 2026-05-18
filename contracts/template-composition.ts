import { z } from 'zod'

export const TemplateCapabilityKindSchema = z.enum([
  'agent',
  'team',
  'workflow',
  'routine',
  'knowledge',
  'browser',
  'commerce',
  'web3_read',
  'web3_trade',
  'channel',
  'policy',
  'dashboard',
])

export const TemplateCapabilityRiskSchema = z.enum(['read_only', 'low', 'medium', 'high'])
export const TemplateCapabilityScopeSchema = z.enum(['workspace', 'project', 'team', 'agent', 'user'])
export const TemplateCapabilityProgressPhaseSchema = z.enum([
  'thinking',
  'memory',
  'fetching',
  'browser',
  'tool_running',
  'approval_waiting',
  'writing',
])

export const TemplateCapabilityProgressSchema = z.object({
  label: z.string().min(1).max(120),
  phase: TemplateCapabilityProgressPhaseSchema.default('thinking'),
})

export const TemplateCapabilitySchema = z.object({
  key: z.string().min(1).max(160),
  kind: TemplateCapabilityKindSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  scope: TemplateCapabilityScopeSchema.default('project'),
  risk: TemplateCapabilityRiskSchema.default('read_only'),
  progress: TemplateCapabilityProgressSchema.optional(),
})

export const TemplateDependencySchema = z.object({
  capability: z.string().min(1).max(160),
  required: z.boolean().default(true),
  acceptedProviders: z.array(z.string()).default([]),
  reason: z.string().max(500).optional(),
})

export const TemplateConflictSchema = z.object({
  capability: z.string().min(1).max(160),
  mode: z.enum(['exclusive', 'warn', 'requires_fork']),
  reason: z.string().max(500),
})

export const TemplateCompositionSchema = z.object({
  provides: z.array(TemplateCapabilitySchema).default([]),
  requires: z.array(TemplateDependencySchema).default([]),
  optional: z.array(TemplateDependencySchema).default([]),
  conflicts: z.array(TemplateConflictSchema).default([]),
  upgradesFrom: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
})

export type TemplateCapabilityKind = z.infer<typeof TemplateCapabilityKindSchema>
export type TemplateCapabilityRisk = z.infer<typeof TemplateCapabilityRiskSchema>
export type TemplateCapabilityScope = z.infer<typeof TemplateCapabilityScopeSchema>
export type TemplateCapabilityProgress = z.infer<typeof TemplateCapabilityProgressSchema>
export type TemplateCapability = z.infer<typeof TemplateCapabilitySchema>
export type TemplateDependency = z.infer<typeof TemplateDependencySchema>
export type TemplateConflict = z.infer<typeof TemplateConflictSchema>
export type TemplateComposition = z.infer<typeof TemplateCompositionSchema>
