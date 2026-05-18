import { describe, expect, it } from 'vitest'
import {
  summarizeCrewConnections,
  summarizeCrewInterventions,
  summarizeCrewRuntimeModes,
  summarizeCrewRuns,
} from './read-model'

describe('summarizeCrewRuns', () => {
  it('calculates health metrics from runs', () => {
    const summary = summarizeCrewRuns([
      {
        id: 'run-1',
        crew_id: 'crew-1',
        status: 'completed',
        started_at: '2026-04-16T10:00:00.000Z',
        completed_at: '2026-04-16T10:10:00.000Z',
        total_cost_usd: 1.25,
      } as never,
      {
        id: 'run-2',
        crew_id: 'crew-1',
        status: 'failed',
        started_at: '2026-04-16T11:00:00.000Z',
        completed_at: '2026-04-16T11:05:00.000Z',
        total_cost_usd: 0.75,
      } as never,
    ])

    expect(summary.totalRuns).toBe(2)
    expect(summary.resolvedRuns).toBe(2)
    expect(summary.failedRuns).toBe(1)
    expect(summary.successRate).toBe(50)
    expect(summary.failureRate).toBe(50)
    expect(summary.trendDirection).toBe('steady')
    expect(summary.averageCost).toBe(1)
  })

  it('calculates recovery and recent failure rates', () => {
    const summary = summarizeCrewRuns([
      {
        id: 'run-1',
        crew_id: 'crew-1',
        status: 'failed',
        started_at: '2026-04-16T09:00:00.000Z',
        completed_at: '2026-04-16T09:05:00.000Z',
        total_cost_usd: 0.2,
      } as never,
      {
        id: 'run-2',
        crew_id: 'crew-1',
        status: 'completed',
        started_at: '2026-04-16T10:00:00.000Z',
        completed_at: '2026-04-16T10:05:00.000Z',
        total_cost_usd: 0.2,
      } as never,
      {
        id: 'run-3',
        crew_id: 'crew-1',
        status: 'cancelled',
        started_at: '2026-04-16T11:00:00.000Z',
        completed_at: '2026-04-16T11:03:00.000Z',
        total_cost_usd: 0.2,
      } as never,
      {
        id: 'run-4',
        crew_id: 'crew-1',
        status: 'running',
        started_at: '2026-04-16T12:00:00.000Z',
        completed_at: null,
        total_cost_usd: 0.1,
      } as never,
    ])

    expect(summary.cancelledRuns).toBe(1)
    expect(summary.recoveryRate).toBe(50)
    expect(summary.recentFailureRate).toBe(67)
    expect(summary.incidentRate).toBe(75)
    expect(summary.recoveryStreak).toBe(0)
    expect(summary.recentResolvedRuns).toBe(3)
    expect(summary.trendDirection).toBe('steady')
  })

  it('classifies worsening and improving reliability trends', () => {
    const worsening = summarizeCrewRuns([
      {
        id: 'run-1',
        crew_id: 'crew-1',
        status: 'completed',
        started_at: '2026-04-16T08:00:00.000Z',
        completed_at: '2026-04-16T08:05:00.000Z',
        total_cost_usd: 0.1,
      } as never,
      {
        id: 'run-2',
        crew_id: 'crew-1',
        status: 'completed',
        started_at: '2026-04-16T09:00:00.000Z',
        completed_at: '2026-04-16T09:05:00.000Z',
        total_cost_usd: 0.1,
      } as never,
      {
        id: 'run-3',
        crew_id: 'crew-1',
        status: 'completed',
        started_at: '2026-04-16T09:30:00.000Z',
        completed_at: '2026-04-16T09:35:00.000Z',
        total_cost_usd: 0.1,
      } as never,
      {
        id: 'run-4',
        crew_id: 'crew-1',
        status: 'completed',
        started_at: '2026-04-16T09:50:00.000Z',
        completed_at: '2026-04-16T09:55:00.000Z',
        total_cost_usd: 0.1,
      } as never,
      {
        id: 'run-5',
        crew_id: 'crew-1',
        status: 'completed',
        started_at: '2026-04-16T09:58:00.000Z',
        completed_at: '2026-04-16T10:00:00.000Z',
        total_cost_usd: 0.1,
      } as never,
      {
        id: 'run-6',
        crew_id: 'crew-1',
        status: 'failed',
        started_at: '2026-04-16T10:05:00.000Z',
        completed_at: '2026-04-16T10:10:00.000Z',
        total_cost_usd: 0.1,
      } as never,
      {
        id: 'run-7',
        crew_id: 'crew-1',
        status: 'failed',
        started_at: '2026-04-16T10:15:00.000Z',
        completed_at: '2026-04-16T10:20:00.000Z',
        total_cost_usd: 0.1,
      } as never,
      {
        id: 'run-8',
        crew_id: 'crew-1',
        status: 'failed',
        started_at: '2026-04-16T10:25:00.000Z',
        completed_at: '2026-04-16T10:30:00.000Z',
        total_cost_usd: 0.1,
      } as never,
      {
        id: 'run-9',
        crew_id: 'crew-1',
        status: 'failed',
        started_at: '2026-04-16T10:35:00.000Z',
        completed_at: '2026-04-16T10:40:00.000Z',
        total_cost_usd: 0.1,
      } as never,
    ])

    const improving = summarizeCrewRuns([
      {
        id: 'run-1',
        crew_id: 'crew-1',
        status: 'failed',
        started_at: '2026-04-16T08:00:00.000Z',
        completed_at: '2026-04-16T08:05:00.000Z',
        total_cost_usd: 0.1,
      } as never,
      {
        id: 'run-2',
        crew_id: 'crew-1',
        status: 'failed',
        started_at: '2026-04-16T09:00:00.000Z',
        completed_at: '2026-04-16T09:05:00.000Z',
        total_cost_usd: 0.1,
      } as never,
      {
        id: 'run-3',
        crew_id: 'crew-1',
        status: 'failed',
        started_at: '2026-04-16T09:30:00.000Z',
        completed_at: '2026-04-16T09:35:00.000Z',
        total_cost_usd: 0.1,
      } as never,
      {
        id: 'run-4',
        crew_id: 'crew-1',
        status: 'failed',
        started_at: '2026-04-16T09:45:00.000Z',
        completed_at: '2026-04-16T09:50:00.000Z',
        total_cost_usd: 0.1,
      } as never,
      {
        id: 'run-5',
        crew_id: 'crew-1',
        status: 'completed',
        started_at: '2026-04-16T10:00:00.000Z',
        completed_at: '2026-04-16T10:05:00.000Z',
        total_cost_usd: 0.1,
      } as never,
      {
        id: 'run-6',
        crew_id: 'crew-1',
        status: 'completed',
        started_at: '2026-04-16T10:15:00.000Z',
        completed_at: '2026-04-16T10:20:00.000Z',
        total_cost_usd: 0.1,
      } as never,
      {
        id: 'run-7',
        crew_id: 'crew-1',
        status: 'completed',
        started_at: '2026-04-16T10:25:00.000Z',
        completed_at: '2026-04-16T10:30:00.000Z',
        total_cost_usd: 0.1,
      } as never,
      {
        id: 'run-8',
        crew_id: 'crew-1',
        status: 'completed',
        started_at: '2026-04-16T10:35:00.000Z',
        completed_at: '2026-04-16T10:40:00.000Z',
        total_cost_usd: 0.1,
      } as never,
      {
        id: 'run-9',
        crew_id: 'crew-1',
        status: 'completed',
        started_at: '2026-04-16T10:45:00.000Z',
        completed_at: '2026-04-16T10:50:00.000Z',
        total_cost_usd: 0.1,
      } as never,
    ])

    expect(worsening.trendDirection).toBe('worsening')
    expect(improving.trendDirection).toBe('improving')
    expect(improving.recoveryStreak).toBe(5)
  })
})

