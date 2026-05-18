import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @modelcontextprotocol/sdk modules before importing the registry
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}))
vi.mock('@modelcontextprotocol/sdk/inMemory.js', () => ({
  InMemoryTransport: {
    createLinkedPair: vi.fn(() => [{ /* clientTransport */ }, { /* serverTransport */ }]),
  },
}))
vi.mock('../monitoring/sentry.js', () => ({
  addBreadcrumb: vi.fn(),
}))

describe('closeAllEmbedded', () => {
  beforeEach(async () => {
    // Re-import fresh module for each test to reset the registry
    vi.resetModules()
  })

  it('closes all registered clients and clears registry', async () => {
    const mod = await import('../agent/embedded-registry.js')

    // Register a mock MCP server
    const mockMcpServer = { connect: vi.fn().mockResolvedValue(undefined) } as any
    mod.registerEmbeddedServer(mockMcpServer, 'test-skill')
    expect(mod.embeddedServerCount()).toBe(1)

    // Trigger a connection so the entry has a client
    await mod.callEmbeddedTool('test-skill', 'some-tool', {}).catch(() => {
      // Tool call may fail since mock doesn't return proper result; that's OK
    })

    // Close all
    await mod.closeAllEmbedded()
    expect(mod.embeddedServerCount()).toBe(0)
  })

  it('handles close errors gracefully', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    // Make the client's close throw
    vi.mocked(Client).mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockRejectedValue(new Error('close failed')),
    }) as any)

    const mod = await import('../agent/embedded-registry.js')

    const mockMcpServer = { connect: vi.fn().mockResolvedValue(undefined) } as any
    mod.registerEmbeddedServer(mockMcpServer, 'failing-skill')

    // Trigger connection
    await mod.callEmbeddedTool('failing-skill', 'some-tool', {}).catch(() => {})

    // closeAllEmbedded should not throw even if close() fails
    await expect(mod.closeAllEmbedded()).resolves.toBeUndefined()
    expect(mod.embeddedServerCount()).toBe(0)
  })

  it('handles registry with no connected clients', async () => {
    const mod = await import('../agent/embedded-registry.js')

    // Register but never connect
    const mockMcpServer = { connect: vi.fn() } as any
    mod.registerEmbeddedServer(mockMcpServer, 'unconnected-skill')
    expect(mod.embeddedServerCount()).toBe(1)

    // Should clear without error
    await expect(mod.closeAllEmbedded()).resolves.toBeUndefined()
    expect(mod.embeddedServerCount()).toBe(0)
  })
})
