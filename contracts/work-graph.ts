import { z } from 'zod'

export const WorkGraphProviderSchema = z.enum([
  'lucid',
  'linear',
  'asana',
  'trello',
  'monday',
  'jira',
])

export type WorkGraphProvider = z.infer<typeof WorkGraphProviderSchema>

export const WorkGraphSourceSchema = z.enum([
  'lucid',
  'builder',
  'agent_ops',
  'external_pm',
  'import',
  'system',
])

export type WorkGraphSource = z.infer<typeof WorkGraphSourceSchema>

export const WorkGoalStatusSchema = z.enum([
  'draft',
  'active',
  'blocked',
  'at_risk',
  'done',
  'cancelled',
  'archived',
])

export type WorkGoalStatus = z.infer<typeof WorkGoalStatusSchema>

export const WorkGoalPrioritySchema = z.enum(['critical', 'high', 'normal', 'low'])

export type WorkGoalPriority = z.infer<typeof WorkGoalPrioritySchema>

export const WorkItemRelationTypeSchema = z.enum([
  'blocks',
  'blocked_by',
  'depends_on',
  'parent',
  'child',
  'duplicate_of',
  'relates_to',
])

export type WorkItemRelationType = z.infer<typeof WorkItemRelationTypeSchema>

export const WorkBoardKindSchema = z.enum([
  'kanban',
  'roadmap',
  'goal',
  'external_mirror',
])

export type WorkBoardKind = z.infer<typeof WorkBoardKindSchema>

export const WorkItemCheckoutStatusSchema = z.enum([
  'active',
  'released',
  'expired',
  'cancelled',
  'completed',
])

export type WorkItemCheckoutStatus = z.infer<typeof WorkItemCheckoutStatusSchema>

export const WorkItemCheckoutOwnerKindSchema = z.enum([
  'user',
  'agent',
  'team',
  'external_pm',
  'system',
])

export type WorkItemCheckoutOwnerKind = z.infer<typeof WorkItemCheckoutOwnerKindSchema>

export const WorkArtifactLinkTypeSchema = z.enum([
  'agent_ops_run',
  'agent_ops_artifact',
  'agent_ops_finding',
  'agent_run',
  'approval',
  'knowledge_claim',
  'knowledge_page',
  'browser_session',
  'ehv_snapshot',
  'file',
  'url',
  'external_pm_ref',
  'test_result',
  'screenshot',
  'diff',
  'note',
])

export type WorkArtifactLinkType = z.infer<typeof WorkArtifactLinkTypeSchema>

export const WorkGraphActorKindSchema = z.enum([
  'user',
  'agent',
  'system',
  'external_sync',
  'ai_planner',
])

export type WorkGraphActorKind = z.infer<typeof WorkGraphActorKindSchema>

export const WorkGraphPlanningJobStatusSchema = z.enum([
  'queued',
  'running',
  'needs_review',
  'committed',
  'failed',
  'cancelled',
])

export type WorkGraphPlanningJobStatus = z.infer<typeof WorkGraphPlanningJobStatusSchema>

export const WorkGraphPlanningJobSourceSchema = z.enum([
  'goal_create',
  'builder',
  'board_action',
  'external_import',
  'agent_ops',
])

export type WorkGraphPlanningJobSource = z.infer<typeof WorkGraphPlanningJobSourceSchema>

export const WorkGraphProviderModeSchema = z.enum([
  'lucid_authoritative',
  'provider_authoritative',
  'bidirectional_review',
  'mirror_only',
])

export type WorkGraphProviderMode = z.infer<typeof WorkGraphProviderModeSchema>

export const WorkGraphFieldAuthoritySchema = z.enum([
  'lucid',
  'provider',
  'last_writer_wins',
  'review_required',
])

export type WorkGraphFieldAuthority = z.infer<typeof WorkGraphFieldAuthoritySchema>

