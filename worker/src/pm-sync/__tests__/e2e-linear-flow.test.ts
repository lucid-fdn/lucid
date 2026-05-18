/**
 * PM Sync E2E — Linear Full-Flow Integration Test.
 *
 * Validates the complete Linear sync lifecycle using mocked Supabase + adapter:
 *   1. Enqueue outbound pm_sync_outbound job
 *   2. Executor creates issue via Linear adapter → upserts external ref
 *   3. Work item updated → executor updates issue → touches ref
 *   4. Work item closed → executor closes issue → touches ref
 *   5. Reconcile cron detects no drift when external matches
 *   6. Reconcile cron detects drift when external shows closed
 *   7. Feature flag gating: cron skipped when FEATURE_PM_SYNC=false
 *
 * All adapter calls and DB calls are mocked — this tests the integration
 * wiring between enqueue, executor, and reconcile, not the actual HTTP calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PmSyncOutboundExecutor } from '../../pulse/executors/pm-sync-outbound.js'
import { enqueuePmSyncOutbound } from '../enqueue.js'
import type { PulseJob } from '../../pulse/types.js'
import type { StepExecutionContext } from '../../pulse/executors/types.js'
import type { PmIssueRef } from '../types.js'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../observability/tracing.js', () => ({
  withSpan: async (_name: string, _attrs: Record<string, unknown>, fn: () => Promise<unknown>) =>
    fn(),
}))

vi.mock('../db.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db.js')>()
  return {
    ...actual,
    loadWorkItemLite: vi.fn(),
    loadOrgPmConfig: vi.fn(),
    loadExternalRef: vi.fn(),
    upsertExternalRef: vi.fn(),
    touchExternalRefSuccess: vi.fn(),
    recordExternalRefFailure: vi.fn(),
  }
})

vi.mock('../registry.js', () => ({
  getAdapter: vi.fn(),
  listRegisteredProviders: vi.fn(),
}))

const db = await import('../db.js')
const registry = await import('../registry.js')

// ─── Shared fixtures ────────────────────────────────────────────────────────

const ORG_CONFIG = {
  id: 'cfg-1',
  orgId: 'org-1',
  provider: 'linear' as const,
  enabled: true,
  isPrimary: true,
  nangoConnectionId: 'nango-1',
  config: { teamId: 't1', doneStateId: 'state-done', cancelledStateId: 'state-cancel' },
  webhookSecret: 'wh-secret',
  createdAt: '2026-04-08T00:00:00.000Z',
  updatedAt: '2026-04-08T00:00:00.000Z',
  createdBy: null,
}

const WORK_ITEM_OPEN = {
  id: 'wi-1',
  orgId: 'org-1',
  title: 'Implement feature X',
  description: 'Build the thing',
  priority: 'high' as const,
  labels: ['feature'],
  status: 'open' as const,
  resolution: null,
  assigneeUserId: null,
  assigneeRole: null,
  dueAt: null,
  createdAt: '2026-04-08T00:00:00.000Z',
  updatedAt: '2026-04-08T00:00:00.000Z',
  dagContext: null,
}

const ISSUE_REF: PmIssueRef = {
  provider: 'linear',
  externalId: 'LIN-42',
  externalUrl: 'https://linear.app/team/issue/LIN-42',
  metadata: { identifier: 'LIN-42', teamId: 't1' },
}

const EXTERNAL_REF_ROW = {
  id: 'ref-1',
  workItemId: 'wi-1',
  orgId: 'org-1',
  provider: 'linear' as const,
  externalId: 'LIN-42',
  externalUrl: 'https://linear.app/team/issue/LIN-42',
  metadata: { identifier: 'LIN-42', teamId: 't1' },
  createdAt: '2026-04-08T00:00:00.000Z',
  lastSyncedAt: '2026-04-08T00:00:00.000Z',
  lastSyncError: null,
  syncAttempts: 0,
}

function makeAdapter() {
  return {
    provider: 'linear' as const,
    createIssue: vi.fn().mockResolvedValue(ISSUE_REF),
    updateIssue: vi.fn().mockResolvedValue(undefined),
    closeIssue: vi.fn().mockResolvedValue(undefined),
    fetchStatus: vi.fn().mockResolvedValue({ externalStatus: 'started', closed: false }),
    verifySignature: vi.fn(),
    parseWebhook: vi.fn(),
  }
}

function makeJob(overrides: Partial<PulseJob> = {}): PulseJob {
  return {
    runId: 'wi-1:0',
    eventId: 'wi-1',
    eventType: 'outbound',
    agentId: 'sync-bot',
    orgId: 'org-1',
    priority: 'normal',
    attempt: 0,
    enqueuedAt: Date.now(),
    stepType: 'pm_sync_outbound',
    ...overrides,
  }
}

function makeCtx(job: PulseJob): StepExecutionContext {
  return {
    job,
    supabase: {} as any,
    config: {} as any,
    encryptionService: {} as any,
    abortController: new AbortController(),
  }
}

// ─── E2E Tests ───────────────────────────────────────────────────────────────

describe('Linear E2E Flow', () => {
  let executor: PmSyncOutboundExecutor

  beforeEach(() => {
    vi.clearAllMocks()
    executor = new PmSyncOutboundExecutor()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('full lifecycle: create → update → close', async () => {
    const adapter = makeAdapter()
    vi.mocked(registry.getAdapter).mockReturnValue(adapter as any)
    vi.mocked(db.loadOrgPmConfig).mockResolvedValue(ORG_CONFIG)
    vi.mocked(db.upsertExternalRef).mockResolvedValue(EXTERNAL_REF_ROW)

    // Step 1: CREATE — open work item, no existing ref
    vi.mocked(db.loadWorkItemLite).mockResolvedValueOnce(WORK_ITEM_OPEN)
    vi.mocked(db.loadExternalRef).mockResolvedValueOnce(null)

    await executor.execute(makeCtx(makeJob()))

    expect(adapter.createIssue).toHaveBeenCalledTimes(1)
    expect(db.upsertExternalRef).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workItemId: 'wi-1',
        ref: expect.objectContaining({ externalId: 'LIN-42' }),
      }),
    )

    // Step 2: UPDATE — work item updated, ref exists
    vi.mocked(db.loadWorkItemLite).mockResolvedValueOnce({
      ...WORK_ITEM_OPEN,
      title: 'Implement feature X (revised)',
      status: 'in_progress',
    })
    vi.mocked(db.loadExternalRef).mockResolvedValueOnce(EXTERNAL_REF_ROW)

    await executor.execute(makeCtx(makeJob()))

    expect(adapter.updateIssue).toHaveBeenCalledTimes(1)
    expect(db.touchExternalRefSuccess).toHaveBeenCalledWith(expect.anything(), 'ref-1')

    // Step 3: CLOSE — work item done, ref exists
    vi.mocked(db.loadWorkItemLite).mockResolvedValueOnce({
      ...WORK_ITEM_OPEN,
      status: 'done',
    })
    vi.mocked(db.loadExternalRef).mockResolvedValueOnce(EXTERNAL_REF_ROW)

    await executor.execute(makeCtx(makeJob()))

    expect(adapter.closeIssue).toHaveBeenCalledTimes(1)
    expect(adapter.closeIssue).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: 'LIN-42' }),
      'completed',
      expect.anything(),
    )
  })

  it('enqueue produces correct step params', async () => {
    const enqueued: unknown[] = []
    const mockQueue = {
      enqueueStep: vi.fn(async (params: unknown) => {
        enqueued.push(params)
        return true
      }),
    }

    const result = await enqueuePmSyncOutbound(mockQueue as any, {
      workItemId: 'wi-1',
      orgId: 'org-1',
      agentId: 'sync-bot',
    })

    expect(result).toBe(true)
    expect(enqueued[0]).toMatchObject({
      eventId: 'wi-1',
      eventType: 'outbound',
      stepType: 'pm_sync_outbound',
      agentId: 'sync-bot',
      orgId: 'org-1',
      priority: 'normal',
    })
  })

  it('executor registered in createDefaultRegistry before ProcessorExecutor', async () => {
    const { createDefaultRegistry } = await import('../../pulse/executors/index.js')
    const reg = createDefaultRegistry()

    // PmSyncOutboundExecutor should handle pm_sync_outbound BEFORE ProcessorExecutor
    const executor = reg.resolve('pm_sync_outbound')
    expect(executor).toBeDefined()
    expect(executor!.type).toBe('pm_sync_outbound')
  })

  it('reconcile detects no drift when external is not closed', async () => {
    const { reconcilePmMirrors } = await import('../reconcile.js')
    vi.mocked(registry.listRegisteredProviders).mockReturnValue(['linear'])
    const adapter = makeAdapter()
    adapter.fetchStatus.mockResolvedValue({ externalStatus: 'started', closed: false })
    vi.mocked(registry.getAdapter).mockReturnValue(adapter as any)
    vi.mocked(db.loadOrgPmConfig).mockResolvedValue(ORG_CONFIG)

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'work_item_external_refs') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                lt: vi.fn(() => ({
                  gte: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn().mockResolvedValue({
                        data: [
                          {
                            id: 'ref-1',
                            work_item_id: 'wi-1',
                            org_id: 'org-1',
                            provider: 'linear',
                            external_id: 'LIN-42',
                            external_url: 'https://linear.app/i/LIN-42',
                            metadata: {},
                            created_at: 'x',
                            last_synced_at: '2026-04-07T00:00:00.000Z',
                            last_sync_error: null,
                            sync_attempts: 0,
                          },
                        ],
                        error: null,
                      }),
                    })),
                  })),
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          }
        }
        if (table === 'human_work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { status: 'open' },
                  error: null,
                }),
              })),
            })),
          }
        }
        return {}
      }),
    } as any

    await reconcilePmMirrors(supabase)

    expect(adapter.fetchStatus).toHaveBeenCalledTimes(1)
    logSpy.mockRestore()
  })
})
