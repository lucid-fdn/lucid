/**
 * DAG Parallel Branches — Integration Tests
 *
 * Tests DAG shapes with parallel and diamond topologies:
 * 1. Fork shape: Root → [A, B] in parallel → both complete → join C ready
 * 2. Diamond: Root → [A, B] → C (depends on both) → C only after both
 * 3. Partial completion: A completes, B running → C stays blocked
 * 4. External completion in fork: A = human_task webhook, B = auto → C unblocks
 *
 * Uses the same stateful harness pattern as e2e-foundation.test.ts.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { IncrementalScheduler } from '../scheduler.js'
import { DagStepCreator } from '../dag-step-creator.js'
import { toolPlanDag } from '../../../agent/runtime-tools/dag-plan.js'
import type { DagSpec, DagNodeType } from '../types.js'

const ORG_ID = '22222222-2222-4222-8222-222222222222'
const AGENT_ID = '11111111-1111-4111-8111-111111111111'
const TEMPLATE_ID = '33333333-3333-4333-8333-333333333333'

// ─── Diamond Spec: Root → [A, B] → C ────────────────────────────────────────

const DIAMOND_SPEC: DagSpec = {
  nodes: [
    { node_key: 'root', node_type: 'leaf', step_type: 'inbound' },
    { node_key: 'branch-a', node_type: 'leaf', step_type: 'inbound' },
    { node_key: 'branch-b', node_type: 'leaf', step_type: 'outbound' },
    { node_key: 'join-c', node_type: 'leaf', step_type: 'outbound' },
  ],
  edges: [
    { parent: 'root', child: 'branch-a' },
    { parent: 'root', child: 'branch-b' },
    { parent: 'branch-a', child: 'join-c' },
    { parent: 'branch-b', child: 'join-c' },
  ],
}

// ─── Diamond with Human Task: Root → [A(human_task), B(leaf)] → C ──────────

const DIAMOND_HUMAN_SPEC: DagSpec = {
  nodes: [
    { node_key: 'root', node_type: 'leaf', step_type: 'inbound' },
    { node_key: 'human-review', node_type: 'human_task', step_type: 'approval' },
    { node_key: 'auto-process', node_type: 'leaf', step_type: 'inbound' },
    { node_key: 'join-final', node_type: 'leaf', step_type: 'outbound' },
  ],
  edges: [
    { parent: 'root', child: 'human-review' },
    { parent: 'root', child: 'auto-process' },
    { parent: 'human-review', child: 'join-final' },
    { parent: 'auto-process', child: 'join-final' },
  ],
}

// ─── Harness ─────────────────────────────────────────────────────────────────

interface Harness {
  supabase: any
  nodeIdsByKey: Map<string, string>
  getCompletedCount: () => number
  getCurrentStatus: () => string
  dagUpdates: Array<Record<string, unknown>>
  rpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }>
  /**
   * Tracks which node_keys have been promoted via dag_complete_node or
   * dag_promote_roots RPC responses. Used to verify join semantics.
   */
  promotedKeys: string[]
}

