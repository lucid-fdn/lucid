/**
 * Capability Core — Manifest Normalization
 *
 * Normalizes DB rows (snake_case) into the internal ActivatedPlugin format (camelCase).
 * Used by the worker when transforming RPC results.
 */

import type { ActivatedPlugin } from './types.js'
import { prepareToolManifest } from './tool-manifest.js'

/**
 * Transform a raw DB row from get_assistant_active_plugins RPC into an ActivatedPlugin.
 * Handles both old (source/mcpgate_server_id only) and new (unified fields) formats.
 */
export function normalizePluginRow(row: Record<string, unknown>): ActivatedPlugin {
  // Tool manifest: may be JSONB array or stringified
  let tools = []
  const rawManifest = row.tool_manifest ?? row.manifest_snapshot
  if (Array.isArray(rawManifest)) {
    tools = rawManifest
  } else if (typeof rawManifest === 'string') {
    try {
      tools = JSON.parse(rawManifest)
    } catch {
      tools = []
    }
  }

  // Filter tools by enabled_tools if present
  const enabledTools = row.enabled_tools as string[] | null
  if (enabledTools && Array.isArray(enabledTools)) {
    tools = tools.filter((t: { name?: string }) => enabledTools.includes(t.name ?? ''))
  }

  const preparedManifest = prepareToolManifest(tools, { dropInvalidTools: true })

  // Merge org config + plugin config (plugin config takes precedence)
  const orgConfig = (row.org_config ?? {}) as Record<string, unknown>
  const pluginConfig = (row.plugin_config ?? row.config ?? {}) as Record<string, unknown>
  const config = { ...orgConfig, ...pluginConfig }

  return {
    slug: row.plugin_slug as string,
    name: row.plugin_name as string,
    tools: preparedManifest.tools,
    config,

    // UCA dimensions (required — safe defaults match DB column defaults)
    kind: ((row.kind as string) ?? 'plugin') as ActivatedPlugin['kind'],
    transport: ((row.transport as string) ?? 'remote-mcp') as ActivatedPlugin['transport'],
    trustLevel: ((row.trust_level as string) ?? 'community') as ActivatedPlugin['trustLevel'],
    executionMode: ((row.execution_mode as string) ?? 'gateway') as ActivatedPlugin['executionMode'],
    authType: ((row.auth_type as string) ?? 'none') as ActivatedPlugin['authType'],
    authProvider: (row.auth_provider as string) ?? null,

    // Routing targets
    mcpgateServerId: (row.mcpgate_server_id as string) ?? undefined,
    endpointUrl: (row.endpoint_url as string) ?? undefined,

    // Fallback policy
    fallbackMode: ((row.fallback_mode as string) ?? null) as ActivatedPlugin['fallbackMode'],

    // Deprecated (kept for wire compat)
    source: (row.source as ActivatedPlugin['source']) ?? undefined,
  }
}