export const WorkGraphConflictStateSchema = z.enum([
  'clean',
  'remote_changed',
  'local_changed',
  'conflict',
  'needs_review',
  'resolved',
])

export type WorkGraphConflictState = z.infer<typeof WorkGraphConflictStateSchema>

export const WorkGraphProviderFieldMapSchema = z.object({
  title: WorkGraphFieldAuthoritySchema.default('last_writer_wins'),
  description: WorkGraphFieldAuthoritySchema.default('last_writer_wins'),
  status: WorkGraphFieldAuthoritySchema.default('last_writer_wins'),
  priority: WorkGraphFieldAuthoritySchema.default('last_writer_wins'),
  assignee: WorkGraphFieldAuthoritySchema.default('review_required'),
  labels: WorkGraphFieldAuthoritySchema.default('last_writer_wins'),
  due_at: WorkGraphFieldAuthoritySchema.default('last_writer_wins'),
  board_column: WorkGraphFieldAuthoritySchema.default('review_required'),
})

export type WorkGraphProviderFieldMap = z.infer<typeof WorkGraphProviderFieldMapSchema>

const DefaultWorkGraphProviderFieldMap = {
  title: 'last_writer_wins',
  description: 'last_writer_wins',
  status: 'last_writer_wins',
  priority: 'last_writer_wins',
  assignee: 'review_required',
  labels: 'last_writer_wins',
  due_at: 'last_writer_wins',
  board_column: 'review_required',
} satisfies WorkGraphProviderFieldMap

export const WorkGraphPmFederationConfigSchema = z.object({
  mode: WorkGraphProviderModeSchema.default('mirror_only'),
  field_authority: WorkGraphProviderFieldMapSchema.default(DefaultWorkGraphProviderFieldMap),
  conflict_state: WorkGraphConflictStateSchema.default('clean'),
  provider_project_ref: z.string().max(300).nullable().optional(),
  provider_board_ref: z.string().max(300).nullable().optional(),
  provider_team_ref: z.string().max(300).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type WorkGraphPmFederationConfig = z.infer<typeof WorkGraphPmFederationConfigSchema>

export const WorkGraphCapabilityRequirementSchema = z.object({
  capability_id: z.string().min(1).max(160),
  required: z.boolean().default(true),
  reason: z.string().max(500).optional(),
})

export type WorkGraphCapabilityRequirement = z.infer<typeof WorkGraphCapabilityRequirementSchema>

export const WorkGoalSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  parent_goal_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(500),
  description: z.string().nullable().optional(),
  status: WorkGoalStatusSchema.default('draft'),
  priority: WorkGoalPrioritySchema.default('normal'),
  source: WorkGraphSourceSchema.default('lucid'),
  target_date: z.string().datetime().nullable().optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
  owner_agent_id: z.string().uuid().nullable().optional(),
  rollup: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  archived_at: z.string().datetime().nullable().optional(),
})

export type WorkGoal = z.infer<typeof WorkGoalSchema>

export const WorkGoalCreateSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  parent_goal_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(20_000).nullable().optional(),
  status: WorkGoalStatusSchema.optional(),
  priority: WorkGoalPrioritySchema.optional(),
  source: WorkGraphSourceSchema.optional(),
  target_date: z.string().datetime().nullable().optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
  owner_agent_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type WorkGoalCreate = z.infer<typeof WorkGoalCreateSchema>

export const WorkGoalUpdateSchema = WorkGoalCreateSchema.partial().extend({
  archived: z.boolean().optional(),
})

export type WorkGoalUpdate = z.infer<typeof WorkGoalUpdateSchema>

export const WorkItemGoalLinkSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  goal_id: z.string().uuid(),
  work_item_id: z.string().uuid(),
  link_type: z.enum(['primary', 'supporting', 'evidence']).default('primary'),
  weight: z.number().min(0).max(1).default(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime(),
})

export type WorkItemGoalLink = z.infer<typeof WorkItemGoalLinkSchema>

