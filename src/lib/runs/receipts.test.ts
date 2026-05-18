import { describe, expect, it } from 'vitest'
import { crewRunsToNarrativeItems, feedEventsToNarrativeItems, replayStepsToNarrativeItems } from './receipts'

describe('run receipt helpers', () => {
  it('maps feed events into narrative items', () => {
    const items = feedEventsToNarrativeItems([
      {
        id: 'evt-1',
        agent_name: 'Alpha',
        event_type: 'task_completed',
        severity: 'info',
        created_at: '2026-04-16T10:00:00.000Z',
        payload: { output: 'done' },
      } as never,
    ])

    expect(items).toEqual([
      expect.objectContaining({
        id: 'evt-1',
        title: 'Alpha',
        status: 'completed',
        kind: 'task_completed',
      }),
    ])
  })

  it('maps replay steps into narrative items', () => {
    const items = replayStepsToNarrativeItems([
      {
        id: 'step-1',
        direction: 'outbound',
        event_type: 'tool_call',
        channel_type: 'chat',
        payload: { tool_name: 'web_search', duration_ms: 3200 },
        status: 'completed',
        created_at: '2026-04-16T10:00:00.000Z',
        cost_usd: 0.0025,
      },
    ])

    expect(items[0]).toEqual(
      expect.objectContaining({
        id: 'step-1',
        title: 'web_search',
        kind: 'tool_call',
        channel: 'chat',
        costUsd: 0.0025,
        durationMs: 3200,
      }),
    )
  })

  it('maps crew runs into receipt narratives', () => {
    const items = crewRunsToNarrativeItems([
      {
        id: 'run-1',
        crewName: 'Research Team',
        status: 'failed',
        created_at: '2026-04-16T10:00:00.000Z',
        trigger_type: 'manual',
        started_at: '2026-04-16T10:00:00.000Z',
        completed_at: '2026-04-16T10:05:00.000Z',
        outcome_summary: null,
        error_message: 'Timeout',
        total_cost_usd: 0.12,
      } as never,
    ])

    expect(items[0]).toEqual(
      expect.objectContaining({
        title: 'Research Team',
        status: 'failed',
        errorMessage: 'Timeout',
        costUsd: 0.12,
        durationMs: 300000,
      }),
    )
  })
})
