/**
 * dag_status agent tool — Phase 4N-d, Task 76.
 *
 * Pins the read-only snapshot envelope returned by `toolDagStatus`:
 *   - missing dag_id → structured error
 *   - dag not found → structured error (no leak)
 *   - cross-org inspection → "dag not found" (org isolation masks existence)
 *   - happy path → header counters, budget (live + cumulative), mutations
 *   - redis === null → tokensLive degrades gracefully to 0
 *   - no budget events → tokensUsed = 0
 *   - mutations table error → surfaces structured error
 */

import { describe, it, expect, vi } from 'vitest'
import { toolDagStatus } from '../../../agent/runtime-tools/dag-status.js'

const DAG_ID = '11111111-1111-4111-8111-111111111111'
const ORG_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_ORG = '33333333-3333-4333-8333-333333333333'

interface HarnessOpts {
  /** DAG row returned by the header SELECT; null = not found. */
  dag?: Record<string, unknown> | null
  dagError?: { message: string } | null
  /** Last budget event row; null = no events. */
  budgetRow?: { cumulative: number | string } | null
  budgetError?: { message: string } | null
  /** Mutation rows (newest first). */
  mutations?: Array<Record<string, unknown>>
  mutationsError?: { message: string } | null
  /** Live token string returned from fake redis GET; undefined = redis null. */
  liveTokens?: string | null
}

function buildHarness(opts: HarnessOpts) {
  const dagRow = opts.dag === undefined
    ? {
        id: DAG_ID,
        org_id: ORG_ID,
        status: 'running',
        graph_version: 3,
        total_nodes: 5,
        completed_nodes: 2,
        failed_nodes: 0,
        ready_nodes: 1,
        budget_max_tokens: 100000,
        budget_max_usd: '5.00',
        started_at: '2026-04-08T10:00:00.000Z',
        completed_at: null,
      }
    : opts.dag

  const from = vi.fn((table: string) => {
    if (table === 'orchestration_dags') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: dagRow,
              error: opts.dagError ?? null,
            })),
          })),
        })),
      }
    }
    if (table === 'orchestration_dag_budget_events') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: opts.budgetRow ?? null,
                    error: opts.budgetError ?? null,
                  })),
                })),
              })),
            })),
          })),
        })),
      }
    }
    if (table === 'orchestration_dag_mutations') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(async () => ({
                data: opts.mutations ?? [],
                error: opts.mutationsError ?? null,
              })),
            })),
          })),
        })),
      }
    }
    throw new Error(`[dag_status harness] unexpected table: ${table}`)
  })

  const supabase = { from } as any
  const redis =
    opts.liveTokens === undefined
      ? null
      : ({
          get: vi.fn(async () => opts.liveTokens ?? null),
        } as any)

  return { supabase, redis }
}

