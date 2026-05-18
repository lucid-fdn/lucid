/**
 * Plugin types for the worker.
 * Mirrors contracts/plugin.ts but without Zod dependency.
 */

import { prepareToolManifest } from '@lucid/plugin-policy'

/** Tool definition from plugin catalog (OpenAI function calling format) */
export interface PluginToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
}

function normalizePluginToolDefs(tools: PluginToolDef[]): PluginToolDef[] {
  const prepared = prepareToolManifest(tools, { dropInvalidTools: true })
  if (prepared.issues.length > 0) {
    console.warn(
      `[plugin-types] normalized manifest issues=${prepared.issues.length} invalidTools=${prepared.metadata.invalidToolCount} hash=${prepared.metadata.manifestHash}`,
    )
  }
  return prepared.tools as PluginToolDef[]
}

/** Activated plugin with resolved tools (worker receives this) */
export interface ActivatedPlugin {
  slug: string
  name: string
  tools: PluginToolDef[]
  config: Record<string, unknown>

  // UCA fields (carried from DB — safe defaults applied at mapping boundary)
  kind: 'plugin' | 'integration'
  transport: 'embedded' | 'remote-mcp' | 'rest' | 'nango'
  trustLevel: 'internal' | 'verified' | 'community'
  executionMode: 'in_process' | 'gateway'
  authType: 'none' | 'oauth2' | 'api-key' | 'env-var'
  authProvider: string | null

  // Credential resolution
  connectionId?: string      // org_integration_connections.connection_id (for OAuth/API-key)

  // Routing targets (by transport type)
  mcpgateServerId?: string   // for remote-mcp
  endpointUrl?: string       // for rest

  // Fallback policy: null = fail hard (default), 'gateway' = fall back to MCPGate
  fallbackMode?: 'gateway' | null

  // Nango integration policy (from assistant_plugin_activations.config, transport='nango' only)
  nangoPolicy?: {
    requiresConfirmationActions?: string[]
    maxCallsPerRun?: number
    allowedResources?: Record<string, unknown>
    integrationId?: string
  }

  /** @deprecated Use trustLevel + transport instead. */
  source?: 'first-party' | 'mcpgate' | 'community'
}

// =============================================================================
// Plugin Row Mapping (RPC result → ActivatedPlugin)
// =============================================================================

/** Wire format from BFF (camelCase, partial — needs defaults) */
interface PluginWirePayload {
  slug: string
  name: string
  tools: PluginToolDef[]
  config: Record<string, unknown>
  kind?: string
  transport?: string
  trustLevel?: string
  executionMode?: string
  authType?: string
  authProvider?: string | null
  endpointUrl?: string
  fallbackMode?: string | null
  mcpgateServerId?: string
  connectionId?: string
  source?: string
}

/** Map a BFF wire payload to a typed ActivatedPlugin (safe defaults). */
export function mapWireToActivatedPlugin(p: PluginWirePayload): ActivatedPlugin {
  return {
    slug: p.slug,
    name: p.name,
    tools: normalizePluginToolDefs(p.tools),
    config: p.config || {},
    kind: (p.kind ?? 'plugin') as ActivatedPlugin['kind'],
    transport: (p.transport ?? 'remote-mcp') as ActivatedPlugin['transport'],
    trustLevel: (p.trustLevel ?? 'community') as ActivatedPlugin['trustLevel'],
    executionMode: (p.executionMode ?? 'gateway') as ActivatedPlugin['executionMode'],
    authType: (p.authType ?? 'none') as ActivatedPlugin['authType'],
    authProvider: p.authProvider ?? null,
    endpointUrl: p.endpointUrl,
    fallbackMode: (p.fallbackMode ?? null) as ActivatedPlugin['fallbackMode'],
    mcpgateServerId: p.mcpgateServerId,
    connectionId: p.connectionId,
    source: p.source as ActivatedPlugin['source'],
  }
}

/** Map a get_assistant_active_plugins RPC row (snake_case) to ActivatedPlugin. */
export function mapRpcRowToActivatedPlugin(row: Record<string, unknown>): ActivatedPlugin {
  const allTools = (row.tool_manifest ?? []) as PluginToolDef[]
  const enabled = row.enabled_tools as string[] | null
  return {
    slug: row.plugin_slug as string,
    name: row.plugin_name as string,
    tools: normalizePluginToolDefs(enabled ? allTools.filter(t => enabled.includes(t.name)) : allTools),
    config: { ...((row.org_config as Record<string, unknown>) || {}), ...((row.plugin_config as Record<string, unknown>) || {}) },
    kind: ((row.kind as string) ?? 'plugin') as ActivatedPlugin['kind'],
    transport: ((row.transport as string) ?? 'remote-mcp') as ActivatedPlugin['transport'],
    trustLevel: ((row.trust_level as string) ?? 'community') as ActivatedPlugin['trustLevel'],
    executionMode: ((row.execution_mode as string) ?? 'gateway') as ActivatedPlugin['executionMode'],
    authType: ((row.auth_type as string) ?? 'none') as ActivatedPlugin['authType'],
    authProvider: (row.auth_provider as string) || null,
    endpointUrl: (row.endpoint_url as string) || undefined,
    fallbackMode: ((row.fallback_mode as string) || null) as ActivatedPlugin['fallbackMode'],
    mcpgateServerId: (row.mcpgate_server_id as string) || undefined,
    connectionId: (row.connection_id as string) || undefined,
    source: (row.source as string) as ActivatedPlugin['source'],
  }
}

// =============================================================================
// Wire Tool Names
// =============================================================================

/**
 * Convert plugin slug + tool name to wire format for LLM tool calling.
 * OpenAI tool names must match ^[a-zA-Z0-9_-]+$ (max 64 chars).
 * Format: lucid_seo__research_keywords (double underscore separator)
 */
export function toWireToolName(pluginSlug: string, toolName: string): string {
  const full = `${pluginSlug}__${toolName}`.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (full.length <= 64) return full
  const hash = simpleHash(full).toString(36).slice(0, 6)
  return `${full.slice(0, 57)}_${hash}`
}

/**
 * Parse wire tool name back to plugin slug + tool name.
 */
export function parseWireToolName(wireName: string): { pluginSlug: string; toolName: string } | null {
  const idx = wireName.indexOf('__')
  if (idx === -1) return null
  return { pluginSlug: wireName.slice(0, idx), toolName: wireName.slice(idx + 2) }
}

/** FNV-1a hash for deterministic short hashes */
function simpleHash(str: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash
}
