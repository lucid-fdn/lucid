/**
 * PM Sync DB Helpers — Unit Tests
 *
 * Covers the row → object mapping for human_work_items, org_pm_config, and
 * work_item_external_refs, plus the behavior of loadOrgPmConfig's primary
 * fallback and recordExternalRefFailure's attempts counter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  loadWorkItemLite,
  loadOrgPmConfig,
  loadExternalRef,
  upsertExternalRef,
  touchExternalRefSuccess,
  recordExternalRefFailure,
} from '../db.js'

// ─── Supabase query-builder mock helpers ─────────────────────────────────────

/**
 * Build a chainable mock that captures calls and returns `result` at
 * `maybeSingle()` / `single()`. Also collects `eq()` calls so tests can
 * assert filter composition.
 */
function makeQueryChain(result: { data: unknown; error: unknown }) {
  const eqCalls: Array<[string, unknown]> = []
  const chain: Record<string, any> = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => {
      eqCalls.push([col, val])
      return chain
    }),
    upsert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
  }
  return { chain, eqCalls }
}

function makeSupabase(tables: Record<string, { data: unknown; error: unknown }>) {
  const chains: Record<string, ReturnType<typeof makeQueryChain>> = {}
  const from = vi.fn((table: string) => {
    if (!chains[table]) {
      chains[table] = makeQueryChain(tables[table] ?? { data: null, error: null })
    }
    return chains[table].chain
  })
  return { supabase: { from } as any, chains, from }
}

// ─── loadWorkItemLite ────────────────────────────────────────────────────────

describe('loadWorkItemLite', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when no row exists', async () => {
    const { supabase } = makeSupabase({
      human_work_items: { data: null, error: null },
    })
    await expect(loadWorkItemLite(supabase, 'wi-1')).resolves.toBeNull()
  })

  it('maps row columns → HumanWorkItemLite shape', async () => {
    const row = {
      id: 'wi-1',
      org_id: 'org-1',
      title: 'Fix bug',
      description: 'desc',
      priority: 'high',
      labels: ['bug', 'p1'],
      status: 'in_progress',
      resolution: null,
      assignee_user_id: 'user-42',
      assignee_role: 'ops',
      due_at: '2026-04-10T00:00:00.000Z',
      created_at: '2026-04-08T00:00:00.000Z',
      updated_at: '2026-04-08T00:00:00.000Z',
      dag_id: 'dag-1',
      dag_node_id: 'node-1',
    }
    const { supabase } = makeSupabase({
      human_work_items: { data: row, error: null },
    })

    const result = await loadWorkItemLite(supabase, 'wi-1')
    expect(result).toMatchObject({
      id: 'wi-1',
      orgId: 'org-1',
      title: 'Fix bug',
      description: 'desc',
      priority: 'high',
      labels: ['bug', 'p1'],
      status: 'in_progress',
      assigneeUserId: 'user-42',
      assigneeRole: 'ops',
      dueAt: '2026-04-10T00:00:00.000Z',
      dagContext: { dagId: 'dag-1', dagNodeId: 'node-1', downstreamBlockedCount: 0 },
    })
  })

  it('fills defaults for nullable columns', async () => {
    const { supabase } = makeSupabase({
      human_work_items: {
        data: {
          id: 'wi-2',
          org_id: 'org-1',
          title: 't',
          description: null,
          priority: null,
          labels: null,
          status: null,
          assignee_user_id: null,
          assignee_role: null,
          due_at: null,
          created_at: 'x',
          updated_at: 'y',
          dag_id: null,
          dag_node_id: null,
        },
        error: null,
      },
    })

    const result = await loadWorkItemLite(supabase, 'wi-2')
    expect(result).toMatchObject({
      priority: 'normal',
      labels: [],
      status: 'open',
      dagContext: null,
    })
  })

  it('throws on supabase error', async () => {
    const { supabase } = makeSupabase({
      human_work_items: { data: null, error: { message: 'boom' } },
    })
    await expect(loadWorkItemLite(supabase, 'wi-1')).rejects.toThrow('loadWorkItemLite failed: boom')
  })
})

// ─── loadOrgPmConfig ─────────────────────────────────────────────────────────

