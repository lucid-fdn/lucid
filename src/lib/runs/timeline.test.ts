import { describe, expect, it } from 'vitest'
import { buildCrewRunsTimeline, buildReplayTimeline } from './timeline'

describe('run timeline helpers', () => {
  it('builds crew swimlanes from recent runs', () => {
    const timeline = buildCrewRunsTimeline([
      {
        id: 'run-1',
        crewName: 'Research Team',
        status: 'completed',
        started_at: '2026-04-21T10:00:00.000Z',
        completed_at: '2026-04-21T10:05:00.000Z',
        created_at: '2026-04-21T10:00:00.000Z',
        trigger_type: 'manual',
        outcome_summary: 'Completed review',
        error_message: null,
        total_cost_usd: 0.12,
      } as never,
      {
        id: 'run-2',
        crewName: 'Execution Team',
        status: 'failed',
        started_at: '2026-04-21T10:02:00.000Z',
        completed_at: '2026-04-21T10:06:00.000Z',
        created_at: '2026-04-21T10:02:00.000Z',
        trigger_type: 'manual',
        outcome_summary: null,
        error_message: 'Timed out',
        total_cost_usd: 0.2,
      } as never,
    ])

    expect(timeline?.lanes).toHaveLength(2)
    expect(timeline?.lanes[0]?.segments[0]).toEqual(
      expect.objectContaining({
        id: 'run-1',
        tone: 'success',
      }),
    )
    expect(timeline?.lanes[1]?.segments[0]).toEqual(
      expect.objectContaining({
        id: 'run-2',
        tone: 'error',
      }),
    )
  })

  it('builds a replay session lane from ordered steps', () => {
    const timeline = buildReplayTimeline([
      {
        id: 'step-1',
        direction: 'outbound',
        event_type: 'tool_call',
        channel_type: 'chat',
        payload: { tool_name: 'web_search', duration_ms: 3000 },
        status: 'completed',
        created_at: '2026-04-21T10:00:00.000Z',
      },
      {
        id: 'step-2',
        direction: 'outbound',
        event_type: 'tool_result',
        channel_type: 'chat',
        payload: { output: 'done' },
        status: 'completed',
        created_at: '2026-04-21T10:00:05.000Z',
      },
    ])

    expect(timeline?.lanes).toHaveLength(1)
    expect(timeline?.lanes[0]?.segments).toHaveLength(2)
    expect(timeline?.lanes[0]?.segments[0]).toEqual(
      expect.objectContaining({
        id: 'step-1',
        label: 'web_search',
      }),
    )
  })
})
