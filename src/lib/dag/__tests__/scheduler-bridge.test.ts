/**
 * scheduler-bridge tests — Phase 4N-c, Task 52.
 *
 * Verifies the control-plane mirror of IncrementalScheduler:
 *   - terminal/paused/running band guard on onNodeComplete
 *   - dag_complete_node RPC dispatch + leaf step enqueue
 *   - bumpCompletedCounter finalizes DAG
 *   - onNodeFail + dag_cancel_subtree on non-retryable
 *   - onMutation + dag_promote_added_subgraph
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const insertOrchestrationStepMock = vi.fn(async () => ({ stepId: 'new-step', isNew: true }))
vi.mock('@contracts/dag-step', () => ({
  insertOrchestrationStep: (...args: unknown[]) => insertOrchestrationStepMock(...args),
}))

import { SchedulerBridge } from '../scheduler-bridge'

const DAG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const NODE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const AGENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const ROOT_EVENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

interface Sequenced {
  table?: unknown
  rpc?: unknown
}

interface FakeQueryBuilder {
  select: (columns?: string) => FakeQueryBuilder
  eq: (column?: string, value?: unknown) => FakeQueryBuilder
  neq: (column?: string, value?: unknown) => FakeQueryBuilder
  update: (values: unknown) => FakeQueryBuilder
  maybeSingle: () => Promise<unknown>
  then: Promise<unknown>['then']
}

interface FakeSupabase {
  from: (table: string) => FakeQueryBuilder
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<unknown>
}

function makeBridge(supabase: FakeSupabase): SchedulerBridge {
  return new SchedulerBridge(supabase as unknown as SupabaseClient)
}

function makeSupabase(scripts: Sequenced[]): FakeSupabase {
  const queue = [...scripts]
  const make = (): FakeQueryBuilder => {
    const next = queue.shift() ?? { table: { data: null, error: null } }
    const readResult = () => next.table ?? { data: null, error: null }
    const qb: FakeQueryBuilder = {
      select: vi.fn(() => qb),
      eq: vi.fn(() => qb),
      neq: vi.fn(() => qb),
      update: vi.fn(() => qb),
      maybeSingle: vi.fn(() => Promise.resolve(readResult())),
      then: (onfulfilled, onrejected) =>
        Promise.resolve(readResult()).then(onfulfilled, onrejected),
    }
    return qb
  }
  return {
    from: vi.fn(() => make()),
    rpc: vi.fn(() => {
      const next = queue.shift() ?? { rpc: { data: [], error: null } }
      return Promise.resolve(next.rpc ?? { data: [], error: null })
    }),
  }
}

const RUNNING_DAG = {
  id: DAG_ID,
  org_id: ORG_ID,
  agent_id: AGENT_ID,
  root_event_id: ROOT_EVENT_ID,
  status: 'running',
  total_nodes: 2,
  completed_nodes: 0,
  failed_nodes: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SchedulerBridge.onNodeComplete', () => {
  it('no-ops on terminal DAG', async () => {
    const supa = makeSupabase([{ table: { data: { ...RUNNING_DAG, status: 'completed' }, error: null } }])
    const bridge = makeBridge(supa)
    await bridge.onNodeComplete(DAG_ID, NODE_ID)
    expect(supa.rpc).not.toHaveBeenCalled()
    expect(insertOrchestrationStepMock).not.toHaveBeenCalled()
  })

  it('stamps and advances counters when dag is paused but skips enqueue', async () => {
    const supa = makeSupabase([
      { table: { data: { ...RUNNING_DAG, status: 'paused' }, error: null } }, // header
      { table: { data: [{ id: NODE_ID }], error: null } }, // stamp update
      { rpc: { data: [{ id: 'held-child', node_key: 'child' }], error: null } }, // dag_complete_node
      { rpc: { data: { completed_nodes: 1, total_nodes: 2 }, error: null } }, // dag_bump_completed
    ])
    const bridge = makeBridge(supa)
    await bridge.onNodeComplete(DAG_ID, NODE_ID)
    expect(supa.rpc).toHaveBeenNthCalledWith(1, 'dag_complete_node', {
      p_dag_id: DAG_ID,
      p_node_id: NODE_ID,
    })
    expect(supa.rpc).toHaveBeenNthCalledWith(2, 'dag_bump_completed', { p_dag_id: DAG_ID })
    expect(insertOrchestrationStepMock).not.toHaveBeenCalled()
  })

  it('runs full advance, enqueues promoted leaves, bumps counter', async () => {
    const supa = makeSupabase([
      { table: { data: RUNNING_DAG, error: null } }, // header
      { table: { data: [{ id: NODE_ID }], error: null } }, // stamp update
      {
        rpc: {
          data: [
            {
              id: 'leaf-1',
              node_key: 'leaf_one',
              node_type: 'leaf',
              step_type: 'inbound',
              runtime_target: 'dedicated',
              route_class: 'fast',
            },
            {
              id: 'group-1',
              node_key: 'group_one',
              node_type: 'group',
              step_type: null,
              runtime_target: null,
              route_class: null,
            },
          ],
          error: null,
        },
      }, // dag_complete_node
      { rpc: { data: { completed_nodes: 1, total_nodes: 2 }, error: null } }, // dag_bump_completed
    ])
    const bridge = makeBridge(supa)
    await bridge.onNodeComplete(DAG_ID, NODE_ID)
    expect(supa.rpc).toHaveBeenNthCalledWith(1, 'dag_complete_node', {
      p_dag_id: DAG_ID,
      p_node_id: NODE_ID,
    })
    // Only the leaf with step_type was enqueued
    expect(insertOrchestrationStepMock).toHaveBeenCalledTimes(1)
    expect(supa.rpc).toHaveBeenNthCalledWith(2, 'dag_bump_completed', { p_dag_id: DAG_ID })
  })

  it('finalizes the DAG when bump counter reports total reached', async () => {
    const finalizeUpdate = vi.fn(() => ({ eq: vi.fn() }))
    const supa = makeSupabase([
      { table: { data: RUNNING_DAG, error: null } }, // header
      { table: { data: [{ id: NODE_ID }], error: null } }, // stamp update
      { rpc: { data: [], error: null } }, // dag_complete_node
      { rpc: { data: [{ completed_nodes: 2, total_nodes: 2 }], error: null } }, // dag_bump_completed
    ])
    // Override 4th `from` call (final UPDATE) to capture the finalize.
    let fromCount = 0
    const orig = supa.from
    supa.from = (table: string) => {
      fromCount += 1
      if (fromCount === 3) {
        return { update: finalizeUpdate } as unknown as FakeQueryBuilder
      }
      return orig(table)
    }
    const bridge = makeBridge(supa)
    await bridge.onNodeComplete(DAG_ID, NODE_ID)
    expect(finalizeUpdate).toHaveBeenCalled()
  })
})

describe('SchedulerBridge.onDagCreated', () => {
  it('promotes roots and threads node payload into orchestration step input', async () => {
    const nodePayload = { agent_ops: { run_id: 'run-agent-ops-1' } }
    const supa = makeSupabase([
      { table: { data: { ...RUNNING_DAG, status: 'pending' }, error: null } }, // loadDagHeader
      { table: { data: null, error: null } }, // dag running update
      {
        rpc: {
          data: [
            {
              id: 'root-leaf',
              node_key: 'root',
              node_type: 'leaf',
              step_type: 'scheduled',
              runtime_target: 'dedicated',
              route_class: 'strong',
              payload: nodePayload,
            },
          ],
          error: null,
        },
      }, // dag_promote_roots
    ])
    const bridge = makeBridge(supa)
    await bridge.onDagCreated(DAG_ID)

    expect(supa.rpc).toHaveBeenCalledWith('dag_promote_roots', {
      p_dag_id: DAG_ID,
    })
    expect(insertOrchestrationStepMock).toHaveBeenCalledWith(
      supa,
      expect.objectContaining({
        dagId: DAG_ID,
        dagNodeId: 'root-leaf',
        input: nodePayload,
        runtimeTarget: 'dedicated',
        routeClass: 'strong',
      }),
    )
  })

  it('materializes approval nodes as executable approval steps', async () => {
    const nodePayload = { agent_ops: { run_id: 'run-agent-ops-1', step_id: 'approval' } }
    const supa = makeSupabase([
      { table: { data: { ...RUNNING_DAG, status: 'pending' }, error: null } },
      { table: { data: null, error: null } },
      {
        rpc: {
          data: [
            {
              id: 'approval-node',
              node_key: 'approval',
              node_type: 'approval',
              step_type: 'approval',
              runtime_target: 'dedicated',
              route_class: 'strong',
              payload: nodePayload,
            },
          ],
          error: null,
        },
      },
    ])
    const bridge = makeBridge(supa)

    await bridge.onDagCreated(DAG_ID)

    expect(insertOrchestrationStepMock).toHaveBeenCalledWith(
      supa,
      expect.objectContaining({
        dagNodeId: 'approval-node',
        stepType: 'approval',
        executorType: 'approval',
        input: nodePayload,
      }),
    )
  })
})

describe('SchedulerBridge.onNodeFail', () => {
  it('does not cancel subtree on retryable failure', async () => {
    const supa = makeSupabase([{ table: { data: null, error: null } }])
    const bridge = makeBridge(supa)
    await bridge.onNodeFail(DAG_ID, NODE_ID, true, 'transient')
    expect(supa.rpc).not.toHaveBeenCalled()
  })

  it('cancels subtree and marks DAG failed on non-retryable failure', async () => {
    const supa = makeSupabase([
      { table: { data: null, error: null } }, // node update
      { rpc: { data: null, error: null } }, // dag_cancel_subtree
      { table: { data: null, error: null } }, // dag failed update
    ])
    const bridge = makeBridge(supa)
    await bridge.onNodeFail(DAG_ID, NODE_ID, false, 'fatal')
    expect(supa.rpc).toHaveBeenCalledWith('dag_cancel_subtree', {
      p_dag_id: DAG_ID,
      p_root_node_id: NODE_ID,
    })
  })
})

describe('SchedulerBridge.onMutation', () => {
  it('returns early when no nodes added', async () => {
    const supa = makeSupabase([])
    const bridge = makeBridge(supa)
    await bridge.onMutation(DAG_ID, [])
    expect(supa.from).not.toHaveBeenCalled()
  })

  it('promotes added subgraph and enqueues leaves', async () => {
    const supa = makeSupabase([
      { table: { data: RUNNING_DAG, error: null } }, // loadDagHeader
      {
        rpc: {
          data: [
            {
              id: 'added-leaf',
              node_key: 'added',
              node_type: 'leaf',
              step_type: 'webhook',
              runtime_target: 'dedicated',
              route_class: null,
            },
          ],
          error: null,
        },
      },
    ])
    const bridge = makeBridge(supa)
    await bridge.onMutation(DAG_ID, ['added-leaf'])
    expect(supa.rpc).toHaveBeenCalledWith('dag_promote_added_subgraph', {
      p_dag_id: DAG_ID,
      p_node_ids: ['added-leaf'],
    })
    expect(insertOrchestrationStepMock).toHaveBeenCalledTimes(1)
  })
})
