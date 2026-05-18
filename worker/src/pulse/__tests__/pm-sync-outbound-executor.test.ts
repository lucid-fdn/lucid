/**
 * PM Sync Outbound Executor — Unit Tests
 *
 * Covers the reconcile-style derivation (create/update/close/noop),
 * primary-provider config loading, adapter dispatch, external-ref upserts
 * on success, and best-effort failure bookkeeping on adapter errors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PmSyncOutboundExecutor } from '../executors/pm-sync-outbound.js'
import type { StepExecutionContext } from '../executors/types.js'
import type { PulseJob } from '../types.js'
import type {
  HumanWorkItemLite,
  OrgPmProviderConfig,
  PmAdapter,
  PmIssueRef,
} from '../../pm-sync/types.js'
import type { ExternalRefRow } from '../../pm-sync/db.js'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../observability/tracing.js', () => ({
  withSpan: async (_name: string, _attrs: Record<string, unknown>, fn: () => Promise<unknown>) =>
    fn(),
}))

vi.mock('../../pm-sync/db.js', () => ({
  loadWorkItemLite: vi.fn(),
  loadOrgPmConfig: vi.fn(),
  loadExternalRef: vi.fn(),
  upsertExternalRef: vi.fn(),
  touchExternalRefSuccess: vi.fn(),
  recordExternalRefFailure: vi.fn(),
}))

vi.mock('../../pm-sync/registry.js', () => ({
  getAdapter: vi.fn(),
}))

const db = await import('../../pm-sync/db.js')
const registry = await import('../../pm-sync/registry.js')

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWorkItem(overrides: Partial<HumanWorkItemLite> = {}): HumanWorkItemLite {
  return {
    id: 'wi-1',
    orgId: 'org-1',
    title: 'Fix bug',
    description: 'Something broke',
    priority: 'normal',
    labels: ['bug'],
    status: 'open',
    resolution: null,
    assigneeUserId: null,
    assigneeRole: null,
    dueAt: null,
    createdAt: '2026-04-08T00:00:00.000Z',
    updatedAt: '2026-04-08T00:00:00.000Z',
    dagContext: null,
    ...overrides,
  }
}

function makeOrgConfig(overrides: Partial<OrgPmProviderConfig> = {}): OrgPmProviderConfig {
  return {
    id: 'cfg-1',
    orgId: 'org-1',
    provider: 'linear',
    enabled: true,
    isPrimary: true,
    nangoConnectionId: 'nango-conn-1',
    config: { teamId: 'team-1' },
    webhookSecret: null,
    createdAt: '2026-04-08T00:00:00.000Z',
    updatedAt: '2026-04-08T00:00:00.000Z',
    createdBy: null,
    ...overrides,
  }
}

function makeExistingRef(overrides: Partial<ExternalRefRow> = {}): ExternalRefRow {
  return {
    id: 'ref-1',
    workItemId: 'wi-1',
    orgId: 'org-1',
    provider: 'linear',
    externalId: 'LIN-123',
    externalUrl: 'https://linear.app/team/issue/LIN-123',
    metadata: { identifier: 'LIN-123', teamId: 'team-1' },
    createdAt: '2026-04-08T00:00:00.000Z',
    lastSyncedAt: '2026-04-08T00:00:00.000Z',
    lastSyncError: null,
    syncAttempts: 0,
    ...overrides,
  }
}

function makeAdapter(overrides: Partial<PmAdapter> = {}): PmAdapter {
  return {
    provider: 'linear',
    createIssue: vi.fn().mockResolvedValue({
      provider: 'linear',
      externalId: 'LIN-123',
      externalUrl: 'https://linear.app/team/issue/LIN-123',
      metadata: { identifier: 'LIN-123' },
    } satisfies PmIssueRef),
    updateIssue: vi.fn().mockResolvedValue(undefined),
    closeIssue: vi.fn().mockResolvedValue(undefined),
    fetchStatus: vi.fn(),
    verifySignature: vi.fn(),
    parseWebhook: vi.fn(),
    ...overrides,
  } as unknown as PmAdapter
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

function makeCtx(job: PulseJob = makeJob()): StepExecutionContext {
  return {
    job,
    supabase: {} as any,
    config: {} as any,
    encryptionService: {} as any,
    abortController: new AbortController(),
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PmSyncOutboundExecutor', () => {
  let executor: PmSyncOutboundExecutor

  beforeEach(() => {
    vi.clearAllMocks()
    executor = new PmSyncOutboundExecutor()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('canHandle', () => {
    it('matches pm_sync_outbound', () => {
      expect(executor.canHandle('pm_sync_outbound')).toBe(true)
    })

    it('rejects other step types', () => {
      expect(executor.canHandle('inbound')).toBe(false)
      expect(executor.canHandle('approval')).toBe(false)
      expect(executor.canHandle('webhook')).toBe(false)
    })
  })

  describe('short-circuit paths', () => {
    it('returns silently when work item is missing', async () => {
      vi.mocked(db.loadWorkItemLite).mockResolvedValueOnce(null)

      await expect(executor.execute(makeCtx())).resolves.toBeUndefined()
      expect(db.loadOrgPmConfig).not.toHaveBeenCalled()
      expect(registry.getAdapter).not.toHaveBeenCalled()
    })

    it('noops when terminal work item has no external ref', async () => {
      vi.mocked(db.loadWorkItemLite).mockResolvedValueOnce(makeWorkItem({ status: 'done' }))
      vi.mocked(db.loadOrgPmConfig).mockResolvedValueOnce(makeOrgConfig())
      const adapter = makeAdapter()
      vi.mocked(registry.getAdapter).mockReturnValueOnce(adapter)
      vi.mocked(db.loadExternalRef).mockResolvedValueOnce(null)

      await executor.execute(makeCtx())

      expect(adapter.createIssue).not.toHaveBeenCalled()
      expect(adapter.updateIssue).not.toHaveBeenCalled()
      expect(adapter.closeIssue).not.toHaveBeenCalled()
      expect(db.upsertExternalRef).not.toHaveBeenCalled()
      expect(db.touchExternalRefSuccess).not.toHaveBeenCalled()
    })
  })

  describe('config / adapter errors', () => {
    it('throws mapping error when no primary provider is configured', async () => {
      vi.mocked(db.loadWorkItemLite).mockResolvedValueOnce(makeWorkItem())
      vi.mocked(db.loadOrgPmConfig).mockResolvedValueOnce(null)

      await expect(executor.execute(makeCtx())).rejects.toThrow(/No primary PM provider/)
    })

    it('throws mapping error when adapter is not registered', async () => {
      vi.mocked(db.loadWorkItemLite).mockResolvedValueOnce(makeWorkItem())
      vi.mocked(db.loadOrgPmConfig).mockResolvedValueOnce(makeOrgConfig())
      vi.mocked(registry.getAdapter).mockReturnValueOnce(null)

      await expect(executor.execute(makeCtx())).rejects.toThrow(/No PM adapter registered/)
    })
  })

  describe('create operation', () => {
    it('creates an issue and upserts the external ref', async () => {
      vi.mocked(db.loadWorkItemLite).mockResolvedValueOnce(makeWorkItem({ status: 'open' }))
      vi.mocked(db.loadOrgPmConfig).mockResolvedValueOnce(makeOrgConfig())
      const adapter = makeAdapter()
      vi.mocked(registry.getAdapter).mockReturnValueOnce(adapter)
      vi.mocked(db.loadExternalRef).mockResolvedValueOnce(null)
      vi.mocked(db.upsertExternalRef).mockResolvedValueOnce(makeExistingRef())

      await executor.execute(makeCtx())

      expect(adapter.createIssue).toHaveBeenCalledTimes(1)
      const [createArg, createCtxArg] = (adapter.createIssue as any).mock.calls[0]
      expect(createArg.id).toBe('wi-1')
      expect(createCtxArg).toMatchObject({
        orgId: 'org-1',
        nangoConnectionId: 'nango-conn-1',
        providerConfigKey: 'linear',
      })
      expect(db.upsertExternalRef).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          workItemId: 'wi-1',
          orgId: 'org-1',
          ref: expect.objectContaining({ provider: 'linear', externalId: 'LIN-123' }),
        }),
      )
    })
  })

  describe('update operation', () => {
    it('patches the issue and touches success', async () => {
      vi.mocked(db.loadWorkItemLite).mockResolvedValueOnce(
        makeWorkItem({
          status: 'in_progress',
          title: 'Updated title',
          priority: 'high',
          labels: ['bug', 'p1'],
          dueAt: '2026-04-10T00:00:00.000Z',
        }),
      )
      vi.mocked(db.loadOrgPmConfig).mockResolvedValueOnce(makeOrgConfig())
      const adapter = makeAdapter()
      vi.mocked(registry.getAdapter).mockReturnValueOnce(adapter)
      vi.mocked(db.loadExternalRef).mockResolvedValueOnce(makeExistingRef())

      await executor.execute(makeCtx())

      expect(adapter.updateIssue).toHaveBeenCalledTimes(1)
      const [pmRef, patch] = (adapter.updateIssue as any).mock.calls[0]
      expect(pmRef).toMatchObject({ provider: 'linear', externalId: 'LIN-123' })
      expect(patch).toMatchObject({
        title: 'Updated title',
        priority: 'high',
        labels: ['bug', 'p1'],
        dueAt: '2026-04-10T00:00:00.000Z',
      })
      expect(db.touchExternalRefSuccess).toHaveBeenCalledWith(expect.anything(), 'ref-1')
      expect(adapter.createIssue).not.toHaveBeenCalled()
      expect(adapter.closeIssue).not.toHaveBeenCalled()
    })
  })

  describe('close operation', () => {
    it.each([
      ['done', 'completed'],
      ['cancelled', 'cancelled'],
      ['rejected', 'rejected'],
    ] as const)('closes %s work item with resolution=%s', async (status, expected) => {
      vi.mocked(db.loadWorkItemLite).mockResolvedValueOnce(makeWorkItem({ status }))
      vi.mocked(db.loadOrgPmConfig).mockResolvedValueOnce(makeOrgConfig())
      const adapter = makeAdapter()
      vi.mocked(registry.getAdapter).mockReturnValueOnce(adapter)
      vi.mocked(db.loadExternalRef).mockResolvedValueOnce(makeExistingRef())

      await executor.execute(makeCtx())

      expect(adapter.closeIssue).toHaveBeenCalledTimes(1)
      const [, resolution] = (adapter.closeIssue as any).mock.calls[0]
      expect(resolution).toBe(expected)
      expect(db.touchExternalRefSuccess).toHaveBeenCalledWith(expect.anything(), 'ref-1')
    })
  })

  describe('failure bookkeeping', () => {
    it('records failure against existing ref and re-throws', async () => {
      vi.mocked(db.loadWorkItemLite).mockResolvedValueOnce(makeWorkItem({ status: 'in_progress' }))
      vi.mocked(db.loadOrgPmConfig).mockResolvedValueOnce(makeOrgConfig())
      const adapter = makeAdapter({
        updateIssue: vi.fn().mockRejectedValue(new Error('linear 500')),
      })
      vi.mocked(registry.getAdapter).mockReturnValueOnce(adapter)
      vi.mocked(db.loadExternalRef).mockResolvedValueOnce(makeExistingRef())

      await expect(executor.execute(makeCtx())).rejects.toThrow('linear 500')

      expect(db.recordExternalRefFailure).toHaveBeenCalledWith(
        expect.anything(),
        'ref-1',
        'linear 500',
      )
      expect(db.touchExternalRefSuccess).not.toHaveBeenCalled()
    })

    it('skips bookkeeping on create failure (no existing ref)', async () => {
      vi.mocked(db.loadWorkItemLite).mockResolvedValueOnce(makeWorkItem({ status: 'open' }))
      vi.mocked(db.loadOrgPmConfig).mockResolvedValueOnce(makeOrgConfig())
      const adapter = makeAdapter({
        createIssue: vi.fn().mockRejectedValue(new Error('nango not connected')),
      })
      vi.mocked(registry.getAdapter).mockReturnValueOnce(adapter)
      vi.mocked(db.loadExternalRef).mockResolvedValueOnce(null)

      await expect(executor.execute(makeCtx())).rejects.toThrow('nango not connected')

      expect(db.recordExternalRefFailure).not.toHaveBeenCalled()
      expect(db.upsertExternalRef).not.toHaveBeenCalled()
    })

    it('swallows bookkeeping errors but still re-throws the original error', async () => {
      vi.mocked(db.loadWorkItemLite).mockResolvedValueOnce(makeWorkItem({ status: 'done' }))
      vi.mocked(db.loadOrgPmConfig).mockResolvedValueOnce(makeOrgConfig())
      const adapter = makeAdapter({
        closeIssue: vi.fn().mockRejectedValue(new Error('adapter boom')),
      })
      vi.mocked(registry.getAdapter).mockReturnValueOnce(adapter)
      vi.mocked(db.loadExternalRef).mockResolvedValueOnce(makeExistingRef())
      vi.mocked(db.recordExternalRefFailure).mockRejectedValueOnce(new Error('db down'))

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(executor.execute(makeCtx())).rejects.toThrow('adapter boom')

      expect(db.recordExternalRefFailure).toHaveBeenCalled()
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })
  })
})
