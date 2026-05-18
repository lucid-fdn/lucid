import type { CreateRoutineInput, RoutineTriggerKind } from '@/lib/routines/types'

export interface RoutinePreset {
  id: string
  label: string
  description: string
  targetType: NonNullable<CreateRoutineInput['target_type']>
  triggerKind: RoutineTriggerKind
  cronExpression: string
  prompt: string
  triggerConfig: Record<string, unknown>
  concurrencyPolicy: NonNullable<CreateRoutineInput['concurrency_policy']>
  catchUpPolicy: NonNullable<CreateRoutineInput['catch_up_policy']>
  requiredFields: string[]
}

export const ROUTINE_PRESETS: RoutinePreset[] = [
  {
    id: 'work-graph-standup',
    label: 'Work Graph standup',
    description: 'Review goals, blocked cards, and next actions every weekday morning.',
    targetType: 'work_graph',
    triggerKind: 'cron',
    cronExpression: '0 9 * * 1-5',
    prompt: 'Review the current goal and work item state, summarize blockers, and attach routine evidence to the relevant Work Graph records.',
    triggerConfig: { action: 'event_only', artifact_type: 'standup_note' },
    concurrencyPolicy: 'skip_if_running',
    catchUpPolicy: 'latest_only',
    requiredFields: ['Execution assistant', 'Project ID or Work item ID'],
  },
  {
    id: 'team-weekly-review',
    label: 'Team weekly review',
    description: 'Dispatch a team routine with child-run receipts and partial-success tracking.',
    targetType: 'team',
    triggerKind: 'cron',
    cronExpression: '0 10 * * 1',
    prompt: 'Coordinate the team for a weekly review. Summarize member findings, unresolved blockers, and recommended owner assignments.',
    triggerConfig: { mode: 'weekly_review' },
    concurrencyPolicy: 'queue_one',
    catchUpPolicy: 'latest_only',
    requiredFields: ['Team ID'],
  },
  {
    id: 'browser-procedure-health',
    label: 'Browser procedure health',
    description: 'Run a trusted Browser Operator procedure and retain sanitized evidence.',
    targetType: 'browser_procedure',
    triggerKind: 'cron',
    cronExpression: '0 */6 * * *',
    prompt: 'Run the selected browser procedure, capture sanitized evidence, and flag any blocked or refused state.',
    triggerConfig: { matched_trigger: 'routine_health_check' },
    concurrencyPolicy: 'skip_if_running',
    catchUpPolicy: 'none',
    requiredFields: ['Execution assistant', 'Target ID or procedure_id'],
  },
  {
    id: 'engine-home-snapshot',
    label: 'Engine Home snapshot',
    description: 'Snapshot EHV/HHV/OHV state for review, diff, and rollback readiness.',
    targetType: 'engine_home',
    triggerKind: 'cron',
    cronExpression: '0 2 * * *',
    prompt: 'Snapshot the runtime Engine Home and record review evidence without exposing secrets or internal paths.',
    triggerConfig: { operation: 'snapshot' },
    concurrencyPolicy: 'skip_if_running',
    catchUpPolicy: 'latest_only',
    requiredFields: ['Execution assistant', 'trigger_config.runtime_id', 'trigger_config.root_dir'],
  },
  {
    id: 'native-schedule-import',
    label: 'Native schedule import',
    description: 'Observe Hermes/OpenClaw local schedules and import them as disabled Routine candidates.',
    targetType: 'engine_home',
    triggerKind: 'manual',
    cronExpression: '0 9 * * 1-5',
    prompt: 'Inspect runtime-native schedules, create a review candidate, and import safe schedules as disabled Lucid Routines without delegating execution.',
    triggerConfig: {
      operation: 'engine_home.native_scheduler.import',
      native_schedules: [],
    },
    concurrencyPolicy: 'skip_if_running',
    catchUpPolicy: 'none',
    requiredFields: ['Execution assistant', 'trigger_config.engine', 'trigger_config.runtime_id', 'trigger_config.native_schedules or native_schedule_file'],
  },
  {
    id: 'pm-sync',
    label: 'PM federation sync',
    description: 'Reconcile Linear/Jira/Asana/Trello/Monday mirrors into Lucid Work Graph.',
    targetType: 'pm_sync',
    triggerKind: 'pm_sync',
    cronExpression: '*/15 * * * *',
    prompt: 'Reconcile external PM changes into Work Graph, preserve external refs, and attach sync evidence.',
    triggerConfig: { provider: 'linear', sync_mode: 'incremental' },
    concurrencyPolicy: 'queue_one',
    catchUpPolicy: 'bounded',
    requiredFields: ['Execution assistant', 'Project ID', 'provider/connection config'],
  },
]
