import type {
  RoutineCapabilityRequirement,
  RoutineSimulation,
  RoutineTargetType,
  RoutineTaskKind,
  RoutineTriggerKind,
} from './types'

export interface RoutineAdapterValidationInput {
  targetId?: string | null
  assistantId?: string | null
  teamId?: string | null
  projectId?: string | null
  workItemId?: string | null
  managedResourceId?: string | null
  triggerConfig?: Record<string, unknown>
  contextPolicy?: Record<string, unknown>
  knowledgeScope?: Record<string, unknown>
}

export interface RoutineTargetAdapter {
  targetType: RoutineTargetType
  taskKind: RoutineTaskKind
  label: string
  description: string
  requiredCapabilities: RoutineCapabilityRequirement[]
  needsExecutionAssistant: boolean
  estimatedFanout: (input: RoutineAdapterValidationInput) => number
  operatorNotes: (input: RoutineAdapterValidationInput) => string[]
  validate: (input: RoutineAdapterValidationInput) => string[]
}

function readString(record: Record<string, unknown> | undefined, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function hasAnyTriggerConfig(record: Record<string, unknown> | undefined, keys: string[]): boolean {
  return keys.some((key) => Boolean(readString(record, key)))
}

const requiresAssistant = (input: RoutineAdapterValidationInput, label: string): string[] => (
  input.assistantId ? [] : [`execution assistant_id is required for ${label} routines`]
)

export const ROUTINE_TARGET_ADAPTERS: Record<RoutineTargetType, RoutineTargetAdapter> = {
  assistant: {
    targetType: 'assistant',
    taskKind: 'assistant_run',
    label: 'Assistant run',
    description: 'Run one assistant with the shared Routine policy, TrustGate routing, and receipts.',
    requiredCapabilities: [{ id: 'assistant.run', required: true }],
    needsExecutionAssistant: true,
    estimatedFanout: () => 1,
    operatorNotes: () => [],
    validate: (input) => input.assistantId || input.targetId ? [] : ['assistant_id or target_id is required for assistant routines'],
  },
  team: {
    targetType: 'team',
    taskKind: 'team_run',
    label: 'Team run',
    description: 'Dispatch a coordinated team run through Crew lifecycle and record cross-agent receipts.',
    requiredCapabilities: [{ id: 'team.run', required: true }],
    needsExecutionAssistant: false,
    estimatedFanout: () => 2,
    operatorNotes: () => ['Team routines resolve their coordinator assistant at creation and fan out through Crew execution.'],
    validate: (input) => input.teamId || input.targetId ? [] : ['team_id or target_id is required for team routines'],
  },
  work_graph: {
    targetType: 'work_graph',
    taskKind: 'work_graph_action',
    label: 'Work Graph action',
    description: 'Operate on Lucid Work Graph items without binding the routine to one engine or runtime.',
    requiredCapabilities: [
      { id: 'work_graph.action', required: true },
      { id: 'work_graph.evidence_refs', required: false },
    ],
    needsExecutionAssistant: true,
    estimatedFanout: () => 1,
    operatorNotes: () => ['Work Graph routines should attach artifact refs instead of writing opaque status text only.'],
    validate: (input) => [
      ...requiresAssistant(input, 'Work Graph'),
      ...(input.workItemId || input.targetId || hasAnyTriggerConfig(input.triggerConfig, ['work_item_id', 'goal_id', 'project_id'])
        ? []
        : ['work_item_id, target_id, or trigger_config.work_item_id is required for Work Graph routines']),
    ],
  },
  agent_ops: {
    targetType: 'agent_ops',
    taskKind: 'agent_ops_run',
    label: 'Agent Ops run',
    description: 'Start or reconcile an Agent Ops workflow under Routine admission and receipt tracking.',
    requiredCapabilities: [
      { id: 'agent_ops.run', required: true },
      { id: 'agent_ops.receipts', required: false },
    ],
    needsExecutionAssistant: true,
    estimatedFanout: () => 1,
    operatorNotes: () => ['Agent Ops routines keep their domain ledger; Routine receipts store the run reference.'],
    validate: (input) => [
      ...requiresAssistant(input, 'Agent Ops'),
      ...(input.targetId || hasAnyTriggerConfig(input.triggerConfig, ['workflow_id', 'template_id', 'runbook_id'])
        ? []
        : ['target_id or trigger_config.workflow_id is required for Agent Ops routines']),
    ],
  },
  browser_procedure: {
    targetType: 'browser_procedure',
    taskKind: 'browser_procedure_run',
    label: 'Browser procedure',
    description: 'Execute a Browser Operator procedure with sandboxed evidence and replayable receipts.',
    requiredCapabilities: [
      { id: 'browser.procedure.run', required: true },
      { id: 'browser.evidence.sanitized', required: true },
    ],
    needsExecutionAssistant: true,
    estimatedFanout: () => 1,
    operatorNotes: () => ['Browser routines must keep screenshots/logs sanitized before they appear in Mission Control.'],
    validate: (input) => [
      ...requiresAssistant(input, 'Browser Procedure'),
      ...(input.targetId || hasAnyTriggerConfig(input.triggerConfig, ['procedure_id'])
        ? []
        : ['target_id or trigger_config.procedure_id is required for Browser Procedure routines']),
    ],
  },
  knowledge: {
    targetType: 'knowledge',
    taskKind: 'knowledge_job',
    label: 'Knowledge job',
    description: 'Run Brain/Knowledge operations such as retrieval, source refresh, reflection, or promotion review.',
    requiredCapabilities: [
      { id: 'knowledge.job.run', required: true },
      { id: 'knowledge.receipts', required: false },
    ],
    needsExecutionAssistant: true,
    estimatedFanout: () => 1,
    operatorNotes: () => ['Knowledge routines use knowledge_scope as the boundary for sources, claims, and promotion candidates.'],
    validate: (input) => [
      ...requiresAssistant(input, 'Knowledge'),
      ...(hasAnyTriggerConfig(input.triggerConfig, ['operation', 'source_id', 'claim_id']) || Object.keys(input.knowledgeScope ?? {}).length > 0
        ? []
        : ['trigger_config.operation or knowledge_scope is required for Knowledge routines']),
    ],
  },
  engine_home: {
    targetType: 'engine_home',
    taskKind: 'engine_home_job',
    label: 'Engine Home job',
    description: 'Snapshot, diff, export, or prepare rollback of engine-local home state through EHV/HHV/OHV.',
    requiredCapabilities: [
      { id: 'engine_home.snapshot', required: true },
      { id: 'engine_home.diff', required: false },
      { id: 'engine_home.rollback', required: false, supportLevel: 'experimental' },
    ],
    needsExecutionAssistant: true,
    estimatedFanout: () => 1,
    operatorNotes: () => ['Engine Home routines observe/import/review native state; native scheduler execution still requires ACK/reconcile.'],
    validate: (input) => [
      ...requiresAssistant(input, 'Engine Home'),
      ...(hasAnyTriggerConfig(input.triggerConfig, ['operation', 'runtime_id', 'snapshot_id'])
        ? []
        : ['trigger_config.operation is required for Engine Home routines']),
    ],
  },
  plugin_job: {
    targetType: 'plugin_job',
    taskKind: 'plugin_job',
    label: 'Plugin job',
    description: 'Run a managed plugin or skill maintenance job with explicit policy and receipts.',
    requiredCapabilities: [
      { id: 'plugin.job.run', required: true },
      { id: 'plugin.policy.enforced', required: true },
    ],
    needsExecutionAssistant: true,
    estimatedFanout: () => 1,
    operatorNotes: () => ['Plugin routines must execute through managed policy; unmanaged plugin side effects stay out of the shared scheduler.'],
    validate: (input) => [
      ...requiresAssistant(input, 'Plugin'),
      ...(input.targetId || input.managedResourceId || hasAnyTriggerConfig(input.triggerConfig, ['plugin_id', 'skill_id', 'job_id'])
        ? []
        : ['target_id, managed_resource_id, or trigger_config.plugin_id is required for plugin routines']),
    ],
  },
  pm_sync: {
    targetType: 'pm_sync',
    taskKind: 'pm_sync',
    label: 'PM sync',
    description: 'Synchronize external PM systems through federation mappings into Work Graph.',
    requiredCapabilities: [
      { id: 'pm.sync', required: true },
      { id: 'work_graph.action', required: true },
    ],
    needsExecutionAssistant: true,
    estimatedFanout: () => 1,
    operatorNotes: () => ['PM sync routines should reconcile into Work Graph first, then let views render Kanban/list/timeline state.'],
    validate: (input) => [
      ...requiresAssistant(input, 'PM sync'),
      ...(input.projectId || input.targetId || hasAnyTriggerConfig(input.triggerConfig, ['provider', 'external_project_id', 'connection_id'])
        ? []
        : ['project_id, target_id, or trigger_config.provider is required for PM sync routines']),
    ],
  },
}

export function getRoutineTargetAdapter(targetType: RoutineTargetType): RoutineTargetAdapter {
  return ROUTINE_TARGET_ADAPTERS[targetType]
}

export function inferRoutineKinds(input: {
  target_type?: RoutineTargetType
  task_kind?: RoutineTaskKind
  assistant_id?: string | null
  team_id?: string | null
  target_id?: string | null
}): { targetType: RoutineTargetType; taskKind: RoutineTaskKind } {
  const targetType = input.target_type
    ?? (input.team_id ? 'team' : 'assistant')
  const adapter = getRoutineTargetAdapter(targetType)
  return {
    targetType,
    taskKind: input.task_kind ?? adapter.taskKind,
  }
}

export function inferTriggerKind(input: {
  trigger_kind?: RoutineTriggerKind
  cron_expression?: string | null
  run_at?: string | null
}): RoutineTriggerKind {
  if (input.trigger_kind) return input.trigger_kind
  if (input.run_at) return 'one_shot'
  return 'cron'
}

export function buildRoutineSimulation(input: {
  targetType: RoutineTargetType
  taskKind: RoutineTaskKind
  triggerKind: RoutineTriggerKind
  nextRuns: string[]
  warnings?: string[]
  errors?: string[]
  capabilityRequirements?: RoutineCapabilityRequirement[]
  estimatedFanout?: number
  estimatedMonthlyRuns?: number
}): RoutineSimulation {
  const adapter = getRoutineTargetAdapter(input.targetType)
  return {
    valid: (input.errors ?? []).length === 0,
    targetType: input.targetType,
    taskKind: input.taskKind,
    triggerKind: input.triggerKind,
    nextRuns: input.nextRuns,
    warnings: input.warnings ?? [],
    errors: input.errors ?? [],
    requiredCapabilities: input.capabilityRequirements ?? adapter.requiredCapabilities,
    estimatedFanout: input.estimatedFanout ?? adapter.estimatedFanout({}),
    estimatedMonthlyRuns: input.estimatedMonthlyRuns,
  }
}
