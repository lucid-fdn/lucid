/**
 * Contract Sync Tests — PM Adapter Worker ↔ Contracts
 *
 * Verifies that `worker/src/pm-sync/types.ts` stays in sync with
 * `contracts/pm-adapter.ts`. The worker tsconfig has `rootDir: ./src`
 * so value modules in contracts/ cannot be imported by worker runtime
 * code — but vitest excludes __tests__ from rootDir enforcement, so
 * this test can import from both sides and compare.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.1
 */

import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  PM_PROVIDERS as WorkerProviders,
  type PmProvider as WorkerProvider,
  type PmIssueRef as WorkerIssueRef,
  type HumanWorkItemLite as WorkerWorkItem,
  type PmIssuePatch as WorkerPatch,
  type PmResolution as WorkerResolution,
  type PmWebhookEventType as WorkerEventType,
  type PmWebhookEvent as WorkerEvent,
  type PmAdapterContext as WorkerCtx,
  type OrgPmProviderConfig as WorkerConfig,
  type PmAdapter as WorkerAdapter,
  type PmSyncJob as WorkerJob,
} from '../types.js'
import {
  PM_PROVIDERS as ContractProviders,
  type PmProvider as ContractProvider,
  type PmIssueRef as ContractIssueRef,
  type HumanWorkItemLite as ContractWorkItem,
  type PmIssuePatch as ContractPatch,
  type PmResolution as ContractResolution,
  type PmWebhookEventType as ContractEventType,
  type PmWebhookEvent as ContractEvent,
  type PmAdapterContext as ContractCtx,
  type OrgPmProviderConfig as ContractConfig,
  type PmAdapter as ContractAdapter,
  type PmSyncJob as ContractJob,
} from '../../../../contracts/pm-adapter.js'

describe('PM Adapter Contract Sync', () => {
  describe('PM_PROVIDERS constant', () => {
    it('worker and contract PM_PROVIDERS arrays are identical', () => {
      expect([...WorkerProviders]).toEqual([...ContractProviders])
    })

    it('contains exactly the four shipping providers', () => {
      expect([...ContractProviders]).toEqual([
        'linear',
        'asana',
        'trello',
        'monday',
      ])
    })
  })

  describe('type-level parity', () => {
    // These are compile-time assertions. If contracts/ drifts from worker
    // types.ts, tsc will fail these checks before vitest ever runs.
    it('PmProvider types are assignable', () => {
      expectTypeOf<WorkerProvider>().toEqualTypeOf<ContractProvider>()
    })

    it('PmIssueRef types are assignable', () => {
      expectTypeOf<WorkerIssueRef>().toEqualTypeOf<ContractIssueRef>()
    })

    it('HumanWorkItemLite types are assignable', () => {
      expectTypeOf<WorkerWorkItem>().toEqualTypeOf<ContractWorkItem>()
    })

    it('PmIssuePatch types are assignable', () => {
      expectTypeOf<WorkerPatch>().toEqualTypeOf<ContractPatch>()
    })

    it('PmResolution types are assignable', () => {
      expectTypeOf<WorkerResolution>().toEqualTypeOf<ContractResolution>()
    })

    it('PmWebhookEventType types are assignable', () => {
      expectTypeOf<WorkerEventType>().toEqualTypeOf<ContractEventType>()
    })

    it('PmWebhookEvent types are assignable', () => {
      expectTypeOf<WorkerEvent>().toEqualTypeOf<ContractEvent>()
    })

    it('PmAdapterContext types are assignable', () => {
      expectTypeOf<WorkerCtx>().toEqualTypeOf<ContractCtx>()
    })

    it('OrgPmProviderConfig types are assignable', () => {
      expectTypeOf<WorkerConfig>().toEqualTypeOf<ContractConfig>()
    })

    it('PmAdapter types are assignable', () => {
      expectTypeOf<WorkerAdapter>().toEqualTypeOf<ContractAdapter>()
    })

    it('PmSyncJob types are assignable', () => {
      expectTypeOf<WorkerJob>().toEqualTypeOf<ContractJob>()
    })
  })

  describe('sample-value round-trip', () => {
    it('a contract PmWebhookEvent is accepted by the worker type', () => {
      const contractEvent: ContractEvent = {
        provider: 'linear',
        type: 'issue.closed',
        externalId: 'issue-123',
        isEcho: false,
        actorId: 'user-bot',
        resolution: 'completed',
        occurredAt: '2026-04-08T00:00:00Z',
      }
      const workerEvent: WorkerEvent = contractEvent
      expect(workerEvent.provider).toBe('linear')
      expect(workerEvent.type).toBe('issue.closed')
    })

    it('a contract HumanWorkItemLite is accepted by the worker type', () => {
      const contractWi: ContractWorkItem = {
        id: 'wi-1',
        orgId: 'org-1',
        title: 'Ship thing',
        description: null,
        priority: 'normal',
        labels: ['a', 'b'],
        status: 'open',
        resolution: null,
        assigneeUserId: null,
        assigneeRole: null,
        dueAt: null,
        createdAt: '2026-04-08T00:00:00Z',
        updatedAt: '2026-04-08T00:00:00Z',
        dagContext: null,
      }
      const workerWi: WorkerWorkItem = contractWi
      expect(workerWi.id).toBe('wi-1')
    })
  })
})
