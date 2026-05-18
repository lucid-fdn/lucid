/**
 * PM External Refs — Mirror index between human_work_items and external PM tools.
 *
 * One row per (work_item_id, provider). Supports:
 *   - upsert on create/update (used by outbound sync worker)
 *   - lookup by (provider, external_id) for inbound webhooks
 *   - stale-ref scan for the reconcile cron
 *
 * Migration: supabase/migrations/20260409100000_work_item_external_refs.sql
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.5
 */

import 'server-only'
import { supabase, ErrorService } from './client'
import type { PmProviderDbValue } from '@contracts/pm-adapter'

export interface WorkItemExternalRef {
  id: string
  work_item_id: string
  org_id: string
  provider: PmProviderDbValue
  external_id: string
  external_url: string
  metadata: Record<string, unknown>
  created_at: string
  last_synced_at: string
  last_sync_error: string | null
  sync_attempts: number
}

const REF_COLUMNS =
  'id, work_item_id, org_id, provider, external_id, external_url, metadata, created_at, last_synced_at, last_sync_error, sync_attempts'

export interface UpsertExternalRefInput {
  work_item_id: string
  org_id: string
  provider: PmProviderDbValue
  external_id: string
  external_url: string
  metadata?: Record<string, unknown>
}

/**
 * Create or update a mirror row. Matches on (work_item_id, provider).
 * Resets sync_attempts/last_sync_error and bumps last_synced_at.
 */
export async function upsertExternalRef(
  input: UpsertExternalRefInput,
): Promise<WorkItemExternalRef | null> {
  const { data, error } = await supabase
    .from('work_item_external_refs')
    .upsert(
      {
        work_item_id: input.work_item_id,
        org_id: input.org_id,
        provider: input.provider,
        external_id: input.external_id,
        external_url: input.external_url,
        metadata: input.metadata ?? {},
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
        sync_attempts: 0,
      },
      { onConflict: 'work_item_id,provider' },
    )
    .select(REF_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { op: 'upsertExternalRef', work_item_id: input.work_item_id, provider: input.provider },
      tags: { layer: 'db', table: 'work_item_external_refs' },
    })
    return null
  }
  return data as WorkItemExternalRef
}

/**
 * Fetch all mirror rows for a work item, across every provider.
 * Returns empty array on error (non-fatal — callers should degrade gracefully).
 */
export async function getExternalRefsForWorkItem(
  workItemId: string,
): Promise<WorkItemExternalRef[]> {
  const { data, error } = await supabase
    .from('work_item_external_refs')
    .select(REF_COLUMNS)
    .eq('work_item_id', workItemId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { op: 'getExternalRefsForWorkItem', work_item_id: workItemId },
      tags: { layer: 'db', table: 'work_item_external_refs' },
    })
    return []
  }
  return (data ?? []) as WorkItemExternalRef[]
}

/**
 * Look up a work item id from an external (provider, external_id) pair.
 * Used by inbound webhook handlers to route provider events back to Lucid.
 */
export async function findWorkItemByExternalRef(
  provider: PmProviderDbValue,
  externalId: string,
): Promise<WorkItemExternalRef | null> {
  const { data, error } = await supabase
    .from('work_item_external_refs')
    .select(REF_COLUMNS)
    .eq('provider', provider)
    .eq('external_id', externalId)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { op: 'findWorkItemByExternalRef', provider, external_id: externalId },
      tags: { layer: 'db', table: 'work_item_external_refs' },
    })
    return null
  }
  return (data as WorkItemExternalRef | null) ?? null
}

export interface ListStaleRefsOptions {
  provider: PmProviderDbValue
  /** Only return refs older than this (ISO 8601). Defaults to now - 5min. */
  olderThan?: string
  limit?: number
}

/**
 * Reconcile cron scan: oldest-first stale refs for a given provider.
 * Per plan Section D: 50 refs/tick (20 for Trello rate-limit).
 */
export async function listStaleRefsForReconcile(
  options: ListStaleRefsOptions,
): Promise<WorkItemExternalRef[]> {
  const cutoff =
    options.olderThan ?? new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const limit = options.limit ?? 50

  const { data, error } = await supabase
    .from('work_item_external_refs')
    .select(REF_COLUMNS)
    .eq('provider', options.provider)
    .lt('last_synced_at', cutoff)
    .order('last_synced_at', { ascending: true })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { op: 'listStaleRefsForReconcile', provider: options.provider },
      tags: { layer: 'db', table: 'work_item_external_refs' },
    })
    return []
  }
  return (data ?? []) as WorkItemExternalRef[]
}

/**
 * Mark a ref as successfully synced right now. Resets error state.
 */
export async function touchLastSynced(
  refId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('work_item_external_refs')
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_error: null,
      sync_attempts: 0,
    })
    .eq('id', refId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { op: 'touchLastSynced', ref_id: refId },
      tags: { layer: 'db', table: 'work_item_external_refs' },
    })
    return false
  }
  return true
}

/**
 * Record a failed sync attempt. Bumps attempt counter + stores error message.
 */
export async function recordSyncFailure(
  refId: string,
  errorMessage: string,
): Promise<boolean> {
  // Read current attempts, then write attempts+1. This is a simple read-modify-write
  // because the reconcile cron is serialized per-provider (sharedOnly cron lock), so
  // there is no concurrent writer to the same row.
  const { data: existing, error: readError } = await supabase
    .from('work_item_external_refs')
    .select('sync_attempts')
    .eq('id', refId)
    .maybeSingle()

  if (readError) {
    ErrorService.captureException(readError, {
      severity: 'error',
      context: { op: 'recordSyncFailure.read', ref_id: refId },
      tags: { layer: 'db', table: 'work_item_external_refs' },
    })
    return false
  }

  const nextAttempts = (existing?.sync_attempts ?? 0) + 1

  const { error } = await supabase
    .from('work_item_external_refs')
    .update({
      last_sync_error: errorMessage.slice(0, 2000),
      sync_attempts: nextAttempts,
    })
    .eq('id', refId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { op: 'recordSyncFailure.write', ref_id: refId },
      tags: { layer: 'db', table: 'work_item_external_refs' },
    })
    return false
  }
  return true
}
