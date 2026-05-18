/**
 * Template System Contracts
 *
 * Pure TypeScript + Zod — no framework dependencies.
 * Shared between src/ (Next.js) and worker/ (Node.js).
 */

import { z } from 'zod'
import { WorkGraphHintSchema } from './work-graph'

export { WorkGraphHintSchema } from './work-graph'

// =============================================================================
// LIVING SPEC — MEMORY / SCHEDULE / CHANNEL / EVAL
// =============================================================================

export const MemorySchemaHintSchema = z.object({
  category: z.enum(['fact', 'preference', 'instruction', 'context']),
  description: z.string(),
  importance_floor: z.number().min(0).max(1),
})

export type MemorySchemaHint = z.infer<typeof MemorySchemaHintSchema>

export const ScheduleHintSchema = z.object({
  cron: z.string(),
  prompt: z.string(),
  description: z.string(),
  optional: z.boolean(),
})

export type ScheduleHint = z.infer<typeof ScheduleHintSchema>

export const ChannelHintSchema = z.object({
  channel_type: z.string(),
  required: z.boolean(),
  setup_note: z.string(),
})

export type ChannelHint = z.infer<typeof ChannelHintSchema>

export const EvalScenarioSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  expected_behaviors: z.array(z.string()),
  must_not_contain: z.array(z.string()).optional(),
})

export type EvalScenario = z.infer<typeof EvalScenarioSchema>

export const AgentOpsLaunchContextSchema = z.enum([
  'project',
  'assistant',
  'run',
  'deploy',
  'channel',
  'incident',
])

export type AgentOpsLaunchContext = z.infer<typeof AgentOpsLaunchContextSchema>

export const AgentOpsWorkflowHintSchema = z.object({
  workflow_id: z.string().min(1).max(128),
  label: z.string().min(1).max(160).optional(),
  description: z.string().max(500).optional(),
  default_enabled: z.boolean().default(true),
  launch_contexts: z.array(AgentOpsLaunchContextSchema).default([]),
  input_defaults: z.record(z.string(), z.string()).optional(),
})

export type AgentOpsWorkflowHint = z.infer<typeof AgentOpsWorkflowHintSchema>

export const ToolServerSchema = z.object({
  name: z.string(),
  protocol: z.enum(['mcp']).default('mcp'),
  transport: z.enum(['http', 'sse']).optional(),
  url: z.string().url(),
  description: z.string().optional(),
})

export type ToolServer = z.infer<typeof ToolServerSchema>

export const ToolPermissionPolicySchema = z.object({
  type: z.enum(['always_allow', 'approval_required', 'manual_review', 'deny_all']),
  allowed_tools: z.array(z.string()).optional(),
  blocked_tools: z.array(z.string()).optional(),
})

export type ToolPermissionPolicy = z.infer<typeof ToolPermissionPolicySchema>

// =============================================================================
// PARAMS
// =============================================================================

export const TemplateParamSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['text', 'email', 'url', 'secret', 'select']),
  required: z.boolean(),
  placeholder: z.string().optional(),
  hint: z.string().optional(),
  default: z.string().optional(),
  options: z.array(z.string()).optional(),
})

export type TemplateParam = z.infer<typeof TemplateParamSchema>

// =============================================================================
// TEMPLATE SPECS
// =============================================================================

export const AgentTemplateSpecSchema = z.object({
  kind: z.literal('agent'),
  description: z.string().optional(),
  system_prompt: z.string(),
  soul_content: z.string().optional(),
  model_hint: z.string().optional(),
  plugins: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  tool_servers: z.array(ToolServerSchema).optional(),
  tool_permission_policy: ToolPermissionPolicySchema.optional(),
  memory_enabled: z.boolean().optional(),
  memory_strategy: z.enum(['auto', 'aggressive', 'conservative', 'off']).optional(),
  approval_required_tools: z.array(z.string()).optional(),
  cost_limit_per_run_usd: z.number().optional(),
  cost_limit_daily_usd: z.number().optional(),
  // Living spec extensions
  memory_schema: z.array(MemorySchemaHintSchema).optional(),
  default_schedules: z.array(ScheduleHintSchema).optional(),
  channel_hints: z.array(ChannelHintSchema).optional(),
  eval_pack: z.array(EvalScenarioSchema).optional(),
  ops_workflows: z.array(AgentOpsWorkflowHintSchema).optional(),
  work_graph: WorkGraphHintSchema.optional(),
})

