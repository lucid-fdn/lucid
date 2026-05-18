import 'server-only'

import { supabase } from '@/lib/db/client'

export function resolveAuthoritativeConnectionsFromAppBindings(
  rows: Array<{
    plugin_catalog?: { auth_provider?: string | null } | null
    org_integration_connections?: { connection_id?: string | null; status?: string | null } | null
  }>,
): Record<string, string> {
  const authoritative: Record<string, string> = {}
  for (const row of rows) {
    const provider = row.plugin_catalog?.auth_provider
    const connectionId = row.org_integration_connections?.connection_id
    if (
      provider
      && connectionId
      && row.org_integration_connections?.status === 'active'
    ) {
      authoritative[provider] = connectionId
    }
  }
  return authoritative
}

export async function getAuthoritativeAssistantConnections(
  assistantId: string,
): Promise<Record<string, string>> {
  const { data: appBindings, error: appBindingError } = await supabase
    .from('assistant_app_bindings')
    .select(`
      plugin_id,
      org_connection_id,
      status,
      plugin_catalog!inner(auth_provider),
      org_integration_connections(connection_id, status)
    `)
    .eq('assistant_id', assistantId)
    .eq('status', 'active')

  if (!appBindingError && appBindings?.length) {
    const authoritative = resolveAuthoritativeConnectionsFromAppBindings(appBindings as Array<{
      plugin_catalog?: { auth_provider?: string | null } | null
      org_integration_connections?: { connection_id?: string | null; status?: string | null } | null
    }>)
    if (Object.keys(authoritative).length > 0) {
      return authoritative
    }
  }

  const { data: activations, error: activationError } = await supabase
    .from('assistant_plugin_activations')
    .select('installation_id')
    .eq('assistant_id', assistantId)
    .eq('is_active', true)

  if (activationError || !activations?.length) {
    return {}
  }

  const installationIds = activations
    .map((row) => row.installation_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)

  if (installationIds.length === 0) return {}

  const { data: installations, error: installError } = await supabase
    .from('org_plugin_installations')
    .select('id, plugin_id, active_connection_id')
    .in('id', installationIds)

  if (installError || !installations?.length) {
    return {}
  }

  const pluginIds = installations
    .map((row) => row.plugin_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
  const activeConnectionIds = installations
    .map((row) => row.active_connection_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)

  if (pluginIds.length === 0 || activeConnectionIds.length === 0) {
    return {}
  }

  const [{ data: plugins, error: pluginError }, { data: connections, error: connectionError }] = await Promise.all([
    supabase
      .from('plugin_catalog')
      .select('id, auth_provider')
      .in('id', pluginIds),
    supabase
      .from('org_integration_connections')
      .select('id, connection_id')
      .in('id', activeConnectionIds),
  ])

  if (pluginError || connectionError || !plugins?.length || !connections?.length) {
    return {}
  }

  const providerByPluginId = new Map(
    plugins
      .filter((row) => typeof row.auth_provider === 'string' && row.auth_provider.length > 0)
      .map((row) => [row.id, row.auth_provider as string]),
  )
  const connectionIdByRowId = new Map(
    connections
      .filter((row) => typeof row.connection_id === 'string' && row.connection_id.length > 0)
      .map((row) => [row.id, row.connection_id as string]),
  )

  const authoritative: Record<string, string> = {}
  for (const installation of installations) {
    const provider = providerByPluginId.get(installation.plugin_id)
    const connectionId = connectionIdByRowId.get(installation.active_connection_id)
    if (provider && connectionId) {
      authoritative[provider] = connectionId
    }
  }

  return authoritative
}

export function applyAuthoritativeConnectionIds(
  rows: Array<Record<string, unknown>>,
  authoritativeConnections: Record<string, string>,
): Array<Record<string, unknown>> {
  if (rows.length === 0 || Object.keys(authoritativeConnections).length === 0) {
    return rows
  }

  return rows.map((row) => {
    const provider = row.auth_provider
    if (typeof provider !== 'string') return row
    const authoritativeConnectionId = authoritativeConnections[provider]
    if (!authoritativeConnectionId) return row
    if (row.connection_id === authoritativeConnectionId) return row
    return { ...row, connection_id: authoritativeConnectionId }
  })
}
