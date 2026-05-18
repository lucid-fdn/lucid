/**
 * Embedded MCP Server Registry
 *
 * Manages in-process MCP servers connected via InMemoryTransport.
 * Stripped version of MCPGate's builtin-registry — no PassportStore,
 * no external deps beyond @modelcontextprotocol/sdk.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { addBreadcrumb } from '../monitoring/sentry.js'

interface EmbeddedEntry {
  mcpServer: McpServer
  client?: Client
  connecting?: Promise<Client>
  connectedAt?: number
}

const MAX_CONNECTED = 15
const registry = new Map<string, EmbeddedEntry>()

export function registerEmbeddedServer(mcpServer: McpServer, name: string): void {
  registry.set(name, { mcpServer })
}

function connectedCount(): number {
  let n = 0
  for (const e of registry.values()) if (e.client) n++
  return n
}

export function isEmbeddedServer(slug: string): boolean {
  return registry.has(slug)
}

async function getClient(serverName: string): Promise<Client> {
  const entry = registry.get(serverName)
  if (!entry) throw new Error(`Embedded server not found: ${serverName}`)

  if (entry.client) return entry.client

  if (!entry.connecting) {
    entry.connecting = (async () => {
      try {
        if (connectedCount() >= MAX_CONNECTED) {
          throw new Error(`Embedded MCP connection limit reached (${MAX_CONNECTED}). Offload to MCPGate.`)
        }
        const t0 = Date.now()
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
        await entry.mcpServer.connect(serverTransport)
        const client = new Client({ name: 'lucid-worker', version: '1.0.0' })
        await client.connect(clientTransport)
        entry.client = client
        entry.connectedAt = Date.now()
        addBreadcrumb(`MCP client connected: ${serverName} (${Date.now() - t0}ms)`, 'embedded')
        return client
      } catch (err) {
        // Clear the rejected promise so subsequent calls can retry
        entry.connecting = undefined
        addBreadcrumb(`MCP client connection failed: ${serverName}`, 'embedded', {
          error: err instanceof Error ? err.message : String(err),
        })
        throw err
      }
    })()
  }

  return entry.connecting
}

export async function callEmbeddedTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: unknown[]; isError: boolean }> {
  const client = await getClient(serverName)
  const result = await client.callTool({ name: toolName, arguments: args })
  return {
    content: 'content' in result ? (result.content as unknown[]) : [],
    isError: 'isError' in result ? Boolean(result.isError) : false,
  }
}

export function embeddedServerCount(): number {
  return registry.size
}

/** Return loaded plugins info for health checks */
export function getLoadedPlugins(): Array<{ name: string; connected: boolean; connectedAt?: number }> {
  return Array.from(registry.entries()).map(([name, entry]) => ({
    name,
    connected: !!entry.client,
    connectedAt: entry.connectedAt,
  }))
}

/** Close all embedded MCP clients and clear registry (for graceful shutdown) */
export async function closeAllEmbedded(): Promise<void> {
  const entries = Array.from(registry.entries())
  for (const [name, entry] of entries) {
    try {
      if (entry.client) {
        await entry.client.close()
      }
    } catch (err) {
      console.warn(`[embedded] Failed to close ${name}:`, err instanceof Error ? err.message : err)
    }
  }
  registry.clear()
}
