/**
 * Budget Pause / Resume — Integration Test (Phase 4N-d, Task 69)
 *
 * End-to-end wiring of `IncrementalScheduler` + `BudgetLedger` against
 * an in-memory Redis + Supabase fake to prove the full budget lifecycle:
 *
 *   1. `onDagCreated` promotes two sibling leaves. The first reservation
 *      fits under the cap; the second would exceed → Lua rolls it back,
 *      `tryReserve` returns false, the scheduler reverts the blocked leaf
 *      to `pending` and flips the DAG to `paused`. The `onDagPaused`
 *      callback fires with `reason: 'budget_exhausted'`.
 *
 *   2. An operator releases headroom out-of-band — emulated here by
 *      directly decrementing the Redis counter (as if a `reservation`
 *      event with a positive delta had been inserted + replayed).
 *
 *   3. `scheduler.onDagResume(dagId)` flips the DAG back to `running`
 *      and re-runs `dag_promote_roots`. Because the blocked leaf was
 *      reverted to `pending`, the CTE predicate
 *      (`pending_parent_count=0 AND status='pending'`) picks it up, and
 *      `enqueuePromoted` successfully reserves + enqueues it.
 *
 * This test guards the exact operator pause/resume contract from the
 * plan (Phase 4N-d, §Budgets): "exhaust budget → DAG paused → operator
 * INSERTs reservation event → DAG resumes."
 */

import { describe, it, expect, vi } from 'vitest'
import { IncrementalScheduler } from '../scheduler.js'
import { BudgetLedger } from '../budget-ledger.js'
import type { DagStepCreator } from '../dag-step-creator.js'
import type { IPulseRedisAdapter } from '../../adapters/types.js'

const DAG_ID = '11111111-1111-4111-8111-111111111111'
const AGENT_ID = '22222222-2222-4222-8222-222222222222'
const ORG_ID = '33333333-3333-4333-8333-333333333333'
const ROOT_EVENT_ID = '44444444-4444-4444-8444-444444444444'
const NODE_A = '55555555-5555-4555-8555-555555555555'
const NODE_B = '66666666-6666-4666-8666-666666666666'
const TOKEN_KEY = `pulse:dag:budget:{${DAG_ID}}:tokens`

/**
 * Minimal in-memory Redis fake that speaks the two Lua scripts the
 * BudgetLedger uses (RESERVE_LUA, FLOOR_DECR_LUA). Matches by script
 * substring so whitespace / comment drift won't break the test.
 */
function makeFakeRedis(): {
  adapter: IPulseRedisAdapter
  store: Map<string, number>
} {
  const store = new Map<string, number>()
  const adapter = {
    get: vi.fn(async (key: string) => {
      const v = store.get(key)
      return v == null ? null : String(v)
    }),
    eval: vi.fn(async (script: string, keys: string[], args: string[]) => {
      const key = keys[0]!
      if (script.includes("redis.call('INCRBY'") && script.includes('> tonumber(ARGV[2])')) {
        const delta = Number(args[0])
        const cap = Number(args[1])
        const next = (store.get(key) ?? 0) + delta
        if (next > cap) return 0
        store.set(key, next)
        return 1
      }
      if (script.includes("redis.call('DECRBY'") && script.includes('< 0')) {
        const delta = Number(args[0])
        const next = (store.get(key) ?? 0) - delta
        if (next < 0) {
          store.set(key, 0)
          return 0
        }
        store.set(key, next)
        return next
      }
      throw new Error(`[fake-redis] unknown script: ${script}`)
    }),
  } as unknown as IPulseRedisAdapter
  return { adapter, store }
}

/**
 * Stateful Supabase harness:
 *
 *   - `dagHeader` is mutated by UPDATE payloads on `orchestration_dags`
 *     so `loadDagHeader` reflects the real lifecycle (running → paused
 *     → running).
 *   - `orchestration_dag_nodes` UPDATEs are captured so we can assert
 *     the blocked node was reverted to `pending`.
 *   - `orchestration_dag_budget_events` inserts are captured for the
 *     ledger side of operator resume.
 *   - `dag_promote_roots` RPC is scripted: first call returns both
 *     leaves (fresh DAG), second call (post-resume) returns only the
 *     previously-blocked leaf (the first is already running).
 */
