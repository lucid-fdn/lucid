/**
 * dag_status — Phase 4N-d, Task 76.
 *
 * Read-only agent-facing tool that returns a snapshot of a live DAG:
 * status, node counters, budget consumption (live + cumulative), and
 * the most recent mutations. Reads counters directly from the
 * `orchestration_dags` row (no graph scan), the live token counter
 * from Redis via `BudgetLedger.getLiveTokens`, and the cumulative
 * token cost + mutation history from Postgres.
 *
 * Capability: `read:orchestration` (auto-granted, read-only).
 *
 * Never throws — the agent loop expects string results.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { BudgetLedger } from '../../pulse/dag/budget-ledger.js'
import type { IPulseRedisAdapter } from '../../pulse/adapters/types.js'

const RECENT_MUTATIONS_LIMIT = 10

export interface DagStatusParams {
  dag_id: string
}

export interface DagStatusContext {
  supabase: SupabaseClient
  redis: IPulseRedisAdapter | null
  orgId: string
}

interface DagHeaderRow {
  id: string
  org_id: string
  status: string
  graph_version: number
  total_nodes: number
  completed_nodes: number
  failed_nodes: number
  ready_nodes: number
  budget_max_tokens: number | null
  budget_max_usd: string | null
  started_at: string | null
  completed_at: string | null
}

interface MutationRow {
  id: string
  mutation_type: string
  source: string
  applied_graph_version: number
  applied_at: string
  idempotency_key: string
}

export async function toolDagStatus(
  params: DagStatusParams,
  ctx: DagStatusContext,
): Promise<string> {
  if (!params.dag_id || typeof params.dag_id !== 'string') {
    return JSON.stringify({ error: 'dag_id is required' })
  }

  try {
    // 1. DAG header — single-row counter read, no graph scan.
    const { data: dag, error: dagErr } = await ctx.supabase
      .from('orchestration_dags')
      .select(
        'id, org_id, status, graph_version, total_nodes, completed_nodes, failed_nodes, ready_nodes, budget_max_tokens, budget_max_usd, started_at, completed_at',
      )
      .eq('id', params.dag_id)
      .maybeSingle()

    if (dagErr) {
      return JSON.stringify({ error: `dag_status failed: ${dagErr.message}` })
    }
    if (!dag) {
      return JSON.stringify({ error: `dag not found: ${params.dag_id}` })
    }

    const header = dag as DagHeaderRow

    // Org isolation guard — agents can only inspect DAGs in their org.
    if (header.org_id !== ctx.orgId) {
      return JSON.stringify({ error: `dag not found: ${params.dag_id}` })
    }

    // 2. Budget — live counter from Redis, cumulative from DB ledger.
    const ledger = new BudgetLedger(ctx.supabase, ctx.redis)
    const tokensLive = await ledger.getLiveTokens(params.dag_id)
    const tokensCumulative = await loadCumulativeTokens(ctx.supabase, params.dag_id)

    // 3. Recent mutations — last N from the audit log, newest first.
    const { data: mutationRows, error: mutErr } = await ctx.supabase
      .from('orchestration_dag_mutations')
      .select('id, mutation_type, source, applied_graph_version, applied_at, idempotency_key')
      .eq('dag_id', params.dag_id)
      .order('applied_at', { ascending: false })
      .limit(RECENT_MUTATIONS_LIMIT)

    if (mutErr) {
      return JSON.stringify({ error: `dag_status mutations failed: ${mutErr.message}` })
    }

    const recentMutations = ((mutationRows ?? []) as MutationRow[]).map((m) => ({
      id: m.id,
      mutation_type: m.mutation_type,
      source: m.source,
      applied_graph_version: m.applied_graph_version,
      applied_at: m.applied_at,
      idempotency_key: m.idempotency_key,
    }))

    return JSON.stringify({
      dag_id: header.id,
      status: header.status,
      graph_version: header.graph_version,
      total: header.total_nodes,
      completed: header.completed_nodes,
      failed: header.failed_nodes,
      ready: header.ready_nodes,
      started_at: header.started_at,
      completed_at: header.completed_at,
      budget: {
        tokensLive,
        tokensUsed: tokensCumulative,
        tokensCap: header.budget_max_tokens,
        usdCap: header.budget_max_usd,
      },
      recentMutations,
    })
  } catch (err) {
    return JSON.stringify({
      error: `dag_status failed: ${err instanceof Error ? err.message : String(err)}`,
    })
  }
}

/**
 * Load the most recent cumulative token consumption from the budget
 * ledger. The ledger writes a new row on every commit/release, with
 * `cumulative` set to `previous + delta` so the most recent row is
 * the running total. Returns 0 if no events exist.
 */
async function loadCumulativeTokens(
  supabase: SupabaseClient,
  dagId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('orchestration_dag_budget_events')
    .select('cumulative')
    .eq('dag_id', dagId)
    .in('event_type', ['tokens', 'reservation', 'release'])
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return 0
  const n = Number((data as { cumulative: number }).cumulative)
  return Number.isFinite(n) ? n : 0
}