export type AgentTemplateSpec = z.infer<typeof AgentTemplateSpecSchema>

export const TeamMemberSpecSchema = z.object({
  role: z.string(),
  is_coordinator: z.boolean().optional(),
  description: z.string().optional(),
  responsibilities: z.array(z.string()).optional(),
  system_prompt: z.string(),
  system_prompt_mode: z.enum(['auto', 'manual']).optional(),
  soul_content: z.string().optional(),
  model_hint: z.string().optional(),
  plugins: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  tool_servers: z.array(ToolServerSchema).optional(),
  tool_permission_policy: ToolPermissionPolicySchema.optional(),
  // Living spec extensions
  memory_schema: z.array(MemorySchemaHintSchema).optional(),
  default_schedules: z.array(ScheduleHintSchema).optional(),
})

export type TeamMemberSpec = z.infer<typeof TeamMemberSpecSchema>

export const TeamEdgeSpecSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
})

export type TeamEdgeSpec = z.infer<typeof TeamEdgeSpecSchema>

export const TeamTemplateSpecSchema = z.object({
  kind: z.literal('team'),
  objective: z.string().optional(),
  members: z.array(TeamMemberSpecSchema),
  edges: z.array(TeamEdgeSpecSchema),
  // Living spec extensions
  channel_hints: z.array(ChannelHintSchema).optional(),
  eval_pack: z.array(EvalScenarioSchema).optional(),
  ops_workflows: z.array(AgentOpsWorkflowHintSchema).optional(),
  work_graph: WorkGraphHintSchema.optional(),
})

export type TeamTemplateSpec = z.infer<typeof TeamTemplateSpecSchema>

export const TemplateSpecSchema = z.discriminatedUnion('kind', [
  AgentTemplateSpecSchema,
  TeamTemplateSpecSchema,
])

export type TemplateSpec = z.infer<typeof TemplateSpecSchema>

// =============================================================================
// CATALOG + DEPLOYMENTS
// =============================================================================

export const TemplateCatalogEntrySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  kind: z.enum(['agent', 'team']),
  source: z.enum(['platform', 'community', 'org']),
  status: z.enum(['draft', 'pending_review', 'approved', 'deprecated']),
  is_public: z.boolean(),
  owner_org_id: z.string().uuid().nullable(),
  spec: TemplateSpecSchema,
  params: z.array(TemplateParamSchema),
  preview_prompt: z.string().nullable(),
  tags: z.array(z.string()),
  install_count: z.number(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  // Living spec columns (added by migration 20260413300000)
  version: z.string().optional().default('1.0.0'),
  changelog: z.string().nullable().optional(),
  forked_from_id: z.string().uuid().nullable().optional(),
  forked_from_ver: z.string().nullable().optional(),
  component_type: z.enum(['role', 'prompt', 'memory_schema', 'schedule', 'approval', 'eval', 'ops_workflow']).nullable().optional(),
  cert_status: z.enum(['uncertified', 'experimental', 'community', 'verified']).optional().default('uncertified'),
  cert_score: z.number().nullable().optional(),
  cert_checked_at: z.string().nullable().optional(),
  outcome_data: z.record(z.string(), z.unknown()).optional().default({}),
})

export type TemplateCatalogEntry = z.infer<typeof TemplateCatalogEntrySchema>

// =============================================================================
// API SHAPES
// =============================================================================

export const DeployTemplateRequestSchema = z.object({
  params: z.record(z.string(), z.string()).optional(),
  name_override: z.string().optional(),
})

export type DeployTemplateRequest = z.infer<typeof DeployTemplateRequestSchema>

export const DeployTemplateResultSchema = z.object({
  deployment_id: z.string().uuid(),
  kind: z.enum(['agent', 'team']),
  project_slug: z.string().min(1).optional(),
  assistant_id: z.string().uuid().optional(),
  crew_id: z.string().uuid().optional(),
  assistant_ids: z.array(z.string().uuid()).optional(),
})

export type DeployTemplateResult = z.infer<typeof DeployTemplateResultSchema>