describe('summarizeCrewConnections', () => {
  it('counts inbound and outbound links', () => {
    const summary = summarizeCrewConnections(
      [
        { id: 'm1' } as never,
        { id: 'm2' } as never,
      ],
      [
        { source_member_id: 'm1', target_member_id: 'm2' } as never,
      ],
    )

    expect(summary).toEqual([
      { memberId: 'm1', outboundCount: 1, inboundCount: 0 },
      { memberId: 'm2', outboundCount: 0, inboundCount: 1 },
    ])
  })
})

describe('summarizeCrewRuntimeModes', () => {
  it('summarizes mixed runtime modes across crew members', () => {
    const summary = summarizeCrewRuntimeModes(
      [
        { assistant_id: 'a1', member_ref_id: 'a1' } as never,
        { assistant_id: 'a2', member_ref_id: 'a2' } as never,
        { assistant_id: 'a3', member_ref_id: 'a3' } as never,
      ],
      [
        { id: 'a1', runtime_flavor: 'shared', runtime_id: null } as never,
        { id: 'a2', runtime_flavor: 'c1_managed', runtime_id: 'rt-2' } as never,
        { id: 'a3', runtime_flavor: 'c2a_autonomous', runtime_id: 'rt-3' } as never,
      ],
    )

    expect(summary.assistedMembers).toBe(3)
    expect(summary.primaryMode).toBe('Shared runtime')
    expect(summary.primaryDescription).toContain('Fastest setup')
    expect(summary.uniqueModes).toEqual([
      'Shared runtime',
      'Lucid-managed runtime',
      'Bring your own runtime',
    ])
    expect(summary.alignmentLabel).toBe('3 runtime paths in play')
    expect(summary.sharedCount).toBe(1)
    expect(summary.managedCount).toBe(1)
    expect(summary.byoCount).toBe(1)
  })
})

