/**
 * Capability SDK — Unified Executor
 *
 * Single entry point for executing any plugin tool.
 * Uses plugin-policy's router to determine the execution path,
 * then delegates to the appropriate executor (embedded, gateway-mcp, gateway-rest).
 *
 * This is what PluginBridge will delegate to in Phase 4.
 */

import type { ExecutorConfig, ToolCallContext, ToolCallResult } from './types.js'
import { EmbeddedExecutor } from './embedded-executor.js'
import { GatewayExecutor } from './gateway-executor.js'

// Re-export route types so consumers don't need to import plugin-policy directly
export type { ExecutionPath, RouteResult, ActivatedPlugin } from './re-exports.js'

export class UnifiedExecutor {
  private readonly embedded?: EmbeddedExecutor
  private readonly gateway?: GatewayExecutor

  constructor(config: ExecutorConfig) {
    if (config.embedded) {
      this.embedded = new EmbeddedExecutor(config.embedded)
    }
    if (config.gateway) {
      this.gateway = new GatewayExecutor(config.gateway)
    }
  }

  /**
   * Execute a tool call using the pre-determined execution path.
   *
   * @param path - Execution path from plugin-policy's router.
   * @param ctx - Tool call context (slug, tool, args, auth).
   * @param target - Gateway target (server ID or URL) from router.
   * @param fallbackMode - null = fail hard (default), 'gateway' = fall back on embedded failure.
   */
  async execute(
    path: 'embedded' | 'gateway-mcp' | 'gateway-rest',
    ctx: ToolCallContext,
    target?: string,
    fallbackMode?: 'gateway' | null,
  ): Promise<ToolCallResult> {
    switch (path) {
      case 'embedded': {
        if (!this.embedded) {
          if (fallbackMode === 'gateway') return this.fallbackToGateway(ctx, target)
          return {
            content: { error: 'Embedded executor not configured', plugin: ctx.pluginSlug, tool: ctx.toolName },
            isError: true,
            durationMs: 0,
            executionPath: 'embedded',
          }
        }

        try {
          return await this.embedded.execute(ctx.pluginSlug, ctx.toolName, ctx.args)
        } catch (err) {
          if (fallbackMode === 'gateway') {
            console.warn(
              `[capability-sdk] Embedded failed for ${ctx.pluginSlug}:${ctx.toolName}, falling back to gateway:`,
              err instanceof Error ? err.message : err,
            )
            return this.fallbackToGateway(ctx, target)
          }
          // No fallback — return the error directly
          return {
            content: { error: err instanceof Error ? err.message : 'Embedded execution failed' },
            isError: true,
            durationMs: 0,
            executionPath: 'embedded',
          }
        }
      }

      case 'gateway-mcp': {
        if (!this.gateway) {
          return {
            content: { error: 'MCPGate gateway not configured' },
            isError: true,
            durationMs: 0,
            executionPath: 'gateway-mcp',
          }
        }
        return this.gateway.executeMcp(
          target ?? `builtin:${ctx.pluginSlug}`,
          ctx.toolName,
          ctx.args,
          ctx.authToken,
          ctx.authHeaders,
        )
      }

      case 'gateway-rest': {
        if (!this.gateway) {
          return {
            content: { error: 'REST gateway not configured' },
            isError: true,
            durationMs: 0,
            executionPath: 'gateway-rest',
          }
        }
        return this.gateway.executeRest(
          target ?? ctx.pluginSlug,
          ctx.toolName,
          ctx.args,
          ctx.authToken,
          ctx.authTokenType,
          ctx.authHeaders,
        )
      }

      default: {
        return {
          content: { error: `Unknown execution path: ${path}` },
          isError: true,
          durationMs: 0,
          executionPath: 'gateway-mcp',
        }
      }
    }
  }

  private async fallbackToGateway(ctx: ToolCallContext, target?: string): Promise<ToolCallResult> {
    if (!this.gateway) {
      return {
        content: {
          error: 'Plugin execution not configured',
          plugin: ctx.pluginSlug,
          tool: ctx.toolName,
          message: `Neither embedded executor nor MCPGate gateway is available.`,
        },
        isError: true,
        durationMs: 0,
        executionPath: 'gateway-mcp',
      }
    }
    return this.gateway.executeMcp(
      target ?? `builtin:${ctx.pluginSlug}`,
      ctx.toolName,
      ctx.args,
      ctx.authToken,
      ctx.authHeaders,
    )
  }
}
