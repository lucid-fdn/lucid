/**
 * Pause-during-Completion Wedge — Regression Test (Blocker #6)
 *
 * Guards the fix for the operator-pause edge case where a node
 * completes while the DAG is in `paused` state. Before the fix,
 * `onNodeComplete` would stamp the node `completed` and then return
 * early without calling `dag_complete_node`, which meant child
 * `pending_parent_count` was never decremented and the children sat
 * stranded forever — `dag_promote_roots` (used by resume) only
 * matches `pending_parent_count = 0 AND status = 'pending'`.
 *
 * The fix runs `dag_complete_node` in BOTH the paused band (Band 2)
 * and the running band (Band 3) — the difference is whether the
 * promoted children are enqueued or not. On Band 2 they sit in DB
 * `ready` state without an `orchestration_steps` row. On resume,
 * `onDagResume` picks them up via the orphan-ready scan and feeds
 * them through the gate + budget reserve for the first time.
 *
 * Scenario modeled here:
 *
 *   1. DAG has two nodes: A → B (B has pending_parent_count = 1).
 *   2. DAG is in `paused` state (operator pause, not budget pause).
 *   3. A completes → onNodeComplete is called.
 *      Expected: A is stamped completed, dag_complete_node runs and
 *      promotes B to `ready` in the DB, but no step row is created
 *      and no enqueue happens. Counter is bumped.
 *   4. Operator resumes → onDagResume is called.
 *      Expected: dag_promote_roots returns nothing (B is already
 *      `ready`, not `pending`), but the orphan-ready scan picks B up
 *      and enqueues it via the gate.
 */

import { describe, it, expect, vi } from 'vitest'
import { IncrementalScheduler } from '../scheduler.js'
import type { DagStepCreator } from '../dag-step-creator.js'

const DAG_ID = '11111111-1111-4111-8111-111111111111'
const AGENT_ID = '22222222-2222-4222-8222-222222222222'
const ORG_ID = '33333333-3333-4333-8333-333333333333'
const ROOT_EVENT_ID = '44444444-4444-4444-8444-444444444444'
const NODE_A = '55555555-5555-4555-8555-555555555555'
const NODE_B = '66666666-6666-4666-8666-666666666666'

/**
 * Stateful Supabase fake. Tracks dag header status, captures node
 * updates, and serves the orphan-ready scan from a controllable
 * `readyNodes` list. The orchestration_steps select returns an
 * empty list (no step rows exist for the orphan-ready scan in the
 * fresh-pause scenario).
 */
function buildHarness() {
  const dagHeader: Record<string, unknown> = {
    id: DAG_ID,
    org_id: ORG_ID,
    agent_id: AGENT_ID,
    root_event_id: ROOT_EVENT_ID,
    status: 'paused',
    total_nodes: 2,
    completed_nodes: 0,
    failed_nodes: 0,
    budget_max_tokens: null,
  }

  const nodeUpdates: Array<{ nodeId: string; payload: Record<string, unknown> }> = []
  const dagUpdates: Array<Record<string, unknown>> = []

  // Models the DB state of `orchestration_dag_nodes` for the
  // orphan-ready scan. Once `dag_complete_node` runs and promotes B,
  // we push B onto this list so the resume scan can pick it up.
  const readyNodes: Array<Record<string, unknown>> = []

  let completeNodeCalls = 0
  let promoteRootsCalls = 0
  let bumpCompletedCalls = 0

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
        // UPDATE chain (used by stamp-complete + confidence stamp).
        update: vi.fn((payload: Record<string, unknown>) => ({
          eq: vi.fn((_col1: string, nodeId: string) => ({
            eq: vi.fn(() => {
              nodeUpdates.push({ nodeId, payload })
              // Supports both `.update().eq().eq()` (awaitable, legacy stamps)
              // and `.update().eq().eq().neq().select()` (Blocker #1 claim).
              const leaf: any = Promise.resolve({ error: null })
              leaf.neq = vi.fn(() => ({
                select: vi.fn(async () => ({
                  data: [{ id: nodeId }],
                  error: null,
                })),
              }))
              return leaf
            }),
          })),
        })),
        // SELECT chain (used by orphan-ready scan in onDagResume).
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: readyNodes.slice(), error: null })),
          })),
        })),
      }
    }

    if (table === 'orchestration_steps' || table === 'human_work_items') {
      // Orphan-ready cross-check: no step/work-item rows exist, so every
      // ready node returned above is enqueue-eligible.
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
      }
    }

    throw new Error(`[harness] unexpected table: ${table}`)
  })

  const rpc = vi.fn(async (name: string) => {
    if (name === 'dag_complete_node') {
      completeNodeCalls += 1
      // Decrement+promote: B's count drops to 0 and is flipped to
      // 'ready'. Push B into readyNodes so the orphan-ready scan
      // (called later by onDagResume) sees it.
      readyNodes.push({
        id: NODE_B,
        node_key: 'leaf-b',
        node_type: 'leaf',
        step_type: 'outbound',
        runtime_target: null,
        route_class: null,
        confidence_floor: null,
        payload: null,
      })
      return {
        data: [
          {
            id: NODE_B,
            node_key: 'leaf-b',
            node_type: 'leaf',
            step_type: 'outbound',
            runtime_target: null,
            route_class: null,
            confidence_floor: null,
            payload: null,
          },
        ],
        error: null,
      }
    }
    if (name === 'dag_bump_completed') {
      bumpCompletedCalls += 1
      return {
        data: { completed_nodes: 1, total_nodes: 2 },
        error: null,
      }
    }
    if (name === 'dag_promote_roots') {
      promoteRootsCalls += 1
      // No nodes match the predicate — B is already 'ready', not
      // 'pending'. The whole point of this test is that the
      // orphan-ready scan rescues B even though dag_promote_roots
      // can't see it.
      return { data: [], error: null }
    }
    return { data: null, error: null }
  })

  return {
    supabase: { from, rpc } as any,
    dagHeader,
    nodeUpdates,
    dagUpdates,
    readyNodes,
    getCounts: () => ({
      completeNodeCalls,
      promoteRootsCalls,
      bumpCompletedCalls,
    }),
  }
}

