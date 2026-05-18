import type { CrewRun } from '@contracts/crew'
import type { FeedEvent } from '@/lib/mission-control/types'

export type ContinuationSeverity = 'info' | 'warn' | 'critical'
export type ContinuationReason =
  | 'approval_required'
  | 'run_failed'
  | 'crew_run_failed'
  | 'active_run'
  | 'cancelled_run'
  | 'delivery_failed'
  | 'runtime_error'
  | 'no_handoff'

export interface ContinuationHandoff {
  reason: ContinuationReason
  severity: ContinuationSeverity
  title: string
  detail: string
  nextAction: string
  anchorLabel?: string | null
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function pickError(payload: Record<string, unknown>) {
  const candidates = [
    payload.error,
    payload.error_message,
    payload.reason,
    payload.last_error_message,
  ]
  return candidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? null
}

function getLastMeaningfulEvent(events: FeedEvent[]) {
  return [...events].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null
}

export function deriveFeedContinuation(events: FeedEvent[]): ContinuationHandoff | null {
  if (events.length === 0) return null

  const latest = getLastMeaningfulEvent(events)
  if (!latest) return null

  const payload = (latest.payload ?? {}) as Record<string, unknown>
  const error = pickError(payload)

  if (latest.event_type === 'approval_requested') {
    const toolName = typeof payload.tool_name === 'string' ? payload.tool_name : 'a gated action'
    return {
      reason: 'approval_required',
      severity: 'warn',
      title: 'Waiting on operator approval',
      detail: `The linked run paused to request approval for ${toolName}.`,
      nextAction: 'Review the approval request and either approve it or reject it with context.',
      anchorLabel: latest.agent_name,
    }
  }

  if (latest.event_type === 'run_finished' && payload.delivered === false) {
    return {
      reason: 'delivery_failed',
      severity: 'warn',
      title: 'Run completed but delivery failed',
      detail: error ?? 'The run finished, but the final response could not be delivered cleanly.',
      nextAction: 'Check the outbound delivery path and confirm the result reached the user or channel.',
      anchorLabel: latest.agent_name,
    }
  }

  if (
    latest.severity === 'critical' ||
    latest.severity === 'error' ||
    latest.event_type === 'task_failed' ||
    latest.event_type === 'crew_run_failed' ||
    latest.event_type === 'crew_member_failed' ||
    latest.event_type === 'error' ||
    latest.event_type === 'channel_deactivated' ||
    latest.event_type === 'runtime_migration_failed'
  ) {
    return {
      reason: latest.event_type === 'crew_run_failed' ? 'crew_run_failed' : 'runtime_error',
      severity: latest.severity === 'critical' ? 'critical' : 'warn',
      title: `${formatLabel(latest.event_type)} needs handoff`,
      detail: error ?? `${latest.agent_name} emitted ${formatLabel(latest.event_type)} and the run needs operator follow-up.`,
      nextAction: 'Inspect the failing step, capture the blocking error, and decide whether to retry, reassign, or escalate.',
      anchorLabel: latest.agent_name,
    }
  }

  if (latest.event_type === 'run_started') {
    return {
      reason: 'active_run',
      severity: 'info',
      title: 'Run is still active',
      detail: `${latest.agent_name} has started the linked run and has not produced a terminal receipt yet.`,
      nextAction: 'Wait for completion or inspect runtime activity if the run appears stalled.',
      anchorLabel: latest.agent_name,
    }
  }

  return null
}

export function deriveCrewRunContinuation(run: CrewRun): ContinuationHandoff | null {
  if (run.status === 'failed') {
    return {
      reason: 'crew_run_failed',
      severity: 'critical',
      title: 'Team run failed',
      detail: run.error_message ?? run.outcome_summary ?? 'The team run ended in a failed state without a detailed operator note.',
      nextAction: 'Inspect the failing member path, capture the blocker, and either retry the run or break the work into a follow-up task.',
    }
  }

  if (run.status === 'cancelled') {
    return {
      reason: 'cancelled_run',
      severity: 'warn',
      title: 'Team run was cancelled',
      detail: run.error_message ?? run.outcome_summary ?? 'The team run was cancelled before it reached a normal completion.',
      nextAction: 'Confirm whether the cancellation was intentional, then decide if the work should be resumed or rewritten as follow-up work.',
    }
  }

  if (run.status === 'starting' || run.status === 'running') {
    return {
      reason: 'active_run',
      severity: 'info',
      title: 'Team run still in progress',
      detail: run.outcome_summary ?? 'The team is still running and no terminal receipt has been written yet.',
      nextAction: 'Check member progress and runtime health before intervening.',
    }
  }

  return null
}
