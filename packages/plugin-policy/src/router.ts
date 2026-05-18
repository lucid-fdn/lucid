/**
 * Capability Core — Router
 *
 * Determines the execution path for a plugin tool call:
 *   embedded      → in-process MCP via InMemoryTransport
 *   gateway-mcp   → HTTP call to MCPGate (remote MCP)
 *   gateway-rest   → HTTP call to REST API endpoint
 *   blocked        → execution denied by policy
 *
 * Decision table (RFC Section 3.2):
 *   transport=embedded   + policy=in_process → embedded
 *   transport=embedded   + policy=gateway    → gateway-mcp (fallback)
 *   transport=remote-mcp + any               → gateway-mcp
 *   transport=rest       + any               → gateway-rest
 *   policy=block                             → blocked
 */

import type { ActivatedPlugin, PolicyConfig, RouteResult } from './types.js'
import { resolvePolicy } from './policy.js'

export interface RouterConfig {
  /** MCPGate gateway URL (from MCPGATE_URL env). */
  mcpgateUrl?: string
  /** Policy configuration. */
  policy?: PolicyConfig
}

/**
 * Route a plugin to its execution path.
 */
export function routePlugin(plugin: ActivatedPlugin, config?: RouterConfig): RouteResult {
  const trustLevel = plugin.trustLevel ?? 'community'
  const executionMode = plugin.executionMode ?? 'gateway'
  const transport = plugin.transport ?? 'remote-mcp'

  // Resolve policy
  const policy = resolvePolicy(
    { slug: plugin.slug, trustLevel, executionMode },
    config?.policy,
  )

  // Blocked by policy
  if (policy.decision === 'block') {
    return { path: 'blocked', policy }
  }

  // Route based on transport + effective mode
  switch (transport) {
    case 'embedded': {
      if (policy.effectiveMode === 'in_process') {
        return { path: 'embedded', policy }
      }
      // Embedded plugin forced to gateway by policy → route through MCPGate
      return {
        path: 'gateway-mcp',
        target: plugin.mcpgateServerId ?? `builtin:${plugin.slug}`,
        policy,
      }
    }

    case 'remote-mcp': {
      return {
        path: 'gateway-mcp',
        target: plugin.mcpgateServerId ?? `builtin:${plugin.slug}`,
        policy,
      }
    }

    case 'rest': {
      return {
        path: 'gateway-rest',
        target: plugin.endpointUrl ?? plugin.slug,
        policy,
      }
    }

    default: {
      // Unknown transport → gateway as safe default
      return {
        path: 'gateway-mcp',
        target: plugin.mcpgateServerId ?? `builtin:${plugin.slug}`,
        policy,
      }
    }
  }
}
