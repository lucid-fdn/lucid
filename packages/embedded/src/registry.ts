/**
 * Embedded MCP Server Registry
 *
 * Manages in-process MCP servers connected via InMemoryTransport.
 * Register your servers, then call tools on them — zero network overhead.
 *
 * @example
 * ```ts
 * import { EmbeddedRegistry, createTradeServer } from '@lucid-fdn/plugins-embedded'
 *
 * const registry = new EmbeddedRegistry()
 * registry.register(createTradeServer(), 'trade')
 * const result = await registry.callTool('trade', 'analyze_market', { symbol: 'BTC' })
 * ```
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

interface RegistryEntry {
  mcpServer: McpServer
  client?: Client
  connecting?: Promise<Client>
  connectedAt?: number
}

export class EmbeddedRegistry {
  private entries = new Map<string, RegistryEntry>()

  /** Register an MCP server for in-process execution. */
  register(mcpServer: McpServer, name: string): void {
    this.entries.set(name, { mcpServer })
  }

  /** Check if a server is registered by name. */
  has(name: string): boolean {
    return this.entries.has(name)
  }

  /** Number of registered servers. */
  get size(): number {
    return this.entries.size
  }

  /** Return info for all registered servers (useful for health checks). */
  list(): Array<{ name: string; connected: boolean; connectedAt?: number }> {
    return Array.from(this.entries.entries()).map(([name, entry]) => ({
      name,
      connected: !!entry.client,
      connectedAt: entry.connectedAt,
    }))
  }

  /**
   * Call a tool on a registered server.
   * The MCP client is lazily connected on first call and reused afterwards.
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<{ content: unknown[]; isError: boolean }> {
    const client = await this.getClient(serverName)
    const result = await client.callTool({ name: toolName, arguments: args })
    return {
      content: 'content' in result ? (result.content as unknown[]) : [],
      isError: 'isError' in result ? Boolean(result.isError) : false,
    }
  }

  /** Close all connected clients and clear the registry. */
  async closeAll(): Promise<void> {
    for (const [name, entry] of this.entries) {
      try {
        if (entry.client) await entry.client.close()
      } catch {
        // Log but don't throw — one failure shouldn't block others
        console.warn(`[EmbeddedRegistry] Failed to close ${name}`)
      }
    }
    this.entries.clear()
  }

  private async getClient(serverName: string): Promise<Client> {
    const entry = this.entries.get(serverName)
    if (!entry) throw new Error(`Embedded server not found: ${serverName}`)

    if (entry.client) return entry.client

    if (!entry.connecting) {
      entry.connecting = (async () => {
        try {
          const [clientTransport, serverTransport] =
            InMemoryTransport.createLinkedPair()
          await entry.mcpServer.connect(serverTransport)
          const client = new Client({
            name: 'embedded-registry',
            version: '1.0.0',
          })
          await client.connect(clientTransport)
          entry.client = client
          entry.connectedAt = Date.now()
          return client
        } catch (err) {
          entry.connecting = undefined
          throw err
        }
      })()
    }

    return entry.connecting
  }
}
