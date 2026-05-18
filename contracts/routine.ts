/**
 * Routine Kernel contract.
 *
 * A Routine is Lucid's product-facing automation definition. It is backed by
 * `agent_scheduled_tasks` for storage and Pulse for admission, but the contract
 * stays domain-neutral so assistants, teams, Work Graph jobs, browser
 * procedures, Knowledge jobs, engine-home jobs, and future engine-native
 * schedulers can share one control-plane vocabulary.
 */

import { z } from 'zod'

export const RoutineTriggerKindSchema = z.enum(['cron', 'one_shot', 'manual', 'event', 'webhook', 'pm_sync'])
export type RoutineTriggerKind = z.infer<typeof RoutineTriggerKindSchema>

export const RoutineTargetTypeSchema = z.enum([
  'assistant',
  'team',
  'work_graph',
  'agent_ops',
  'browser_procedure',
  'knowledge',
  'engine_home',
  'plugin_job',
  'pm_sync',
])
export type RoutineTargetType = z.infer<typeof RoutineTargetTypeSchema>

export const RoutineTaskKindSchema = z.enum([
  'assistant_run',
  'team_run',
  'work_graph_action',
  'agent_ops_run',
  'browser_procedure_run',
  'knowledge_job',
  'engine_home_job',
  'plugin_job',
  'pm_sync',
])
export type RoutineTaskKind = z.infer<typeof RoutineTaskKindSchema>

export const RoutineConcurrencyPolicySchema = z.enum(['skip_if_running', 'queue_one', 'parallel', 'replace'])
export type RoutineConcurrencyPolicy = z.infer<typeof RoutineConcurrencyPolicySchema>

export const RoutineCatchUpPolicySchema = z.enum(['none', 'latest_only', 'bounded', 'all'])
export type RoutineCatchUpPolicy = z.infer<typeof RoutineCatchUpPolicySchema>

export const RoutineRunStatusSchema = z.enum([
  'queued',
  'claimed',
  'running',
  'succeeded',
  'failed',
  'dead_letter',
  'cancelled',
  'skipped',
])
export type RoutineRunStatus = z.infer<typeof RoutineRunStatusSchema>

export const RoutineSourceKindSchema = z.enum([
  'manual',
  'agent_tool',
  'template',
  'pack',
  'agent_ops',
  'work_graph',
  'system',
  'import',
])
export type RoutineSourceKind = z.infer<typeof RoutineSourceKindSchema>

export const RoutineRuntimeSelectorSchema = z.object({
  engine: z.enum(['openclaw', 'hermes']).nullable().optional(),
  runtimeFlavor: z.enum(['shared', 'dedicated', 'byo']).nullable().optional(),
  runtimeId: z.string().uuid().nullable().optional(),
  nativeScheduler: z.enum(['disabled', 'observe', 'import', 'delegate_experimental', 'delegate_supported']).default('disabled'),
}).passthrough()
export type RoutineRuntimeSelector = z.infer<typeof RoutineRuntimeSelectorSchema>

export const RoutineCapabilityRequirementSchema = z.object({
  id: z.string().min(1),
  required: z.boolean().default(true),
  supportLevel: z.enum(['unsupported', 'experimental', 'beta', 'supported', 'preferred']).optional(),
}).passthrough()
export type RoutineCapabilityRequirement = z.infer<typeof RoutineCapabilityRequirementSchema>

