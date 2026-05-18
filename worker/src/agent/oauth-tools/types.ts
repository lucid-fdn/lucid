/**
 * OAuth Tool Execution Types
 *
 * Shared types for the OAuth tool execution layer.
 * Worker-side — no Next.js dependencies.
 *
 * Architecture: Nango owns auth + API translation (triggerAction).
 * We own policy: bindings, rate limits, audit, confirmation gating.
 */

// ---------------------------------------------------------------------------
// Danger Levels
// ---------------------------------------------------------------------------

export type ActionDangerLevel = 'read' | 'write' | 'destructive'

// ---------------------------------------------------------------------------
// Tool Definition (from Nango /scripts/config)
// ---------------------------------------------------------------------------

/** A single tool discovered from Nango's integration config. */
export interface NangoToolDefinition {
  /** Action name in Nango (e.g. 'send-message', 'create-contact') */
  actionName: string
  /** Human-readable description for the LLM */
  description: string
  /** JSON Schema for parameters (from Nango's Zod→JSON Schema) */
  inputSchema: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Bindings & Context
// ---------------------------------------------------------------------------

export interface OAuthBinding {
  assistantId: string
  provider: string
  connectionId: string
  /** Nango integration ID (providerConfigKey). If empty, defaults to provider. */
  integrationId: string
  enabledActions: string[]
  requiresConfirmationActions: string[]
  maxCallsPerRun: number
  allowedResources: Record<string, unknown>
  metadata: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Nango Binding Factory
// ---------------------------------------------------------------------------

/**
 * Build an OAuthBinding from plugin data.
 * Single source of truth — used by both builder.ts (v2) and OpenClawAgent.ts (legacy).
 */
export function buildNangoBinding(params: {
  assistantId: string
  pluginSlug: string
  connectionId: string
  authProvider: string | null
  config: Record<string, unknown>
}): OAuthBinding {
  const provider = params.authProvider || params.pluginSlug.replace('nango-', '')
  const policy = params.config || {}
  return {
    assistantId: params.assistantId,
    provider,
    connectionId: params.connectionId,
    integrationId: (policy.integrationId as string) || provider,
    enabledActions: [],
    requiresConfirmationActions: (policy.requiresConfirmationActions as string[]) || [],
    maxCallsPerRun: (policy.maxCallsPerRun as number) ?? 50,
    allowedResources: (policy.allowedResources as Record<string, unknown>) || {},
    metadata: {},
  }
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export type OAuthToolCallStatus = 'success' | 'error' | 'gated' | 'denied'

export interface OAuthToolAuditEvent {
  event_type: 'oauth_tool_call'
  assistant_id: string
  run_id: string
  provider: string
  action: string
  connection_id: string
  args_summary: Record<string, unknown>
  status: OAuthToolCallStatus
  error_code?: string
  duration_ms: number
  timestamp: string
}
