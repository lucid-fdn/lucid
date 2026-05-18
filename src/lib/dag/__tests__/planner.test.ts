import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { ControlPlaneDagPlanner, DagCycleError } from '../planner'
import type { DagSpec } from '@contracts/dag'

const ORG_ID = '11111111-1111-4111-8111-111111111111'
const AGENT_ID = '22222222-2222-4222-8222-222222222222'
const ROOT_EVENT_ID = '33333333-3333-4333-8333-333333333333'

function makeSupabase() {
  const inserts: Array<{ table: string; payload: unknown }> = []
  const deletes: Array<{ table: string; column: string; value: unknown }> = []

  const supabase = {
    from: vi.fn((table: string) => ({
      insert: vi.fn(async (payload: unknown) => {
        inserts.push({ table, payload })
        return { error: null }
      }),
      delete: vi.fn(() => ({
        eq: vi.fn(async (column: string, value: unknown) => {
          deletes.push({ table, column, value })
          return { error: null }
        }),
      })),
    })),
  }

  return { supabase, inserts, deletes }
}

describe('ControlPlaneDagPlanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('instantiates a valid DagSpec into dag, node, and edge rows', async () => {
    const { supabase, inserts } = makeSupabase()
    const uuids = [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ]
    const planner = new ControlPlaneDagPlanner(supabase as never, () => uuids.shift()!)
    const spec: DagSpec = {
      nodes: [
        { node_key: 'scope', node_type: 'leaf', step_type: 'scheduled', payload: { a: 1 } },
        { node_key: 'summary', node_type: 'leaf', step_type: 'scheduled' },
      ],
      edges: [{ parent: 'scope', child: 'summary', edge_kind: 'order' }],
    }

    const result = await planner.instantiate({
      spec,
      agentId: AGENT_ID,
      orgId: ORG_ID,
      source: 'hybrid',
      rootEventId: ROOT_EVENT_ID,
      rootEventType: 'scheduled',
    })

    expect(result.dagId).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
    expect(result.rootNodeIds).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])
    expect(inserts.map((insert) => insert.table)).toEqual([
      'orchestration_dags',
      'orchestration_dag_nodes',
      'orchestration_dag_edges',
    ])
    expect(inserts[0].payload).toMatchObject({
      id: result.dagId,
      org_id: ORG_ID,
      agent_id: AGENT_ID,
      source: 'hybrid',
      root_event_id: ROOT_EVENT_ID,
      root_event_type: 'scheduled',
      total_nodes: 2,
      ready_nodes: 1,
    })
    expect(inserts[1].payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node_key: 'scope',
          pending_parent_count: 0,
          payload: { a: 1 },
        }),
        expect.objectContaining({
          node_key: 'summary',
          pending_parent_count: 1,
        }),
      ]),
    )
  })

  it('rejects cycles before writing rows', async () => {
    const { supabase, inserts } = makeSupabase()
    const planner = new ControlPlaneDagPlanner(supabase as never, () => crypto.randomUUID())
    const spec: DagSpec = {
      nodes: [
        { node_key: 'a', node_type: 'leaf', step_type: 'scheduled' },
        { node_key: 'b', node_type: 'leaf', step_type: 'scheduled' },
      ],
      edges: [
        { parent: 'a', child: 'b' },
        { parent: 'b', child: 'a' },
      ],
    }

    await expect(
      planner.instantiate({
        spec,
        agentId: AGENT_ID,
        orgId: ORG_ID,
        source: 'hybrid',
      }),
    ).rejects.toBeInstanceOf(DagCycleError)
    expect(inserts).toHaveLength(0)
  })
})
