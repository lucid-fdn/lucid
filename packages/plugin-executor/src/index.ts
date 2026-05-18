/**
 * @lucid/plugin-executor
 *
 * In-process plugin executor for the Lucid worker.
 * Wraps embedded MCP, MCPGate HTTP, and REST calls behind a unified interface.
 *
 * Usage:
 *   import { UnifiedExecutor } from '@lucid/plugin-executor'
 *
 *   const executor = new UnifiedExecutor({
 *     embedded: embeddedRegistry,
 *     gateway: { mcpgateUrl: '...', mcpgateApiKey: '...' },
 *   })
 *
 *   // routeResult comes from @lucid/plugin-policy's routePlugin()
 *   const result = await executor.execute(routeResult.path, { pluginSlug, toolName, args })
 */

// Types
export type {
  ToolCallResult,
  ToolCallContext,
  EmbeddedServerRegistry,
  GatewayConfig,
  ExecutorConfig,
} from './types.js'

// Re-exports from plugin-policy (type-only, for convenience)
export type { ExecutionPath, RouteResult, ActivatedPlugin } from './re-exports.js'

// Executors
export { EmbeddedExecutor } from './embedded-executor.js'
export { GatewayExecutor } from './gateway-executor.js'
export { UnifiedExecutor } from './unified-executor.js'
