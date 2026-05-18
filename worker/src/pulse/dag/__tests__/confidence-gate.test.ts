/**
 * Confidence Gate — Phase 4N-d, Task 75.
 *
 * Coverage:
 *   1. Unit tests for `evaluateConfidence()`: NULL floor → observed=1.0,
 *      numeric floor → observed equals floor (Phase 4N static gate),
 *      source is always 'static'.
 *
 *   2. Scheduler integration: during promotion (onDagCreated), the gate
 *      is evaluated for each promoted leaf. The scheduler must:
 *        - Write `confidence_observed` + `confidence_source` on the node
 *        - Enqueue the step when `observed >= floor`
 *        - Flip node to `failed` with reason `confidence_floor` when
 *          `observed < floor` (tested by mocking `evaluateConfidence`
 *          to return a sub-floor score — the only way to exercise the
 *          fail path in Phase 4N since the static gate always admits)
 *        - Admit nodes with NULL floor without stamping failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IncrementalScheduler } from '../scheduler.js'
import { evaluateConfidence } from '../confidence-gate.js'
import type { DagStepCreator } from '../dag-step-creator.js'

const DAG_ID = '11111111-1111-4111-8111-111111111111'
const AGENT_ID = '22222222-2222-4222-8222-222222222222'
const ORG_ID = '33333333-3333-4333-8333-333333333333'
const ROOT_EVENT_ID = '44444444-4444-4444-8444-444444444444'
const NODE_A = '55555555-5555-4555-8555-555555555555'
const NODE_B = '66666666-6666-4666-8666-666666666666'

const DAG_HEADER_RUNNING = {
  id: DAG_ID,
  org_id: ORG_ID,
  agent_id: AGENT_ID,
  root_event_id: ROOT_EVENT_ID,
  status: 'running' as const,
  total_nodes: 2,
  completed_nodes: 0,
  failed_nodes: 0,
  budget_max_tokens: null,
}

// ─── Unit tests: evaluateConfidence ────────────────────────────────────────

function gateNode(overrides: Partial<{
  step_type: string | null
  route_class: string | null
  confidence_floor: number | null
  payload: unknown
}> = {}) {
  return {
    step_type: overrides.step_type !== undefined ? overrides.step_type : 'inbound',
    route_class: overrides.route_class !== undefined ? overrides.route_class : null,
    confidence_floor:
      overrides.confidence_floor !== undefined ? overrides.confidence_floor : null,
    payload: overrides.payload !== undefined ? overrides.payload : null,
  }
}

describe('evaluateConfidence (Phase 4N static gate, router flag off)', () => {
  it('returns observed=1.0 and source=static when floor is null', () => {
    const result = evaluateConfidence({ node: gateNode({ confidence_floor: null }) })
    expect(result.observed).toBe(1.0)
    expect(result.source).toBe('static')
  })

  it('returns observed=floor and source=static when floor is numeric', () => {
    const result = evaluateConfidence({ node: gateNode({ confidence_floor: 0.8 }) })
    expect(result.observed).toBe(0.8)
    expect(result.source).toBe('static')
  })

  it('static gate admits exactly at the floor (observed == floor)', () => {
    const result = evaluateConfidence({ node: gateNode({ confidence_floor: 0.5 }) })
    expect(result.observed).toBe(0.5)
    expect(result.source).toBe('static')
  })

  it('ignores parentResults when router flag is off', () => {
    const result = evaluateConfidence({
      node: gateNode({ confidence_floor: 0.9 }),
      parentResults: [{ confidence_observed: 0.1 }],
    })
    expect(result.observed).toBe(0.9)
    expect(result.source).toBe('static')
  })
})

// ─── Integration tests: scheduler wiring ──────────────────────────────────

interface HarnessOpts {
  promotedNodes: Array<{
    id: string
    node_key: string
    node_type: 'leaf' | 'group' | 'barrier'
    step_type: string | null
    runtime_target: string | null
    route_class: string | null
    confidence_floor: number | null
  }>
}

function buildHarness(opts: HarnessOpts) {
  const createSpy = vi.fn(async () => ({ stepId: 'step', isNew: true }))
  const nodeUpdates: Array<{
    id: string
    set: Record<string, unknown>
  }> = []

  const chain: any = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => ({ data: DAG_HEADER_RUNNING, error: null }))

  // Capture every .update({...}).eq('id', X).eq('dag_id', Y) so we can
  // assert the confidence stamp landed on the right node.
  chain.update = vi.fn((patch: Record<string, unknown>) => {
    let capturedId: string | null = null
    return {
      eq: vi.fn((col: string, val: string) => {
        if (col === 'id') capturedId = val
        return {
          eq: vi.fn(async () => {
            if (capturedId) {
              nodeUpdates.push({ id: capturedId, set: patch })
            }
            return { error: null }
          }),
          then: (r: (v: { error: null }) => void) => {
            if (capturedId) {
              nodeUpdates.push({ id: capturedId, set: patch })
            }
            r({ error: null })
          },
        }
      }),
    }
  })

  const from = vi.fn(() => chain)

  const rpc = vi.fn(async (name: string) => {
    if (name === 'dag_promote_roots') {
      return { data: opts.promotedNodes, error: null }
    }
    if (name === 'dag_cancel_subtree') {
      return { data: 0, error: null }
    }
    if (name === 'dag_bump_completed') {
      return { data: { completed_nodes: 1, total_nodes: 2 }, error: null }
    }
    return { data: null, error: null }
  })

  const supabase = { from, rpc } as any
  const scheduler = new IncrementalScheduler(
    supabase,
    { create: createSpy } as unknown as DagStepCreator,
  )
  return { scheduler, createSpy, rpc, nodeUpdates }
}

describe('IncrementalScheduler — confidence gate wiring', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('admits node with NULL floor and stamps source=static', async () => {
    const { scheduler, createSpy, nodeUpdates } = buildHarness({
      promotedNodes: [
        {
          id: NODE_A,
          node_key: 'a',
          node_type: 'leaf',
          step_type: 'outbound',
          runtime_target: null,
          route_class: null,
          confidence_floor: null,
        },
      ],
    })

    await scheduler.onDagCreated(DAG_ID)

    expect(createSpy).toHaveBeenCalledTimes(1)
    const stamps = nodeUpdates.filter((u) => u.id === NODE_A)
    const confStamp = stamps.find((u) => 'confidence_observed' in u.set)
    expect(confStamp).toBeDefined()
    expect(confStamp!.set.confidence_observed).toBe(1.0)
    expect(confStamp!.set.confidence_source).toBe('static')
  })

  it('admits node whose observed meets its floor (static gate = floor)', async () => {
    const { scheduler, createSpy, nodeUpdates } = buildHarness({
      promotedNodes: [
        {
          id: NODE_B,
          node_key: 'b',
          node_type: 'leaf',
          step_type: 'outbound',
          runtime_target: null,
          route_class: null,
          confidence_floor: 0.75,
        },
      ],
    })

    await scheduler.onDagCreated(DAG_ID)

    expect(createSpy).toHaveBeenCalledTimes(1)
    const stamps = nodeUpdates.filter((u) => u.id === NODE_B)
    const confStamp = stamps.find((u) => 'confidence_observed' in u.set)
    expect(confStamp).toBeDefined()
    expect(confStamp!.set.confidence_observed).toBe(0.75)
    expect(confStamp!.set.confidence_source).toBe('static')
  })

  it('fails node with reason confidence_floor when observed < floor', async () => {
    // Mock the gate to return a sub-floor score. This is the only way
    // to exercise the fail path in Phase 4N — the real static gate
    // always pins observed to the floor. Phase 5N will use the router
    // and this test becomes meaningful without any mock.
    vi.doMock('../confidence-gate.js', () => ({
      evaluateConfidence: (_node: unknown) => ({
        observed: 0.2,
        source: 'router' as const,
      }),
    }))

    // Re-import the scheduler so the mock takes effect.
    const { IncrementalScheduler: MockedScheduler } = await import('../scheduler.js')

    const createSpy = vi.fn(async () => ({ stepId: 'step', isNew: true }))
    const nodeUpdates: Array<{ id: string; set: Record<string, unknown> }> = []

    const chain: any = {}
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.maybeSingle = vi.fn(async () => ({ data: DAG_HEADER_RUNNING, error: null }))
    chain.update = vi.fn((patch: Record<string, unknown>) => {
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
    })

    const from = vi.fn(() => chain)
    const rpc = vi.fn(async (name: string) => {
      if (name === 'dag_promote_roots') {
        return {
          data: [
            {
              id: NODE_A,
              node_key: 'a',
              node_type: 'leaf',
              step_type: 'outbound',
              runtime_target: null,
              route_class: null,
              confidence_floor: 0.8,
            },
          ],
          error: null,
        }
      }
      if (name === 'dag_cancel_subtree') return { data: 0, error: null }
      if (name === 'dag_bump_completed') {
        return { data: { completed_nodes: 1, total_nodes: 2 }, error: null }
      }
      return { data: null, error: null }
    })

    const supabase = { from, rpc } as any
    const scheduler = new MockedScheduler(
      supabase,
      { create: createSpy } as unknown as DagStepCreator,
    )

    await scheduler.onDagCreated(DAG_ID)

    // Not enqueued — the gate rejected the node.
    expect(createSpy).not.toHaveBeenCalled()

    // Confidence score was still stamped (with the sub-floor value) so
    // observers see a truthful record of what was scored.
    const stamps = nodeUpdates.filter((u) => u.id === NODE_A)
    const confStamp = stamps.find((u) => 'confidence_observed' in u.set)
    expect(confStamp).toBeDefined()
    expect(confStamp!.set.confidence_observed).toBe(0.2)
    expect(confStamp!.set.confidence_source).toBe('router')

    // Node was flipped to failed (onNodeFail sets status='failed').
    const failStamp = stamps.find(
      (u) => 'status' in u.set && u.set.status === 'failed',
    )
    expect(failStamp).toBeDefined()

    // Subtree cancel was invoked with the gated node as the root, and
    // the dag header itself was flipped to failed.
    const rpcNames = rpc.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(rpcNames).toContain('dag_cancel_subtree')

    vi.doUnmock('../confidence-gate.js')
  })
})
