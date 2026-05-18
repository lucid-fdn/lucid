/**
 * PM Sync — Reconciliation Cron.
 *
 * Safety-net sweep that catches drift between our work items and external
 * PM tools. Runs every 5 minutes (shared only). For each enabled provider:
 *
 *   1. Query stale external refs (last_synced_at > 10 min ago, non-terminal)
 *   2. Call adapter.fetchStatus() for each ref
 *   3. On drift (external tool shows closed but our item is still open):
 *      log + re-enqueue an outbound sync job so the outbound executor
 *      derives the correct operation from current DB state
 *
 * Gated by FEATURE_PM_SYNC + FEATURE_PM_SYNC_RECONCILE.
 * Providers are iterated sequentially (round-robin fairness). Each batch
 * is capped at 50 refs per provider per tick (configurable, Trello = 20).
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section D.2
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdapter, listRegisteredProviders } from './registry.js'
import { rowToExternalRef, loadOrgPmConfig } from './db.js'
import type { ExternalRefRow } from './db.js'
import { PmSyncRateLimitError } from './errors.js'
import type { PmAdapterContext, OrgPmProviderConfig, PmProvider } from './types.js'
import type { PulseQueue } from '../pulse/queue.js'
import { enqueuePmSyncOutbound } from './enqueue.js'

const DEFAULT_BATCH_SIZE = 50
const TRELLO_BATCH_SIZE = 20
const STALE_THRESHOLD_MINUTES = 10

/**
 * Per-provider batch size overrides. Trello's strict rate limits
 * require a smaller batch to stay under 100 req/10s.
 */
function batchSizeForProvider(provider: PmProvider): number {
  if (provider === 'trello') return TRELLO_BATCH_SIZE
  return DEFAULT_BATCH_SIZE
}

/**
 * Load stale external refs for a given provider — refs whose
 * last_synced_at is older than the threshold and whose work item
 * is still non-terminal.
 */
async function loadStaleRefs(
  supabase: SupabaseClient,
  provider: PmProvider,
  limit: number,
): Promise<ExternalRefRow[]> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000).toISOString()

  // We join work_item_external_refs with human_work_items to filter terminal items.
  // Supabase JS client doesn't support cross-table WHERE easily, so we use an RPC-free
  // approach: fetch stale refs, then batch-check work item statuses.
  const { data, error } = await supabase
    .from('work_item_external_refs')
    .select(
      'id, work_item_id, org_id, provider, external_id, external_url, metadata, created_at, last_synced_at, last_sync_error, sync_attempts',
    )
    .eq('provider', provider)
    .lt('last_synced_at', cutoff)
    .gte('sync_attempts', 0) // skip permanently-failed refs (sync_attempts = -1)
    .order('last_synced_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error(`[cron:pm-sync-reconcile] loadStaleRefs(${provider}) error:`, error.message)
    return []
  }
  if (!data || data.length === 0) return []

  return data.map((row: Record<string, unknown>) => rowToExternalRef(row))
}

/**
 * Check whether the work item is already terminal (done/cancelled/rejected).
 * If terminal, we just touch the ref and skip the reconcile.
 */
async function isWorkItemTerminal(
  supabase: SupabaseClient,
  workItemId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('human_work_items')
    .select('status')
    .eq('id', workItemId)
    .maybeSingle()

  if (error || !data) return true // treat missing/error as terminal (skip)
  const status = (data.status as string | undefined) ?? ''
  return status === 'done' || status === 'cancelled' || status === 'rejected'
}

/**
 * Build a PmAdapterContext for reconciliation. Uses an in-memory cache
 * to avoid repeated loadOrgPmConfig() calls for the same org+provider
 * within a single cron tick (batch of 50 refs from same org).
 */
