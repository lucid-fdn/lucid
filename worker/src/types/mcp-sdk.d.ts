declare module '@modelcontextprotocol/sdk/server/mcp.js' {
  export class McpServer {
    connect(transport: unknown): Promise<void>
    close(): Promise<void>
    tool(name: string, schema: Record<string, unknown>, handler: (...args: unknown[]) => Promise<unknown>): void
  }
}

declare module '@modelcontextprotocol/sdk/client/index.js' {
  export class Client {
    constructor(options: { name: string; version: string }, capabilities?: Record<string, unknown>)
    connect(transport: unknown): Promise<void>
    close(): Promise<void>
    callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<{
      content: Array<{ type: string; text?: string }>
      isError?: boolean
    }>
    listTools(): Promise<{
      tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>
    }>
  }
}

declare module '@modelcontextprotocol/sdk/inMemory.js' {
  export class InMemoryTransport {
    constructor()
    static createLinkedPair(): [InMemoryTransport, InMemoryTransport]
  }
}
