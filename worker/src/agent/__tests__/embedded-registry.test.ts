import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

function createTestServer(name: string): McpServer {
  const server = new McpServer({ name, version: '1.0.0' })
  server.tool('echo', 'Echo input back', { text: z.string() }, async ({ text }) => ({
    content: [{ type: 'text', text: `echo: ${text}` }],
  }))
  return server
}

// Use vi.resetModules() + dynamic import to get a fresh registry for each test
async function freshImport() {
  vi.resetModules()
  return await import('../embedded-registry.js')
}

describe('embedded-registry', () => {
  let registry: Awaited<ReturnType<typeof freshImport>>

  beforeEach(async () => {
    registry = await freshImport()
  })

  it('registerEmbeddedServer + callEmbeddedTool returns correct result', async () => {
    const server = createTestServer('test-echo')
    registry.registerEmbeddedServer(server, 'test-echo')

    const result = await registry.callEmbeddedTool('test-echo', 'echo', { text: 'hello' })
    expect(result.isError).toBe(false)
    expect(result.content).toHaveLength(1)
    expect((result.content[0] as { text: string }).text).toBe('echo: hello')
  })

  it('isEmbeddedServer returns true for registered, false for unknown', async () => {
    expect(registry.isEmbeddedServer('not-registered')).toBe(false)

    const server = createTestServer('my-server')
    registry.registerEmbeddedServer(server, 'my-server')
    expect(registry.isEmbeddedServer('my-server')).toBe(true)
  })

  it('concurrent getClient calls share one connection (dedup)', async () => {
    const server = createTestServer('dedup-test')
    registry.registerEmbeddedServer(server, 'dedup-test')

    // Fire two calls concurrently — both should succeed (shared client)
    const [r1, r2] = await Promise.all([
      registry.callEmbeddedTool('dedup-test', 'echo', { text: 'a' }),
      registry.callEmbeddedTool('dedup-test', 'echo', { text: 'b' }),
    ])
    expect(r1.isError).toBe(false)
    expect(r2.isError).toBe(false)
    expect((r1.content[0] as { text: string }).text).toBe('echo: a')
    expect((r2.content[0] as { text: string }).text).toBe('echo: b')
  })

  it('callEmbeddedTool with non-existent server throws', async () => {
    await expect(
      registry.callEmbeddedTool('no-such-server', 'echo', {}),
    ).rejects.toThrow('Embedded server not found: no-such-server')
  })

  it('embeddedServerCount tracks registered servers', async () => {
    expect(registry.embeddedServerCount()).toBe(0)
    registry.registerEmbeddedServer(createTestServer('s1'), 's1')
    expect(registry.embeddedServerCount()).toBe(1)
    registry.registerEmbeddedServer(createTestServer('s2'), 's2')
    expect(registry.embeddedServerCount()).toBe(2)
  })

  it('connection failure is recoverable (not poisoned)', async () => {
    // Create a server that will fail to connect the first time
    const server = createTestServer('retry-test')

    // Override connect to fail once then succeed
    let callCount = 0
    const origConnect = server.connect.bind(server)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.connect = async (transport: any) => {
      callCount++
      if (callCount === 1) throw new Error('connection failed')
      return origConnect(transport)
    }

    registry.registerEmbeddedServer(server, 'retry-test')

    // First call should fail
    await expect(
      registry.callEmbeddedTool('retry-test', 'echo', { text: 'hi' }),
    ).rejects.toThrow('connection failed')

    // Second call should succeed (connecting promise was cleared)
    const result = await registry.callEmbeddedTool('retry-test', 'echo', { text: 'recovered' })
    expect(result.isError).toBe(false)
    expect((result.content[0] as { text: string }).text).toBe('echo: recovered')
  })

  it('handles tool that returns isError=true', async () => {
    const server = new McpServer({ name: 'error-test', version: '1.0.0' })
    server.tool('fail', 'Always fails', {}, async () => ({
      content: [{ type: 'text', text: 'something broke' }],
      isError: true,
    }))
    registry.registerEmbeddedServer(server, 'error-test')

    const result = await registry.callEmbeddedTool('error-test', 'fail', {})
    expect(result.isError).toBe(true)
    expect((result.content[0] as { text: string }).text).toBe('something broke')
  })

  it('handles tool with complex JSON response', async () => {
    const server = new McpServer({ name: 'json-test', version: '1.0.0' })
    server.tool('data', 'Returns structured data', { query: z.string() }, async ({ query }) => ({
      content: [{ type: 'text', text: JSON.stringify({ results: [1, 2, 3], query }) }],
    }))
    registry.registerEmbeddedServer(server, 'json-test')

    const result = await registry.callEmbeddedTool('json-test', 'data', { query: 'test' })
    expect(result.isError).toBe(false)
    const data = JSON.parse((result.content[0] as { text: string }).text)
    expect(data.results).toEqual([1, 2, 3])
    expect(data.query).toBe('test')
  })
})