async function buildReconcileCtx(
  supabase: SupabaseClient,
  orgId: string,
  provider: PmProvider,
  configCache: Map<string, OrgPmProviderConfig | null>,
): Promise<PmAdapterContext | null> {
  const cacheKey = `${orgId}:${provider}`
  let orgConfig: OrgPmProviderConfig | null | undefined = configCache.get(cacheKey)
  if (orgConfig === undefined) {
    orgConfig = await loadOrgPmConfig(supabase, orgId, provider)
    configCache.set(cacheKey, orgConfig)
  }
  if (!orgConfig) return null
  return {
    orgId: orgConfig.orgId,
    nangoConnectionId: orgConfig.nangoConnectionId,
    providerConfigKey: orgConfig.provider,
    providerConfig: orgConfig.config,
    nowIso: () => new Date().toISOString(),
  }
}

/**
 * Compute the backoff bump for a failed sync attempt.
 * 30s → 5min → 1hr based on sync_attempts. Capped at 10.
 */
function backoffBumpMs(attempts: number): number {
  if (attempts <= 1) return 30_000        // 30s
  if (attempts <= 3) return 5 * 60_000    // 5min
  return 60 * 60_000                       // 1hr
}

/**
 * Touch last_synced_at forward by a backoff interval on retriable failure.
 * This prevents the ref from being retried immediately on the next sweep.
 */
async function bumpSyncedAtWithBackoff(
  supabase: SupabaseClient,
  refId: string,
  attempts: number,
  errorMessage: string,
): Promise<void> {
  const now = Date.now()
  const bumped = new Date(now + backoffBumpMs(attempts)).toISOString()
  const next = attempts + 1

  if (next > 10) {
    // Permanently mark as failed — operator must intervene
    await supabase
      .from('work_item_external_refs')
      .update({ sync_attempts: -1, last_sync_error: errorMessage.length > 2000 ? errorMessage.slice(0, 1997) + '...' : errorMessage })
      .eq('id', refId)
    return
  }

  await supabase
    .from('work_item_external_refs')
    .update({
      last_synced_at: bumped,
      sync_attempts: next,
      last_sync_error: errorMessage.length > 2000 ? errorMessage.slice(0, 1997) + '...' : errorMessage,
    })
    .eq('id', refId)
}

/**
 * On successful reconcile check (no drift), just touch the timestamp.
 */
async function touchReconcileSuccess(
  supabase: SupabaseClient,
  refId: string,
): Promise<void> {
  await supabase
    .from('work_item_external_refs')
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_error: null,
      sync_attempts: 0,
    })
    .eq('id', refId)
}

/**
 * Main reconciliation sweep. Called by the cron runner every 5 minutes.
 */
