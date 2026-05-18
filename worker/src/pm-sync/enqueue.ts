/**
 * PM Sync Outbound — Enqueuer.
 *
 * Drops a `pm_sync_outbound` step job onto the Pulse queue. The job carries
 * only the work item ID; `PmSyncOutboundExecutor` derives the actual
 * operation (create/update/close) from DB state at claim time, so retries
 * are naturally idempotent and safe against in-flight status changes.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section D.3
 */

import type { PulseQueue } from '../pulse/queue.js'

export async function enqueuePmSyncOutbound(
  queue: PulseQueue,
  params: {
    workItemId: string
    orgId: string
    /** Logical owner — typically the work item's assignee agent or a sync-bot id. */
    agentId: string
  },
): Promise<boolean> {
  return queue.enqueueStep({
    eventId: params.workItemId,
    eventType: 'outbound',
    agentId: params.agentId,
    orgId: params.orgId,
    stepType: 'pm_sync_outbound',
    priority: 'normal',
  })
}