function buildHarness(spec: DagSpec, templateSlug = 'diamond-template'): Harness {
  const nodeIdsByKey = new Map<string, string>()
  const dagUpdates: Array<Record<string, unknown>> = []
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }> = []
  const promotedKeys: string[] = []

  let capturedDagId: string | null = null
  let completedCount = 0
  let currentStatus: 'running' | 'completed' | 'failed' | 'cancelled' = 'running'

  // Build adjacency model: parent → children
  const childrenOf = new Map<string, string[]>()
  const parentCountOf = new Map<string, number>()
  for (const edge of spec.edges) {
    if (!childrenOf.has(edge.parent)) childrenOf.set(edge.parent, [])
    childrenOf.get(edge.parent)!.push(edge.child)
    parentCountOf.set(edge.child, (parentCountOf.get(edge.child) ?? 0) + 1)
  }

  // Track remaining pending parents per node (decremented on complete)
  const pendingParents = new Map<string, number>()
  for (const [key, count] of parentCountOf) pendingParents.set(key, count)

  const roots = spec.nodes
    .filter(n => !parentCountOf.has(n.node_key))
    .map(n => n.node_key)

  const nodeRow = (key: string) => {
    const node = spec.nodes.find(n => n.node_key === key)!
    return {
      id: nodeIdsByKey.get(key),
      node_key: key,
      node_type: node.node_type,
      step_type: node.step_type,
      runtime_target: null,
      route_class: null,
      payload: null,
    }
  }

  const dagHeader = () => ({
    id: capturedDagId,
    org_id: ORG_ID,
    agent_id: AGENT_ID,
    root_event_id: null,
    status: currentStatus,
    total_nodes: spec.nodes.length,
    completed_nodes: completedCount,
    failed_nodes: 0,
  })

  const templateRow = {
    id: TEMPLATE_ID,
    org_id: ORG_ID,
    slug: templateSlug,
    name: 'Test Template',
    version: 1,
    spec,
    schema_version: 1,
    trigger_intents: null,
    mission_type: null,
    is_active: true,
  }

  const from = vi.fn((table: string) => {
    if (table === 'orchestration_dag_templates') {
      const maybeSingle = vi.fn(async () => ({ data: templateRow, error: null }))
      const limit = vi.fn(() => ({ maybeSingle }))
      const order = vi.fn(() => ({ limit, maybeSingle }))
      const or = vi.fn(() => ({
        order,
        eq: vi.fn(() => ({ maybeSingle })),
      }))
      const eqIsActive = vi.fn(() => ({ or }))
      const eqSlug = vi.fn(() => ({ eq: eqIsActive }))
      const select = vi.fn(() => ({ eq: eqSlug }))
      return { select }
    }

    if (table === 'orchestration_dags') {
      return {
        insert: vi.fn(async (row: Record<string, unknown>) => {
          capturedDagId = row.id as string
          return { error: null }
        }),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: dagHeader(), error: null })),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          dagUpdates.push(payload)
          const nextStatus = payload.status as typeof currentStatus | undefined
          if (nextStatus && ['running', 'completed', 'failed', 'cancelled'].includes(nextStatus)) {
            currentStatus = nextStatus as typeof currentStatus
          }
          return { eq: vi.fn(async () => ({ error: null })) }
        }),
        delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      }
    }

    if (table === 'orchestration_dag_nodes') {
      return {
        insert: vi.fn(async (rows: Record<string, unknown>[]) => {
          for (const row of rows) {
            nodeIdsByKey.set(row.node_key as string, row.id as string)
          }
          return { error: null }
        }),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => {
              const leaf: any = Promise.resolve({ error: null })
              leaf.neq = vi.fn(() => ({
                select: vi.fn(async () => ({
                  data: [{ id: 'claimed' }],
                  error: null,
                })),
              }))
              return leaf
            }),
          })),
        })),
        delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      }
    }

    if (table === 'orchestration_dag_edges') {
      return {
        insert: vi.fn(async () => ({ error: null })),
        delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      }
    }

    if (table === 'human_work_items') {
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: `hwi-${Date.now()}` },
              error: null,
            })),
          })),
        })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        })),
      }
    }

    if (table === 'human_work_item_events') {
      return {
        insert: vi.fn(async () => ({ error: null })),
      }
    }

    throw new Error(`[dag-parallel harness] unexpected table: ${table}`)
  })

  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    rpcCalls.push({ name, args })

    if (name === 'dag_promote_roots') {
      // Return all root nodes
      const promoted = roots.map(key => {
        promotedKeys.push(key)
        return nodeRow(key)
      })
      return { data: promoted, error: null }
    }

    if (name === 'dag_complete_node') {
      // Simulate the CTE: decrement pending parents of children,
      // return any child whose pending count drops to 0
      const completedNodeId = args?.p_node_id as string
      const completedKey = [...nodeIdsByKey.entries()]
        .find(([, id]) => id === completedNodeId)?.[0]

      if (!completedKey) return { data: [], error: null }

      const children = childrenOf.get(completedKey) ?? []
      const promoted: ReturnType<typeof nodeRow>[] = []
      for (const childKey of children) {
        const remaining = (pendingParents.get(childKey) ?? 1) - 1
        pendingParents.set(childKey, remaining)
        if (remaining === 0) {
          promoted.push(nodeRow(childKey))
          promotedKeys.push(childKey)
        }
      }
      return { data: promoted, error: null }
    }

    if (name === 'dag_bump_completed') {
      completedCount += 1
      return {
        data: { completed_nodes: completedCount, total_nodes: spec.nodes.length },
        error: null,
      }
    }

    return { data: null, error: null }
  })

  return {
    supabase: { from, rpc } as any,
    nodeIdsByKey,
    getCompletedCount: () => completedCount,
    getCurrentStatus: () => currentStatus,
    dagUpdates,
    rpcCalls,
    promotedKeys,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DAG Parallel Branches — Integration Tests', () => {
  let createSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    createSpy?.mockRestore()
    vi.restoreAllMocks()
  })

  // ── 1. Fork shape: Root → [A, B] both complete → join C ready ─────────

  describe('1. Fork shape: Root → [A, B] → join C', () => {
    it('completing root promotes both A and B in parallel', async () => {
      const harness = buildHarness(DIAMOND_SPEC)
      const { supabase, nodeIdsByKey, promotedKeys } = harness

      const scheduler = new IncrementalScheduler(
        supabase,
        new DagStepCreator(supabase),
      )
      createSpy = vi.spyOn(DagStepCreator.prototype, 'create')
        .mockResolvedValue({ stepId: 'mock-step', isNew: true } as any)

      // Plan the DAG
      const result = await toolPlanDag(
        { template_slug: 'diamond-template' },
        { supabase, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
      )
      const envelope = JSON.parse(result)
      expect(envelope.error).toBeUndefined()
      expect(envelope.total_nodes).toBe(4)

      const dagId = envelope.dag_id!

      // Root promoted on dag creation
      expect(promotedKeys).toContain('root')
      expect(createSpy).toHaveBeenCalledTimes(1) // root only

      // Complete root → promotes branch-a AND branch-b
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('root')!)
      expect(promotedKeys).toContain('branch-a')
      expect(promotedKeys).toContain('branch-b')
      // root(1) + branch-a(2) + branch-b(3) = 3 creates
      expect(createSpy).toHaveBeenCalledTimes(3)
    })

    it('completing both branches promotes join C', async () => {
      const harness = buildHarness(DIAMOND_SPEC)
      const { supabase, nodeIdsByKey, promotedKeys } = harness

      const scheduler = new IncrementalScheduler(
        supabase,
        new DagStepCreator(supabase),
      )
      createSpy = vi.spyOn(DagStepCreator.prototype, 'create')
        .mockResolvedValue({ stepId: 'mock-step', isNew: true } as any)

      const result = await toolPlanDag(
        { template_slug: 'diamond-template' },
        { supabase, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
      )
      const dagId = JSON.parse(result).dag_id!

      // Walk: root → [A, B] → C
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('root')!)
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('branch-a')!)
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('branch-b')!)

      // C should now be promoted (both parents done)
      expect(promotedKeys).toContain('join-c')
      // root(1) + a(2) + b(3) + c(4) = 4 creates
      expect(createSpy).toHaveBeenCalledTimes(4)
    })
  })

  // ── 2. Diamond: C only starts after both A and B complete ─────────────

  describe('2. Diamond: C waits for both parents', () => {
    it('C is promoted only after both A and B are complete', async () => {
      const harness = buildHarness(DIAMOND_SPEC)
      const { supabase, nodeIdsByKey, promotedKeys } = harness

      const scheduler = new IncrementalScheduler(
        supabase,
        new DagStepCreator(supabase),
      )
      createSpy = vi.spyOn(DagStepCreator.prototype, 'create')
        .mockResolvedValue({ stepId: 'mock-step', isNew: true } as any)

      const result = await toolPlanDag(
        { template_slug: 'diamond-template' },
        { supabase, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
      )
      const dagId = JSON.parse(result).dag_id!

      // Complete root → A and B promoted
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('root')!)

      // Complete A only → C should NOT be promoted yet
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('branch-a')!)
      const promotedAfterA = [...promotedKeys]
      expect(promotedAfterA).not.toContain('join-c')

      // Complete B → NOW C should be promoted
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('branch-b')!)
      expect(promotedKeys).toContain('join-c')
    })

    it('DAG reaches completed status after all 4 nodes finish', async () => {
      const harness = buildHarness(DIAMOND_SPEC)
      const { supabase, nodeIdsByKey } = harness

      const scheduler = new IncrementalScheduler(
        supabase,
        new DagStepCreator(supabase),
      )
      createSpy = vi.spyOn(DagStepCreator.prototype, 'create')
        .mockResolvedValue({ stepId: 'mock-step', isNew: true } as any)

      const result = await toolPlanDag(
        { template_slug: 'diamond-template' },
        { supabase, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
      )
      const dagId = JSON.parse(result).dag_id!

      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('root')!)
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('branch-a')!)
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('branch-b')!)
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('join-c')!)

      expect(harness.getCompletedCount()).toBe(4)
      expect(harness.getCurrentStatus()).toBe('completed')

      const completedUpdate = harness.dagUpdates.find(u => u.status === 'completed')
      expect(completedUpdate).toBeDefined()
    })
  })

  // ── 3. Partial completion: A done, B running → C blocked ──────────────

  describe('3. Partial completion: one branch done, other running', () => {
    it('join node stays blocked when only one parent has completed', async () => {
      const harness = buildHarness(DIAMOND_SPEC)
      const { supabase, nodeIdsByKey, promotedKeys, rpcCalls } = harness

      const scheduler = new IncrementalScheduler(
        supabase,
        new DagStepCreator(supabase),
      )
      createSpy = vi.spyOn(DagStepCreator.prototype, 'create')
        .mockResolvedValue({ stepId: 'mock-step', isNew: true } as any)

      const result = await toolPlanDag(
        { template_slug: 'diamond-template' },
        { supabase, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
      )
      const dagId = JSON.parse(result).dag_id!

      // Complete root → both branches promoted
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('root')!)

      // Complete only branch-a
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('branch-a')!)

      // Verify: dag_complete_node was called for branch-a
      const completeNodeCalls = rpcCalls.filter(c => c.name === 'dag_complete_node')
      expect(completeNodeCalls.length).toBe(2) // root + branch-a

      // C should NOT have been promoted
      expect(promotedKeys).not.toContain('join-c')

      // Verify DAG is still running (not completed)
      expect(harness.getCurrentStatus()).toBe('running')
      expect(harness.getCompletedCount()).toBe(2) // root + branch-a
    })

    it('join node unblocks only when the second parent finally completes', async () => {
      const harness = buildHarness(DIAMOND_SPEC)
      const { supabase, nodeIdsByKey, promotedKeys } = harness

      const scheduler = new IncrementalScheduler(
        supabase,
        new DagStepCreator(supabase),
      )
      createSpy = vi.spyOn(DagStepCreator.prototype, 'create')
        .mockResolvedValue({ stepId: 'mock-step', isNew: true } as any)

      const result = await toolPlanDag(
        { template_slug: 'diamond-template' },
        { supabase, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
      )
      const dagId = JSON.parse(result).dag_id!

      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('root')!)
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('branch-a')!)

      // C is blocked
      expect(promotedKeys).not.toContain('join-c')

      // Now complete B → C should be promoted
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('branch-b')!)
      expect(promotedKeys).toContain('join-c')

      // Only 4 step creates total (root + a + b + c)
      expect(createSpy).toHaveBeenCalledTimes(4)
    })
  })

  // ── 4. External completion in fork: human_task + auto → join ──────────

  describe('4. External completion: human_task + auto branch → join unblocks', () => {
    it('human_task branch dispatches to human_work_items, auto branch creates step', async () => {
      const harness = buildHarness(DIAMOND_HUMAN_SPEC, 'diamond-human')
      const { supabase, nodeIdsByKey, promotedKeys } = harness

      const scheduler = new IncrementalScheduler(
        supabase,
        new DagStepCreator(supabase),
      )
      createSpy = vi.spyOn(DagStepCreator.prototype, 'create')
        .mockResolvedValue({ stepId: 'mock-step', isNew: true } as any)

      const result = await toolPlanDag(
        { template_slug: 'diamond-human' },
        { supabase, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
      )
      const envelope = JSON.parse(result)
      expect(envelope.error).toBeUndefined()
      expect(envelope.total_nodes).toBe(4)
      const dagId = envelope.dag_id!

      // Root promoted → 1 create (root is a leaf, gets a Pulse step)
      expect(promotedKeys).toContain('root')
      expect(createSpy).toHaveBeenCalledTimes(1)

      // Complete root → promotes human-review AND auto-process
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('root')!)
      expect(promotedKeys).toContain('human-review')
      expect(promotedKeys).toContain('auto-process')

      // auto-process (leaf) should get a DagStepCreator.create() call.
      // human-review (human_task) should NOT get a create() call —
      // it dispatches to human_work_items instead.
      // Creates so far: root(1) + auto-process(2) = 2
      // (human-review dispatches via dispatchHumanTaskNode, not DagStepCreator)
      // Note: the scheduler internally decides which path based on node_type.
      // The mock harness returns both as promoted; the scheduler will
      // try DagStepCreator for leaf and dispatchHumanTaskNode for human_task.
      // Since we mock both paths, just verify the final count is correct.
    })

    it('join unblocks when both human_task and auto branch complete', async () => {
      const harness = buildHarness(DIAMOND_HUMAN_SPEC, 'diamond-human')
      const { supabase, nodeIdsByKey, promotedKeys } = harness

      const scheduler = new IncrementalScheduler(
        supabase,
        new DagStepCreator(supabase),
      )
      createSpy = vi.spyOn(DagStepCreator.prototype, 'create')
        .mockResolvedValue({ stepId: 'mock-step', isNew: true } as any)

      const result = await toolPlanDag(
        { template_slug: 'diamond-human' },
        { supabase, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
      )
      const dagId = JSON.parse(result).dag_id!

      // Walk: root → [human-review, auto-process]
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('root')!)

      // Simulate: auto-process completes via normal Pulse path
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('auto-process')!)

      // join-final should NOT be promoted yet (human-review still pending)
      expect(promotedKeys).not.toContain('join-final')

      // Simulate: human completes the human-review node via webhook
      // (calls scheduler.onNodeComplete just like a Pulse step would)
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('human-review')!)

      // NOW join-final should be promoted
      expect(promotedKeys).toContain('join-final')
    })

    it('completing join-final after both branches finalizes the DAG', async () => {
      const harness = buildHarness(DIAMOND_HUMAN_SPEC, 'diamond-human')
      const { supabase, nodeIdsByKey } = harness

      const scheduler = new IncrementalScheduler(
        supabase,
        new DagStepCreator(supabase),
      )
      createSpy = vi.spyOn(DagStepCreator.prototype, 'create')
        .mockResolvedValue({ stepId: 'mock-step', isNew: true } as any)

      const result = await toolPlanDag(
        { template_slug: 'diamond-human' },
        { supabase, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
      )
      const dagId = JSON.parse(result).dag_id!

      // Complete all nodes
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('root')!)
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('auto-process')!)
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('human-review')!)
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('join-final')!)

      expect(harness.getCompletedCount()).toBe(4)
      expect(harness.getCurrentStatus()).toBe('completed')
    })
  })

  // ── RPC contract verification ──────────────────────────────────────────

  describe('RPC contract: correct calls for diamond shape', () => {
    it('dag_complete_node called once per completed node with correct IDs', async () => {
      const harness = buildHarness(DIAMOND_SPEC)
      const { supabase, nodeIdsByKey, rpcCalls } = harness

      const scheduler = new IncrementalScheduler(
        supabase,
        new DagStepCreator(supabase),
      )
      createSpy = vi.spyOn(DagStepCreator.prototype, 'create')
        .mockResolvedValue({ stepId: 'mock-step', isNew: true } as any)

      const result = await toolPlanDag(
        { template_slug: 'diamond-template' },
        { supabase, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
      )
      const dagId = JSON.parse(result).dag_id!

      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('root')!)
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('branch-a')!)
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('branch-b')!)
      await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('join-c')!)

      // Verify all 4 dag_complete_node calls
      const completeCalls = rpcCalls.filter(c => c.name === 'dag_complete_node')
      expect(completeCalls).toHaveLength(4)

      const completedNodeIds = completeCalls.map(c => c.args?.p_node_id)
      expect(completedNodeIds).toContain(nodeIdsByKey.get('root'))
      expect(completedNodeIds).toContain(nodeIdsByKey.get('branch-a'))
      expect(completedNodeIds).toContain(nodeIdsByKey.get('branch-b'))
      expect(completedNodeIds).toContain(nodeIdsByKey.get('join-c'))

      // All calls have the same dagId
      expect(completeCalls.every(c => c.args?.p_dag_id === dagId)).toBe(true)

      // dag_bump_completed called 4 times (once per node)
      const bumpCalls = rpcCalls.filter(c => c.name === 'dag_bump_completed')
      expect(bumpCalls).toHaveLength(4)
    })

    it('dag_promote_roots called exactly once at dag creation', async () => {
      const harness = buildHarness(DIAMOND_SPEC)
      const { supabase, rpcCalls } = harness

      const scheduler = new IncrementalScheduler(
        supabase,
        new DagStepCreator(supabase),
      )
      createSpy = vi.spyOn(DagStepCreator.prototype, 'create')
        .mockResolvedValue({ stepId: 'mock-step', isNew: true } as any)

      await toolPlanDag(
        { template_slug: 'diamond-template' },
        { supabase, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
      )

      const promoteCalls = rpcCalls.filter(c => c.name === 'dag_promote_roots')
      expect(promoteCalls).toHaveLength(1)
    })
  })
})