function buildHarness(opts: { budgetCap: number }) {
  const dagHeader: Record<string, unknown> = {
    id: DAG_ID,
    org_id: ORG_ID,
    agent_id: AGENT_ID,
    root_event_id: ROOT_EVENT_ID,
    status: 'running',
    total_nodes: 2,
    completed_nodes: 0,
    failed_nodes: 0,
    budget_max_tokens: opts.budgetCap,
  }

  const nodeUpdates: Array<{ nodeId: string; payload: Record<string, unknown> }> = []
  const dagUpdates: Array<Record<string, unknown>> = []
  const budgetInserts: Array<Record<string, unknown>> = []

  let promoteRootsCall = 0
  const promotedLeaf = (nodeId: string) => ({
    id: nodeId,
    node_key: `leaf-${nodeId.slice(0, 4)}`,
    node_type: 'leaf' as const,
    step_type: 'outbound',
    runtime_target: null,
    route_class: null,
  })

  const from = vi.fn((table: string) => {
    if (table === 'orchestration_dags') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { ...dagHeader }, error: null })),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          dagUpdates.push(payload)
          for (const [k, v] of Object.entries(payload)) {
            dagHeader[k] = v
          }
          return { eq: vi.fn(async () => ({ error: null })) }
        }),
      }
    }

    if (table === 'orchestration_dag_nodes') {
      return {
        update: vi.fn((payload: Record<string, unknown>) => ({
          eq: vi.fn((_col1: string, nodeId: string) => ({
            eq: vi.fn(async () => {
              nodeUpdates.push({ nodeId, payload })
              return { error: null }
            }),
          })),
        })),
        // SELECT chain (used by onDagResume's orphan-ready scan).
        // In the budget-pause-resume scenario the blocked leaf was
        // reverted to `pending` (not `ready`), so the orphan scan
        // legitimately finds nothing — the resume re-promotion goes
        // through `dag_promote_roots`, not the orphan path.
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
      }
    }

    if (table === 'orchestration_steps') {
      // Orphan-ready cross-check — no step rows queried in this
      // scenario because the orphan scan returns nothing.
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
      }
    }

    if (table === 'orchestration_dag_budget_events') {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          const last = budgetInserts[budgetInserts.length - 1]
          if (!last) return { data: null, error: null }
          return { data: { cumulative: last.cumulative }, error: null }
        }),
        insert: vi.fn(async (row: Record<string, unknown>) => {
          budgetInserts.push(row)
          return { error: null }
        }),
      }
      return chain
    }

    throw new Error(`[harness] unexpected table: ${table}`)
  })

  const rpc = vi.fn(async (name: string) => {
    if (name === 'dag_promote_roots') {
      promoteRootsCall += 1
      if (promoteRootsCall === 1) {
        // Fresh DAG: both leaves eligible. The scheduler will reserve A
        // (fits) and attempt B (blocks), then pause.
        return { data: [promotedLeaf(NODE_A), promotedLeaf(NODE_B)], error: null }
      }
      // After resume, only B is still pending — the CTE predicate
      // would exclude A (now in 'ready' / running state). We model
      // that by scripting the resume RPC to return just B.
      return { data: [promotedLeaf(NODE_B)], error: null }
    }
    return { data: null, error: null }
  })

  return {
    supabase: { from, rpc } as any,
    dagHeader,
    nodeUpdates,
    dagUpdates,
    budgetInserts,
    getPromoteRootsCalls: () => promoteRootsCall,
  }
}