export const WorkItemRelationSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  source_work_item_id: z.string().uuid(),
  target_work_item_id: z.string().uuid(),
  relation_type: WorkItemRelationTypeSchema,
  reason: z.string().max(1_000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime(),
})

export type WorkItemRelation = z.infer<typeof WorkItemRelationSchema>

export const WorkItemRelationCreateSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  source_work_item_id: z.string().uuid(),
  target_work_item_id: z.string().uuid(),
  relation_type: WorkItemRelationTypeSchema,
  reason: z.string().max(1_000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type WorkItemRelationCreate = z.infer<typeof WorkItemRelationCreateSchema>

export const WorkBoardSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  goal_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(240),
  kind: WorkBoardKindSchema.default('kanban'),
  scope: z.record(z.string(), z.unknown()).default({}),
  source: WorkGraphProviderSchema.default('lucid'),
  external_config: z.record(z.string(), z.unknown()).default({}),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  archived_at: z.string().datetime().nullable().optional(),
})

export type WorkBoard = z.infer<typeof WorkBoardSchema>

export const WorkBoardCreateSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  goal_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(240),
  kind: WorkBoardKindSchema.optional(),
  scope: z.record(z.string(), z.unknown()).optional(),
  source: WorkGraphProviderSchema.optional(),
  external_config: z.record(z.string(), z.unknown()).optional(),
})

export type WorkBoardCreate = z.infer<typeof WorkBoardCreateSchema>

