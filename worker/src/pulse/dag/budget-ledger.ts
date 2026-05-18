/**
 * BudgetLedger — Phase 4N-d, Task 66.
 *
 * Enforces per-DAG token/USD budget caps with atomic Redis reservations
 * + a durable DB audit trail in `orchestration_dag_budget_events`.
 *
 * Design split (spec §4.5):
 *   - Redis owns the LIVE counter (fast, atomic reserve/release).
 *     Key: `pulse:dag:budget:{${dagId}}:tokens` — hash-tagged to keep
 *     all per-DAG budget keys on the same Redis cluster slot.
 *   - Postgres owns the CUMULATIVE history
 *     (`orchestration_dag_budget_events`). Cumulative is computed as
 *     `previous_cumulative + delta` so the ledger replays deterministically
 *     in insertion order.
 *
 * The scheduler is the single writer during normal operation; operators
 * may INSERT `reservation` / `release` events directly to pause/resume
 * a stuck DAG (see `budget-pause-resume.test.ts`).
 *
 * Fail-open rules (dev / test / Redis down):
 *   - If `redis === null` → `tryReserve` returns true (no enforcement).
 *   - If `maxTokens === null` → `tryReserve` returns true (no cap set).
 * This keeps the DAG foundation usable in unit tests that don't wire a
 * real Redis adapter; production wiring always provides both.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { IPulseRedisAdapter } from '../adapters/types.js'

/**
 * Default token estimate for a node when the scheduler doesn't know the
 * real cost yet (PromotedNode doesn't carry payload in Phase 4N-a). The
 * scheduler passes this into `tryReserve`; when actual usage comes back
 * via `commit`, any leftover headroom is released back into the pool.
 */
export const DEFAULT_ESTIMATED_TOKENS_PER_NODE = 1000

/**
 * Atomic reserve: INCRBY then rollback if over cap.
 * Returns 1 on success, 0 on overflow (reservation was rolled back).
 */
const RESERVE_LUA = `
local v = redis.call('INCRBY', KEYS[1], ARGV[1])
if v > tonumber(ARGV[2]) then
  redis.call('DECRBY', KEYS[1], ARGV[1])
  return 0
end
return 1
`.trim()

/**
 * Floor-guarded release: DECRBY but clamp to 0 if the counter would
 * go negative. Prevents underflow if commit/release are called twice.
 */
const FLOOR_DECR_LUA = `
local v = redis.call('DECRBY', KEYS[1], ARGV[1])
if v < 0 then
  redis.call('SET', KEYS[1], '0')
  return 0
end
return v
`.trim()

/**
 * Plain INCRBY used by `commit()` to charge an over-spend back onto
 * the live counter so it never drifts below the cumulative truth in
 * the DB ledger. No cap check — the work already ran.
 */
const INCR_BY_LUA = `
return redis.call('INCRBY', KEYS[1], ARGV[1])
`.trim()

export type BudgetEventType = 'tokens' | 'reservation' | 'release'

interface BudgetLedgerOptions {
  defaultEstimatedTokens?: number
}