describe('toolDagStatus', () => {
  it('rejects missing dag_id with a structured envelope', async () => {
    const { supabase, redis } = buildHarness({})
    const result = await toolDagStatus({ dag_id: '' }, { supabase, redis, orgId: ORG_ID })
    const envelope = JSON.parse(result)
    expect(envelope.error).toContain('dag_id')
  })

  it('returns "dag not found" when the DAG row is missing', async () => {
    const { supabase, redis } = buildHarness({ dag: null })
    const result = await toolDagStatus({ dag_id: DAG_ID }, { supabase, redis, orgId: ORG_ID })
    const envelope = JSON.parse(result)
    expect(envelope.error).toContain('dag not found')
  })

  it('returns "dag not found" across orgs (no existence leak)', async () => {
    const { supabase, redis } = buildHarness({
      dag: {
        id: DAG_ID,
        org_id: OTHER_ORG,
        status: 'running',
        graph_version: 1,
        total_nodes: 1,
        completed_nodes: 0,
        failed_nodes: 0,
        ready_nodes: 1,
        budget_max_tokens: null,
        budget_max_usd: null,
        started_at: null,
        completed_at: null,
      },
    })
    const result = await toolDagStatus({ dag_id: DAG_ID }, { supabase, redis, orgId: ORG_ID })
    const envelope = JSON.parse(result)
    expect(envelope.error).toContain('dag not found')
  })

  it('surfaces dag header select errors', async () => {
    const { supabase, redis } = buildHarness({
      dag: null,
      dagError: { message: 'boom' },
    })
    const result = await toolDagStatus({ dag_id: DAG_ID }, { supabase, redis, orgId: ORG_ID })
    const envelope = JSON.parse(result)
    expect(envelope.error).toContain('boom')
  })

  it('happy path: returns counters, budget, and recent mutations', async () => {
    const { supabase, redis } = buildHarness({
      budgetRow: { cumulative: 42000 },
      liveTokens: '4200',
      mutations: [
        {
          id: 'mut-1',
          mutation_type: 'expand',
          source: 'agent',
          applied_graph_version: 3,
          applied_at: '2026-04-08T10:05:00.000Z',
          idempotency_key: 'expand-1',
        },
        {
          id: 'mut-2',
          mutation_type: 'expand',
          source: 'agent',
          applied_graph_version: 2,
          applied_at: '2026-04-08T10:02:00.000Z',
          idempotency_key: 'expand-0',
        },
      ],
    })

    const result = await toolDagStatus(
      { dag_id: DAG_ID },
      { supabase, redis, orgId: ORG_ID },
    )
    const envelope = JSON.parse(result) as {
      dag_id: string
      status: string
      graph_version: number
      total: number
      completed: number
      failed: number
      ready: number
      started_at: string | null
      completed_at: string | null
      budget: {
        tokensLive: number
        tokensUsed: number
        tokensCap: number | null
        usdCap: string | null
      }
      recentMutations: Array<Record<string, unknown>>
      error?: string
    }

    expect(envelope.error).toBeUndefined()
    expect(envelope.dag_id).toBe(DAG_ID)
    expect(envelope.status).toBe('running')
    expect(envelope.graph_version).toBe(3)
    expect(envelope.total).toBe(5)
    expect(envelope.completed).toBe(2)
    expect(envelope.failed).toBe(0)
    expect(envelope.ready).toBe(1)
    expect(envelope.budget.tokensLive).toBe(4200)
    expect(envelope.budget.tokensUsed).toBe(42000)
    expect(envelope.budget.tokensCap).toBe(100000)
    expect(envelope.budget.usdCap).toBe('5.00')
    expect(envelope.recentMutations).toHaveLength(2)
    expect(envelope.recentMutations[0].id).toBe('mut-1')
    expect(envelope.recentMutations[0].mutation_type).toBe('expand')
  })

  it('degrades gracefully when redis is null (tokensLive = 0)', async () => {
    const { supabase, redis } = buildHarness({
      budgetRow: { cumulative: 1234 },
      // liveTokens omitted → redis is null
    })
    expect(redis).toBeNull()
    const result = await toolDagStatus(
      { dag_id: DAG_ID },
      { supabase, redis, orgId: ORG_ID },
    )
    const envelope = JSON.parse(result)
    expect(envelope.error).toBeUndefined()
    expect(envelope.budget.tokensLive).toBe(0)
    expect(envelope.budget.tokensUsed).toBe(1234)
  })

  it('returns tokensUsed = 0 when no budget events exist', async () => {
    const { supabase, redis } = buildHarness({
      budgetRow: null,
      liveTokens: '0',
    })
    const result = await toolDagStatus(
      { dag_id: DAG_ID },
      { supabase, redis, orgId: ORG_ID },
    )
    const envelope = JSON.parse(result)
    expect(envelope.error).toBeUndefined()
    expect(envelope.budget.tokensUsed).toBe(0)
  })

  it('surfaces mutations table errors in the envelope', async () => {
    const { supabase, redis } = buildHarness({
      budgetRow: { cumulative: 0 },
      liveTokens: '0',
      mutationsError: { message: 'mutations down' },
    })
    const result = await toolDagStatus(
      { dag_id: DAG_ID },
      { supabase, redis, orgId: ORG_ID },
    )
    const envelope = JSON.parse(result)
    expect(envelope.error).toContain('mutations down')
  })
})