describe('Pause-during-completion wedge — regression', () => {
  it('completion during pause decrements children, resume re-enqueues via orphan scan', async () => {
    const harness = buildHarness()
    const createSpy = vi.fn(async () => ({ stepId: 'step', isNew: true }))

    const scheduler = new IncrementalScheduler(
      harness.supabase,
      { create: createSpy } as unknown as DagStepCreator,
      {},
      null, // no budget ledger — keeps the test focused on the wedge
    )

    // ---- 1. A completes while DAG is paused ---------------------------
    await scheduler.onNodeComplete(DAG_ID, NODE_A)

    // A was stamped completed.
    const aStamp = harness.nodeUpdates.find(
      (u) => u.nodeId === NODE_A && u.payload.status === 'completed',
    )
    expect(aStamp).toBeDefined()

    // dag_complete_node ran (the wedge fix) — B is now `ready` in DB
    // but no step row was created.
    expect(harness.getCounts().completeNodeCalls).toBe(1)
    expect(createSpy).not.toHaveBeenCalled()

    // dag_bump_completed ran so a paused dag whose last node finishes
    // can still finalize cleanly.
    expect(harness.getCounts().bumpCompletedCalls).toBe(1)

    // DAG is still paused — onNodeComplete must NOT flip it back to
    // running on its own.
    expect(harness.dagHeader.status).toBe('paused')

    // ---- 2. Operator resumes → orphan-ready scan picks B up ----------
    await scheduler.onDagResume(DAG_ID)

    // dag_promote_roots was called (and returned nothing — B is
    // already 'ready', not 'pending').
    expect(harness.getCounts().promoteRootsCalls).toBe(1)

    // The orphan-ready scan rescued B and enqueued it.
    expect(createSpy).toHaveBeenCalledTimes(1)
    const enqueueArg = createSpy.mock.calls[0][0] as { dagNodeId: string }
    expect(enqueueArg.dagNodeId).toBe(NODE_B)

    // DAG is back to running.
    expect(harness.dagHeader.status).toBe('running')
  })

  it('does NOT double-enqueue ready nodes that already have step rows', async () => {
    // Same shape as above, but the orchestration_steps select returns
    // a row for B — meaning B was enqueued before the pause and we
    // must NOT enqueue it a second time on resume.
    const harness = buildHarness()
    const createSpy = vi.fn(async () => ({ stepId: 'step', isNew: true }))

    // Override the orchestration_steps select to return an existing
    // row for B. We rebuild the harness fake here so the test stays
    // self-contained.
    harness.supabase.from = vi.fn((table: string) => {
      if (table === 'orchestration_dags') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { ...harness.dagHeader },
                error: null,
              })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            harness.dagUpdates.push(payload)
            for (const [k, v] of Object.entries(payload)) {
              harness.dagHeader[k] = v
            }
            return { eq: vi.fn(async () => ({ error: null })) }
          }),
        }
      }
      if (table === 'orchestration_dag_nodes') {
        return {
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
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [
                  {
                    id: NODE_B,
                    node_key: 'leaf-b',
                    node_type: 'leaf',
                    step_type: 'outbound',
                    runtime_target: null,
                    route_class: null,
                    confidence_floor: null,
                    payload: null,
                  },
                ],
                error: null,
              })),
            })),
          })),
        }
      }
      if (table === 'orchestration_steps') {
        // B already has a step row → must be filtered out.
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: [{ dag_node_id: NODE_B }],
                error: null,
              })),
            })),
          })),
        }
      }
      if (table === 'human_work_items') {
        // No human work items for this test scenario.
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        }
      }
      throw new Error(`[harness] unexpected table: ${table}`)
    })

    const scheduler = new IncrementalScheduler(
      harness.supabase,
      { create: createSpy } as unknown as DagStepCreator,
      {},
      null,
    )

    await scheduler.onDagResume(DAG_ID)

    // B was filtered out by the existence check — no double-enqueue.
    expect(createSpy).not.toHaveBeenCalled()
  })
})
