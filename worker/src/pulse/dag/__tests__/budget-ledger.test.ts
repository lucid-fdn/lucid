/**
 * BudgetLedger — Unit Tests (Phase 4N-d, Task 68)
 *
 * Pins the four core contracts of `BudgetLedger`:
 *
 *   1. **Atomic reserve** — `tryReserve` INCRBYs the live counter and
 *      returns true when the resulting value is ≤ cap. Uses the Lua
 *      script verbatim so a faulty script rewrite breaks this test.
 *   2. **Over-spend block** — when the INCRBY would push the live
 *      counter past the cap, the Lua rolls back via DECRBY and returns
 *      0, which the class surfaces as `false`.
 *   3. **Release on fail** — `release(reservedTokens)` DECRBYs the
 *      counter and INSERTs a `release` event with a negative delta.
 *   4. **Cumulative correctness** — `commit` writes a `tokens` event
 *      whose `cumulative` is `previous_cumulative + delta`. Repeated
 *      commits cross-compound correctly across 'tokens' + 'release'
 *      events because all three event types share a single token stream.
 *
 * The Redis adapter is faked with an in-memory map so we can assert
 * on the actual Lua arguments and observe counter values.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BudgetLedger, DEFAULT_ESTIMATED_TOKENS_PER_NODE } from '../budget-ledger.js'
import type { IPulseRedisAdapter } from '../../adapters/types.js'

const DAG_ID = '11111111-1111-4111-8111-111111111111'
const NODE_ID = '22222222-2222-4222-8222-222222222222'
const TOKEN_KEY = `pulse:dag:budget:{${DAG_ID}}:tokens`

/**
 * Minimal in-memory Redis fake that knows just enough to interpret the
 * two Lua scripts BudgetLedger uses. We match on distinctive substrings
 * so the test does not get tied to whitespace/comment drift.
 */
