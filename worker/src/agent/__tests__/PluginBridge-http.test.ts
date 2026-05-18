import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PluginToolContext } from '../PluginBridge.js'

// Mock embedded-plugin-loader and embedded-registry (same as PluginBridge.test.ts)
vi.mock('../embedded-plugin-loader.js', () => ({
  ensureEmbeddedPlugin: vi.fn(),
  isFirstPartyPlugin: vi.fn().mockReturnValue(false),
}))

vi.mock('../embedded-registry.js', () => ({
  callEmbeddedTool: vi.fn(),
}))

const { executePluginTool } = await import('../PluginBridge.js')

describe('PluginBridge HTTP fallback', () => {
  const MCPGATE_URL = 'https://mcpgate.example.com'
  const MCPGATE_API_KEY = 'test-api-key-12345'

  const httpCtx: PluginToolContext = {
    pluginSlug: 'my-plugin',
    config: {},
    trustLevel: 'community',
    executionMode: 'gateway',
    transport: 'remote-mcp',
    authType: 'none',
    authProvider: null,
    mcpgateServerId: 'srv_custom',
  }

  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.MCPGATE_URL = MCPGATE_URL
    process.env.MCPGATE_API_KEY = MCPGATE_API_KEY

    fetchSpy = vi.fn()
    global.fetch = fetchSpy
  })

  afterEach(() => {
    delete process.env.MCPGATE_URL
    delete process.env.MCPGATE_API_KEY
    vi.restoreAllMocks()
  })

  it('sends correct headers and body to MCPGate', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'ok' }], isError: false }),
    })

    await executePluginTool('my-plugin', 'do_thing', { foo: 'bar' }, httpCtx)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, options] = fetchSpy.mock.calls[0]

    // Correct URL
    expect(url).toBe(`${MCPGATE_URL}/v1/tools/call`)

    // Correct headers
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(options.headers['Authorization']).toBe(`Bearer ${MCPGATE_API_KEY}`)

    // Correct body
    const body = JSON.parse(options.body)
    expect(body).toEqual({
      server_id: 'srv_custom',
      tool_name: 'do_thing',
      arguments: { foo: 'bar' },
    })
  })

  it('uses builtin:{slug} as server_id when mcpgateServerId is not set', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'ok' }], isError: false }),
    })

    const ctxWithoutServerId: PluginToolContext = {
      pluginSlug: 'some-plugin',
      config: {},
      trustLevel: 'community',
      executionMode: 'gateway',
      transport: 'remote-mcp',
      authType: 'none',
      authProvider: null,
      // no mcpgateServerId
    }

    await executePluginTool('some-plugin', 'tool_x', {}, ctxWithoutServerId)

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.server_id).toBe('builtin:some-plugin')
  })

  it('parses successful response correctly', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: 'analysis complete' }],
        isError: false,
      }),
    })

    const result = await executePluginTool('my-plugin', 'analyze', { query: 'test' }, httpCtx)

    const parsed = JSON.parse(result)
    expect(parsed).toEqual([{ type: 'text', text: 'analysis complete' }])
  })

  it('returns error JSON for non-200 response (after retries)', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
      headers: new Headers(),
    })

    const result = await executePluginTool('my-plugin', 'broken_tool', {}, httpCtx)

    // GatewayExecutor retries 5xx up to 3 times, then returns error wrapped by PluginBridge
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(result).toMatch(/^Tool error:/)
    const parsed = JSON.parse(result.replace('Tool error: ', ''))
    expect(parsed.error).toBe('MCPGate returned 500')
    expect(parsed.details).toBe('Internal Server Error')
  })

  it('truncates error details to 500 characters (after retries)', async () => {
    const longError = 'x'.repeat(1000)
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => longError,
      headers: new Headers(),
    })

    const result = await executePluginTool('my-plugin', 'broken_tool', {}, httpCtx)

    // GatewayExecutor retries 5xx (502) up to 3 times
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(result).toMatch(/^Tool error:/)
    const parsed = JSON.parse(result.replace('Tool error: ', ''))
    expect(parsed.details.length).toBe(500)
  })

  it('propagates isError: true with "Tool error:" prefix', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: 'rate limit exceeded' }],
        isError: true,
      }),
    })

    const result = await executePluginTool('my-plugin', 'rate_limited', {}, httpCtx)

    expect(result).toMatch(/^Tool error:/)
    expect(result).toContain('rate limit exceeded')
  })

  it('handles network error gracefully (after retries)', async () => {
    fetchSpy.mockRejectedValue(new Error('fetch failed: ECONNREFUSED'))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await executePluginTool('my-plugin', 'unreachable', {}, httpCtx)

    // GatewayExecutor retries network errors up to 3 times, then catches and returns ToolCallResult
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(result).toMatch(/^Tool error:/)
    const parsed = JSON.parse(result.replace('Tool error: ', ''))
    expect(parsed.error).toBe('fetch failed: ECONNREFUSED')

    warnSpy.mockRestore()
  })

  it('handles non-Error throw gracefully (after retries)', async () => {
    fetchSpy.mockRejectedValue('string error')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await executePluginTool('my-plugin', 'weird_error', {}, httpCtx)

    // GatewayExecutor retries, then catches non-Error and wraps it
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(result).toMatch(/^Tool error:/)
    const parsed = JSON.parse(result.replace('Tool error: ', ''))
    // fetchWithRetry wraps non-Error into Error(String(err)), so message is the stringified value
    expect(parsed.error).toBe('string error')

    warnSpy.mockRestore()
  })

  it('returns error when MCPGate is not configured', async () => {
    delete process.env.MCPGATE_URL
    delete process.env.MCPGATE_API_KEY

    const result = await executePluginTool('my-plugin', 'some_tool', {}, httpCtx)

    expect(fetchSpy).not.toHaveBeenCalled()

    // Unified path: no gateway → MCPGate gateway not configured
    expect(result).toMatch(/^Tool error:/)
    const parsed = JSON.parse(result.replace('Tool error: ', ''))
    expect(parsed.error).toBe('MCPGate gateway not configured')
  })

  it('returns error when only MCPGATE_URL is set', async () => {
    delete process.env.MCPGATE_API_KEY

    const result = await executePluginTool('my-plugin', 'some_tool', {}, httpCtx)

    expect(fetchSpy).not.toHaveBeenCalled()

    // Unified path: only URL set, no key → no gateway created
    expect(result).toMatch(/^Tool error:/)
    const parsed = JSON.parse(result.replace('Tool error: ', ''))
    expect(parsed.error).toBe('MCPGate gateway not configured')
  })

  it('passes AbortSignal to fetch (via GatewayExecutor)', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [], isError: false }),
    })

    await executePluginTool('my-plugin', 'slow_tool', {}, httpCtx)

    // GatewayExecutor creates AbortSignal.timeout(30_000) for each fetch call
    const options = fetchSpy.mock.calls[0][1]
    expect(options.signal).toBeDefined()
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.signal.aborted).toBe(false)
  })

  it('handles res.text() failure when reading error response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => { throw new Error('body stream exhausted') },
      headers: new Headers(),
    })

    const result = await executePluginTool('my-plugin', 'broken_body', {}, httpCtx)

    // GatewayExecutor retries 503 up to 3 times
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(result).toMatch(/^Tool error:/)
    const parsed = JSON.parse(result.replace('Tool error: ', ''))
    expect(parsed.error).toBe('MCPGate returned 503')
    expect(parsed.details).toBe('Unknown error')
  })
})
