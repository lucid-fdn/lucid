import { z } from 'zod'

export const LucidDoctorDomainSchema = z.enum([
  'knowledge',
  'agent_ops',
  'browser_operator',
  'commerce',
  'runtimes',
  'channels',
  'templates',
  'routines',
  'security',
  'env',
  'l2',
])

export type LucidDoctorDomain = z.infer<typeof LucidDoctorDomainSchema>

export const LucidDoctorFindingSchema = z.object({
  id: z.string(),
  domain: LucidDoctorDomainSchema,
  severity: z.enum(['info', 'watch', 'warning', 'critical']),
  title: z.string(),
  summary: z.string(),
  scope: z.object({
    orgId: z.string().uuid().nullable(),
    projectId: z.string().uuid().nullable(),
    resourceType: z.string().nullable(),
    resourceId: z.string().nullable(),
  }),
  evidence: z.array(z.record(z.string(), z.unknown())).default([]),
  remediation: z.array(z.object({
    kind: z.enum(['manual', 'command', 'agent_ops_workflow', 'ui_action', 'docs']),
    label: z.string(),
    command: z.string().nullable().optional(),
    href: z.string().nullable().optional(),
    workflowId: z.string().nullable().optional(),
    destructive: z.boolean().default(false),
  })).default([]),
  dedupeKey: z.string(),
})

export type LucidDoctorFinding = z.infer<typeof LucidDoctorFindingSchema>

export const LucidDoctorReportSchema = z.object({
  orgId: z.string().uuid(),
  generatedAt: z.string(),
  status: z.enum(['ready', 'needs_attention', 'blocked']),
  findings: z.array(LucidDoctorFindingSchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(),
    watch: z.number().int().nonnegative(),
  }),
})

export type LucidDoctorReport = z.infer<typeof LucidDoctorReportSchema>

export const NeedsHumanItemSchema = z.object({
  id: z.string(),
  domain: z.string(),
  title: z.string(),
  summary: z.string(),
  priority: z.enum(['urgent', 'high', 'normal', 'low']),
  status: z.enum(['open', 'acknowledged', 'resolved', 'dismissed']),
  createdAt: z.string(),
  projectId: z.string().uuid().nullable(),
  runId: z.string().uuid().nullable(),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  actions: z.array(z.record(z.string(), z.unknown())).default([]),
  evidence: z.array(z.record(z.string(), z.unknown())).default([]),
})

export type NeedsHumanItem = z.infer<typeof NeedsHumanItemSchema>
