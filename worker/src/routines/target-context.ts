export interface RoutineTargetTask {
  id: string
  assistant_id: string
  org_id: string
  task_prompt: string
  name: string | null
  task_kind?: string | null
  target_type?: string | null
  target_id?: string | null
  team_id?: string | null
  project_id?: string | null
  work_item_id?: string | null
  trigger_kind?: string | null
  trigger_config?: Record<string, unknown> | null
  context_policy?: Record<string, unknown> | null
  knowledge_scope?: Record<string, unknown> | null
  trustgate_policy?: Record<string, unknown> | null
  dispatch_policy?: Record<string, unknown> | null
  managed_resource_id?: string | null
}

export interface RoutineExecutionContext {
  systemSection: string
  userMessage: string
  dispatchSummary: Record<string, unknown>
  receiptRefs: {
    agentOpsRunId?: string | null
    browserRunId?: string | null
    engineHomeRefs?: Record<string, unknown>
    workGraphRefs?: Record<string, unknown>
    knowledgeRefs?: Record<string, unknown>
    trustgateRefs?: Record<string, unknown>
    sanitizedEvidence?: Record<string, unknown>
  }
}

function stableJson(value: Record<string, unknown> | null | undefined): string {
  if (!value || Object.keys(value).length === 0) return '{}'
  return JSON.stringify(value)
}

function targetLabel(targetType: string): string {
  return targetType.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function refsFor(task: RoutineTargetTask): RoutineExecutionContext['receiptRefs'] {
  const targetId = task.target_id ?? null
  switch (task.target_type) {
    case 'work_graph':
    case 'pm_sync':
      return {
        workGraphRefs: {
          target_id: targetId,
          work_item_id: task.work_item_id ?? null,
          project_id: task.project_id ?? null,
        },
      }
    case 'agent_ops':
      return {
        agentOpsRunId: typeof task.trigger_config?.run_id === 'string' ? task.trigger_config.run_id : null,
        sanitizedEvidence: { routine_target: 'agent_ops', target_id: targetId },
      }
    case 'browser_procedure':
      return {
        browserRunId: typeof task.trigger_config?.browser_run_id === 'string' ? task.trigger_config.browser_run_id : null,
        sanitizedEvidence: { routine_target: 'browser_procedure', target_id: targetId },
      }
    case 'knowledge':
      return {
        knowledgeRefs: {
          target_id: targetId,
          scope: task.knowledge_scope ?? {},
          operation: task.trigger_config?.operation ?? null,
        },
      }
    case 'engine_home':
      return {
        engineHomeRefs: {
          target_id: targetId,
          runtime_id: task.trigger_config?.runtime_id ?? null,
          operation: task.trigger_config?.operation ?? null,
          snapshot_id: task.trigger_config?.snapshot_id ?? null,
        },
      }
    case 'plugin_job':
      return {
        sanitizedEvidence: {
          routine_target: 'plugin_job',
          target_id: targetId,
          managed_resource_id: task.managed_resource_id ?? null,
        },
      }
    default:
      return {}
  }
}

function targetGuidance(task: RoutineTargetTask): string[] {
  const targetType = task.target_type ?? 'assistant'
  switch (targetType) {
    case 'work_graph':
      return [
        'Operate on Lucid Work Graph state. Use canonical Work Graph tools/APIs when available.',
        'Attach or describe evidence refs for any status, priority, dependency, or Kanban/lane change.',
        'Do not invent external PM state; reconcile missing data as an explicit blocker.',
      ]
    case 'agent_ops':
      return [
        'Run or reconcile the referenced Agent Ops workflow under existing policies.',
        'Keep domain evidence in Agent Ops and summarize the run reference in the routine receipt.',
      ]
    case 'browser_procedure':
      return [
        'Execute or verify the referenced Browser Operator procedure.',
        'Keep screenshots, URLs, logs, and DOM details sanitized before including them in the final output.',
      ]
    case 'knowledge':
      return [
        'Run the requested Knowledge/Brain operation inside the provided knowledge scope.',
        'Prefer claims, source refs, and promotion candidates over opaque memory edits.',
      ]
    case 'engine_home':
      return [
        'Operate through Engine Home Virtualization semantics: snapshot, diff, export, or rollback proposal.',
        'Do not write directly to engine home files unless an approved command/tool performs the change.',
      ]
    case 'plugin_job':
      return [
        'Run the referenced plugin or skill job through managed policy.',
        'Report policy denials or missing permissions as blocked, not as successful execution.',
      ]
    case 'pm_sync':
      return [
        'Synchronize external PM data into Work Graph using federation mappings.',
        'Preserve external identifiers as refs and let Work Graph remain the canonical Lucid view.',
      ]
    default:
      return [
        'Execute the assistant routine directly and return a concise result.',
      ]
  }
}

export function buildRoutineExecutionContext(task: RoutineTargetTask): RoutineExecutionContext {
  const targetType = task.target_type ?? 'assistant'
  const lines = [
    `Routine target: ${targetLabel(targetType)}`,
    `Task kind: ${task.task_kind ?? 'assistant_run'}`,
    `Routine id: ${task.id}`,
    `Target id: ${task.target_id ?? 'none'}`,
    `Project id: ${task.project_id ?? 'none'}`,
    `Work item id: ${task.work_item_id ?? 'none'}`,
    `Managed resource id: ${task.managed_resource_id ?? 'none'}`,
    '',
    'Target guidance:',
    ...targetGuidance(task).map((line) => `- ${line}`),
    '',
    `Trigger config: ${stableJson(task.trigger_config)}`,
    `Context policy: ${stableJson(task.context_policy)}`,
    `Knowledge scope: ${stableJson(task.knowledge_scope)}`,
    `TrustGate policy: ${stableJson(task.trustgate_policy)}`,
    `Dispatch policy: ${stableJson(task.dispatch_policy)}`,
  ]

  return {
    systemSection: lines.join('\n'),
    userMessage: [
      `[ROUTINE TARGET: ${targetType}]`,
      `Use the target contract and policies from the system prompt.`,
      task.task_prompt,
    ].join('\n'),
    dispatchSummary: {
      target_type: targetType,
      task_kind: task.task_kind ?? 'assistant_run',
      target_id: task.target_id ?? null,
      project_id: task.project_id ?? null,
      work_item_id: task.work_item_id ?? null,
      managed_resource_id: task.managed_resource_id ?? null,
      trigger_kind: task.trigger_kind ?? null,
      trigger_config: task.trigger_config ?? {},
    },
    receiptRefs: refsFor(task),
  }
}
