/**
 * DagMutator — CAS conflict (Phase 4N-b, Task 37)
 *
 * Two concurrent `apply()` calls with the same `expectedVersion`. The
 * RPC's CAS guard (`UPDATE … WHERE graph_version = expected`) is the
 * authoritative gate; the Redis advisory lock is just an optimization.
 * We simulate the race by having the second call see a bumped version
 * during the under-lock re-check (step 5) — that's the band the
 * mutator is designed to fail-fast on, before even calling the RPC.
 *
 * Then the loser refreshes its expected version and retries — this
 * time the under-lock re-check matches and the call succeeds.
 */

import { describe, it, expect, vi } from 'vitest'
import { DagMutator, CasConflictError } from '../mutator.js'

const DAG_ID = '11111111-1111-4111-8111-111111111111'

interface HarnessOpts {
  /** Sequence of graph_version values to return on successive SELECTs. */
  versionSequence: number[]
  /** RPC behavior: array of return values per call. */
  rpcReturns: Array<{ data?: unknown; error?: { code?: string; message: string } }>
}

function buildHarness(opts: HarnessOpts) {
  let versionIdx = 0
  const versionFn = vi.fn(async () => {
    const v = opts.versionSequence[versionIdx] ?? opts.versionSequence[opts.versionSequence.length - 1]
    versionIdx++
    return { data: { graph_version: v }, error: null }
  })

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
    if (table === 'orchestration_dag_mutations') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
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

  // Redis stub — no-op set/eval so we exercise the lock path.
  const redis = {
    set: vi.fn(async () => 'OK' as string | null),
    eval: vi.fn(async () => 1), // PLAIN_CONDITIONAL_DEL_LUA fenced release
  } as any

  return { supabase, redis, rpc, versionFn }
}

const VALID_INPUT = {
  dagId: DAG_ID,
  expectedVersion: 1,
  idempotencyKey: 'mut-1',
  mutationType: 'expand' as const,
  source: 'agent' as const,
  additions: {
    nodes: [
      { node_key: 'new1', node_type: 'leaf' as const, step_type: 'webhook' as const },
    ],
    edges: [],
  },
}

describe('DagMutator — CAS conflict', () => {
  it('first apply succeeds and bumps version 1 → 2', async () => {
    const { supabase, redis } = buildHarness({
      versionSequence: [1, 1], // pre-check + under-lock re-check
      rpcReturns: [
        {
          data: [
            {
              applied_graph_version: 2,
              added_node_ids: ['aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
              idempotent: false,
            },
          ],
          error: null,
        },
      ],
    })
    const mutator = new DagMutator(supabase, redis)
    const result = await mutator.apply(VALID_INPUT)

    expect(result.appliedGraphVersion).toBe(2)
    expect(result.idempotent).toBe(false)
    expect(result.addedNodeIds).toHaveLength(1)
  })

  it('second concurrent apply observes bumped version → CasConflictError before lock', async () => {
    // Pre-check sees version=2 (the winner already bumped). Mutator
    // throws CasConflictError without acquiring the lock or calling
    // the RPC.
    const { supabase, redis, rpc } = buildHarness({
      versionSequence: [2],
      rpcReturns: [],
    })
    const mutator = new DagMutator(supabase, redis)

    await expect(mutator.apply(VALID_INPUT)).rejects.toBeInstanceOf(CasConflictError)
    expect(redis.set).not.toHaveBeenCalled() // never even tried to lock
    expect(rpc).not.toHaveBeenCalled()
  })

  it('loser observes mismatch under lock when pre-check raced → CasConflictError, lock released', async () => {
    // Pre-check is stale (still sees v=1) but the under-lock re-check
    // sees v=2 (winner committed in-between). The mutator must fail
    // fast and release the lock in the `finally` block.
    const { supabase, redis, rpc } = buildHarness({
      versionSequence: [1, 2],
      rpcReturns: [],
    })
    const mutator = new DagMutator(supabase, redis)

    await expect(mutator.apply(VALID_INPUT)).rejects.toBeInstanceOf(CasConflictError)
    expect(redis.set).toHaveBeenCalledTimes(1)
    expect(redis.eval).toHaveBeenCalledTimes(1) // fenced release in finally
    expect(rpc).not.toHaveBeenCalled() // never reached step 7
  })

  it('loser refreshes expectedVersion and retries → succeeds at version 3', async () => {
    const { supabase, redis } = buildHarness({
      versionSequence: [2, 2], // refreshed expectedVersion=2
      rpcReturns: [
        {
          data: [
            {
              applied_graph_version: 3,
              added_node_ids: ['bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
              idempotent: false,
            },
          ],
          error: null,
        },
      ],
    })
    const mutator = new DagMutator(supabase, redis)
    const result = await mutator.apply({ ...VALID_INPUT, expectedVersion: 2, idempotencyKey: 'mut-2' })

    expect(result.appliedGraphVersion).toBe(3)
    expect(result.idempotent).toBe(false)
  })

  it('translates RPC 40001 (cas_conflict raised inside the function) into CasConflictError', async () => {
    const { supabase, redis } = buildHarness({
      versionSequence: [1, 1, 4], // pre/under-lock match expected=1, then re-fetch on error returns 4
      rpcReturns: [
        { data: null, error: { code: '40001', message: 'cas_conflict: expected 1 got 4' } },
      ],
    })
    const mutator = new DagMutator(supabase, redis)

    const err = await mutator.apply(VALID_INPUT).catch((e) => e)
    expect(err).toBeInstanceOf(CasConflictError)
    expect((err as CasConflictError).actualVersion).toBe(4)
    expect(redis.eval).toHaveBeenCalledTimes(1) // lock released
  })
})
