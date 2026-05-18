import type { CrewRun } from '@contracts/crew'
import type { FeedEvent } from '@/lib/mission-control/types'
import type { RunNarrativeItem } from './narrative'

export interface ReplayRunStep {
  id: string
  direction: 'inbound' | 'outbound'
  event_type: string
  channel_type: string
  payload: Record<string, unknown>
  status: string
  created_at: string
  error_message?: string | null
  tokens_used?: number | null
  cost_usd?: number | null
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function feedEventsToNarrativeItems(events: FeedEvent[]): RunNarrativeItem[] {
  return events.map((event) => ({
    id: event.id,
    title: event.agent_name,
    summary: `${formatLabel(event.event_type)} · Severity ${event.severity}`,
    timestamp: event.created_at,
    status: event.severity === 'error' || event.severity === 'critical' ? 'failed' : 'completed',
    kind: event.event_type,
    details: event.payload ?? null,
  }))
}

export function replayStepsToNarrativeItems(steps: ReplayRunStep[]): RunNarrativeItem[] {
  return steps.map((step) => ({
    id: step.id,
    title: String(step.payload?.message_text ?? step.payload?.tool_name ?? step.event_type),
    summary: step.error_message ?? null,
    timestamp: step.created_at,
    status: step.status,
    kind: step.event_type,
    channel: step.channel_type,
    direction: step.direction,
    errorMessage: step.error_message ?? null,
    costUsd: step.cost_usd ?? null,
    tokensUsed: step.tokens_used ?? null,
    durationMs:
      typeof step.payload?.duration_ms === 'number'
        ? step.payload.duration_ms
        : typeof step.payload?.durationMs === 'number'
          ? step.payload.durationMs
          : null,
    details: step.payload,
  }))
}

export function crewRunsToNarrativeItems(
  runs: Array<CrewRun & { crewName?: string }>,
): RunNarrativeItem[] {
  return runs.map((run) => ({
    id: run.id,
    title: run.crewName ?? 'Team run',
    summary: run.outcome_summary ?? run.error_message ?? `${formatLabel(run.status)} run`,
    timestamp: run.created_at,
    status: run.status,
    kind: `crew_run_${run.status}`,
    costUsd: Number(run.total_cost_usd ?? 0),
    durationMs: computeRunDurationMs(run.started_at, run.completed_at),
    errorMessage: run.error_message ?? null,
    details: {
      trigger_type: run.trigger_type,
      started_at: run.started_at,
      completed_at: run.completed_at,
      outcome_summary: run.outcome_summary,
      error_message: run.error_message,
      total_cost_usd: run.total_cost_usd,
    },
  }))
}

function computeRunDurationMs(startedAt?: string | null, completedAt?: string | null) {
  if (!startedAt || !completedAt) return null

  const startedAtMs = new Date(startedAt).getTime()
  const completedAtMs = new Date(completedAt).getTime()

  if (Number.isNaN(startedAtMs) || Number.isNaN(completedAtMs)) return null

  return Math.max(0, completedAtMs - startedAtMs)
}
