vi.mock('server-only', () => ({}))

import { describe, expect, it, vi } from 'vitest'
import type { FeedEvent, PendingApproval } from '@/lib/mission-control/types'
import { buildProjectOverviewProjection } from '@/lib/projects/read-model'
import type { ProjectAttentionData } from '@/lib/projects/attention'

function makeAttention(overrides: Partial<ProjectAttentionData> = {}): ProjectAttentionData {
  const projectFeedEvents: FeedEvent[] = [
    {
      id: 'event-1',
      agent_id: 'agent-1',
      event_type: 'task_completed',
      severity: 'info',
      created_at: new Date().toISOString(),
      run_id: 'run-1',
      metadata: null,
      title: null,
      detail: null,
      assistant_name: null,
      workspace_id: null,
      project_id: null,
    },
  ]

  const pendingApprovals: PendingApproval[] = [
    {
      id: 'approval-1',
      agent_id: 'agent-1',
      agent_name: 'Alpha',
      tool_name: 'send_email',
      risk_level: 'medium',
      created_at: new Date().toISOString(),
      status: 'pending',
      args: {},
      reason: null,
      scope: null,
      project_id: null,
      workspace_id: null,
      assistant_id: 'agent-1',
      run_id: null,
      policy_id: null,
      policy_name: null,
      tool_call_id: null,
      expires_at: null,
    },
  ]

  return {
    assistants: [
      {
        id: 'agent-1',
        name: 'Alpha',
        description: null,
        model: null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        provider: null,
        system_prompt: null,
        project_id: 'project-1',
        workspace_id: 'org-1',
        runtime_flavor: 'c1_managed',
        runtime_tier: 'dedicated',
      },
      {
        id: 'agent-2',
        name: 'Bravo',
        description: null,
        model: null,
        is_active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        provider: null,
        system_prompt: null,
        project_id: 'project-1',
        workspace_id: 'org-1',
        runtime_flavor: 'shared',
        runtime_tier: null,
      },
    ],
    projectAgentIds: ['agent-1', 'agent-2'],
    projectFeedEvents,
    pendingApprovals,
    failedEvents: [],
    criticalEvents: [],
    openWorkItems: [],
    readyWorkItems: [],
    blockedWorkItems: [],
    livenessIncidents: [],
    activeCrewRuns: [],
    failedCrewRuns: [],
    recentCrewRuns: [],
    summary: {
      approvals: 1,
      failedRuns: 0,
      activeRuns: 0,
      openWorkItems: 0,
      readyWorkItems: 0,
      blockedWorkItems: 0,
      livenessIncidents: 0,
      criticalEvents: 0,
    },
    ...overrides,
  }
}

describe('buildProjectOverviewProjection', () => {
  it('builds runtime and proof summaries from the centralized attention model', () => {
    const projection = buildProjectOverviewProjection({
      counts: {
        assistants: 2,
        crews: 1,
        templates: 0,
      },
      attention: makeAttention(),
    })

    expect(projection.activeAgents).toBe(1)
    expect(projection.runtimeCounts.managed).toBe(1)
    expect(projection.runtimeCounts.shared).toBe(1)
    expect(projection.metrics.operatorLoad).toBe(1)
    expect(projection.metrics.crewTrendDirection).toBe('insufficient_data')
    expect(projection.runtimePackaging.primaryTitle).toBeTruthy()
    expect(projection.proofLoop.stage).toBe('create-work')
    expect(projection.agentProjectionById.get('agent-1')?.runtimeTitle).toBeTruthy()
  })

  it('keeps approval counts scoped to the project attention summary', () => {
    const projection = buildProjectOverviewProjection({
      counts: {
        assistants: 1,
        crews: 0,
        templates: 0,
      },
      attention: makeAttention({
        pendingApprovals: [],
        summary: {
          approvals: 0,
          failedRuns: 0,
          activeRuns: 0,
          openWorkItems: 0,
          readyWorkItems: 0,
          blockedWorkItems: 0,
          livenessIncidents: 0,
          criticalEvents: 0,
        },
      }),
    })

    expect(projection.attention.summary.approvals).toBe(0)
    expect(projection.metrics.operatorLoad).toBe(0)
    expect(projection.proofLoop.receiptLabel).toContain('1 recent event')
  })
})
