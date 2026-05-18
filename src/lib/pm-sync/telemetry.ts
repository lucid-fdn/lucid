/**
 * PM Sync Telemetry — Lightweight counters + structured logging for the
 * control-plane side of the sync pipeline.
 *
 * The heavy lifting (OTel spans, histograms) lives on the worker side in
 * `worker/src/pm-sync/`. Control-plane code paths (webhook receiver, org
 * config API, reconcile DB reads) only need cheap counters + log lines so
 * operators can correlate spikes with Linear/Trello/etc. outages.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section D.4
 */

import 'server-only'
import { ErrorService } from '@/lib/db/client'
import type { PmProvider, PmWebhookEventType } from '@contracts/pm-adapter'

// In-memory counters. Intentionally unbounded per-process because values
// are flushed on every metrics scrape / process restart. If a future
// Prometheus integration lands, swap this for a proper registry.
const counters = new Map<string, number>()

function incr(name: string, labels: Record<string, string | number> = {}): void {
  const labelStr = Object.entries(labels)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')
  const key = labelStr ? `${name}{${labelStr}}` : name
  counters.set(key, (counters.get(key) ?? 0) + 1)
}

/** Read-only snapshot of all counters. Used by the `/metrics` endpoint. */
export function snapshotCounters(): Record<string, number> {
  return Object.fromEntries(counters)
}

// ─── Webhook surface ────────────────────────────────────────────────────────────

export function recordWebhookReceived(provider: PmProvider): void {
  incr('lucid.pm_sync.webhook_received', { provider })
}

export function recordWebhookRejected(
  provider: PmProvider,
  reason: 'signature' | 'dedupe' | 'parse' | 'no_match' | 'disabled',
): void {
  incr('lucid.pm_sync.webhook_rejected', { provider, reason })
}

export function recordWebhookProcessed(
  provider: PmProvider,
  eventType: PmWebhookEventType,
): void {
  incr('lucid.pm_sync.webhook_processed', { provider, event_type: eventType })
}

export function recordWebhookEcho(provider: PmProvider): void {
  incr('lucid.pm_sync.webhook_echo_skipped', { provider })
}

// ─── Outbound sync surface ──────────────────────────────────────────────────────

export function recordOutboundEnqueued(
  provider: PmProvider,
  operation: 'create' | 'update' | 'close',
): void {
  incr('lucid.pm_sync.outbound_enqueued', { provider, operation })
}

// ─── Error reporting helper ────────────────────────────────────────────────────

/**
 * Thin wrapper around ErrorService that stamps layer + component tags so
 * Sentry queries (`layer:pm-sync`) narrow instantly to this subsystem.
 */
export function reportSyncError(
  err: unknown,
  context: {
    op: string
    provider?: PmProvider
    workItemId?: string
    orgId?: string
    severity?: 'error' | 'warning'
  },
): void {
  const { op, provider, workItemId, orgId, severity = 'error' } = context
  ErrorService.captureException(err, {
    severity,
    context: {
      op,
      provider: provider ?? null,
      work_item_id: workItemId ?? null,
      org_id: orgId ?? null,
    },
    tags: {
      layer: 'pm-sync',
      provider: provider ?? 'unknown',
    },
  })
}
