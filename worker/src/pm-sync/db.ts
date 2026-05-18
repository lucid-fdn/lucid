/**
 * PM Sync — Worker-side DB helpers.
 *
 * Narrow queries against `human_work_items`, `org_pm_config`, and
 * `work_item_external_refs` used by the outbound sync executor and the
 * reconcile cron. Read/write only via these helpers so the executor stays
 * thin and the shapes stay consistent with the DB schema.
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section D.1
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  HumanWorkItemLite,
  OrgPmProviderConfig,
  PmIssueRef,
  PmProvider,
} from './types.js'

// ─── human_work_items ──────────────────────────────────────────────────────

export async function loadWorkItemLite(
  supabase: SupabaseClient,
  workItemId: string,
): Promise<HumanWorkItemLite | null> {
  const { data, error } = await supabase
    .from('human_work_items')
    .select(
      'id, org_id, title, description, priority, labels, status, resolution, assignee_user_id, assignee_role, due_at, created_at, updated_at, dag_id, dag_node_id',
    )
    .eq('id', workItemId)
    .maybeSingle()

  if (error) {
    throw new Error(`loadWorkItemLite failed: ${error.message}`)
  }
  if (!data) return null

  const row = data as Record<string, unknown>
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    priority: (row.priority as HumanWorkItemLite['priority']) ?? 'normal',
    labels: (row.labels as string[] | null) ?? [],
    status: (row.status as HumanWorkItemLite['status']) ?? 'open',
    resolution: (row.resolution as string | null) ?? null,
    assigneeUserId: (row.assignee_user_id as string | null) ?? null,
    assigneeRole: (row.assignee_role as string | null) ?? null,
    dueAt: (row.due_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    dagContext: row.dag_id && row.dag_node_id
      ? {
          dagId: row.dag_id as string,
          dagNodeId: row.dag_node_id as string,
          downstreamBlockedCount: 0,
        }
      : null,
  }
}

// ─── org_pm_config ─────────────────────────────────────────────────────────

function rowToOrgPmProviderConfig(row: Record<string, unknown>): OrgPmProviderConfig {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    provider: row.provider as PmProvider,
    enabled: row.enabled as boolean,
    isPrimary: row.is_primary as boolean,
    nangoConnectionId: row.nango_connection_id as string,
    config: (row.config as Record<string, unknown>) ?? {},
    webhookSecret: (row.webhook_secret as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    createdBy: (row.created_by as string | null) ?? null,
  }
}

/**
 * Load an org's config for a given provider. If provider is omitted,
 * returns the primary enabled provider for the org (or null).
 */
export async function loadOrgPmConfig(
  supabase: SupabaseClient,
  orgId: string,
  provider?: PmProvider,
): Promise<OrgPmProviderConfig | null> {
  let query = supabase
    .from('org_pm_config')
    .select(
      'id, org_id, provider, enabled, is_primary, nango_connection_id, config, webhook_secret, created_by, created_at, updated_at',
    )
    .eq('org_id', orgId)
    .eq('enabled', true)

  if (provider) {
    query = query.eq('provider', provider)
  } else {
    query = query.eq('is_primary', true)
  }

  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new Error(`loadOrgPmConfig failed: ${error.message}`)
  }
  if (!data) return null
  return rowToOrgPmProviderConfig(data as Record<string, unknown>)
}

// ─── work_item_external_refs ───────────────────────────────────────────────

/** Shared column list for work_item_external_refs queries — single source of truth. */
const EXTERNAL_REF_COLUMNS =
  'id, work_item_id, org_id, provider, external_id, external_url, metadata, created_at, last_synced_at, last_sync_error, sync_attempts'

export interface ExternalRefRow {
  id: string
  workItemId: string
  orgId: string
  provider: PmProvider
  externalId: string
  externalUrl: string
  metadata: Record<string, unknown>
  createdAt: string
  lastSyncedAt: string
  lastSyncError: string | null
  syncAttempts: number
}

export function rowToExternalRef(row: Record<string, unknown>): ExternalRefRow {
  return {
    id: row.id as string,
    workItemId: row.work_item_id as string,
    orgId: row.org_id as string,
    provider: row.provider as PmProvider,
    externalId: row.external_id as string,
    externalUrl: row.external_url as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    lastSyncedAt: row.last_synced_at as string,
    lastSyncError: (row.last_sync_error as string | null) ?? null,
    syncAttempts: (row.sync_attempts as number | null) ?? 0,
  }
}

export async function loadExternalRef(
  supabase: SupabaseClient,
  workItemId: string,
  provider: PmProvider,
): Promise<ExternalRefRow | null> {
  const { data, error } = await supabase
    .from('work_item_external_refs')
    .select(EXTERNAL_REF_COLUMNS)
    .eq('work_item_id', workItemId)
    .eq('provider', provider)
    .maybeSingle()

  if (error) {
    throw new Error(`loadExternalRef failed: ${error.message}`)
  }
  return data ? rowToExternalRef(data as Record<string, unknown>) : null
}

/**
 * Insert (or idempotently update) an external ref after a successful create.
 * Called from the outbound executor once `adapter.createIssue()` returns a
 * `PmIssueRef`. Clears any prior error and resets attempts to 0.
 */
export async function upsertExternalRef(
  supabase: SupabaseClient,
  params: {
    workItemId: string
    orgId: string
    ref: PmIssueRef
  },
): Promise<ExternalRefRow> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('work_item_external_refs')
    .upsert(
      {
        work_item_id: params.workItemId,
        org_id: params.orgId,
        provider: params.ref.provider,
        external_id: params.ref.externalId,
        external_url: params.ref.externalUrl,
        metadata: params.ref.metadata ?? {},
        last_synced_at: now,
        last_sync_error: null,
        sync_attempts: 0,
      },
      { onConflict: 'work_item_id,provider' },
    )
    .select(EXTERNAL_REF_COLUMNS)
    .single()

  if (error || !data) {
    throw new Error(`upsertExternalRef failed: ${error?.message ?? 'no row'}`)
  }
  return rowToExternalRef(data as Record<string, unknown>)
}

export async function touchExternalRefSuccess(
  supabase: SupabaseClient,
  externalRefId: string,
): Promise<void> {
  const { error } = await supabase
    .from('work_item_external_refs')
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_error: null,
      sync_attempts: 0,
    })
    .eq('id', externalRefId)

  if (error) {
    throw new Error(`touchExternalRefSuccess failed: ${error.message}`)
  }
}

export async function recordExternalRefFailure(
  supabase: SupabaseClient,
  externalRefId: string,
  errorMessage: string,
): Promise<void> {
  // Best-effort: read attempts, write attempts+1. A lost update on the
  // counter is acceptable — it's advisory, not a gate.
  const { data } = await supabase
    .from('work_item_external_refs')
    .select('sync_attempts')
    .eq('id', externalRefId)
    .maybeSingle()

  const next = ((data?.sync_attempts as number | null) ?? 0) + 1
  const truncated = errorMessage.length > 2000
    ? errorMessage.slice(0, 1997) + '...'
    : errorMessage

  const { error } = await supabase
    .from('work_item_external_refs')
    .update({
      last_sync_error: truncated,
      sync_attempts: next,
    })
    .eq('id', externalRefId)

  if (error) {
    throw new Error(`recordExternalRefFailure failed: ${error.message}`)
  }
}