describe('summarizeCrewInterventions', () => {
  it('builds intervention history with recurring incident detection', () => {
    const summary = summarizeCrewInterventions([
      {
        id: 'run-1',
        crew_id: 'crew-1',
        org_id: 'org-1',
        trigger_type: 'manual',
        triggered_by: 'user-1',
        status: 'failed',
        started_at: '2026-04-21T10:00:00.000Z',
        completed_at: '2026-04-21T10:05:00.000Z',
        outcome_summary: null,
        error_message: 'Rate limit exceeded',
        total_cost_usd: 1.1,
        created_at: '2026-04-21T10:00:00.000Z',
      } as never,
      {
        id: 'run-2',
        crew_id: 'crew-1',
        org_id: 'org-1',
        trigger_type: 'manual',
        triggered_by: 'user-1',
        status: 'failed',
        started_at: '2026-04-21T09:00:00.000Z',
        completed_at: '2026-04-21T09:05:00.000Z',
        outcome_summary: null,
        error_message: 'Rate limit exceeded',
        total_cost_usd: 1.0,
        created_at: '2026-04-21T09:00:00.000Z',
      } as never,
      {
        id: 'run-3',
        crew_id: 'crew-1',
        org_id: 'org-1',
        trigger_type: 'manual',
        triggered_by: 'user-1',
        status: 'running',
        started_at: '2026-04-21T11:00:00.000Z',
        completed_at: null,
        outcome_summary: null,
        error_message: null,
        total_cost_usd: 0.4,
        created_at: '2026-04-21T11:00:00.000Z',
      } as never,
      {
        id: 'run-4',
        crew_id: 'crew-1',
        org_id: 'org-1',
        trigger_type: 'manual',
        triggered_by: 'user-1',
        status: 'completed',
        started_at: '2026-04-21T08:00:00.000Z',
        completed_at: '2026-04-21T08:10:00.000Z',
        outcome_summary: 'Done',
        error_message: null,
        total_cost_usd: 0.2,
        created_at: '2026-04-21T08:00:00.000Z',
      } as never,
    ])

    expect(summary.totalInterventions).toBe(3)
    expect(summary.activeIncidents).toBe(1)
    expect(summary.failedRuns).toBe(2)
    expect(summary.recurringIncidentCount).toBe(2)
    expect(summary.consecutiveFailureCount).toBe(2)
    expect(summary.incidents[1]?.recurring).toBe(true)
  })
})
