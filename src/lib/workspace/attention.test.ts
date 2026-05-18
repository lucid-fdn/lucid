import { describe, expect, it, vi } from 'vitest'
import { buildWorkspaceAttentionData, getWorkspaceAttentionCount } from './attention'

vi.mock('server-only', () => ({}))

describe('workspace attention', () => {
  it('aggregates counts and sorts projects by operator attention', () => {
    const data = buildWorkspaceAttentionData([
      {
        project: {
          id: 'project-b',
          slug: 'beta',
          name: 'Beta',
        },
        attention: {
          pendingApprovals: [],
          readyWorkItems: [],
          blockedWorkItems: [],
          livenessIncidents: [],
          failedCrewRuns: [],
          failedEvents: [],
          recentCrewRuns: [],
          summary: {
            approvals: 0,
            failedRuns: 0,
            activeRuns: 1,
            openWorkItems: 0,
            readyWorkItems: 0,
            blockedWorkItems: 0,
            livenessIncidents: 0,
            criticalEvents: 0,
          },
        },
      },
      {
        project: {
          id: 'project-a',
          slug: 'alpha',
          name: 'Alpha',
        },
        attention: {
          pendingApprovals: [
            {
              id: 'approval-1',
              org_id: 'org-1',
              agent_id: 'agent-1',
              agent_name: 'Agent One',
              run_id: 'run-1',
              tool_name: 'send_email',
              tool_args: {},
              estimated_cost_usd: null,
              risk_level: 'medium',
              status: 'pending',
              requested_at: '2026-04-21T08:00:00.000Z',
              expires_at: '2026-04-21T10:00:00.000Z',
            },
          ],
          readyWorkItems: [
            {
              id: 'work-1',
              org_id: 'org-1',
              kind: 'pulse_standalone',
              pulse_job_run_id: 'run-1',
              dag_id: null,
              dag_node_id: null,
              agent_id: 'agent-1',
              title: 'Review brief',
              description: null,
              priority: 'normal',
              labels: [],
              assignee_user_id: null,
              assignee_role: null,
              status: 'open',
              resolution: null,
              resolution_notes: null,
              due_at: null,
              sla_seconds: null,
              started_at: null,
              completed_at: null,
              external_mirror: null,
              created_by: 'user-1',
              created_at: '2026-04-21T08:00:00.000Z',
              updated_at: '2026-04-21T08:00:00.000Z',
              signal: {
                state: 'ready',
                label: 'Ready for claim',
                detail: 'Operator can pick this up now.',
                readyForOperator: true,
                stalled: false,
                severity: 'info',
                reason: 'ready_unassigned',
              },
            },
          ],
          blockedWorkItems: [],
          livenessIncidents: [
            {
              key: 'incident-1',
              type: 'unassigned_work',
              severity: 'warn',
              title: 'Unassigned work',
              detail: 'Work has no operator assigned.',
              workItemId: 'work-1',
              agentId: 'agent-1',
              createdAt: '2026-04-21T08:00:00.000Z',
            },
          ],
          failedCrewRuns: [],
          failedEvents: [
            {
              id: 'event-1',
              agent_id: 'agent-1',
              agent_name: 'Agent One',
              severity: 'error',
              event_type: 'task_failed',
              org_id: 'org-1',
              run_id: 'run-1',
              payload: {},
              created_at: '2026-04-21T09:00:00.000Z',
            },
          ],
          recentCrewRuns: [
            {
              id: 'crew-run-0',
              crew_id: 'crew-1',
              org_id: 'org-1',
              trigger_type: 'manual',
              triggered_by: 'user-1',
              status: 'completed',
              started_at: '2026-04-21T06:00:00.000Z',
              completed_at: '2026-04-21T06:05:00.000Z',
              outcome_summary: 'Recovered',
              error_message: null,
              total_cost_usd: 0.3,
              created_at: '2026-04-21T06:00:00.000Z',
              crewName: 'Alpha Crew',
            },
            {
              id: 'crew-run-1',
              crew_id: 'crew-1',
              org_id: 'org-1',
              trigger_type: 'manual',
              triggered_by: 'user-1',
              status: 'failed',
              started_at: '2026-04-21T07:00:00.000Z',
              completed_at: '2026-04-21T07:05:00.000Z',
              outcome_summary: null,
              error_message: 'Rate limited',
              total_cost_usd: 0.3,
              created_at: '2026-04-21T07:00:00.000Z',
              crewName: 'Alpha Crew',
            },
            {
              id: 'crew-run-2',
              crew_id: 'crew-1',
              org_id: 'org-1',
              trigger_type: 'manual',
              triggered_by: 'user-1',
              status: 'failed',
              started_at: '2026-04-21T08:30:00.000Z',
              completed_at: '2026-04-21T08:35:00.000Z',
              outcome_summary: null,
              error_message: 'Rate limited',
              total_cost_usd: 0.3,
              created_at: '2026-04-21T08:30:00.000Z',
              crewName: 'Alpha Crew',
            },
          ],
          summary: {
            approvals: 1,
            failedRuns: 1,
            activeRuns: 0,
            openWorkItems: 1,
            readyWorkItems: 1,
            blockedWorkItems: 0,
            livenessIncidents: 1,
            criticalEvents: 1,
          },
        },
      },
    ])

    expect(data.projects.map((project) => project.projectName)).toEqual(['Alpha', 'Beta'])
    expect(data.projects[0]?.priorityScore).toBeGreaterThan(data.projects[1]?.priorityScore ?? 0)
    expect(data.projects[0]?.priorityReason).toContain('Degrading reliability')
    expect(data.summary.approvals).toBe(1)
    expect(data.summary.readyWorkItems).toBe(1)
    expect(data.summary.livenessIncidents).toBe(1)
    expect(data.summary.failedRuns).toBe(1)
    expect(data.attentionCount).toBe(getWorkspaceAttentionCount(data.summary))
  })
})
