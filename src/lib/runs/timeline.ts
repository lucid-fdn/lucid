import type { CrewRun } from '@contracts/crew'
import type { ReplayRunStep } from './receipts'
import type { FeedEvent } from '@/lib/mission-control/types'

export interface RunTimelineSegment {
  id: string
  label: string
  summary?: string | null
  status: string
  startedAt: string
  endedAt: string
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'error'
}

export interface RunTimelineLane {
  id: string
  label: string
  segments: RunTimelineSegment[]
}

export interface RunTimelineModel {
  startedAt: string
  endedAt: string
  lanes: RunTimelineLane[]
}

export function buildCrewRunsTimeline(
  runs: Array<CrewRun & { crewName?: string }>,
): RunTimelineModel | null {
  if (runs.length === 0) return null

  const sortedRuns = [...runs].sort(
    (left, right) => new Date(left.started_at).getTime() - new Date(right.started_at).getTime(),
  )

  const laneMap = new Map<string, RunTimelineLane>()

  for (const run of sortedRuns) {
    const laneId = run.crewName ?? run.id
    const lane = laneMap.get(laneId) ?? {
      id: laneId,
      label: run.crewName ?? 'Team run',
      segments: [],
    }

    lane.segments.push({
      id: run.id,
      label: run.crewName ?? 'Team run',
      summary: run.outcome_summary ?? run.error_message ?? `Triggered via ${run.trigger_type}`,
      status: run.status,
      startedAt: run.started_at,
      endedAt: run.completed_at ?? run.started_at,
      tone: getTimelineTone(run.status),
    })

    laneMap.set(laneId, lane)
  }

  return {
    startedAt: sortedRuns[0].started_at,
    endedAt: getMaxEndedAt(
      sortedRuns.map((run) => run.completed_at ?? run.started_at),
      sortedRuns[sortedRuns.length - 1]?.started_at ?? sortedRuns[0].started_at,
    ),
    lanes: Array.from(laneMap.values()),
  }
}

export function buildReplayTimeline(steps: ReplayRunStep[]): RunTimelineModel | null {
  if (steps.length === 0) return null

  const sortedSteps = [...steps].sort(
    (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
  )

  const lane: RunTimelineLane = {
    id: 'session',
    label: 'Session',
    segments: sortedSteps.map((step, index) => {
      const currentTime = new Date(step.created_at).getTime()
      const nextStep = sortedSteps[index + 1]
      const durationMs =
        typeof step.payload?.duration_ms === 'number'
          ? step.payload.duration_ms
          : typeof step.payload?.durationMs === 'number'
            ? step.payload.durationMs
            : null
      const endedAtMs =
        durationMs != null
          ? currentTime + durationMs
          : nextStep
            ? new Date(nextStep.created_at).getTime()
            : currentTime + 1000

      return {
        id: step.id,
        label: String(step.payload?.tool_name ?? step.payload?.message_text ?? step.event_type),
        summary: step.error_message ?? null,
        status: step.status,
        startedAt: step.created_at,
        endedAt: new Date(endedAtMs).toISOString(),
        tone: getTimelineTone(step.status),
      } satisfies RunTimelineSegment
    }),
  }

  return {
    startedAt: sortedSteps[0].created_at,
    endedAt: lane.segments[lane.segments.length - 1]?.endedAt ?? sortedSteps[0].created_at,
    lanes: [lane],
  }
}

export function buildFeedEventsTimeline(events: FeedEvent[]): RunTimelineModel | null {
  if (events.length === 0) return null

  const sortedEvents = [...events].sort(
    (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
  )

  const lane: RunTimelineLane = {
    id: 'linked-run',
    label: 'Linked run',
    segments: sortedEvents.map((event, index) => {
      const currentTime = new Date(event.created_at).getTime()
      const nextEvent = sortedEvents[index + 1]
      const endedAtMs = nextEvent
        ? new Date(nextEvent.created_at).getTime()
        : currentTime + 1000

      return {
        id: event.id,
        label: String(event.payload?.tool_name ?? event.payload?.message_text ?? event.event_type),
        summary: event.agent_name ? `${event.agent_name} • ${event.event_type}` : event.event_type,
        status: event.severity,
        startedAt: event.created_at,
        endedAt: new Date(endedAtMs).toISOString(),
        tone: getFeedEventTone(event.severity),
      } satisfies RunTimelineSegment
    }),
  }

  return {
    startedAt: sortedEvents[0].created_at,
    endedAt: lane.segments[lane.segments.length - 1]?.endedAt ?? sortedEvents[0].created_at,
    lanes: [lane],
  }
}

function getMaxEndedAt(values: string[], fallback: string) {
  const timestamps = values
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value))
  if (timestamps.length === 0) return fallback
  return new Date(Math.max(...timestamps)).toISOString()
}

function getTimelineTone(status: string): RunTimelineSegment['tone'] {
  if (status === 'failed' || status === 'error') return 'error'
  if (status === 'cancelled') return 'warning'
  if (status === 'running' || status === 'starting') return 'accent'
  if (status === 'completed') return 'success'
  return 'default'
}

function getFeedEventTone(severity: FeedEvent['severity']): RunTimelineSegment['tone'] {
  if (severity === 'critical' || severity === 'error') return 'error'
  if (severity === 'warn' || severity === 'warning') return 'warning'
  return 'accent'
}
