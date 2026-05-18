/**
 * Capability Core — Types
 *
 * Canonical types for the unified capability architecture.
 * These mirror contracts/plugin.ts but are framework-independent.
 */

// =============================================================================
// Plugin Catalog Entry (from DB)
// =============================================================================

export interface PluginCatalogEntry {
  id: string
  slug: string
  name: string
  description: string | null
  version: string
  source: 'first-party' | 'mcpgate' | 'community'

  // Unified Capability Architecture fields
  kind: 'plugin' | 'integration' | 'platform'
  transport: 'embedded' | 'remote-mcp' | 'rest' | 'nango'
  trustLevel: 'internal' | 'verified' | 'community'
  executionMode: 'in_process' | 'gateway'
  authType: 'none' | 'oauth2' | 'api-key' | 'env-var'
  authProvider: string | null

  // Tool manifest
  toolManifest: ToolDef[]

  // MCPGate routing
  mcpgateServerId?: string | null

  // Runtime flags
  riskLevel: 'read' | 'write' | 'destructive'
  verified: boolean
  isPublished: boolean
  maxTools: number
}

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
}

// =============================================================================
// Activated Plugin (resolved from DB joins — what the worker receives)
// =============================================================================

export interface ActivatedPlugin {
  slug: string
  name: string
  tools: ToolDef[]
  config: Record<string, unknown>

  // UCA dimensions (required — DB columns have defaults)
  kind: 'plugin' | 'integration' | 'platform'
  transport: 'embedded' | 'remote-mcp' | 'rest' | 'nango'
  trustLevel: 'internal' | 'verified' | 'community'
  executionMode: 'in_process' | 'gateway'
  authType: 'none' | 'oauth2' | 'api-key' | 'env-var'
  authProvider: string | null

  // Routing targets (by transport type)
  mcpgateServerId?: string   // for remote-mcp
  endpointUrl?: string       // for rest

  // Fallback policy: null = fail hard (default), 'gateway' = fall back to MCPGate
  fallbackMode?: 'gateway' | null

  /** @deprecated Use trustLevel + transport instead. Kept for DB wire compat. */
  source?: 'first-party' | 'mcpgate' | 'community'
}

// =============================================================================
// Policy Resolution
// =============================================================================

export type PolicyDecision = 'allow_in_process' | 'allow_gateway' | 'block'

export interface PolicyResult {
  decision: PolicyDecision
  reason: string
  /** Effective execution mode after policy resolution. */
  effectiveMode: 'in_process' | 'gateway'
}

export interface PolicyConfig {
  /** Admin blocklist — slugs that are blocked regardless of trust. */
  blockedPlugins?: string[]
  /** Environment override (e.g., force gateway in staging). */
  forceGateway?: boolean
}

// =============================================================================
// Router
// =============================================================================

export type ExecutionPath = 'embedded' | 'gateway-mcp' | 'gateway-rest' | 'blocked'

export interface RouteResult {
  path: ExecutionPath
  /** The target URL or server ID for gateway paths. */
  target?: string
  /** Policy result that determined this route. */
  policy: PolicyResult
}

// =============================================================================
// Audit
// =============================================================================

export interface AuditEvent {
  timestamp: string
  pluginSlug: string
  toolName: string
  executionPath: ExecutionPath
  durationMs: number
  success: boolean
  error?: string
  /** Who triggered it (assistant ID, org ID). */
  context?: Record<string, unknown>
}

export type AuditHandler = (event: AuditEvent) => void | Promise<void>