describe('loadOrgPmConfig', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by is_primary when provider is omitted', async () => {
    const row = {
      id: 'cfg-1',
      org_id: 'org-1',
      provider: 'linear',
      enabled: true,
      is_primary: true,
      nango_connection_id: 'nango-1',
      config: { teamId: 't1' },
      webhook_secret: null,
      created_by: null,
      created_at: 'x',
      updated_at: 'y',
    }
    const { supabase, chains } = makeSupabase({
      org_pm_config: { data: row, error: null },
    })

    const result = await loadOrgPmConfig(supabase, 'org-1')
    expect(result).toMatchObject({
      id: 'cfg-1',
      provider: 'linear',
      isPrimary: true,
      nangoConnectionId: 'nango-1',
      config: { teamId: 't1' },
    })

    // Verify filter composition
    const cols = chains.org_pm_config.eqCalls.map(([c]) => c)
    expect(cols).toContain('org_id')
    expect(cols).toContain('enabled')
    expect(cols).toContain('is_primary')
    expect(cols).not.toContain('provider')
  })

  it('filters by provider when explicitly passed', async () => {
    const { supabase, chains } = makeSupabase({
      org_pm_config: { data: null, error: null },
    })

    await loadOrgPmConfig(supabase, 'org-1', 'jira')
    const cols = chains.org_pm_config.eqCalls.map(([c]) => c)
    expect(cols).toContain('provider')
    expect(cols).not.toContain('is_primary')
    const providerEq = chains.org_pm_config.eqCalls.find(([c]) => c === 'provider')
    expect(providerEq?.[1]).toBe('jira')
  })

  it('returns null when no config row exists', async () => {
    const { supabase } = makeSupabase({
      org_pm_config: { data: null, error: null },
    })
    await expect(loadOrgPmConfig(supabase, 'org-1')).resolves.toBeNull()
  })
})

// ─── loadExternalRef ─────────────────────────────────────────────────────────

describe('loadExternalRef', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps row → ExternalRefRow', async () => {
    const { supabase } = makeSupabase({
      work_item_external_refs: {
        data: {
          id: 'ref-1',
          work_item_id: 'wi-1',
          org_id: 'org-1',
          provider: 'linear',
          external_id: 'LIN-1',
          external_url: 'https://linear.app/i/LIN-1',
          metadata: { identifier: 'LIN-1' },
          created_at: 'x',
          last_synced_at: 'y',
          last_sync_error: null,
          sync_attempts: 2,
        },
        error: null,
      },
    })

    const result = await loadExternalRef(supabase, 'wi-1', 'linear')
    expect(result).toMatchObject({
      id: 'ref-1',
      workItemId: 'wi-1',
      provider: 'linear',
      externalId: 'LIN-1',
      metadata: { identifier: 'LIN-1' },
      syncAttempts: 2,
    })
  })

  it('returns null when no row', async () => {
    const { supabase } = makeSupabase({
      work_item_external_refs: { data: null, error: null },
    })
    await expect(loadExternalRef(supabase, 'wi-1', 'linear')).resolves.toBeNull()
  })
})

// ─── upsertExternalRef ───────────────────────────────────────────────────────

describe('upsertExternalRef', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts and returns the mapped row', async () => {
    const row = {
      id: 'ref-1',
      work_item_id: 'wi-1',
      org_id: 'org-1',
      provider: 'linear',
      external_id: 'LIN-1',
      external_url: 'https://linear.app/i/LIN-1',
      metadata: {},
      created_at: 'x',
      last_synced_at: 'y',
      last_sync_error: null,
      sync_attempts: 0,
    }
    const { supabase, chains } = makeSupabase({
      work_item_external_refs: { data: row, error: null },
    })

    const result = await upsertExternalRef(supabase, {
      workItemId: 'wi-1',
      orgId: 'org-1',
      ref: {
        provider: 'linear',
        externalId: 'LIN-1',
        externalUrl: 'https://linear.app/i/LIN-1',
        metadata: { identifier: 'LIN-1' },
      },
    })

    expect(result).toMatchObject({ id: 'ref-1', externalId: 'LIN-1' })
    expect(chains.work_item_external_refs.chain.upsert).toHaveBeenCalledTimes(1)
    const [payload, options] = (chains.work_item_external_refs.chain.upsert as any).mock.calls[0]
    expect(payload).toMatchObject({
      work_item_id: 'wi-1',
      provider: 'linear',
      external_id: 'LIN-1',
      last_sync_error: null,
      sync_attempts: 0,
    })
    expect(options).toMatchObject({ onConflict: 'work_item_id,provider' })
  })

  it('throws when upsert errors', async () => {
    const { supabase } = makeSupabase({
      work_item_external_refs: { data: null, error: { message: 'dup' } },
    })
    await expect(
      upsertExternalRef(supabase, {
        workItemId: 'wi-1',
        orgId: 'org-1',
        ref: { provider: 'linear', externalId: 'LIN-1', externalUrl: 'u' },
      }),
    ).rejects.toThrow(/upsertExternalRef failed/)
  })
})

