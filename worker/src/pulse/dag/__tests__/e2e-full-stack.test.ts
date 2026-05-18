/**
 * DAG Planner Full-Stack E2E — Phase 4N-d, Task 78.
 *
 * Wires the three agent-facing touch points of the Phase 4N stack into a
 * single scenario:
 *
 *   1. `toolPlanDag` — instantiates a 4-node linear template and fires
 *      `scheduler.onDagCreated` to promote roots.
 *   2. `scheduler.onNodeComplete` — walks completions forward, stamping
 *      confidence on every admission (Phase 4N-d gate) and advancing the
 *      header counters.
 *   3. `toolDagStatus` — read-only snapshot called at three checkpoints
 *      (mid-flight, after the final completion walk) to verify the
 *      envelope reflects the live dag state: counters, budget, and
 *      recent mutations.
 *
 * What this test deliberately does NOT re-test:
 *   - CAS / cycle / idempotency path for `expand_dag` → covered by
 *     `mutator-cas.test.ts`, `mutator-cycle-reject.test.ts`,
 *     `mutator-idempotency.test.ts`, and `dag-expand-tool.test.ts`.
 *   - Budget pause/resume RPC flow → covered by `budget-pause-resume.test.ts`.
 *   - Replay determinism → covered by `replay-determinism.test.ts`.
 *
 * The intent here is integration shape, not unit coverage: a single
 * happy-path walk that proves plan_dag → scheduler → dag_status all
 * compose against a shared harness with no contract drift.
 */

import { describe, it, expect, vi } from 'vitest'
import { toolPlanDag } from '../../../agent/runtime-tools/dag-plan.js'
import { toolDagStatus } from '../../../agent/runtime-tools/dag-status.js'
import { IncrementalScheduler } from '../scheduler.js'
import { DagStepCreator } from '../dag-step-creator.js'
import type { DagSpec } from '../types.js'

const ORG_ID = '22222222-2222-4222-8222-222222222222'
const AGENT_ID = '11111111-1111-4111-8111-111111111111'
const TEMPLATE_ID = '33333333-3333-4333-8333-333333333333'

const FOUR_NODE_SPEC: DagSpec = {
  nodes: [
    { node_key: 'research', node_type: 'leaf', step_type: 'inbound' },
    { node_key: 'draft', node_type: 'leaf', step_type: 'outbound' },
    { node_key: 'approval', node_type: 'leaf', step_type: 'approval' },
    { node_key: 'deliver', node_type: 'leaf', step_type: 'outbound' },
  ],
  edges: [
    { parent: 'research', child: 'draft' },
    { parent: 'draft', child: 'approval' },
    { parent: 'approval', child: 'deliver' },
  ],
}

const TEMPLATE_ROW = {
  id: TEMPLATE_ID,
  org_id: ORG_ID,
  slug: 'complaint-handler',
  name: 'Complaint Handler',
  version: 1,
  spec: FOUR_NODE_SPEC,
  schema_version: 1,
  trigger_intents: null,
  mission_type: null,
  is_active: true,
}

interface Harness {
  supabase: any
  nodeIdsByKey: Map<string, string>
  getCompletedCount: () => number
  getCurrentStatus: () => string
}

/**
 * Stateful harness supporting:
 *   - Template loader SELECT chain
 *   - DAG/node/edge INSERTs (capture generated UUIDs)
 *   - orchestration_dags select for loadDagHeader AND for dag_status
 *   - RPC calls dag_promote_roots / dag_complete_node / dag_bump_completed
 *   - orchestration_dag_budget_events SELECT chain (cumulative tokens)
 *   - orchestration_dag_mutations SELECT chain (recent mutations, empty)
 */
