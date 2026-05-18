import { describe, expect, it, vi } from 'vitest'
import type { HumanWorkItem } from '@/lib/db/human-work-items'
import { buildWorkItemLivenessIncidents, evaluateWorkItemSignal } from './signals'

vi.mock('server-only', () => ({}))

function makeItem(overrides: Partial<HumanWorkItem> = {}): HumanWorkItem {
  return {
    id: 'work-1',
    org_id: 'org-1',
    kind: 'pulse_standalone',
    pulse_job_run_id: 'run-1',
    dag_id: null,
    dag_node_id: null,
    agent_id: 'agent-1',
    title: 'Review request',
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
    ...overrides,
  }
}

describe('work item signals', () => {
  it('marks open standalone work as ready for claim', () => {
    const item = makeItem()
    const signal = evaluateWorkItemSignal(item, { now: new Date('2026-04-21T08:05:00.000Z').getTime() })

    expect(signal.state).toBe('ready')
    expect(signal.readyForOperator).toBe(true)
    expect(signal.label).toBe('Ready for claim')
  })

  it('marks claimed work as stalled after the operator window', () => {
    const item = makeItem({
      status: 'in_progress',
      assignee_user_id: 'user-1',
      started_at: '2026-04-21T02:00:00.000Z',
    })

    const signal = evaluateWorkItemSignal(item, { now: new Date('2026-04-21T08:30:00.000Z').getTime() })

    expect(signal.state).toBe('claimed')
    expect(signal.stalled).toBe(true)
    expect(signal.severity).toBe('warn')
  })

  it('blocks DAG-backed work when the DAG is paused', () => {
    const item = makeItem({
      kind: 'nerve_node',
      pulse_job_run_id: null,
      dag_id: 'dag-1',
      dag_node_id: 'node-1',
    })

    const signal = evaluateWorkItemSignal(item, {
      dag: { id: 'dag-1', status: 'paused' },
      dagNode: { id: 'node-1', dag_id: 'dag-1', status: 'ready', pending_parent_count: 0 },
    })

    expect(signal.state).toBe('waiting')
    expect(signal.readyForOperator).toBe(false)
    expect(signal.reason).toBe('dag_paused')
  })

  it('creates liveness incidents for unassigned, overdue, and orphaned work', () => {
    const now = new Date('2026-04-21T12:00:00.000Z').getTime()
    const ready = makeItem({
      id: 'ready-1',
      due_at: '2026-04-21T10:00:00.000Z',
      created_at: '2026-04-21T09:00:00.000Z',
    })
    const orphaned = makeItem({
      id: 'orphaned-1',
      kind: 'nerve_node',
      pulse_job_run_id: null,
      dag_id: 'dag-1',
      dag_node_id: 'node-1',
    })

    const incidents = buildWorkItemLivenessIncidents([
      {
        ...ready,
        signal: evaluateWorkItemSignal(ready, { now }),
      },
      {
        ...orphaned,
        signal: evaluateWorkItemSignal(orphaned, {
          now,
          dag: { id: 'dag-1', status: 'failed' },
          dagNode: { id: 'node-1', dag_id: 'dag-1', status: 'failed', pending_parent_count: 0 },
        }),
      },
    ])

    expect(incidents.map((incident) => incident.type)).toEqual(
      expect.arrayContaining(['unassigned_work', 'overdue_work', 'orphaned_dag_work']),
    )
  })
})
