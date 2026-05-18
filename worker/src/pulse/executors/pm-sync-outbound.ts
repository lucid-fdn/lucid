/**
 * PM Sync Outbound Executor
 *
 * Reconcile-style outbound executor for human work items mirrored to
 * external PM providers (Linear, Jira, Asana, Trello, Monday).
 *
 * The job carries only `eventId = work_item_id`; the executor loads the
 * current work item + existing external ref and derives the operation
 * (create / update / close) from DB state. This makes retries naturally
 * idempotent and avoids drift between "what was queued" and "what's true now".
 *
 * Flow:
 *   1. Load work item → short-circuit if deleted
 *   2. Load org PM config (primary provider unless pinned in job payload)
 *   3. Load existing external ref (if any)
 *   4. Derive operation from status + ref presence
 *   5. Resolve adapter and dispatch
 *   6. Upsert / touch external ref on success; record failure + re-throw
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section D.2
 */

import type { StepExecutionContext, StepExecutor } from './types.js'
import {
  loadExternalRef,
  loadOrgPmConfig,
  loadWorkItemLite,
  recordExternalRefFailure,
  touchExternalRefSuccess,
  upsertExternalRef,
  type ExternalRefRow,
} from '../../pm-sync/db.js'
import { getAdapter } from '../../pm-sync/registry.js'
import { PmSyncMappingError } from '../../pm-sync/errors.js'
import type {
  HumanWorkItemLite,
  OrgPmProviderConfig,
  PmAdapter,
  PmAdapterContext,
  PmResolution,
} from '../../pm-sync/types.js'
import { withSpan } from '../../observability/tracing.js'

type Operation = 'create' | 'update' | 'close' | 'noop'

const TERMINAL_STATUSES: ReadonlySet<HumanWorkItemLite['status']> = new Set([
  'done',
  'cancelled',
  'rejected',
])

function deriveOperation(
  workItem: HumanWorkItemLite,
  ref: ExternalRefRow | null,
): Operation {
  const isTerminal = TERMINAL_STATUSES.has(workItem.status)
  if (!ref) {
    return isTerminal ? 'noop' : 'create'
  }
  return isTerminal ? 'close' : 'update'
}

function statusToResolution(status: HumanWorkItemLite['status']): PmResolution {
  switch (status) {
    case 'done':
      return 'completed'
    case 'rejected':
      return 'rejected'
    case 'cancelled':
    default:
      return 'cancelled'
  }
}

function buildAdapterContext(orgConfig: OrgPmProviderConfig): PmAdapterContext {
  return {
    orgId: orgConfig.orgId,
    nangoConnectionId: orgConfig.nangoConnectionId,
    providerConfigKey: orgConfig.provider,
    providerConfig: orgConfig.config,
    nowIso: () => new Date().toISOString(),
  }
}

export class PmSyncOutboundExecutor implements StepExecutor {
  readonly type = 'pm_sync_outbound'

  canHandle(stepType: string): boolean {
    return stepType === 'pm_sync_outbound'
  }

  async execute(ctx: StepExecutionContext): Promise<void> {
    const { job, supabase } = ctx
    const workItemId = job.eventId

    await withSpan(
      'pulse.step.execute',
      {
        'lucid.pulse.step_type': 'pm_sync_outbound',
        'lucid.pulse.executor_type': this.type,
        'lucid.pulse.agent_id': job.agentId,
      },
      async () => {
        const workItem = await loadWorkItemLite(supabase, workItemId)
        if (!workItem) {
          console.warn(
            `[pulse:pm-sync-outbound] work item ${workItemId} not found — completing as noop`,
          )
          return
        }

        const orgConfig = await loadOrgPmConfig(supabase, workItem.orgId)
        if (!orgConfig) {
          throw new PmSyncMappingError(
            `No primary PM provider configured for org ${workItem.orgId}`,
            { provider: null },
          )
        }

        const adapter: PmAdapter | null = getAdapter(orgConfig.provider)
        if (!adapter) {
          throw new PmSyncMappingError(
            `No PM adapter registered for provider=${orgConfig.provider}`,
            { provider: orgConfig.provider },
          )
        }

        const existingRef = await loadExternalRef(
          supabase,
          workItemId,
          orgConfig.provider,
        )
        const operation = deriveOperation(workItem, existingRef)
        if (operation === 'noop') {
          // Terminal work item with no external ref — nothing to sync.
          return
        }

        const adapterCtx = buildAdapterContext(orgConfig)

        try {
          if (operation === 'create') {
            const ref = await adapter.createIssue(workItem, adapterCtx)
            await upsertExternalRef(supabase, {
              workItemId,
              orgId: workItem.orgId,
              ref,
            })
            return
          }

          // update / close both need the existing ref.
          if (!existingRef) {
            // Defensive: deriveOperation guarantees this, but keep the type
            // system honest.
            throw new PmSyncMappingError(
              `Expected external ref for ${operation} operation on work item ${workItemId}`,
              { provider: orgConfig.provider },
            )
          }

          const pmRef = {
            provider: existingRef.provider,
            externalId: existingRef.externalId,
            externalUrl: existingRef.externalUrl,
            metadata: existingRef.metadata,
          }

          if (operation === 'update') {
            await adapter.updateIssue(
              pmRef,
              {
                title: workItem.title,
                description: workItem.description,
                priority: workItem.priority,
                labels: workItem.labels,
                dueAt: workItem.dueAt,
              },
              adapterCtx,
            )
            await touchExternalRefSuccess(supabase, existingRef.id)
            return
          }

          // operation === 'close'
          await adapter.closeIssue(
            pmRef,
            statusToResolution(workItem.status),
            adapterCtx,
          )
          await touchExternalRefSuccess(supabase, existingRef.id)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (existingRef) {
            // Best-effort failure bookkeeping. Never swallow the original
            // error — BaseWorker needs the throw to call queue.fail().
            try {
              await recordExternalRefFailure(supabase, existingRef.id, message)
            } catch (bookkeepErr) {
              console.error(
                `[pulse:pm-sync-outbound] failed to record external ref failure for ${existingRef.id}:`,
                bookkeepErr,
              )
            }
          }
          throw err
        }
      },
    )
  }
}