function buildHarness(): Harness {
  const nodeIdsByKey = new Map<string, string>()
  let capturedDagId: string | null = null
  let completedCount = 0
  let currentStatus: 'running' | 'completed' | 'failed' | 'cancelled' = 'running'
  let startedAt: string | null = null
  let completedAt: string | null = null
  const chain: string[] = ['research', 'draft', 'approval', 'deliver']

  const promotedRow = (key: string) => ({
    id: nodeIdsByKey.get(key),
    node_key: key,
    node_type: 'leaf',
    step_type: FOUR_NODE_SPEC.nodes.find((n) => n.node_key === key)!.step_type,
    runtime_target: null,
    route_class: null,
  })

  // Two-shape header:
  //   - scheduler.loadDagHeader expects a slim shape
  //   - toolDagStatus expects the wide shape with budget columns
  // A single source-of-truth getter that returns a superset row satisfies both.
  const dagHeader = () => ({
    id: capturedDagId,
    org_id: ORG_ID,
    agent_id: AGENT_ID,
    root_event_id: null,
    status: currentStatus,
    graph_version: 1,
    total_nodes: 4,
    completed_nodes: completedCount,
    failed_nodes: 0,
    ready_nodes: Math.max(0, 1),
    budget_max_tokens: 100000,
    budget_max_usd: '5.00',
    started_at: startedAt,
    completed_at: completedAt,
  })

  const from = vi.fn((table: string) => {
    if (table === 'orchestration_dag_templates') {
      const maybeSingle = vi.fn(async () => ({ data: TEMPLATE_ROW, error: null }))
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
          startedAt = new Date().toISOString()
          return { error: null }
        }),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: dagHeader(), error: null })),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          const nextStatus = payload.status as typeof currentStatus | undefined
          if (
            nextStatus === 'running' ||
            nextStatus === 'completed' ||
            nextStatus === 'failed' ||
            nextStatus === 'cancelled'
          ) {
            currentStatus = nextStatus
            if (nextStatus === 'completed') {
              completedAt = new Date().toISOString()
            }
          }
          return {
            eq: vi.fn(async () => ({ error: null })),
          }
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

    if (table === 'orchestration_dag_budget_events') {
      // dag_status cumulative token read — no events exist in this harness
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
          })),
        })),
      }
    }

    if (table === 'orchestration_dag_mutations') {
      // dag_status recent mutations read — empty history (no expand calls)
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        })),
      }
    }

    throw new Error(`[e2e-full-stack harness] unexpected table: ${table}`)
  })

  const rpc = vi.fn(async (name: string, _args?: Record<string, unknown>) => {
    if (name === 'dag_promote_roots') {
      return { data: [promotedRow('research')], error: null }
    }
    if (name === 'dag_complete_node') {
      const nextIdx = completedCount + 1
      if (nextIdx < chain.length) {
        return { data: [promotedRow(chain[nextIdx])], error: null }
      }
      return { data: [], error: null }
    }
    if (name === 'dag_bump_completed') {
      completedCount += 1
      return {
        data: { completed_nodes: completedCount, total_nodes: 4 },
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
  }
}

describe('DAG Planner Full-Stack E2E (plan + walk + dag_status)', () => {
  it('plan → partial walk → dag_status → finish → dag_status reflects completion', async () => {
    const harness = buildHarness()
    const { supabase, nodeIdsByKey } = harness

    const scheduler = new IncrementalScheduler(
      supabase,
      new DagStepCreator(supabase),
    )

    // Keep DagStepCreator out of the hot path for enqueuePromoted.
    const createSpy = vi
      .spyOn(DagStepCreator.prototype, 'create')
      .mockResolvedValue({ stepId: 'mock-step', isNew: true } as any)

    // ── 1. plan_dag ──────────────────────────────────────────────────────
    const planResult = await toolPlanDag(
      { template_slug: 'complaint-handler' },
      { supabase, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
    )
    const planEnvelope = JSON.parse(planResult) as {
      dag_id?: string
      total_nodes?: number
      error?: string
    }
    expect(planEnvelope.error).toBeUndefined()
    expect(planEnvelope.total_nodes).toBe(4)
    const dagId = planEnvelope.dag_id!

    // ── 2. Partial walk: complete research + draft ───────────────────────
    await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('research')!)
    await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('draft')!)
    expect(harness.getCompletedCount()).toBe(2)

    // ── 3. dag_status mid-flight ─────────────────────────────────────────
    const midStatus = await toolDagStatus(
      { dag_id: dagId },
      { supabase, redis: null, orgId: ORG_ID },
    )
    const midEnvelope = JSON.parse(midStatus) as {
      dag_id: string
      status: string
      total: number
      completed: number
      budget: {
        tokensLive: number
        tokensUsed: number
        tokensCap: number | null
        usdCap: string | null
      }
      recentMutations: unknown[]
      started_at: string | null
      error?: string
    }
    expect(midEnvelope.error).toBeUndefined()
    expect(midEnvelope.dag_id).toBe(dagId)
    expect(midEnvelope.status).toBe('running')
    expect(midEnvelope.total).toBe(4)
    expect(midEnvelope.completed).toBe(2)
    // redis=null → live counter degrades gracefully to 0
    expect(midEnvelope.budget.tokensLive).toBe(0)
    // No budget events yet → cumulative = 0
    expect(midEnvelope.budget.tokensUsed).toBe(0)
    // Budget caps round-trip from the dag header
    expect(midEnvelope.budget.tokensCap).toBe(100000)
    expect(midEnvelope.budget.usdCap).toBe('5.00')
    // No expand_dag calls in this scenario → empty mutation history
    expect(midEnvelope.recentMutations).toHaveLength(0)
    // started_at was stamped by the planner INSERT
    expect(midEnvelope.started_at).toEqual(expect.any(String))

    // ── 4. Finish the walk ───────────────────────────────────────────────
    await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('approval')!)
    await scheduler.onNodeComplete(dagId, nodeIdsByKey.get('deliver')!)
    expect(harness.getCompletedCount()).toBe(4)
    expect(harness.getCurrentStatus()).toBe('completed')

    // ── 5. dag_status after completion ───────────────────────────────────
    const finalStatus = await toolDagStatus(
      { dag_id: dagId },
      { supabase, redis: null, orgId: ORG_ID },
    )
    const finalEnvelope = JSON.parse(finalStatus) as {
      status: string
      completed: number
      completed_at: string | null
      error?: string
    }
    expect(finalEnvelope.error).toBeUndefined()
    expect(finalEnvelope.status).toBe('completed')
    expect(finalEnvelope.completed).toBe(4)
    expect(finalEnvelope.completed_at).toEqual(expect.any(String))

    // ── 6. Every promoted node got enqueued as a step exactly once ──────
    // 1 root (research) + 3 children (draft, approval, deliver) = 4 creates
    expect(createSpy).toHaveBeenCalledTimes(4)

    createSpy.mockRestore()
  })

  it('dag_status across orgs returns "not found" (no existence leak)', async () => {
    const harness = buildHarness()
    const { supabase, nodeIdsByKey } = harness
    const scheduler = new IncrementalScheduler(
      supabase,
      new DagStepCreator(supabase),
    )
    vi.spyOn(DagStepCreator.prototype, 'create').mockResolvedValue({
      stepId: 'mock-step',
      isNew: true,
    } as any)

    // Plan a DAG under ORG_ID
    const planResult = await toolPlanDag(
      { template_slug: 'complaint-handler' },
      { supabase, assistantId: AGENT_ID, orgId: ORG_ID, scheduler },
    )
    const { dag_id: dagId } = JSON.parse(planResult)
    expect(dagId).toBeDefined()
    expect(nodeIdsByKey.size).toBe(4)

    // Inspect from a different org → should be masked as not found
    const OTHER_ORG = '99999999-9999-4999-8999-999999999999'
    const result = await toolDagStatus(
      { dag_id: dagId },
      { supabase, redis: null, orgId: OTHER_ORG },
    )
    const envelope = JSON.parse(result)
    expect(envelope.error).toContain('dag not found')

    vi.restoreAllMocks()
  })
})