// ─── touchExternalRefSuccess ─────────────────────────────────────────────────

describe('touchExternalRefSuccess', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clears error and resets attempts counter', async () => {
    const { supabase, chains } = makeSupabase({
      work_item_external_refs: { data: null, error: null },
    })
    await touchExternalRefSuccess(supabase, 'ref-1')

    expect(chains.work_item_external_refs.chain.update).toHaveBeenCalledTimes(1)
    const [patch] = (chains.work_item_external_refs.chain.update as any).mock.calls[0]
    expect(patch).toMatchObject({ last_sync_error: null, sync_attempts: 0 })
    expect(patch.last_synced_at).toBeTypeOf('string')
  })

  it('throws when update errors', async () => {
    const chain: Record<string, any> = {}
    chain.update = vi.fn(() => chain)
    chain.eq = vi.fn(() => Promise.resolve({ data: null, error: { message: 'nope' } }))
    const supabase = { from: vi.fn(() => chain) } as any

    await expect(touchExternalRefSuccess(supabase, 'ref-1')).rejects.toThrow(
      /touchExternalRefSuccess failed/,
    )
  })
})

// ─── recordExternalRefFailure ────────────────────────────────────────────────

describe('recordExternalRefFailure', () => {
  beforeEach(() => vi.clearAllMocks())

  it('increments sync_attempts based on current value', async () => {
    // First call reads existing attempts, second call writes the update.
    // makeQueryChain returns the same `data` for every maybeSingle() call
    // on the same table, which is what we want: select returns {sync_attempts: 3}.
    const { supabase, chains } = makeSupabase({
      work_item_external_refs: { data: { sync_attempts: 3 }, error: null },
    })

    await recordExternalRefFailure(supabase, 'ref-1', 'linear 500')

    expect(chains.work_item_external_refs.chain.update).toHaveBeenCalledTimes(1)
    const [patch] = (chains.work_item_external_refs.chain.update as any).mock.calls[0]
    expect(patch).toMatchObject({ sync_attempts: 4, last_sync_error: 'linear 500' })
  })

  it('starts at 1 when no prior row is found', async () => {
    const { supabase, chains } = makeSupabase({
      work_item_external_refs: { data: null, error: null },
    })
    await recordExternalRefFailure(supabase, 'ref-1', 'err')

    const [patch] = (chains.work_item_external_refs.chain.update as any).mock.calls[0]
    expect(patch.sync_attempts).toBe(1)
  })

  it('truncates long error messages to 2000 chars', async () => {
    const { supabase, chains } = makeSupabase({
      work_item_external_refs: { data: null, error: null },
    })
    const longMsg = 'x'.repeat(5000)
    await recordExternalRefFailure(supabase, 'ref-1', longMsg)

    const [patch] = (chains.work_item_external_refs.chain.update as any).mock.calls[0]
    expect(patch.last_sync_error.length).toBe(2000)
  })

  it('throws when update errors', async () => {
    // Select returns ok, update returns an error.
    const baseChain = makeQueryChain({ data: null, error: null })
    const updateErrorChain: Record<string, any> = { ...baseChain.chain }
    updateErrorChain.update = vi.fn(() => updateErrorChain)
    updateErrorChain.eq = vi.fn(() => {
      return Promise.resolve({ data: null, error: { message: 'update failed' } })
    })

    let callCount = 0
    const supabase = {
      from: vi.fn(() => {
        callCount++
        // First call: select path (returns null data). Second call: update path.
        if (callCount === 1) return baseChain.chain
        return updateErrorChain
      }),
    } as any

    await expect(recordExternalRefFailure(supabase, 'ref-1', 'err')).rejects.toThrow(
      /recordExternalRefFailure failed/,
    )
  })
})
