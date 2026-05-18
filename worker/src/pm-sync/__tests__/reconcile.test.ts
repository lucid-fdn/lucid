/**
 * PM Sync Reconcile Cron — Unit Tests
 *
 * Tests the drift-detection sweep: stale ref loading, terminal-item skip,
 * successful reconcile touch, drift detection (external closed), rate-limit
 * bail-out, backoff bumping, and permanent-failure marking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../registry.js', () => ({
  listRegisteredProviders: vi.fn(),
  getAdapter: vi.fn(),
}))

vi.mock('../db.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db.js')>()
  return {
    ...actual,
    loadOrgPmConfig: vi.fn(),
    loadWorkItemLite: vi.fn(),
    loadExternalRef: vi.fn(),
    upsertExternalRef: vi.fn(),
    touchExternalRefSuccess: vi.fn(),
    recordExternalRefFailure: vi.fn(),
  }
})

const registry = await import('../registry.js')
const db = await import('../db.js')
const { reconcilePmMirrors } = await import('../reconcile.js')
const { PmSyncRateLimitError } = await import('../errors.js')

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRefRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ref-1',
    work_item_id: 'wi-1',
    org_id: 'org-1',
    provider: 'linear',
    external_id: 'LIN-1',
    external_url: 'https://linear.app/i/LIN-1',
    metadata: {},
    created_at: '2026-04-08T00:00:00.000Z',
    last_synced_at: '2026-04-07T00:00:00.000Z',
    last_sync_error: null,
    sync_attempts: 0,
    ...overrides,
  }
}

function makeOrgConfigRow() {
  return {
    id: 'cfg-1',
    orgId: 'org-1',
    provider: 'linear' as const,
    enabled: true,
    isPrimary: true,
    nangoConnectionId: 'nango-1',
    config: { teamId: 't1' },
    webhookSecret: null,
    createdAt: 'x',
    updatedAt: 'y',
    createdBy: null,
  }
}

function makeAdapter() {
  return {
    provider: 'linear',
    fetchStatus: vi.fn(),
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    closeIssue: vi.fn(),
    verifySignature: vi.fn(),
    parseWebhook: vi.fn(),
  }
}

function makeSupabase(options: {
  staleRefs?: unknown[]
  staleRefsError?: { message: string } | null
  workItemStatus?: string | null
  workItemError?: boolean
}) {
  const updateCalls: unknown[] = []
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'work_item_external_refs') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                lt: vi.fn(() => ({
                  gte: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn().mockResolvedValue({
                        data: options.staleRefs ?? [],
                        error: options.staleRefsError ?? null,
                      }),
                    })),
                  })),
                })),
              })),
            })),
            update: vi.fn((payload: unknown) => {
              updateCalls.push(payload)
              return {
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              }
            }),
          }
        }
        if (table === 'human_work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: options.workItemError
                    ? null
                    : options.workItemStatus != null
                      ? { status: options.workItemStatus }
                      : null,
                  error: options.workItemError ? { message: 'err' } : null,
                }),
              })),
            })),
          }
        }
        if (table === 'org_pm_config') {
          // loadOrgPmConfig is mocked directly — this fallback shouldn't be hit
          return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn() })) })) })) }
        }
        return {}
      }),
    } as any,
    updateCalls,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('reconcilePmMirrors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when no providers are registered', async () => {
    vi.mocked(registry.listRegisteredProviders).mockReturnValue([])
    const { supabase } = makeSupabase({})
    await reconcilePmMirrors(supabase)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('skips provider when adapter is null', async () => {
    vi.mocked(registry.listRegisteredProviders).mockReturnValue(['linear'])
    vi.mocked(registry.getAdapter).mockReturnValue(null)
    const { supabase } = makeSupabase({})
    await reconcilePmMirrors(supabase)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('skips when no stale refs found', async () => {
    vi.mocked(registry.listRegisteredProviders).mockReturnValue(['linear'])
    const adapter = makeAdapter()
    vi.mocked(registry.getAdapter).mockReturnValue(adapter as any)

    const { supabase } = makeSupabase({ staleRefs: [] })
    await reconcilePmMirrors(supabase)

    expect(adapter.fetchStatus).not.toHaveBeenCalled()
  })

  it('skips terminal work items and touches ref success', async () => {
    vi.mocked(registry.listRegisteredProviders).mockReturnValue(['linear'])
    const adapter = makeAdapter()
    vi.mocked(registry.getAdapter).mockReturnValue(adapter as any)

    const { supabase, updateCalls } = makeSupabase({
      staleRefs: [makeRefRow()],
      workItemStatus: 'done', // terminal
    })

    await reconcilePmMirrors(supabase)

    // Should touch success, not call fetchStatus
    expect(adapter.fetchStatus).not.toHaveBeenCalled()
    expect(updateCalls.length).toBe(1)
    expect(updateCalls[0]).toMatchObject({
      last_sync_error: null,
      sync_attempts: 0,
    })
  })

  it('detects drift when external issue is closed but work item is open', async () => {
    vi.mocked(registry.listRegisteredProviders).mockReturnValue(['linear'])
    const adapter = makeAdapter()
    adapter.fetchStatus.mockResolvedValue({ externalStatus: 'completed', closed: true })
    vi.mocked(registry.getAdapter).mockReturnValue(adapter as any)
    vi.mocked(db.loadOrgPmConfig).mockResolvedValue(makeOrgConfigRow())

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { supabase, updateCalls } = makeSupabase({
      staleRefs: [makeRefRow()],
      workItemStatus: 'open', // non-terminal
    })

    await reconcilePmMirrors(supabase)

    expect(adapter.fetchStatus).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('drift detected'))
    // Should still touch success (ref is acknowledged)
    expect(updateCalls.length).toBe(1)
    expect(updateCalls[0]).toMatchObject({ last_sync_error: null, sync_attempts: 0 })

    warnSpy.mockRestore()
    logSpy.mockRestore()
  })

  it('touches success when no drift detected', async () => {
    vi.mocked(registry.listRegisteredProviders).mockReturnValue(['linear'])
    const adapter = makeAdapter()
    adapter.fetchStatus.mockResolvedValue({ externalStatus: 'started', closed: false })
    vi.mocked(registry.getAdapter).mockReturnValue(adapter as any)
    vi.mocked(db.loadOrgPmConfig).mockResolvedValue(makeOrgConfigRow())

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { supabase, updateCalls } = makeSupabase({
      staleRefs: [makeRefRow()],
      workItemStatus: 'in_progress',
    })

    await reconcilePmMirrors(supabase)

    expect(adapter.fetchStatus).toHaveBeenCalledTimes(1)
    expect(updateCalls.length).toBe(1)
    expect(updateCalls[0]).toMatchObject({ last_sync_error: null, sync_attempts: 0 })

    logSpy.mockRestore()
  })

  it('bumps backoff when fetchStatus returns null (deleted external)', async () => {
    vi.mocked(registry.listRegisteredProviders).mockReturnValue(['linear'])
    const adapter = makeAdapter()
    adapter.fetchStatus.mockResolvedValue(null) // deleted
    vi.mocked(registry.getAdapter).mockReturnValue(adapter as any)
    vi.mocked(db.loadOrgPmConfig).mockResolvedValue(makeOrgConfigRow())

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { supabase, updateCalls } = makeSupabase({
      staleRefs: [makeRefRow({ sync_attempts: 0 })],
      workItemStatus: 'open',
    })

    await reconcilePmMirrors(supabase)

    // Should bump sync_attempts to 1 and set error
    expect(updateCalls.length).toBe(1)
    expect(updateCalls[0]).toMatchObject({
      sync_attempts: 1,
      last_sync_error: expect.stringContaining('deleted'),
    })
    // last_synced_at should be in the future (backoff)
    const bumped = (updateCalls[0] as any).last_synced_at
    expect(new Date(bumped).getTime()).toBeGreaterThan(Date.now() - 1000)

    logSpy.mockRestore()
  })

  it('breaks out of provider loop on rate limit error', async () => {
    vi.mocked(registry.listRegisteredProviders).mockReturnValue(['linear'])
    const adapter = makeAdapter()
    adapter.fetchStatus.mockRejectedValue(new PmSyncRateLimitError('too fast', { retryAfterMs: 5000 }))
    vi.mocked(registry.getAdapter).mockReturnValue(adapter as any)
    vi.mocked(db.loadOrgPmConfig).mockResolvedValue(makeOrgConfigRow())

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { supabase } = makeSupabase({
      staleRefs: [makeRefRow(), makeRefRow({ id: 'ref-2', work_item_id: 'wi-2' })],
      workItemStatus: 'open',
    })

    await reconcilePmMirrors(supabase)

    // Should have called fetchStatus only once (broke out after rate limit)
    expect(adapter.fetchStatus).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('rate limited'))

    warnSpy.mockRestore()
  })

  it('marks ref as permanently failed after 10 attempts', async () => {
    vi.mocked(registry.listRegisteredProviders).mockReturnValue(['linear'])
    const adapter = makeAdapter()
    adapter.fetchStatus.mockRejectedValue(new Error('flaky'))
    vi.mocked(registry.getAdapter).mockReturnValue(adapter as any)
    vi.mocked(db.loadOrgPmConfig).mockResolvedValue(makeOrgConfigRow())

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { supabase, updateCalls } = makeSupabase({
      staleRefs: [makeRefRow({ sync_attempts: 10 })], // at the limit
      workItemStatus: 'open',
    })

    await reconcilePmMirrors(supabase)

    // sync_attempts 10 → next would be 11 > 10 → permanently mark as -1
    expect(updateCalls.length).toBe(1)
    expect(updateCalls[0]).toMatchObject({ sync_attempts: -1 })

    errorSpy.mockRestore()
  })

  it('skips refs when org config is not found', async () => {
    vi.mocked(registry.listRegisteredProviders).mockReturnValue(['linear'])
    const adapter = makeAdapter()
    vi.mocked(registry.getAdapter).mockReturnValue(adapter as any)
    vi.mocked(db.loadOrgPmConfig).mockResolvedValue(null)

    const { supabase } = makeSupabase({
      staleRefs: [makeRefRow()],
      workItemStatus: 'open',
    })

    await reconcilePmMirrors(supabase)

    expect(adapter.fetchStatus).not.toHaveBeenCalled()
  })
})