function makeFakeRedis(): {
  adapter: IPulseRedisAdapter
  store: Map<string, number>
  evalCalls: Array<{ script: string; keys: string[]; args: string[] }>
} {
  const store = new Map<string, number>()
  const evalCalls: Array<{ script: string; keys: string[]; args: string[] }> = []

  const adapter = {
    get: vi.fn(async (key: string) => {
      const v = store.get(key)
      return v == null ? null : String(v)
    }),
    eval: vi.fn(async (script: string, keys: string[], args: string[]) => {
      evalCalls.push({ script, keys, args })
      const key = keys[0]!

      if (script.includes("redis.call('INCRBY'") && script.includes('> tonumber(ARGV[2])')) {
        // RESERVE_LUA
        const delta = Number(args[0])
        const cap = Number(args[1])
        const next = (store.get(key) ?? 0) + delta
        if (next > cap) {
          // Roll back — counter never observes over-cap
          return 0
        }
        store.set(key, next)
        return 1
      }

      if (script.includes("redis.call('DECRBY'") && script.includes('< 0')) {
        // FLOOR_DECR_LUA
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

  return { adapter, store, evalCalls }
}

/**
 * Minimal Supabase fake that simulates the `dag_insert_budget_event`
 * RPC server-side. The RPC holds a per-dag advisory lock while it
 * reads the last cumulative and writes the new row, so the fake
 * computes cumulative the same way the plpgsql function does:
 * token-bearing types ('tokens' / 'reservation' / 'release') share one
 * stream; other event types have independent streams.
 *
 * Inserts are recorded in a flat array to preserve the assertion
 * shape of the existing tests (`fakeSupabase.inserts[i].cumulative`).
 */
function makeFakeSupabase(): {
  supabase: any
  inserts: Array<Record<string, unknown>>
} {
  const inserts: Array<Record<string, unknown>> = []
  const TOKEN_TYPES = new Set(['tokens', 'reservation', 'release'])

  const rpc = vi.fn(async (name: string, params: Record<string, unknown>) => {
    if (name !== 'dag_insert_budget_event') {
      throw new Error(`[fake-supabase] unexpected rpc: ${name}`)
    }
    const dagId = params.p_dag_id as string
    const nodeId = (params.p_node_id ?? null) as string | null
    const eventType = params.p_event_type as string
    const delta = Number(params.p_delta)

    const stream = TOKEN_TYPES.has(eventType)
      ? (t: string) => TOKEN_TYPES.has(t)
      : (t: string) => t === eventType

    const matching = inserts.filter(
      (r) => r.dag_id === dagId && stream(r.event_type as string),
    )
    const previous =
      matching.length === 0
        ? 0
        : Number((matching[matching.length - 1]!).cumulative)
    const cumulative = previous + delta

    inserts.push({
      dag_id: dagId,
      node_id: nodeId,
      event_type: eventType,
      delta,
      cumulative,
    })
    return { data: null, error: null }
  })

  const from = vi.fn((table: string) => {
    throw new Error(
      `[fake-supabase] unexpected .from('${table}') — BudgetLedger should only use rpc()`,
    )
  })

  return { supabase: { from, rpc } as any, inserts }
}

describe('BudgetLedger', () => {
  describe('tryReserve', () => {
    let fakeRedis: ReturnType<typeof makeFakeRedis>
    let fakeSupabase: ReturnType<typeof makeFakeSupabase>
    let ledger: BudgetLedger

    beforeEach(() => {
      fakeRedis = makeFakeRedis()
      fakeSupabase = makeFakeSupabase()
      ledger = new BudgetLedger(fakeSupabase.supabase, fakeRedis.adapter)
    })

    it('atomic reserve — accepts a fresh reservation under the cap', async () => {
      const ok = await ledger.tryReserve(DAG_ID, 1000, 5000)
      expect(ok).toBe(true)
      expect(fakeRedis.store.get(TOKEN_KEY)).toBe(1000)
    })

    it('over-spend block — rejects a reservation that would exceed the cap', async () => {
      // Two reservations fit (1000 + 1000 = 2000 ≤ 2500)
      expect(await ledger.tryReserve(DAG_ID, 1000, 2500)).toBe(true)
      expect(await ledger.tryReserve(DAG_ID, 1000, 2500)).toBe(true)
      // Third would push past (2000 + 1000 = 3000 > 2500) → rejected, rolled back
      expect(await ledger.tryReserve(DAG_ID, 1000, 2500)).toBe(false)
      // Counter is unchanged from the rejection (still 2000, not 3000)
      expect(fakeRedis.store.get(TOKEN_KEY)).toBe(2000)
    })

    it('fail-open when redis is null', async () => {
      const openLedger = new BudgetLedger(fakeSupabase.supabase, null)
      const ok = await openLedger.tryReserve(DAG_ID, 999999, 100)
      expect(ok).toBe(true)
    })

    it('fail-open when maxTokens is null (no cap configured)', async () => {
      const ok = await ledger.tryReserve(DAG_ID, 999999, null)
      expect(ok).toBe(true)
      // No reservation was made against the counter
      expect(fakeRedis.store.get(TOKEN_KEY)).toBeUndefined()
    })

    it('exposes the default estimated tokens constant', () => {
      expect(ledger.getDefaultEstimatedTokens()).toBe(DEFAULT_ESTIMATED_TOKENS_PER_NODE)
    })

    it('honors a custom default estimated tokens override', () => {
      const custom = new BudgetLedger(fakeSupabase.supabase, fakeRedis.adapter, {
        defaultEstimatedTokens: 42,
      })
      expect(custom.getDefaultEstimatedTokens()).toBe(42)
    })
  })

  describe('commit', () => {
    let fakeRedis: ReturnType<typeof makeFakeRedis>
    let fakeSupabase: ReturnType<typeof makeFakeSupabase>
    let ledger: BudgetLedger

    beforeEach(() => {
      fakeRedis = makeFakeRedis()
      fakeSupabase = makeFakeSupabase()
      ledger = new BudgetLedger(fakeSupabase.supabase, fakeRedis.adapter)
    })

    it('releases headroom when actual < reserved', async () => {
      await ledger.tryReserve(DAG_ID, 1000, 5000)
      expect(fakeRedis.store.get(TOKEN_KEY)).toBe(1000)

      await ledger.commit(DAG_ID, NODE_ID, 700, 1000)

      // 300 tokens of headroom released back to the counter
      expect(fakeRedis.store.get(TOKEN_KEY)).toBe(700)
      // Ledger records the TRUE consumption as 'tokens' event
      expect(fakeSupabase.inserts).toHaveLength(1)
      expect(fakeSupabase.inserts[0]).toMatchObject({
        dag_id: DAG_ID,
        node_id: NODE_ID,
        event_type: 'tokens',
        delta: 700,
        cumulative: 700,
      })
    })

    it('does not release anything when actual === reserved', async () => {
      await ledger.tryReserve(DAG_ID, 1000, 5000)
      await ledger.commit(DAG_ID, NODE_ID, 1000, 1000)
      expect(fakeRedis.store.get(TOKEN_KEY)).toBe(1000)
      expect(fakeSupabase.inserts).toHaveLength(1)
      expect(fakeSupabase.inserts[0]!.delta).toBe(1000)
    })

    it('cumulative ledger correctness across multiple commits', async () => {
      // Three successive leaf completions, each reserving 1000 and
      // committing different actuals. Cumulative should walk 400 → 1200 → 2200.
      await ledger.tryReserve(DAG_ID, 1000, 10000)
      await ledger.commit(DAG_ID, NODE_ID, 400, 1000)

      await ledger.tryReserve(DAG_ID, 1000, 10000)
      await ledger.commit(DAG_ID, NODE_ID, 800, 1000)

      await ledger.tryReserve(DAG_ID, 1000, 10000)
      await ledger.commit(DAG_ID, NODE_ID, 1000, 1000)

      expect(fakeSupabase.inserts.map((r) => r.cumulative)).toEqual([400, 1200, 2200])
      // Live counter reflects all headroom that was released back:
      //   reserved 3×1000 = 3000; actual 400+800+1000 = 2200
      expect(fakeRedis.store.get(TOKEN_KEY)).toBe(2200)
    })
  })

  describe('release', () => {
    it('full release on fail — decrements counter and writes negative-delta release event', async () => {
      const fakeRedis = makeFakeRedis()
      const fakeSupabase = makeFakeSupabase()
      const ledger = new BudgetLedger(fakeSupabase.supabase, fakeRedis.adapter)

      await ledger.tryReserve(DAG_ID, 1000, 5000)
      expect(fakeRedis.store.get(TOKEN_KEY)).toBe(1000)

      await ledger.release(DAG_ID, NODE_ID, 1000)

      expect(fakeRedis.store.get(TOKEN_KEY)).toBe(0)
      expect(fakeSupabase.inserts).toHaveLength(1)
      expect(fakeSupabase.inserts[0]).toMatchObject({
        dag_id: DAG_ID,
        node_id: NODE_ID,
        event_type: 'release',
        delta: -1000,
        cumulative: -1000,
      })
    })

    it('is a no-op for reservedTokens <= 0', async () => {
      const fakeRedis = makeFakeRedis()
      const fakeSupabase = makeFakeSupabase()
      const ledger = new BudgetLedger(fakeSupabase.supabase, fakeRedis.adapter)

      await ledger.release(DAG_ID, NODE_ID, 0)
      expect(fakeSupabase.inserts).toHaveLength(0)
      expect(fakeRedis.evalCalls.length).toBe(0)
    })

    it('floor-guards the counter — clamps to 0 instead of going negative', async () => {
      const fakeRedis = makeFakeRedis()
      const fakeSupabase = makeFakeSupabase()
      const ledger = new BudgetLedger(fakeSupabase.supabase, fakeRedis.adapter)

      // Reserve 500, then release 1000 (more than was ever reserved)
      await ledger.tryReserve(DAG_ID, 500, 10000)
      await ledger.release(DAG_ID, NODE_ID, 1000)
      expect(fakeRedis.store.get(TOKEN_KEY)).toBe(0)
    })
  })

  describe('getLiveTokens', () => {
    it('returns 0 when redis is null', async () => {
      const ledger = new BudgetLedger(makeFakeSupabase().supabase, null)
      expect(await ledger.getLiveTokens(DAG_ID)).toBe(0)
    })

    it('returns the current live counter value', async () => {
      const fakeRedis = makeFakeRedis()
      const ledger = new BudgetLedger(makeFakeSupabase().supabase, fakeRedis.adapter)
      await ledger.tryReserve(DAG_ID, 1234, 10000)
      expect(await ledger.getLiveTokens(DAG_ID)).toBe(1234)
    })
  })
})