export const WorkBoardColumnSchema = z.object({
  id: z.string().uuid(),
  board_id: z.string().uuid(),
  org_id: z.string().uuid(),
  key: z.string().min(1).max(120),
  label: z.string().min(1).max(160),
  status_filter: z.array(z.string()).default([]),
  position: z.number(),
  wip_limit: z.number().int().positive().nullable().optional(),
  color: z.string().nullable().optional(),
  is_done: z.boolean().default(false),
  external_mapping: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type WorkBoardColumn = z.infer<typeof WorkBoardColumnSchema>

export const WorkBoardColumnCreateSchema = z.object({
  key: z.string().min(1).max(120),
  label: z.string().min(1).max(160),
  status_filter: z.array(z.string()).optional(),
  position: z.number().optional(),
  wip_limit: z.number().int().positive().nullable().optional(),
  color: z.string().max(80).nullable().optional(),
  is_done: z.boolean().optional(),
  external_mapping: z.record(z.string(), z.unknown()).optional(),
})

export type WorkBoardColumnCreate = z.infer<typeof WorkBoardColumnCreateSchema>

export const WorkBoardItemSchema = z.object({
  id: z.string().uuid(),
  board_id: z.string().uuid(),
  column_id: z.string().uuid(),
  org_id: z.string().uuid(),
  work_item_id: z.string().uuid(),
  rank: z.string().min(1),
  swimlane_key: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type WorkBoardItem = z.infer<typeof WorkBoardItemSchema>

export const WorkBoardMoveSchema = z.object({
  work_item_id: z.string().uuid(),
  column_id: z.string().uuid(),
  before_rank: z.string().nullable().optional(),
  after_rank: z.string().nullable().optional(),
  rank: z.string().min(1).optional(),
  swimlane_key: z.string().max(160).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type WorkBoardMove = z.infer<typeof WorkBoardMoveSchema>

export const WorkItemCheckoutSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  work_item_id: z.string().uuid(),
  owner_kind: WorkItemCheckoutOwnerKindSchema,
  owner_user_id: z.string().uuid().nullable().optional(),
  owner_agent_id: z.string().uuid().nullable().optional(),
  owner_team_id: z.string().uuid().nullable().optional(),
  external_owner_ref: z.string().nullable().optional(),
  status: WorkItemCheckoutStatusSchema.default('active'),
  purpose: z.string().min(1).max(500),
  lease_expires_at: z.string().datetime().nullable().optional(),
  agent_ops_run_id: z.string().uuid().nullable().optional(),
  runtime_id: z.string().uuid().nullable().optional(),
  required_capabilities: z.array(WorkGraphCapabilityRequirementSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  released_at: z.string().datetime().nullable().optional(),
})

export type WorkItemCheckout = z.infer<typeof WorkItemCheckoutSchema>

export const WorkItemCheckoutCreateSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  work_item_id: z.string().uuid(),
  owner_kind: WorkItemCheckoutOwnerKindSchema,
  owner_user_id: z.string().uuid().nullable().optional(),
  owner_agent_id: z.string().uuid().nullable().optional(),
  owner_team_id: z.string().uuid().nullable().optional(),
  external_owner_ref: z.string().max(300).nullable().optional(),
  purpose: z.string().min(1).max(500),
  lease_expires_at: z.string().datetime().nullable().optional(),
  agent_ops_run_id: z.string().uuid().nullable().optional(),
  runtime_id: z.string().uuid().nullable().optional(),
  required_capabilities: z.array(WorkGraphCapabilityRequirementSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type WorkItemCheckoutCreate = z.infer<typeof WorkItemCheckoutCreateSchema>

export const WorkArtifactLinkSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  goal_id: z.string().uuid().nullable().optional(),
  work_item_id: z.string().uuid().nullable().optional(),
  artifact_type: WorkArtifactLinkTypeSchema,
  label: z.string().min(1).max(240),
  url: z.string().url().nullable().optional(),
  ref_table: z.string().max(160).nullable().optional(),
  ref_id: z.string().max(300).nullable().optional(),
  summary: z.string().max(2_000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime(),
})

export type WorkArtifactLink = z.infer<typeof WorkArtifactLinkSchema>

export const WorkArtifactLinkCreateSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  goal_id: z.string().uuid().nullable().optional(),
  work_item_id: z.string().uuid().nullable().optional(),
  artifact_type: WorkArtifactLinkTypeSchema,
  label: z.string().min(1).max(240),
  url: z.string().url().nullable().optional(),
  ref_table: z.string().max(160).nullable().optional(),
  ref_id: z.string().max(300).nullable().optional(),
  summary: z.string().max(2_000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => value.goal_id || value.work_item_id, {
  message: 'goal_id or work_item_id is required',
}).refine((value) => value.url || (value.ref_table && value.ref_id) || value.metadata?.external_ref, {
  message: 'url, ref_table/ref_id, or metadata.external_ref is required',
})

export type WorkArtifactLinkCreate = z.infer<typeof WorkArtifactLinkCreateSchema>

export const WorkGraphEventSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  goal_id: z.string().uuid().nullable().optional(),
  work_item_id: z.string().uuid().nullable().optional(),
  actor_kind: WorkGraphActorKindSchema,
  actor_user_id: z.string().uuid().nullable().optional(),
  actor_agent_id: z.string().uuid().nullable().optional(),
  actor_external_provider: WorkGraphProviderSchema.nullable().optional(),
  event_type: z.string().min(1).max(160),
  payload: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string().datetime(),
})

export type WorkGraphEvent = z.infer<typeof WorkGraphEventSchema>

export const WorkItemEngineFacetSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  work_item_id: z.string().uuid(),
  engine: z.string().min(1).max(80),
  runtime_flavor: z.enum(['shared', 'dedicated', 'byo']).nullable().optional(),
  facet_key: z.string().min(1).max(160),
  facet_state: z.record(z.string(), z.unknown()).default({}),
  source_runtime_id: z.string().uuid().nullable().optional(),
  source_snapshot_id: z.string().uuid().nullable().optional(),
  observed_at: z.string().datetime(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type WorkItemEngineFacet = z.infer<typeof WorkItemEngineFacetSchema>

export const WorkGraphPlanningJobSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  goal_id: z.string().uuid().nullable().optional(),
  status: WorkGraphPlanningJobStatusSchema.default('queued'),
  source: WorkGraphPlanningJobSourceSchema,
  input: z.record(z.string(), z.unknown()).default({}),
  proposal: z.record(z.string(), z.unknown()).nullable().optional(),
  validation_errors: z.array(z.record(z.string(), z.unknown())).default([]),
  model_policy: z.record(z.string(), z.unknown()).default({}),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  updated_at: z.string().datetime(),
})

export type WorkGraphPlanningJob = z.infer<typeof WorkGraphPlanningJobSchema>

export const WorkGraphDecompositionInputSchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  goal_id: z.string().uuid().nullable().optional(),
  prompt: z.string().min(1).max(20_000),
  decomposition_style: z.enum(['conservative', 'balanced', 'aggressive']).default('balanced'),
  constraints: z.record(z.string(), z.unknown()).default({}),
  required_capabilities: z.array(WorkGraphCapabilityRequirementSchema).default([]),
})

