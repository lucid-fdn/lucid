/**
 * DagMutator — Idempotency (Phase 4N-b, Task 39)
 *
 * The idempotency boundary is `UNIQUE(dag_id, idempotency_key)` on
 * `orchestration_dag_mutations`. The RPC short-circuits inside the
 * transaction: if a mutation row with the same key already exists it
 * returns `idempotent = true` with the previously-applied version and
 * no writes happen.
 *
 * The mutator surfaces this as:
 *   - `appliedGraphVersion = prior version`
 *   - `addedNodeIds = []`
 *   - `nodeIdsByKey = empty Map`
 *   - `idempotent = true`
 *
 * There's also a second idempotency path: if a concurrent caller races
 * past the short-circuit, the INSERT into `orchestration_dag_mutations`
 * collides on the UNIQUE constraint and the RPC surfaces a 23505
 * unique_violation. The mutator translates this into the same
 * idempotent-result shape by reading the prior mutation row. We exercise
 * both paths here.
 */

import { describe, it, expect, vi } from 'vitest'
import { DagMutator } from '../mutator.js'

const DAG_ID = '33333333-3333-4333-8333-333333333333'

interface HarnessOpts {
  rpcReturns: Array<{ data?: unknown; error?: { code?: string; message: string } }>
  priorMutation?: { applied_graph_version: number } | null
}

function buildHarness(opts: HarnessOpts) {
  const versionFn = vi.fn(async () => ({ data: { graph_version: 1 }, error: null }))
  const edgesFn = vi.fn(async () => ({ data: [], error: null }))

  const priorMutationFn = vi.fn(async () => ({
    data: opts.priorMutation ?? null,
    error: null,
  }))

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
    if (table === 'orchestration_dag_mutations') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: priorMutationFn })),
          })),
        })),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })

  let rpcIdx = 0
  const rpc = vi.fn(async () => {
    const ret = opts.rpcReturns[rpcIdx] ?? { data: null, error: null }
    rpcIdx++
    return ret
  })

  const supabase = { from, rpc } as any
  const redis = {
    set: vi.fn(async () => 'OK' as string | null),
    eval: vi.fn(async () => 1),
  } as any

  return { supabase, redis, rpc, priorMutationFn }
}

const baseInput = (overrides: Partial<{ key: string; nodeKey: string }> = {}) => ({
  dagId: DAG_ID,
  expectedVersion: 1,
  idempotencyKey: overrides.key ?? 'idem-1',
  mutationType: 'expand' as const,
  source: 'agent' as const,
  additions: {
    nodes: [
      { node_key: overrides.nodeKey ?? 'x', node_type: 'leaf' as const, step_type: 'webhook' as const },
    ],
    edges: [],
  },
})

describe('DagMutator — idempotency', () => {
  it('first apply with key k1 succeeds and returns idempotent=false', async () => {
    const { supabase, redis } = buildHarness({
      rpcReturns: [
        {
          data: [
            {
              applied_graph_version: 2,
              added_node_ids: ['11111111-1111-4111-8111-111111111111'],
              idempotent: false,
            },
          ],
          error: null,
        },
      ],
    })
    const mutator = new DagMutator(supabase, redis)
    const result = await mutator.apply(baseInput({ key: 'k1' }))

    expect(result.appliedGraphVersion).toBe(2)
    expect(result.idempotent).toBe(false)
    expect(result.addedNodeIds).toHaveLength(1)
  })

  it('replay with same key k1 → RPC reports idempotent=true, no new node ids', async () => {
    // The RPC's internal short-circuit path: mutation row already exists,
    // returns the prior applied_graph_version with idempotent=true and an
    // empty added_node_ids array.
    const { supabase, redis, rpc } = buildHarness({
      rpcReturns: [
        {
          data: [
            {
              applied_graph_version: 2,
              added_node_ids: [],
              idempotent: true,
            },
          ],
          error: null,
        },
      ],
    })
    const mutator = new DagMutator(supabase, redis)
    const result = await mutator.apply(baseInput({ key: 'k1' }))

    expect(result.idempotent).toBe(true)
    expect(result.appliedGraphVersion).toBe(2)
    expect(result.addedNodeIds).toEqual([])
    expect(result.nodeIdsByKey.size).toBe(0)
    expect(rpc).toHaveBeenCalledTimes(1)
    // Lock still released on the idempotent path.
    expect(redis.eval).toHaveBeenCalledTimes(1) // fenced lock release
  })

  it('same key + different payload still no-op (key is the boundary, not the payload)', async () => {
    // Caller is trying to sneak in a different mutation body under the
    // same idempotency key. The RPC must short-circuit on the key alone
    // and NOT apply the new payload. The mutator surfaces this as
    // idempotent=true + the prior version.
    const { supabase, redis, rpc } = buildHarness({
      rpcReturns: [
        {
          data: [
            {
              applied_graph_version: 2,
              added_node_ids: [],
              idempotent: true,
            },
          ],
          error: null,
        },
      ],
    })
    const mutator = new DagMutator(supabase, redis)
    // Different node_key on the addition, but same idempotency key.
    const result = await mutator.apply(baseInput({ key: 'k1', nodeKey: 'y' }))

    expect(result.idempotent).toBe(true)
    expect(result.appliedGraphVersion).toBe(2)
    expect(result.addedNodeIds).toEqual([])
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('concurrent race past short-circuit → 23505 unique_violation translated to idempotent result', async () => {
    // Two callers race: both pass the RPC's initial short-circuit SELECT,
    // both try to INSERT the mutation row, the loser trips the
    // UNIQUE(dag_id, idempotency_key) constraint and Postgres raises
    // 23505. The mutator re-reads the prior mutation row and returns
    // the same idempotent-result shape.
    const { supabase, redis, priorMutationFn } = buildHarness({
      rpcReturns: [
        { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
      ],
      priorMutation: { applied_graph_version: 2 },
    })
    const mutator = new DagMutator(supabase, redis)
    const result = await mutator.apply(baseInput({ key: 'k1' }))

    expect(result.idempotent).toBe(true)
    expect(result.appliedGraphVersion).toBe(2)
    expect(result.addedNodeIds).toEqual([])
    expect(result.nodeIdsByKey.size).toBe(0)
    expect(priorMutationFn).toHaveBeenCalledTimes(1)
    // Lock released on the 23505 translation path too.
    expect(redis.eval).toHaveBeenCalledTimes(1) // fenced lock release
  })

  it('23505 without a discoverable prior row → falls back to expected version', async () => {
    // Edge case: the unique_violation fires but the prior row can't be
    // read (race against an uncommitted transaction, or RLS blocked
    // the SELECT). Mutator should still return idempotent=true with
    // the caller's expectedVersion as a best-effort fallback.
    const { supabase, redis } = buildHarness({
      rpcReturns: [
        { data: null, error: { code: '23505', message: 'duplicate key' } },
      ],
      priorMutation: null,
    })
    const mutator = new DagMutator(supabase, redis)
    const result = await mutator.apply(baseInput({ key: 'k1' }))

    expect(result.idempotent).toBe(true)
    expect(result.appliedGraphVersion).toBe(1) // falls back to expectedVersion
  })
})
