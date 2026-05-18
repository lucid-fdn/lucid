/**
 * Centralized Integration Service (Server-only)
 *
 * Single source of truth for "what integrations exist?" and "what's connected?"
 * Used by API routes, server components, and the worker (via API).
 *
 * All integration queries should go through this module — no inline joins
 * or ad-hoc assembly in route handlers.
 */

import 'server-only'
import { getPluginCatalogByKind } from '@/lib/db/plugins'
import { getOrgPlugins, getAssistantOAuthBindings } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { getAuthoritativeAssistantConnections } from '@/lib/oauth/authoritative-connections'
import type { PluginCatalogEntry } from '@contracts/plugin'
import type { Integration } from '@contracts/integration'

export type { Integration }

// ---------------------------------------------------------------------------
// Core queries
// ---------------------------------------------------------------------------

/**
 * Get all integrations with connection status for a given assistant.
 *
 * Joins: plugin_catalog (kind=integration) + org_plugin_installations + assistant_oauth_bindings
 */
export async function getIntegrations(
  assistantId: string,
  orgId: string,
): Promise<Integration[]> {
  try {
    const [catalog, orgPlugins, oauthBindingsRaw, authoritativeConnections] = await Promise.all([
      getPluginCatalogByKind(['integration']),
      getOrgPlugins(orgId),
      getAssistantOAuthBindings(assistantId).catch(() => []),
      getAuthoritativeAssistantConnections(assistantId).catch(() => ({})),
    ])

    const orgPluginMap = new Map(orgPlugins.map(op => [op.plugin_id, op]))

    // Build binding lookup: provider → { connectionId }
    const bindings: Record<string, { connectionId: string | null }> = {}
    for (const b of oauthBindingsRaw as Array<{ provider?: string; connection_id?: string }>) {
      if (b.provider) {
        bindings[b.provider] = { connectionId: b.connection_id ?? null }
      }
    }
    for (const [provider, connectionId] of Object.entries(authoritativeConnections)) {
      bindings[provider] = { connectionId }
    }

    return catalog
      .filter((c: PluginCatalogEntry) => c.auth_provider)
      .map((c: PluginCatalogEntry) => {
        const orgInstall = orgPluginMap.get(c.id)
        const binding = c.auth_provider ? bindings[c.auth_provider] : undefined
        const tools = orgInstall?.manifest_snapshot ?? c.tool_manifest ?? []

        return {
          id: c.id,
          slug: c.slug,
          name: c.name,
          description: c.description,
          category: c.category,
          auth_provider: c.auth_provider!,
          installed: !!orgInstall,
          installation_id: orgInstall?.id ?? null,
          connection_status: binding ? 'connected' as const : 'setup_required' as const,
          connection_id: binding?.connectionId ?? null,
          tools,
          tool_count: tools.length,
        }
      })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { assistantId, orgId },
      tags: { layer: 'integrations', operation: 'getIntegrations' },
    })
    return []
  }
}

/**
 * Check if a specific provider is connected for an assistant.
 */
export async function isProviderConnected(
  assistantId: string,
  provider: string,
): Promise<boolean> {
  try {
    const bindings = await getAssistantOAuthBindings(assistantId).catch(() => [])
    return (bindings as Array<{ provider?: string }>).some(b => b.provider === provider)
  } catch {
    return false
  }
}

/**
 * Get all connected provider names for an assistant.
 */
export async function getConnectedProviders(
  assistantId: string,
): Promise<string[]> {
  try {
    const bindings = await getAssistantOAuthBindings(assistantId).catch(() => [])
    return (bindings as Array<{ provider?: string }>)
      .filter(b => b.provider)
      .map(b => b.provider!)
  } catch {
    return []
  }
}