export class BudgetLedger {
  private readonly defaultEstimatedTokens: number

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly redis: IPulseRedisAdapter | null,
    options: BudgetLedgerOptions = {},
  ) {
    this.defaultEstimatedTokens =
      options.defaultEstimatedTokens ?? DEFAULT_ESTIMATED_TOKENS_PER_NODE
  }

  /** Hash-tagged so all per-dag budget keys share a cluster slot. */
  private tokenKey(dagId: string): string {
    return `pulse:dag:budget:{${dagId}}:tokens`
  }

  getDefaultEstimatedTokens(): number {
    return this.defaultEstimatedTokens
  }

  /**
   * Attempt to reserve `estimatedTokens` against `maxTokens`. Atomic via
   * Lua so two concurrent reservations can never both squeak through at
   * the cap boundary.
   *
   * Fail-open when:
   *   - redis adapter is null (unit tests, degraded mode)
   *   - maxTokens is null (DAG has no cap configured)
   *
   * @returns true if the reservation was accepted, false if it would
   * have pushed the live counter past `maxTokens` (in which case the
   * counter was rolled back and the caller should leave the node
   * 'pending').
   */
  async tryReserve(
    dagId: string,
    estimatedTokens: number,
    maxTokens: number | null,
  ): Promise<boolean> {
    if (!this.redis || maxTokens == null) return true
    if (estimatedTokens <= 0) return true

    const result = await this.redis.eval(
      RESERVE_LUA,
      [this.tokenKey(dagId)],
      [String(estimatedTokens), String(maxTokens)],
    )
    return Number(result) === 1
  }

  /**
   * Commit the actual token usage for a completed node.
   *
   * Reconciles the live Redis counter against the true consumption:
   *   - `actualTokens < reservedTokens` — release the leftover headroom
   *     so downstream nodes can spend it (DECRBY with floor guard).
   *   - `actualTokens > reservedTokens` — charge the overage so the
   *     live counter stays truthful (INCRBY). Without this, a node
   *     that underestimated its cost would drift the counter below
   *     the cumulative ledger's truth and the cap could be
   *     over-subscribed by sibling leaves.
   *
   * The DB ledger always records the true consumed amount as a 'tokens'
   * event so the audit trail reflects reality.
   */
  async commit(
    dagId: string,
    nodeId: string,
    actualTokens: number,
    reservedTokens: number,
  ): Promise<void> {
    if (actualTokens < 0) actualTokens = 0
    if (reservedTokens < 0) reservedTokens = 0

    // Reconcile the live counter against the true consumption.
    if (this.redis) {
      const diff = reservedTokens - actualTokens
      if (diff > 0) {
        // Under-spent: release leftover headroom back into the pool.
        await this.redis.eval(
          FLOOR_DECR_LUA,
          [this.tokenKey(dagId)],
          [String(diff)],
        )
      } else if (diff < 0) {
        // Over-spent: charge the overage so the live counter does
        // not drift below cumulative truth. No cap check here — the
        // work already ran, and sibling leaves will see the correct
        // headroom on their next tryReserve.
        await this.redis.eval(
          INCR_BY_LUA,
          [this.tokenKey(dagId)],
          [String(-diff)],
        )
      }
    }

    await this.insertEvent(dagId, nodeId, 'tokens', actualTokens)
  }

  /**
   * Release a full reservation without consumption — used when a node
   * fails after tryReserve succeeded but before actual work ran, or
   * when the scheduler needs to roll back a queued reservation.
   *
   * Writes a `release` event with a NEGATIVE delta so the cumulative
   * ledger nets out correctly (reservation + release = 0).
   */
  async release(dagId: string, nodeId: string, reservedTokens: number): Promise<void> {
    if (reservedTokens <= 0) return

    if (this.redis) {
      await this.redis.eval(
        FLOOR_DECR_LUA,
        [this.tokenKey(dagId)],
        [String(reservedTokens)],
      )
    }

    await this.insertEvent(dagId, nodeId, 'release', -reservedTokens)
  }

  /**
   * Current live token counter from Redis (0 if no counter exists yet
   * or Redis is unavailable). Useful for `dag_status` tool + tests.
   */
  async getLiveTokens(dagId: string): Promise<number> {
    if (!this.redis) return 0
    const raw = await this.redis.get(this.tokenKey(dagId))
    if (raw == null) return 0
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  }

  // ------------------------------------------------------------------
  // Internals — DB ledger
  // ------------------------------------------------------------------

  /**
   * Insert a budget event via the `dag_insert_budget_event` RPC, which
   * wraps a per-dag `pg_advisory_xact_lock` around the
   * load-last-cumulative + insert so two concurrent commits from
   * sibling leaves cannot both read the same `previous` and
   * under-count cumulative consumption.
   *
   * The RPC mirrors the class-level cumulative rule: token-bearing
   * events ('tokens', 'reservation', 'release') share a single stream,
   * all other types have independent streams.
   */
  private async insertEvent(
    dagId: string,
    nodeId: string | null,
    eventType: BudgetEventType,
    delta: number,
  ): Promise<void> {
    const { error } = await this.supabase.rpc('dag_insert_budget_event', {
      p_dag_id: dagId,
      p_node_id: nodeId,
      p_event_type: eventType,
      p_delta: delta,
    })
    if (error) {
      throw new Error(`[budget-ledger] insert ${eventType} failed: ${error.message}`)
    }
  }
}
