/**
 * Capability SDK — Embedded Executor
 *
 * Executes plugin tools in-process via InMemoryTransport (MCP SDK).
 * Wraps the existing embedded-plugin-loader + embedded-registry pattern.
 *
 * ~1-5ms latency. Only for internal/verified plugins allowed by policy.
 */

import type { EmbeddedServerRegistry, ToolCallResult } from './types.js'

export class EmbeddedExecutor {
  private readonly registry: EmbeddedServerRegistry

  constructor(registry: EmbeddedServerRegistry) {
    this.registry = registry
  }

  isAvailable(slug: string): boolean {
    return this.registry.isEmbedded(slug)
  }

  async execute(slug: string, toolName: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const t0 = Date.now()

    const ready = await this.registry.ensureServer(slug)
    if (!ready) {
      return {
        content: { error: `Embedded server for ${slug} failed to start` },
        isError: true,
        durationMs: Date.now() - t0,
        executionPath: 'embedded',
      }
    }

    const result = await this.registry.callTool(slug, toolName, args)
    return {
      content: result.content,
      isError: result.isError,
      durationMs: Date.now() - t0,
      executionPath: 'embedded',
    }
  }
}
