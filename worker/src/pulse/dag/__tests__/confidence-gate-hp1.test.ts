/**
 * HP1 regression — Phase 5N.
 *
 * Locks in the batched parent-confidence fetch inside
 * `IncrementalScheduler.enqueuePromoted`. The bug this test guards
 * against is the router being wired up but fed `parentResults: []`
 * because the edge fetch was removed, refactored, or silently
 * returned no rows — in which case the `parentHadLowConfidence`
 * signal never fires even when a parent's observed score is low,
 * and the scheduler admits work it should be upgrading or failing.
 *
 * Setup: one leaf child with a low-confidence parent (0.3).
 *   - FEATURE_CONFIDENCE_ROUTER=true
 *   - step_type=outbound, route_class=fast  → base score 0.72
 *   - parentHadLowConfidence signal fires   → delta -0.1 → observed 0.62
 *   - confidence_floor=0.5                  → admitted on fast route
 *
 * Assertions:
 *   - The stamp written to the node carries `source='router'`,
 *     `confidence_router_version='v1-2026-04-07'`, and at least one
 *     audit note whose `signalHits` array contains
 *     `'parentHadLowConfidence'`.
 *   - The step was still enqueued (the router upgrade chose to admit).
 */

import { describe, it, expect, vi } from 'vitest'
import { IncrementalScheduler } from '../scheduler.js'
import { ROUTER_VERSION } from '../confidence-router/version.js'
import type { DagStepCreator } from '../dag-step-creator.js'

const DAG_ID = '11111111-1111-4111-8111-111111111111'
const AGENT_ID = '22222222-2222-4222-8222-222222222222'
const ORG_ID = '33333333-3333-4333-8333-333333333333'
const ROOT_EVENT_ID = '44444444-4444-4444-8444-444444444444'
const CHILD_ID = '55555555-5555-4555-8555-555555555555'
const PARENT_ID = '66666666-6666-4666-8666-666666666666'

const DAG_HEADER_RUNNING = {
  id: DAG_ID,
  org_id: ORG_ID,
  agent_id: AGENT_ID,
  root_event_id: ROOT_EVENT_ID,
  status: 'running' as const,
  total_nodes: 2,
  completed_nodes: 1,
  failed_nodes: 0,
  budget_max_tokens: null,
}

describe('IncrementalScheduler — HP1 parent confidence threading', () => {
  it('surfaces parentHadLowConfidence in the router decision stamped on the child', async () => {
    const createSpy = vi.fn(async () => ({ stepId: 'step', isNew: true }))
    const nodeUpdates: Array<{ id: string; set: Record<string, unknown> }> = []

    // Per-table dispatcher. Different tables need different chain shapes:
    //   - orchestration_dags          → .select().eq().maybeSingle() (read)
    //                                   .update().eq()               (status flip)
    //   - orchestration_dag_nodes     → .update(patch).eq('id').eq('dag_id') (stamps)
    //   - orchestration_dag_edges     → .select().eq('dag_id').in('child_node_id', [...]) (parents)
    const from = vi.fn((table: string) => {
      if (table === 'orchestration_dags') {
        const chain: any = {}
        chain.select = vi.fn(() => chain)
        chain.eq = vi.fn(() => chain)
        chain.maybeSingle = vi.fn(async () => ({ data: DAG_HEADER_RUNNING, error: null }))
        chain.update = vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        }))
        return chain
      }

      if (table === 'orchestration_dag_nodes') {
        return {
          update: vi.fn((patch: Record<string, unknown>) => {
            let capturedId: string | null = null
            return {
              eq: vi.fn((col: string, val: string) => {
                if (col === 'id') capturedId = val
                return {
                  eq: vi.fn(async () => {
                    if (capturedId) nodeUpdates.push({ id: capturedId, set: patch })
                    return { error: null }
                  }),
                  then: (r: (v: { error: null }) => void) => {
                    if (capturedId) nodeUpdates.push({ id: capturedId, set: patch })
                    r({ error: null })
                  },
                }
              }),
            }
          }),
        }
      }

      if (table === 'orchestration_dag_edges') {
        // fetchParentConfidences chain:
        //   .select(...).eq('dag_id', ...).in('child_node_id', [...])
        const inCall = vi.fn(async () => ({
          data: [
            {
              child_node_id: CHILD_ID,
              parent: { confidence_observed: 0.3 },
            },
          ],
          error: null,
        }))
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: inCall,
            })),
          })),
        }
      }

      throw new Error(`unexpected table in HP1 test: ${table}`)
    })

    const rpc = vi.fn(async (name: string) => {
      if (name === 'dag_promote_roots') {
        return {
          data: [
            {
              id: CHILD_ID,
              node_key: 'child',
              node_type: 'leaf',
              step_type: 'outbound',
              runtime_target: null,
              route_class: 'fast',
              confidence_floor: 0.5,
              // Router reads tool_names / schema / allow_external_upgrade
              // off payload — empty object is fine, parentHadLowConfidence
              // doesn't depend on it.
              payload: {},
            },
          ],
          error: null,
        }
      }
      if (name === 'dag_bump_completed') {
        return { data: { completed_nodes: 2, total_nodes: 2 }, error: null }
      }
      return { data: null, error: null }
    })

    const supabase = { from, rpc } as any
    const scheduler = new IncrementalScheduler(
      supabase,
      { create: createSpy } as unknown as DagStepCreator,
      {},
      null,
      { FEATURE_CONFIDENCE_ROUTER: true },
    )

    await scheduler.onDagCreated(DAG_ID)

    // Parent id is unused by the router — the point of the test is that
    // the edge fetch actually ran and its payload reached the router.
    void PARENT_ID

    // Step was enqueued — router upgraded fast route successfully.
    expect(createSpy).toHaveBeenCalledTimes(1)

    // The confidence stamp on the child carries the router version and
    // a note whose signalHits include parentHadLowConfidence. This is
    // the exact contract HP1 threads end-to-end.
    const stamps = nodeUpdates.filter((u) => u.id === CHILD_ID)
    const confStamp = stamps.find((u) => 'confidence_observed' in u.set)
    expect(confStamp, 'router stamp must be written on the admitted child').toBeDefined()
    expect(confStamp!.set.confidence_source).toBe('router')
    expect(confStamp!.set.confidence_router_version).toBe(ROUTER_VERSION)

    const notes = confStamp!.set.confidence_router_notes as Array<{
      route: string
      signalHits: string[]
    }>
    expect(Array.isArray(notes)).toBe(true)
    const allHits = notes.flatMap((n) => n.signalHits)
    expect(allHits).toContain('parentHadLowConfidence')

    // Sanity: the edge fetch was actually consulted.
    expect(from).toHaveBeenCalledWith('orchestration_dag_edges')
  })
})
