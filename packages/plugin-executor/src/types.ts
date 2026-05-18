/**
 * Capability SDK — Types
 *
 * Types for the in-process execution layer.
 * The SDK wraps embedded MCP, MCPGate HTTP, and REST API calls behind a unified interface.
 */

// =============================================================================
// Tool Execution
// =============================================================================

/** Result of executing a plugin tool. */
export interface ToolCallResult {
  content: unknown
  isError: boolean
  durationMs: number
  executionPath: 'embedded' | 'gateway-mcp' | 'gateway-rest'
}

/** Context passed to the executor for each tool call. */
export interface ToolCallContext {
  pluginSlug: string
  toolName: string
  args: Record<string, unknown>
  /** Resolved auth token, if the plugin requires auth. */
  authToken?: string
  /** Auth token type (bearer, api-key, etc.). */
  authTokenType?: string
  /** Additional auth headers from credential provider (e.g., provider-specific headers from Nango). */
  authHeaders?: Record<string, string>
}

// =============================================================================
// Embedded MCP
// =============================================================================

/** Interface for the embedded MCP server registry (injected by the worker). */
export interface EmbeddedServerRegistry {
  /** Check if a slug has an embedded server factory. */
  isEmbedded(slug: string): boolean
  /** Ensure the embedded server is started. Returns true if ready. */
  ensureServer(slug: string): Promise<boolean>
  /** Call a tool on an embedded server. */
  callTool(slug: string, toolName: string, args: Record<string, unknown>): Promise<{ content: unknown; isError: boolean }>
}

// =============================================================================
// Gateway Config
// =============================================================================

export interface GatewayConfig {
  /** MCPGate gateway URL. */
  mcpgateUrl: string
  /** MCPGate API key. */
  mcpgateApiKey: string
  /** Request timeout in ms (default: 30000). */
  timeoutMs?: number
}

// =============================================================================
// Executor Config
// =============================================================================

export interface ExecutorConfig {
  /** Embedded MCP server registry (for in-process execution). */
  embedded?: EmbeddedServerRegistry
  /** MCPGate gateway configuration (for HTTP execution). */
  gateway?: GatewayConfig
}
