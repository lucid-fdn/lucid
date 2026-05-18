/**
 * HP3 regression — Phase 4N-b.
 *
 * Pins the mutator's UUID validation on edge endpoints that are NOT
 * node_keys for new nodes in the same mutation. Without this guard, a
 * bogus string from the agent tool layer would fall through
 * `resolveEndpoint` and surface as an opaque FK violation from the RPC
 * — or, if the RPC happened to accept it, a silent no-op.
 *
 * Contract:
 *   - Mutator throws `InvalidEdgeEndpointError` BEFORE calling the RPC.
 *   - The advisory lock (when Redis is present) is released in `finally`.
 *   - The error carries the offending endpoint + role ('parent'|'child').
 */

import { describe, it, expect, vi } from 'vitest'
import { DagMutator, InvalidEdgeEndpointError } from '../mutator.js'

const DAG_ID = '11111111-1111-4111-8111-111111111111'
const EXISTING_NODE_ID = '22222222-2222-4222-8222-222222222222'

function buildHarness() {
  const versionFn = vi.fn(async () => ({ data: { graph_version: 1 }, error: null }))
  const edgesFn = vi.fn(async () => ({ data: [], error: null }))

  const from = vi.fn((table: string) => {
    if (table === 'orchestration_dags') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: versionFn })),
        })),
      }
    }
    if (table === 'orchestration_dag_edges') {
      return {
        select: vi.fn(() => ({ eq: edgesFn })),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })

  const rpc = vi.fn(async () => ({ data: null, error: null }))
  const supabase = { from, rpc } as any

  const redis = {
    set: vi.fn(async () => 'OK' as string | null),
    eval: vi.fn(async () => 1),
  } as any

  return { supabase, redis, rpc }
}

describe('DagMutator — HP3 invalid edge endpoint', () => {
  it('rejects a bogus parent endpoint with InvalidEdgeEndpointError before hitting the RPC', async () => {
    const { supabase, redis, rpc } = buildHarness()
    const mutator = new DagMutator(supabase, redis)

    const err = await mutator
      .apply({
        dagId: DAG_ID,
        expectedVersion: 1,
        idempotencyKey: 'mut-bogus-parent',
        mutationType: 'expand',
        source: 'agent',
        additions: {
          nodes: [{ node_key: 'child', node_type: 'leaf', step_type: 'webhook' }],
          edges: [
            // 'not-a-uuid-and-not-a-new-node-key' must be rejected.
            { parent: 'not-a-uuid-and-not-a-new-node-key', child: 'child' },
          ],
        },
      })
      .catch((e) => e)

    expect(err).toBeInstanceOf(InvalidEdgeEndpointError)
    expect((err as InvalidEdgeEndpointError).role).toBe('parent')
    expect((err as InvalidEdgeEndpointError).endpoint).toBe(
      'not-a-uuid-and-not-a-new-node-key',
    )
    // Never reached the RPC — validation is pre-RPC.
    expect(rpc).not.toHaveBeenCalled()
    // Lock was acquired and released in finally.
    expect(redis.set).toHaveBeenCalledTimes(1)
    expect(redis.eval).toHaveBeenCalledTimes(1) // fenced lock release
  })

  it('rejects a bogus child endpoint with role="child"', async () => {
    const { supabase, redis, rpc } = buildHarness()
    const mutator = new DagMutator(supabase, redis)

    const err = await mutator
      .apply({
        dagId: DAG_ID,
        expectedVersion: 1,
        idempotencyKey: 'mut-bogus-child',
        mutationType: 'expand',
        source: 'agent',
        additions: {
          nodes: [{ node_key: 'parent', node_type: 'leaf', step_type: 'webhook' }],
          edges: [{ parent: 'parent', child: 'bogus-child-id' }],
        },
      })
      .catch((e) => e)

    expect(err).toBeInstanceOf(InvalidEdgeEndpointError)
    expect((err as InvalidEdgeEndpointError).role).toBe('child')
    expect((err as InvalidEdgeEndpointError).endpoint).toBe('bogus-child-id')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('accepts a valid UUID for an existing-node endpoint (no validation error)', async () => {
    const { supabase, redis, rpc } = buildHarness()
    rpc.mockResolvedValueOnce({
      data: [
        {
          applied_graph_version: 2,
          added_node_ids: ['33333333-3333-4333-8333-333333333333'],
          idempotent: false,
        },
      ],
      error: null,
    })
    const mutator = new DagMutator(supabase, redis)

    const result = await mutator.apply({
      dagId: DAG_ID,
      expectedVersion: 1,
      idempotencyKey: 'mut-valid',
      mutationType: 'expand',
      source: 'agent',
      additions: {
        nodes: [{ node_key: 'new_child', node_type: 'leaf', step_type: 'webhook' }],
        // Existing-node parent is a real UUID → should pass validation.
        edges: [{ parent: EXISTING_NODE_ID, child: 'new_child' }],
      },
    })

    expect(result.appliedGraphVersion).toBe(2)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('accepts a new-node key for both endpoints (resolved through nodeIdsByKey)', async () => {
    const { supabase, redis, rpc } = buildHarness()
    rpc.mockResolvedValueOnce({
      data: [
        {
          applied_graph_version: 2,
          added_node_ids: [
            '44444444-4444-4444-8444-444444444444',
            '55555555-5555-4555-8555-555555555555',
          ],
          idempotent: false,
        },
      ],
      error: null,
    })
    const mutator = new DagMutator(supabase, redis)

    const result = await mutator.apply({
      dagId: DAG_ID,
      expectedVersion: 1,
      idempotencyKey: 'mut-new-to-new',
      mutationType: 'expand',
      source: 'agent',
      additions: {
        nodes: [
          { node_key: 'a', node_type: 'leaf', step_type: 'webhook' },
          { node_key: 'b', node_type: 'leaf', step_type: 'webhook' },
        ],
        edges: [{ parent: 'a', child: 'b' }],
      },
    })

    expect(result.appliedGraphVersion).toBe(2)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