export const RoutineDefinitionSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  assistant_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  work_item_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  task_prompt: z.string().min(1),
  task_kind: RoutineTaskKindSchema.default('assistant_run'),
  target_type: RoutineTargetTypeSchema.default('assistant'),
  target_id: z.string().uuid().nullable().optional(),
  trigger_kind: RoutineTriggerKindSchema.default('cron'),
  trigger_config: z.record(z.string(), z.unknown()).default({}),
  cron_expression: z.string().nullable().optional(),
  run_at: z.string().nullable().optional(),
  timezone: z.string().default('UTC'),
  concurrency_policy: RoutineConcurrencyPolicySchema.default('skip_if_running'),
  catch_up_policy: RoutineCatchUpPolicySchema.default('latest_only'),
  catch_up_limit: z.number().int().min(0).max(100).default(1),
  max_retries: z.number().int().min(0).max(20).default(3),
  budget_policy: z.record(z.string(), z.unknown()).default({}),
  runtime_selector: RoutineRuntimeSelectorSchema.default({ nativeScheduler: 'disabled' }),
  capability_requirements: z.array(RoutineCapabilityRequirementSchema).default([]),
  context_policy: z.record(z.string(), z.unknown()).default({}),
  knowledge_scope: z.record(z.string(), z.unknown()).default({}),
  trustgate_policy: z.record(z.string(), z.unknown()).default({}),
  team_policy: z.record(z.string(), z.unknown()).default({}),
  dispatch_policy: z.record(z.string(), z.unknown()).default({}),
  source_kind: RoutineSourceKindSchema.default('manual'),
  managed_resource_id: z.string().uuid().nullable().optional(),
  enabled: z.boolean().default(true),
  status: z.string().default('pending'),
  next_run_at: z.string().nullable().optional(),
  last_run_at: z.string().nullable().optional(),
  last_run_status: RoutineRunStatusSchema.nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type RoutineDefinition = z.infer<typeof RoutineDefinitionSchema>

export const CreateRoutineInputSchema = z.object({
  org_id: z.string().uuid(),
  assistant_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  work_item_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(160),
  description: z.string().max(1000).nullable().optional(),
  task_prompt: z.string().min(1).max(12000),
  task_kind: RoutineTaskKindSchema.optional(),
  target_type: RoutineTargetTypeSchema.optional(),
  target_id: z.string().uuid().nullable().optional(),
  trigger_kind: RoutineTriggerKindSchema.optional(),
  trigger_config: z.record(z.string(), z.unknown()).optional(),
  cron_expression: z.string().nullable().optional(),
  run_at: z.string().nullable().optional(),
  timezone: z.string().default('UTC').optional(),
  concurrency_policy: RoutineConcurrencyPolicySchema.optional(),
  catch_up_policy: RoutineCatchUpPolicySchema.optional(),
  catch_up_limit: z.number().int().min(0).max(100).optional(),
  max_retries: z.number().int().min(0).max(20).optional(),
  budget_policy: z.record(z.string(), z.unknown()).optional(),
  runtime_selector: RoutineRuntimeSelectorSchema.optional(),
  capability_requirements: z.array(RoutineCapabilityRequirementSchema).optional(),
  context_policy: z.record(z.string(), z.unknown()).optional(),
  knowledge_scope: z.record(z.string(), z.unknown()).optional(),
  trustgate_policy: z.record(z.string(), z.unknown()).optional(),
  team_policy: z.record(z.string(), z.unknown()).optional(),
  dispatch_policy: z.record(z.string(), z.unknown()).optional(),
  source_kind: RoutineSourceKindSchema.optional(),
  managed_resource_id: z.string().uuid().nullable().optional(),
  idempotency_key: z.string().max(200).nullable().optional(),
  webhook_url: z.string().url().nullable().optional(),
})
export type CreateRoutineInput = z.infer<typeof CreateRoutineInputSchema>

export const UpdateRoutineInputSchema = CreateRoutineInputSchema.partial().omit({ org_id: true }).extend({
  enabled: z.boolean().optional(),
})
export type UpdateRoutineInput = z.infer<typeof UpdateRoutineInputSchema>

export interface RoutineSimulation {
  valid: boolean
  targetType: RoutineTargetType
  taskKind: RoutineTaskKind
  triggerKind: RoutineTriggerKind
  nextRuns: string[]
  warnings: string[]
  errors: string[]
  requiredCapabilities: RoutineCapabilityRequirement[]
  estimatedFanout: number
  estimatedMonthlyRuns?: number
}
