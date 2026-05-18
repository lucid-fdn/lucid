/**
 * Org PM Config — Per-org configuration for external PM providers.
 *
 * One row per (org, provider). Holds:
 *   - enabled flag (master switch)
 *   - is_primary flag (default destination — at most one per org)
 *   - Nango connection id (OAuth delegation)
 *   - provider-specific config JSONB
 *   - inbound webhook secret (HMAC verification, stripped from most reads)
 *
 * Migration: supabase/migrations/20260409100100_org_pm_config.sql
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.5
 */

import 'server-only'
import { supabase, ErrorService } from './client'
import type { OrgPmProviderConfig, PmProviderDbValue } from '@contracts/pm-adapter'

interface OrgPmConfigRow {
  id: string
  org_id: string
  provider: PmProviderDbValue
  enabled: boolean
  is_primary: boolean
  nango_connection_id: string
  config: Record<string, unknown>
  webhook_secret: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

const CONFIG_COLUMNS_WITH_SECRET =
  'id, org_id, provider, enabled, is_primary, nango_connection_id, config, webhook_secret, created_by, created_at, updated_at'

const CONFIG_COLUMNS_PUBLIC =
  'id, org_id, provider, enabled, is_primary, nango_connection_id, config, created_by, created_at, updated_at'

function rowToConfig(row: OrgPmConfigRow, includeSecret: boolean): OrgPmProviderConfig {
  return {
    id: row.id,
    orgId: row.org_id,
    provider: row.provider as OrgPmProviderConfig['provider'],
    enabled: row.enabled,
    isPrimary: row.is_primary,
    nangoConnectionId: row.nango_connection_id,
    config: row.config ?? {},
    webhookSecret: includeSecret ? row.webhook_secret : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  }
}

/**
 * Fetch the config row for a single (org, provider). Returns null if not
 * configured. Pass `includeSecret: true` ONLY from trusted server paths
 * (webhook verification, outbound sync worker) — never from API responses.
 */
export async function getOrgPmConfig(
  orgId: string,
  provider: PmProviderDbValue,
  options: { includeSecret?: boolean } = {},
): Promise<OrgPmProviderConfig | null> {
  const columns = options.includeSecret ? CONFIG_COLUMNS_WITH_SECRET : CONFIG_COLUMNS_PUBLIC
  const { data, error } = await supabase
    .from('org_pm_config')
    .select(columns)
    .eq('org_id', orgId)
    .eq('provider', provider)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { op: 'getOrgPmConfig', org_id: orgId, provider },
      tags: { layer: 'db', table: 'org_pm_config' },
    })
    return null
  }
  if (!data) return null
  return rowToConfig(data as unknown as OrgPmConfigRow, options.includeSecret === true)
}

/**
 * List all configured providers for an org. Never returns secrets.
 */
export async function listOrgPmConfigs(
  orgId: string,
): Promise<OrgPmProviderConfig[]> {
  const { data, error } = await supabase
    .from('org_pm_config')
    .select(CONFIG_COLUMNS_PUBLIC)
    .eq('org_id', orgId)
    .order('provider', { ascending: true })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { op: 'listOrgPmConfigs', org_id: orgId },
      tags: { layer: 'db', table: 'org_pm_config' },
    })
    return []
  }
  return (data ?? []).map((row) => rowToConfig(row as OrgPmConfigRow, false))
}

export interface SetOrgPmConfigInput {
  orgId: string
  provider: PmProviderDbValue
  enabled: boolean
  isPrimary: boolean
  nangoConnectionId: string
  config: Record<string, unknown>
  webhookSecret?: string | null
  createdBy?: string | null
}

/**
 * Insert or update an org's provider config. If `isPrimary=true`, first
 * clears any existing primary for the org (partial unique index only allows
 * one). Both operations happen in the same request path, but NOT in a single
 * DB transaction — acceptable because the unique index will reject double
 * writes and the UI is serialized through admin-only routes.
 */
export async function setOrgPmConfig(
  input: SetOrgPmConfigInput,
): Promise<OrgPmProviderConfig | null> {
  if (input.isPrimary) {
    const { error: clearError } = await supabase
      .from('org_pm_config')
      .update({ is_primary: false })
      .eq('org_id', input.orgId)
      .eq('is_primary', true)
      .neq('provider', input.provider)
    if (clearError) {
      ErrorService.captureException(clearError, {
        severity: 'error',
        context: { op: 'setOrgPmConfig.clearPrimary', org_id: input.orgId },
        tags: { layer: 'db', table: 'org_pm_config' },
      })
      return null
    }
  }

  const { data, error } = await supabase
    .from('org_pm_config')
    .upsert(
      {
        org_id: input.orgId,
        provider: input.provider,
        enabled: input.enabled,
        is_primary: input.isPrimary,
        nango_connection_id: input.nangoConnectionId,
        config: input.config,
        webhook_secret: input.webhookSecret ?? null,
        created_by: input.createdBy ?? null,
      },
      { onConflict: 'org_id,provider' },
    )
    .select(CONFIG_COLUMNS_WITH_SECRET)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { op: 'setOrgPmConfig', org_id: input.orgId, provider: input.provider },
      tags: { layer: 'db', table: 'org_pm_config' },
    })
    return null
  }
  // Never return the secret from the public setter. Callers that need the
  // secret should re-read via getOrgPmConfig with includeSecret: true from
  // a trusted server path.
  return rowToConfig(data as OrgPmConfigRow, false)
}

/**
 * Disable a provider for an org without deleting the config row. Keeps
 * history and allows quick re-enable. Also clears is_primary.
 */
export async function disableOrgPmConfig(
  orgId: string,
  provider: PmProviderDbValue,
): Promise<boolean> {
  const { error } = await supabase
    .from('org_pm_config')
    .update({ enabled: false, is_primary: false })
    .eq('org_id', orgId)
    .eq('provider', provider)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { op: 'disableOrgPmConfig', org_id: orgId, provider },
      tags: { layer: 'db', table: 'org_pm_config' },
    })
    return false
  }
  return true
}

/**
 * List all orgs that have a given provider enabled. Used by the reconcile
 * cron to batch work per-provider. Secrets are included because this is
 * called only from the worker (trusted path).
 */
export async function listEnabledConfigsForProvider(
  provider: PmProviderDbValue,
): Promise<OrgPmProviderConfig[]> {
  const { data, error } = await supabase
    .from('org_pm_config')
    .select(CONFIG_COLUMNS_WITH_SECRET)
    .eq('provider', provider)
    .eq('enabled', true)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { op: 'listEnabledConfigsForProvider', provider },
      tags: { layer: 'db', table: 'org_pm_config' },
    })
    return []
  }
  return (data ?? []).map((row) => rowToConfig(row as OrgPmConfigRow, true))
}