export type WorkGraphDecompositionInput = z.infer<typeof WorkGraphDecompositionInputSchema>

export const WorkGraphGoalHintSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2_000).optional(),
  priority: WorkGoalPrioritySchema.default('normal'),
  target_date: z.string().datetime().optional(),
})

export type WorkGraphGoalHint = z.infer<typeof WorkGraphGoalHintSchema>

export const WorkGraphBoardHintSchema = z.object({
  name: z.string().min(1).max(240),
  kind: WorkBoardKindSchema.default('kanban'),
  columns: z.array(WorkBoardColumnCreateSchema).default([]),
})

export type WorkGraphBoardHint = z.infer<typeof WorkGraphBoardHintSchema>

export const WorkGraphHintSchema = z.object({
  default_goals: z.array(WorkGraphGoalHintSchema).default([]),
  default_board: WorkGraphBoardHintSchema.optional(),
  default_workflows: z.array(z.string().min(1).max(160)).default([]),
  decomposition_style: z.enum(['conservative', 'balanced', 'aggressive']).default('balanced'),
})

export type WorkGraphHint = z.infer<typeof WorkGraphHintSchema>

export const WorkGraphDecompositionProposalSchema = z.object({
  goals: z.array(WorkGoalCreateSchema.extend({
    proposal_id: z.string().min(1).max(120).optional(),
  })).default([]),
  work_items: z.array(z.object({
    proposal_id: z.string().min(1).max(120).optional(),
    title: z.string().min(1).max(500),
    description: z.string().max(20_000).nullable().optional(),
    priority: WorkGoalPrioritySchema.default('normal'),
    labels: z.array(z.string().max(80)).default([]),
    goal_titles: z.array(z.string().min(1).max(500)).default([]),
    required_capabilities: z.array(WorkGraphCapabilityRequirementSchema).default([]),
  })).default([]),
  relations: z.array(z.object({
    proposal_id: z.string().min(1).max(120).optional(),
    source_title: z.string().min(1).max(500),
    target_title: z.string().min(1).max(500),
    relation_type: WorkItemRelationTypeSchema,
    reason: z.string().max(1_000).optional(),
  })).default([]),
  board: WorkBoardCreateSchema.extend({
    columns: z.array(WorkBoardColumnCreateSchema).default([]),
  }).optional(),
  notes: z.array(z.string().max(1_000)).default([]),
})

export type WorkGraphDecompositionProposal = z.infer<typeof WorkGraphDecompositionProposalSchema>

export const WorkGraphCommitRequestSchema = z.object({
  planning_job_id: z.string().uuid(),
  accept_goal_ids: z.array(z.string()).default([]),
  accept_work_item_ids: z.array(z.string()).default([]),
  accept_relation_ids: z.array(z.string()).default([]),
  accept_board: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type WorkGraphCommitRequest = z.infer<typeof WorkGraphCommitRequestSchema>