describe('Budget pause / resume — integration', () => {
  it('exhausts budget → pauses DAG → operator release → resume re-promotes blocked leaf', async () => {
    // Cap = 1000, default estimate per node = 1000 → first leaf fits
    // exactly, second leaf (2000 > 1000) is blocked.
    const harness = buildHarness({ budgetCap: 1000 })
    const { adapter: redis, store: redisStore } = makeFakeRedis()

    const createSpy = vi.fn(async () => ({ stepId: 'step', isNew: true }))
    const onDagPaused = vi.fn(async () => {})

    const budgetLedger = new BudgetLedger(harness.supabase, redis)
    const scheduler = new IncrementalScheduler(
      harness.supabase,
      { create: createSpy } as unknown as DagStepCreator,
      { onDagPaused },
      budgetLedger,
    )

    // ------------- 1. Fresh DAG → first leaf enqueued, second paused ----
    await scheduler.onDagCreated(DAG_ID)

    // First reservation consumed the full cap.
    expect(redisStore.get(TOKEN_KEY)).toBe(1000)

    // Only NODE_A was enqueued; NODE_B was blocked.
    expect(createSpy).toHaveBeenCalledTimes(1)
    const firstCall = createSpy.mock.calls[0][0] as { dagNodeId: string }
    expect(firstCall.dagNodeId).toBe(NODE_A)

    // NODE_B was reverted from 'ready' back to 'pending' so the CTE
    // predicate on resume will re-pick it up.
    const bRevert = harness.nodeUpdates.find(
      (u) => u.nodeId === NODE_B && u.payload.status === 'pending',
    )
    expect(bRevert).toBeDefined()

    // DAG flipped to 'paused' and callback fired with budget reason.
    expect(harness.dagHeader.status).toBe('paused')
    const pausedUpdate = harness.dagUpdates.find((u) => u.status === 'paused')
    expect(pausedUpdate).toBeDefined()
    expect(onDagPaused).toHaveBeenCalledWith({
      dagId: DAG_ID,
      reason: 'budget_exhausted',
    })

    // ------------- 2. Operator releases headroom --------------------------
    // Emulate an operator inserting a `reservation` event with a
    // positive delta: the ledger side writes a row, and the live
    // counter drops back to 0 so the previously-blocked leaf can
    // reserve again on resume.
    redisStore.set(TOKEN_KEY, 0)

    // ------------- 3. Resume → blocked leaf re-promoted -------------------
    createSpy.mockClear()

    await scheduler.onDagResume(DAG_ID)

    // DAG flipped back to 'running'.
    expect(harness.dagHeader.status).toBe('running')
    const runningAgain = harness.dagUpdates
      .slice()
      .reverse()
      .find((u) => u.status === 'running')
    expect(runningAgain).toBeDefined()

    // dag_promote_roots was called a second time (by onDagResume).
    expect(harness.getPromoteRootsCalls()).toBe(2)

    // NODE_B was reserved (counter back to 1000) and enqueued.
    expect(redisStore.get(TOKEN_KEY)).toBe(1000)
    expect(createSpy).toHaveBeenCalledTimes(1)
    const secondCall = createSpy.mock.calls[0][0] as { dagNodeId: string }
    expect(secondCall.dagNodeId).toBe(NODE_B)

    // No additional pause callback fired on the happy resume path.
    expect(onDagPaused).toHaveBeenCalledTimes(1)
  })

  it('resume is a no-op when budget is still exhausted', async () => {
    // Same 1000-cap setup, but this time the operator forgets to
    // release headroom before calling onDagResume. The blocked leaf
    // must NOT be enqueued, the DAG should re-pause, and the callback
    // should fire a second time.
    const harness = buildHarness({ budgetCap: 1000 })
    const { adapter: redis, store: redisStore } = makeFakeRedis()

    const createSpy = vi.fn(async () => ({ stepId: 'step', isNew: true }))
    const onDagPaused = vi.fn(async () => {})

    const budgetLedger = new BudgetLedger(harness.supabase, redis)
    const scheduler = new IncrementalScheduler(
      harness.supabase,
      { create: createSpy } as unknown as DagStepCreator,
      { onDagPaused },
      budgetLedger,
    )

    await scheduler.onDagCreated(DAG_ID)
    expect(onDagPaused).toHaveBeenCalledTimes(1)
    expect(harness.dagHeader.status).toBe('paused')

    // Operator calls resume WITHOUT releasing headroom.
    createSpy.mockClear()
    await scheduler.onDagResume(DAG_ID)

    // Counter still at cap — no new reservation accepted.
    expect(redisStore.get(TOKEN_KEY)).toBe(1000)
    expect(createSpy).not.toHaveBeenCalled()

    // DAG flipped running → re-paused again; pause callback fires twice.
    expect(onDagPaused).toHaveBeenCalledTimes(2)
    expect(harness.dagHeader.status).toBe('paused')
  })
})
