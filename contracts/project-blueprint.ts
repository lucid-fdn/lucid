import { z } from 'zod'

import {
  AgentTemplateSpecSchema,
  TeamTemplateSpecSchema,
} from './template'
import { WorkGraphHintSchema } from './work-graph'

export const RuntimeBlueprintSchema = z.object({
  mode: z.enum(['shared', 'dedicated', 'byo']),
  engine: z.string().optional(),
  provider: z.string().optional(),
  runtime_id: z.string().uuid().optional(),
  channel_ownership: z.enum(['lucid_relay', 'runtime_native']).optional(),
  model: z.object({
    mode: z.enum(['lucid_auto', 'custom']).default('lucid_auto'),
    model_id: z.string().min(1).optional(),
    gateway_key_source: z.enum(['lucid', 'workspace', 'runtime']).optional(),
  }).optional(),
  network: z.object({
    access: z.enum(['limited', 'unrestricted', 'custom_allowlist']).default('limited'),
    allowed_hosts: z.array(z.string().min(1)).default([]),
    secrets_source: z.enum(['lucid_vault', 'runtime_env', 'byo_local_env']).default('lucid_vault'),
    filesystem_access: z.enum(['none', 'workspace_sandbox', 'runtime_local']).default('none'),
  }).optional(),
  limits: z.object({
    max_concurrent_runs: z.number().int().min(1).max(100).optional(),
    tool_timeout_seconds: z.number().int().min(5).max(3600).optional(),
    memory_window: z.number().int().min(1).max(500).optional(),
    max_tokens: z.number().int().min(1).max(128000).optional(),
    cost_budget_usd: z.number().min(0).optional(),
    retry_policy: z.enum(['none', 'safe', 'aggressive']).optional(),
    queue_behavior: z.enum(['fifo', 'latest_only', 'drop_when_busy']).optional(),
  }).optional(),
  maintenance: z.object({
    auto_update_policy: z.enum(['manual', 'security_auto', 'patch_auto', 'full_auto']).default('security_auto'),
  }).optional(),
})

export type RuntimeBlueprint = z.infer<typeof RuntimeBlueprintSchema>

const TemplateReferenceFieldsSchema = z.object({
  template_slug: z.string().min(1),
  params: z.record(z.string(), z.string()).optional(),
})

const BlankAgentFieldsSchema = z.object({
  spec: AgentTemplateSpecSchema,
})

const BlankTeamFieldsSchema = z.object({
  spec: TeamTemplateSpecSchema,
})

export const AgentBlueprintItemSchema = z.discriminatedUnion('source', [
  z.object({
    kind: z.literal('agent'),
    source: z.literal('blank'),
    name: z.string().min(1).optional(),
    runtime: RuntimeBlueprintSchema.optional(),
  }).merge(BlankAgentFieldsSchema),
  z.object({
    kind: z.literal('agent'),
    source: z.literal('template'),
    name: z.string().min(1).optional(),
    runtime: RuntimeBlueprintSchema.optional(),
  }).merge(TemplateReferenceFieldsSchema),
])

export type AgentBlueprintItem = z.infer<typeof AgentBlueprintItemSchema>

export const TeamBlueprintItemSchema = z.discriminatedUnion('source', [
  z.object({
    kind: z.literal('team'),
    source: z.literal('blank'),
    name: z.string().min(1).optional(),
    runtime: RuntimeBlueprintSchema.optional(),
  }).merge(BlankTeamFieldsSchema),
  z.object({
    kind: z.literal('team'),
    source: z.literal('template'),
    name: z.string().min(1).optional(),
    runtime: RuntimeBlueprintSchema.optional(),
  }).merge(TemplateReferenceFieldsSchema),
])

export type TeamBlueprintItem = z.infer<typeof TeamBlueprintItemSchema>

export const ProjectBlueprintItemSchema = z.discriminatedUnion('kind', [
  AgentBlueprintItemSchema,
  TeamBlueprintItemSchema,
])

export type ProjectBlueprintItem = z.infer<typeof ProjectBlueprintItemSchema>

export const ProjectBlueprintProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
})

export type ProjectBlueprintProject = z.infer<typeof ProjectBlueprintProjectSchema>

export const StarterWorkBlueprintSchema = z.object({
  prompt: z.string().optional(),
  source: z.enum(['first-proof', 'user']).optional(),
})

export type StarterWorkBlueprint = z.infer<typeof StarterWorkBlueprintSchema>

export const ProjectBlueprintSchema = z.object({
  version: z.literal('1.0'),
  project: ProjectBlueprintProjectSchema,
  items: z.array(ProjectBlueprintItemSchema).min(1),
  starter_work: StarterWorkBlueprintSchema.optional(),
  work_graph: WorkGraphHintSchema.optional(),
})

export type ProjectBlueprint = z.infer<typeof ProjectBlueprintSchema>
