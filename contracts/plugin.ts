/**
 * Plugin System Contracts
 *
 * Pure TypeScript + Zod — no framework dependencies.
 * Shared between src/ (Next.js) and worker/ (Node.js).
 */

import { z } from 'zod'

// =============================================================================
// TOOL DEFINITION (OpenAI function calling format)
// =============================================================================

export const PluginToolDefSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), z.unknown()),
})

export type PluginToolDef = z.infer<typeof PluginToolDefSchema>

// =============================================================================
// PLUGIN CATALOG ENTRY
// =============================================================================

export const PluginCatalogEntrySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  version: z.string(),
  author: z.string().nullable(),
  license: z.string().nullable(),
  icon_url: z.string().nullable(),
  category: z.string(),
  tool_manifest: z.array(PluginToolDefSchema),
  source: z.enum(['first-party', 'mcpgate', 'community']),
  risk_level: z.enum(['read', 'write', 'destructive']),
  verified: z.boolean(),
  max_tools: z.number(),
  is_published: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  // Unified Capability Architecture fields (RFC 2026-03-23)
  // Optional for backwards compatibility — existing code that doesn't
  // destructure these fields continues to work unchanged.
  kind: z.enum(['plugin', 'integration', 'platform']).optional(),
  transport: z.enum(['embedded', 'remote-mcp', 'rest', 'nango']).optional(),
  trust_level: z.enum(['internal', 'verified', 'community']).optional(),
  execution_mode: z.enum(['in_process', 'gateway']).optional(),
  auth_type: z.enum(['none', 'oauth2', 'api-key', 'env-var']).optional(),
  auth_provider: z.string().nullable().optional(),
  endpoint_url: z.string().nullable().optional(),
  fallback_mode: z.enum(['gateway']).nullable().optional(),
  partner_id: z.string().nullable().optional(),
  partner_branding: z.record(z.string(), z.unknown()).nullable().optional(),
  min_plan: z.enum(['starter', 'pro', 'business']).optional(),
})

export type PluginCatalogEntry = z.infer<typeof PluginCatalogEntrySchema>

// =============================================================================
// ORG PLUGIN INSTALLATION
// =============================================================================

export const OrgPluginInstallationSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  plugin_id: z.string().uuid(),
  installed_version: z.string(),
  manifest_snapshot: z.array(PluginToolDefSchema),
  config: z.record(z.string(), z.unknown()).default({}),
  installed_at: z.string(),
  installed_by: z.string().uuid().nullable(),
})

export type OrgPluginInstallation = z.infer<typeof OrgPluginInstallationSchema>

// =============================================================================
// ASSISTANT PLUGIN ACTIVATION
// =============================================================================

export const AssistantPluginActivationSchema = z.object({
  id: z.string().uuid(),
  assistant_id: z.string().uuid(),
  installation_id: z.string().uuid(),
  enabled_tools: z.array(z.string()).nullable(),
  config: z.record(z.string(), z.unknown()).default({}),
  is_active: z.boolean(),
  activated_at: z.string(),
})

export type AssistantPluginActivation = z.infer<typeof AssistantPluginActivationSchema>

// =============================================================================
// ACTIVATED PLUGIN (Worker receives this — resolved from DB joins)
// =============================================================================

export const ActivatedPluginSchema = z.object({
  slug: z.string(),
  name: z.string(),
  tools: z.array(PluginToolDefSchema),
  config: z.record(z.string(), z.unknown()),
  source: z.enum(['first-party', 'mcpgate', 'community']),
  mcpgateServerId: z.string().optional(),
  // Unified Capability Architecture fields (RFC 2026-03-23)
  kind: z.enum(['plugin', 'integration', 'platform']).optional(),
  transport: z.enum(['embedded', 'remote-mcp', 'rest', 'nango']).optional(),
  trustLevel: z.enum(['internal', 'verified', 'community']).optional(),
  executionMode: z.enum(['in_process', 'gateway']).optional(),
  authType: z.enum(['none', 'oauth2', 'api-key', 'env-var']).optional(),
  authProvider: z.string().nullable().optional(),
  connectionId: z.string().optional(),
})

export type ActivatedPlugin = z.infer<typeof ActivatedPluginSchema>

// =============================================================================
// ORG INTEGRATION CONNECTION (OAuth/API connection records)
// =============================================================================

export const OrgIntegrationConnectionSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  plugin_id: z.string().uuid(),
  connection_id: z.string(),
  auth_provider: z.string(),
  status: z.enum(['active', 'expired', 'revoked', 'error']),
  scopes: z.array(z.string()).default([]),
  account_label: z.string().nullable().optional(),
  account_id: z.string().nullable().optional(),
  connected_at: z.string(),
  connected_by: z.string().uuid().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  last_used_at: z.string().nullable().optional(),
  disconnected_at: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
  updated_at: z.string(),
})

export type OrgIntegrationConnection = z.infer<typeof OrgIntegrationConnectionSchema>

// =============================================================================
// ASSISTANT APP BINDING (per-agent selected app account)
// =============================================================================

export const AssistantAppBindingSchema = z.object({
  id: z.string().uuid(),
  assistant_id: z.string().uuid(),
  plugin_id: z.string().uuid(),
  org_connection_id: z.string().uuid().nullable(),
  status: z.enum(['active', 'disabled', 'needs_connection', 'error']),
  enabled_actions: z.array(z.string()).nullable().optional(),
  requires_confirmation_actions: z.array(z.string()).nullable().optional(),
  max_calls_per_run: z.number().int().positive().nullable().optional(),
  allowed_resources: z.record(z.string(), z.unknown()).nullable().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
  updated_at: z.string(),
})

export type AssistantAppBinding = z.infer<typeof AssistantAppBindingSchema>

// =============================================================================
// TOOL NAME SANITIZATION
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
 * Returns null if the name doesn't contain the double underscore separator.
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
