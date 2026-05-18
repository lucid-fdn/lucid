import 'server-only'

import type { PluginToolDef } from '@contracts/plugin'
import { prepareToolManifest } from '@lucid/plugin-policy'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

interface OAuthCatalogActionRow {
  action_name: string
  description: string
  parameter_schema: Record<string, unknown> | null
}

async function selectCatalogRowsForProvider(provider: string): Promise<OAuthCatalogActionRow[]> {
  const { data, error } = await supabase
    .from('oauth_action_catalog')
    .select('action_name, description, parameter_schema')
    .eq('provider', provider)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('action_name', { ascending: true })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        provider,
        operation: 'SELECT',
        table: 'oauth_action_catalog',
      },
      tags: {
        layer: 'oauth',
        source: 'oauth_action_catalog',
      },
    })
    return []
  }

  return Array.isArray(data) ? data as OAuthCatalogActionRow[] : []
}

export async function getCatalogToolsForProvider(provider: string): Promise<PluginToolDef[]> {
  let rows = await selectCatalogRowsForProvider(provider)

  if (rows.length === 0) {
    const { data, error } = await supabase.rpc('get_oauth_provider_actions', {
      p_provider: provider,
    })

    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: {
          provider,
          operation: 'RPC',
          function: 'get_oauth_provider_actions',
        },
        tags: {
          layer: 'oauth',
          source: 'oauth_action_catalog_rpc',
        },
      })
      return []
    }

    rows = Array.isArray(data) ? data as OAuthCatalogActionRow[] : []
  }

  const rawTools = rows.map((row) => ({
    name: row.action_name,
    description: row.description || `Execute ${row.action_name}`,
    parameters: (row.parameter_schema && typeof row.parameter_schema === 'object')
      ? row.parameter_schema as Record<string, unknown>
      : { type: 'object', properties: {}, additionalProperties: false },
  }))

  const prepared = prepareToolManifest(rawTools, { dropInvalidTools: true })
  if (prepared.issues.length > 0) {
    ErrorService.captureMessage('Catalog manifest normalized for provider', {
      severity: prepared.metadata.hasErrors ? 'warning' : 'info',
      context: {
        provider,
        issueCount: prepared.issues.length,
        invalidToolCount: prepared.metadata.invalidToolCount,
        manifestHash: prepared.metadata.manifestHash,
      },
      tags: {
        layer: 'oauth',
        source: 'oauth_action_catalog',
      },
    })
  }

  return prepared.tools as PluginToolDef[]
}