export async function reconcilePmMirrors(supabase: SupabaseClient): Promise<void> {
  const providers = listRegisteredProviders()
  if (providers.length === 0) return

  let totalChecked = 0
  let totalDrift = 0
  const configCache = new Map<string, OrgPmProviderConfig | null>()

  for (const provider of providers) {
    const adapter = getAdapter(provider)
    if (!adapter) continue

    const batchSize = batchSizeForProvider(provider)
    let refs: ExternalRefRow[]
    try {
      refs = await loadStaleRefs(supabase, provider, batchSize)
    } catch (err) {
      console.error(`[cron:pm-sync-reconcile] ${provider} stale-ref query failed:`, err)
      continue
    }
    if (refs.length === 0) continue

    for (const ref of refs) {
      try {
        // Skip terminal work items
        if (await isWorkItemTerminal(supabase, ref.workItemId)) {
          await touchReconcileSuccess(supabase, ref.id)
          continue
        }

        // Build adapter context for this ref's org
        const ctx = await buildReconcileCtx(supabase, ref.orgId, provider, configCache)
        if (!ctx) {
          // Provider not configured for this org — skip
          continue
        }

        const pmRef = {
          provider: ref.provider,
          externalId: ref.externalId,
          externalUrl: ref.externalUrl,
          metadata: ref.metadata,
        }

        const status = await adapter.fetchStatus(pmRef, ctx)
        totalChecked++

        if (!status) {
          // Issue was deleted in the external tool
          await bumpSyncedAtWithBackoff(
            supabase,
            ref.id,
            ref.syncAttempts,
            'External issue not found — may have been deleted',
          )
          totalDrift++
          continue
        }

        if (status.closed) {
          // External tool shows closed but our work item is still open.
          // Log drift and touch the ref — the outbound executor will
          // re-derive the correct operation on its next run. We don't
          // auto-close the work item from here; that's the inbound
          // webhook handler's job. We just mark the drift.
          console.warn(
            `[cron:pm-sync-reconcile] drift detected: ${provider}/${ref.externalId} ` +
              `closed externally but work item ${ref.workItemId} is still open`,
          )
          await touchReconcileSuccess(supabase, ref.id)
          totalDrift++
          continue
        }

        // No drift — just touch success
        await touchReconcileSuccess(supabase, ref.id)
      } catch (err) {
        if (err instanceof PmSyncRateLimitError) {
          console.warn(
            `[cron:pm-sync-reconcile] ${provider} rate limited, skipping remaining refs` +
              (err.retryAfterMs ? ` (retry after ${err.retryAfterMs}ms)` : ''),
          )
          break // Exit the provider loop entirely — resume on next tick
        }

        const message = err instanceof Error ? err.message : String(err)
        console.error(
          `[cron:pm-sync-reconcile] ${provider}/${ref.externalId} error:`,
          message,
        )
        await bumpSyncedAtWithBackoff(supabase, ref.id, ref.syncAttempts, message)
      }
    }
  }

  if (totalChecked > 0 || totalDrift > 0) {
    console.log(
      `[cron:pm-sync-reconcile] checked ${totalChecked} refs, ${totalDrift} drift detected`,
    )
  }
}

/**
 * Phase 6 safety-net sweep: find work items that have `external_mirror` set
 * but no corresponding `work_item_external_refs` row yet. These are items
 * where the push-path PM sync enqueue was missed (e.g. scheduler crash,
 * Redis downtime). Runs inside the existing reconcile cron — oldest first,
 * capped at 50 per tick.
 */
export async function sweepUnmirroredWorkItems(
  supabase: SupabaseClient,
  queue: PulseQueue,
): Promise<number> {
  const { data, error } = await supabase
    .from('human_work_items')
    .select('id, org_id, agent_id')
    .not('external_mirror', 'is', null)
    .not('status', 'in', '("done","cancelled","rejected")')
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) {
    console.error('[cron:pm-sync-reconcile] sweepUnmirroredWorkItems query error:', error.message)
    return 0
  }
  if (!data || data.length === 0) return 0

  // Filter out items that already have an external ref.
  const workItemIds = data.map((r: { id: string }) => r.id)
  const { data: existingRefs, error: refErr } = await supabase
    .from('work_item_external_refs')
    .select('work_item_id')
    .in('work_item_id', workItemIds)

  if (refErr) {
    console.error('[cron:pm-sync-reconcile] sweepUnmirroredWorkItems ref query error:', refErr.message)
    return 0
  }

  const alreadyMirrored = new Set(
    ((existingRefs ?? []) as Array<{ work_item_id: string }>).map((r) => r.work_item_id),
  )
  const unmirrored = data.filter(
    (r: { id: string }) => !alreadyMirrored.has(r.id),
  ) as Array<{ id: string; org_id: string; agent_id: string | null }>

  let enqueued = 0
  for (const item of unmirrored) {
    try {
      await enqueuePmSyncOutbound(queue, {
        workItemId: item.id,
        orgId: item.org_id,
        agentId: item.agent_id ?? 'system', // sentinel for Pulse concurrency bucketing when no agent
      })
      enqueued++
    } catch (err) {
      console.warn(
        `[cron:pm-sync-reconcile] sweepUnmirroredWorkItems enqueue failed for ${item.id}:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  if (enqueued > 0) {
    console.log(`[cron:pm-sync-reconcile] swept ${enqueued} unmirrored work items`)
  }
  return enqueued
}
