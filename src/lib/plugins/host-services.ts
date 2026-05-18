import 'server-only'

import { normalizePluginRow } from '@lucid/plugin-policy'
import { ErrorService } from '@/lib/errors/error-service'
import { discoverIntegrationTools } from '@/lib/oauth/discover-integration-tools'
import { getCatalogToolsForProvider } from '@/lib/oauth/catalog-tools'
import type { PluginToolDef } from '@contracts/plugin'

export interface PluginRuntimePayload {
  slug: unknown
  name: unknown
  tools: Array<{ name: string }>
  config: Record<string, unknown>
  kind: string
  transport: string
  trustLevel: string
  executionMode: string
  authType: string
  authProvider: string | null
  endpointUrl?: string
  fallbackMode?: string | null
  mcpgateServerId?: string
  connectionId?: string
  source: unknown
}

export async function resolveIntegrationHostManifest(
  authProvider: string,
  fallbackManifest: PluginToolDef[] = [],
) {
  const catalogTools = await getCatalogToolsForProvider(authProvider)
  if (catalogTools.length > 0) {
    ErrorService.captureMessage('Resolved integration manifest from oauth_action_catalog', {
      severity: 'info',
      context: {
        authProvider,
        actionCount: catalogTools.length,
        source: 'oauth_action_catalog',
      },
      tags: {
        layer: 'plugins',
        area: 'host-services',
      },
    })

    return {
      ok: true as const,
      tools: catalogTools,
      config: {
        manifest_source: 'oauth_action_catalog',
        manifest_provider: authProvider,
        manifest_action_count: catalogTools.length,
        manifest_discovered_at: new Date().toISOString(),
      },
    }
  }

  const discovery = await discoverIntegrationTools(authProvider)
  if (!discovery.ok || discovery.tools.length === 0) {
    ErrorService.captureMessage('Integration manifest discovery failed', {
      severity: 'warning',
      context: {
        authProvider,
        discoveryError: discovery.error ?? null,
        fallbackManifestCount: fallbackManifest.length,
      },
      tags: {
        layer: 'plugins',
        area: 'host-services',
      },
    })

    if (fallbackManifest.length > 0) {
      return {
        ok: true as const,
        tools: fallbackManifest,
        config: {
          manifest_source: 'plugin_catalog',
          manifest_provider: authProvider,
          manifest_action_count: fallbackManifest.length,
          manifest_discovered_at: new Date().toISOString(),
        },
      }
    }

    return {
      ok: false as const,
      error: discovery.error ?? `No actions found for provider "${authProvider}"`,
    }
  }

  return {
    ok: true as const,
    tools: discovery.tools,
    config: {
      manifest_source: 'nango_scripts',
      manifest_provider: discovery.provider,
      manifest_action_count: discovery.action_count,
      manifest_discovered_at: discovery.discovered_at,
    },
  }
}

export function buildPluginRuntimePayloads(
  rows: Array<Record<string, unknown>>,
): PluginRuntimePayload[] {
  return rows.map((row) => {
    const normalized = normalizePluginRow(row)

    return {
      slug: normalized.slug,
      name: normalized.name,
      tools: normalized.tools,
      config: normalized.config,
      kind: normalized.kind ?? 'plugin',
      transport: normalized.transport ?? 'remote-mcp',
      trustLevel: normalized.trustLevel ?? 'community',
      executionMode: normalized.executionMode ?? 'gateway',
      authType: normalized.authType ?? 'none',
      authProvider: normalized.authProvider ?? null,
      endpointUrl:
        typeof row.endpoint_url === 'string' && row.endpoint_url.length > 0
          ? row.endpoint_url
          : undefined,
      fallbackMode:
        typeof row.fallback_mode === 'string' && row.fallback_mode.length > 0
          ? row.fallback_mode
          : null,
      mcpgateServerId: normalized.mcpgateServerId,
      connectionId:
        typeof row.connection_id === 'string' && row.connection_id.length > 0
          ? row.connection_id
          : undefined,
      source: normalized.source,
    }
  })
}
