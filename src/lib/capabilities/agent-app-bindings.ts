import 'server-only'

import type { PluginCatalogEntry } from '@contracts/plugin'

import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

export interface AppConnectionOption {
  id: string
  plugin_id: string
  connection_id: string
  auth_provider: string
  status: 'active' | 'expired' | 'revoked' | 'error'
  account_label: string | null
  account_id: string | null
  connected_at: string | null
}

export interface AssistantAppBindingRow {
  id: string
  assistant_id: string
  plugin_id: string
  org_connection_id: string | null
  status: 'active' | 'disabled' | 'needs_connection' | 'error'
  enabled_actions: string[] | null
  config: Record<string, unknown> | null
}

export async function getOrgAppConnectionOptions(orgId: string): Promise<AppConnectionOption[]> {
  const { data, error } = await supabase
    .from('org_integration_connections')
    .select('id, plugin_id, connection_id, auth_provider, status, account_label, account_id, connected_at')
    .eq('org_id', orgId)
    .neq('status', 'revoked')
    .order('connected_at', { ascending: false })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'getOrgAppConnectionOptions', orgId },
      tags: { layer: 'database', table: 'org_integration_connections' },
    })
    return []
  }

  return (data ?? []) as AppConnectionOption[]
}

export async function getAssistantAppBindings(assistantId: string): Promise<AssistantAppBindingRow[]> {
  const { data, error } = await supabase
    .from('assistant_app_bindings')
    .select('id, assistant_id, plugin_id, org_connection_id, status, enabled_actions, config')
    .eq('assistant_id', assistantId)

  if (error) {
    // The table is additive; fail open while migrations are rolling out.
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { fn: 'getAssistantAppBindings', assistantId },
      tags: { layer: 'database', table: 'assistant_app_bindings' },
    })
    return []
  }

  return (data ?? []) as AssistantAppBindingRow[]
}

export async function ensureAssistantAppBindingsForPlugins(input: {
  assistantId: string
  orgId: string
  pluginSlugs: string[]
  enabledActionsBySlug?: Record<string, string[] | null>
  selectedConnectionIdsByProvider?: Record<string, string | null | undefined>
}): Promise<void> {
  const slugs = Array.from(new Set(input.pluginSlugs)).filter(Boolean)
  if (slugs.length === 0) return

  const { data: plugins, error: pluginError } = await supabase
    .from('plugin_catalog')
    .select('id, slug, kind, auth_provider')
    .in('slug', slugs)

  if (pluginError) {
    throw pluginError
  }

  const appPlugins = ((plugins ?? []) as Array<Pick<PluginCatalogEntry, 'id' | 'slug' | 'kind' | 'auth_provider'>>)
    .filter((plugin) => plugin.kind === 'integration' && plugin.auth_provider)

  if (appPlugins.length === 0) return

  const pluginIds = appPlugins.map((plugin) => plugin.id)
  const { data: connections, error: connectionError } = await supabase
    .from('org_integration_connections')
    .select('id, plugin_id, status, connected_at')
    .eq('org_id', input.orgId)
    .in('plugin_id', pluginIds)
    .eq('status', 'active')
    .order('connected_at', { ascending: false })

  if (connectionError) {
    throw connectionError
  }

  const latestConnectionByPluginId = new Map<string, string>()
  for (const connection of (connections ?? []) as Array<{ id: string; plugin_id: string }>) {
    if (!latestConnectionByPluginId.has(connection.plugin_id)) {
      latestConnectionByPluginId.set(connection.plugin_id, connection.id)
    }
  }

  const validConnectionIdsByPluginId = new Map<string, Set<string>>()
  for (const connection of (connections ?? []) as Array<{ id: string; plugin_id: string }>) {
    const existing = validConnectionIdsByPluginId.get(connection.plugin_id) ?? new Set<string>()
    existing.add(connection.id)
    validConnectionIdsByPluginId.set(connection.plugin_id, existing)
  }

  const rows = appPlugins.map((plugin) => {
    const requestedConnectionId = plugin.auth_provider
      ? input.selectedConnectionIdsByProvider?.[plugin.auth_provider] ?? null
      : null
    const requestedConnectionIsValid = requestedConnectionId
      ? validConnectionIdsByPluginId.get(plugin.id)?.has(requestedConnectionId) === true
      : false
    const orgConnectionId = requestedConnectionIsValid
      ? requestedConnectionId
      : latestConnectionByPluginId.get(plugin.id) ?? null
    return {
      assistant_id: input.assistantId,
      plugin_id: plugin.id,
      org_connection_id: orgConnectionId,
      status: orgConnectionId ? 'active' : 'needs_connection',
      enabled_actions: input.enabledActionsBySlug?.[plugin.slug] ?? null,
      config: {},
    }
  })

  const { error } = await supabase
    .from('assistant_app_bindings')
    .upsert(rows, { onConflict: 'assistant_id,plugin_id' })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        fn: 'ensureAssistantAppBindingsForPlugins',
        assistantId: input.assistantId,
        orgId: input.orgId,
        pluginSlugs: slugs,
      },
      tags: { layer: 'database', table: 'assistant_app_bindings' },
    })
  }
}

export function groupConnectionOptionsByProvider(
  connections: AppConnectionOption[],
): Record<string, AppConnectionOption[]> {
  const grouped: Record<string, AppConnectionOption[]> = {}
  for (const connection of connections) {
    grouped[connection.auth_provider] ??= []
    grouped[connection.auth_provider]!.push(connection)
  }
  return grouped
}
