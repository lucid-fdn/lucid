import { describe, expect, it } from 'vitest'
import type { CrewRun } from '@contracts/crew'
import type { FeedEvent } from '@/lib/mission-control/types'
import { deriveCrewRunContinuation, deriveFeedContinuation } from './continuation'

function makeFeedEvent(overrides: Partial<FeedEvent> = {}): FeedEvent {
  return {
    id: 'evt-1',
    event_type: 'run_started',
    severity: 'info',
    agent_id: 'agent-1',
    agent_name: 'Alpha',
    org_id: 'org-1',
    run_id: 'run-1',
    payload: {},
    created_at: '2026-04-21T10:00:00.000Z',
    ...overrides,
  }
}

function makeCrewRun(overrides: Partial<CrewRun> = {}): CrewRun {
  return {
    id: 'crew-run-1',
    crew_id: 'crew-1',
    org_id: 'org-1',
    trigger_type: 'manual',
    triggered_by: 'user-1',
    status: 'running',
    started_at: '2026-04-21T10:00:00.000Z',
    completed_at: null,
    outcome_summary: null,
    error_message: null,
    total_cost_usd: 0,
    created_at: '2026-04-21T10:00:00.000Z',
    ...overrides,
  }
}

describe('continuation handoffs', () => {
  it('derives an approval handoff from feed events', () => {
    const handoff = deriveFeedContinuation([
      makeFeedEvent({
        event_type: 'approval_requested',
        severity: 'warning',
        payload: { tool_name: 'send_email' },
      }),
    ])

    expect(handoff?.reason).toBe('approval_required')
    expect(handoff?.title).toContain('approval')
    expect(handoff?.nextAction).toContain('approve')
  })

  it('derives a failure handoff from error feed events', () => {
    const handoff = deriveFeedContinuation([
      makeFeedEvent({
        event_type: 'task_failed',
        severity: 'error',
        payload: { error_message: 'Tool execution failed' },
      }),
    ])

    expect(handoff?.reason).toBe('runtime_error')
    expect(handoff?.detail).toContain('Tool execution failed')
  })

  it('derives a crew run handoff for failed runs', () => {
    const handoff = deriveCrewRunContinuation(
      makeCrewRun({
        status: 'failed',
        error_message: 'Budget exhausted',
      }),
    )

    expect(handoff?.reason).toBe('crew_run_failed')
    expect(handoff?.severity).toBe('critical')
    expect(handoff?.detail).toContain('Budget exhausted')
  })

  it('returns no handoff for cleanly completed crew runs', () => {
    const handoff = deriveCrewRunContinuation(
      makeCrewRun({
        status: 'completed',
        completed_at: '2026-04-21T10:10:00.000Z',
      }),
    )

    expect(handoff).toBeNull()
  })
})
