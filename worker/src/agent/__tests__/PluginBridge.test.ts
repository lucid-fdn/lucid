import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PluginToolContext } from '../PluginBridge.js'

// Mock embedded-plugin-loader and embedded-registry before importing PluginBridge
vi.mock('../embedded-plugin-loader.js', () => ({
  ensureEmbeddedPlugin: vi.fn(),
  isFirstPartyPlugin: vi.fn(),
}))

vi.mock('../embedded-registry.js', () => ({
  callEmbeddedTool: vi.fn(),
}))

const { executePluginTool } = await import('../PluginBridge.js')
const { ensureEmbeddedPlugin, isFirstPartyPlugin } = await import('../embedded-plugin-loader.js')
const { callEmbeddedTool } = await import('../embedded-registry.js')

const mockIsFirstParty = vi.mocked(isFirstPartyPlugin)
const mockEnsure = vi.mocked(ensureEmbeddedPlugin)
const mockCallEmbedded = vi.mocked(callEmbeddedTool)

/** Internal embedded plugin context (first-party, in-process) */
const embeddedCtx: PluginToolContext = {
  pluginSlug: 'lucid-seo',
  config: {},
  trustLevel: 'internal',
  executionMode: 'in_process',
  transport: 'embedded',
  authType: 'none',
  authProvider: null,
}

/** Community remote plugin context (gateway-only) */
const communityCtx: PluginToolContext = {
  pluginSlug: 'community-plugin',
  config: {},
  trustLevel: 'community',
  executionMode: 'gateway',
  transport: 'remote-mcp',
  authType: 'none',
  authProvider: null,
}

describe('PluginBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Remove MCPGate env vars for clean tests
    delete process.env.MCPGATE_URL
    delete process.env.MCPGATE_API_KEY
  })

  afterEach(() => {
    delete process.env.MCPGATE_URL
    delete process.env.MCPGATE_API_KEY
  })

  it('internal plugin routes to embedded execution', async () => {
    mockIsFirstParty.mockReturnValue(true)
    mockEnsure.mockResolvedValue(true)
    mockCallEmbedded.mockResolvedValue({
      content: [{ type: 'text', text: 'keyword data' }],
      isError: false,
    })

    const result = await executePluginTool('lucid-seo', 'research_keywords', { seed: 'AI' }, embeddedCtx)

    expect(mockEnsure).toHaveBeenCalledWith('lucid-seo')
    expect(mockCallEmbedded).toHaveBeenCalledWith('lucid-seo', 'research_keywords', { seed: 'AI' })
    expect(result).toContain('keyword data')
  })

  it('embedded tool error returns error string', async () => {
    mockIsFirstParty.mockReturnValue(true)
    mockEnsure.mockResolvedValue(true)
    mockCallEmbedded.mockResolvedValue({
      content: [{ type: 'text', text: 'something went wrong' }],
      isError: true,
    })

    const result = await executePluginTool('lucid-seo', 'bad_tool', {}, embeddedCtx)

    expect(result).toContain('Tool error')
    expect(result).toContain('something went wrong')
  })

  it('embedded failure with fallbackMode=gateway falls back to gateway (not configured)', async () => {
    mockIsFirstParty.mockReturnValue(true)
    mockEnsure.mockRejectedValue(new Error('import failed'))

    const ctx: PluginToolContext = { ...embeddedCtx, fallbackMode: 'gateway' }
    const result = await executePluginTool('lucid-seo', 'research_keywords', {}, ctx)

    // fallbackMode='gateway' → tries gateway fallback → no gateway → Tool error
    expect(result).toMatch(/^Tool error:/)
    const parsed = JSON.parse(result.replace('Tool error: ', ''))
    expect(parsed.error).toBe('Plugin execution not configured')
    expect(parsed.plugin).toBe('lucid-seo')
    expect(parsed.tool).toBe('research_keywords')
  })

  it('embedded failure without fallbackMode fails hard (no silent fallback)', async () => {
    mockIsFirstParty.mockReturnValue(true)
    mockEnsure.mockRejectedValue(new Error('import failed'))

    // No fallbackMode → fail hard, don't silently route to gateway
    const result = await executePluginTool('lucid-seo', 'research_keywords', {}, embeddedCtx)

    expect(result).toMatch(/^Tool error:/)
    const parsed = JSON.parse(result.replace('Tool error: ', ''))
    expect(parsed.error).toBe('import failed')
  })

  it('community plugin routes to gateway (not configured)', async () => {
    mockIsFirstParty.mockReturnValue(false)

    const result = await executePluginTool('community-plugin', 'some_tool', {}, communityCtx)

    // Should NOT attempt embedded execution
    expect(mockEnsure).not.toHaveBeenCalled()
    expect(mockCallEmbedded).not.toHaveBeenCalled()

    // community → gateway-mcp → no gateway → Tool error
    expect(result).toMatch(/^Tool error:/)
    const parsed = JSON.parse(result.replace('Tool error: ', ''))
    expect(parsed.error).toBe('MCPGate gateway not configured')
  })

  it('MCPGate not configured returns error via unified path', async () => {
    mockIsFirstParty.mockReturnValue(false)

    const result = await executePluginTool('some-plugin', 'tool', {}, {
      ...communityCtx,
      pluginSlug: 'some-plugin',
    })

    expect(result).toMatch(/^Tool error:/)
    const parsed = JSON.parse(result.replace('Tool error: ', ''))
    expect(parsed.error).toBe('MCPGate gateway not configured')
  })

  it('timing log is produced for embedded calls', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockIsFirstParty.mockReturnValue(true)
    mockEnsure.mockResolvedValue(true)
    mockCallEmbedded.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
    })

    await executePluginTool('lucid-seo', 'research_keywords', {}, embeddedCtx)

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[PluginBridge] embedded lucid-seo:research_keywords'),
    )

    logSpy.mockRestore()
  })

  it('trustLevel from context is used — no derivation from source', async () => {
    mockIsFirstParty.mockReturnValue(false) // isFirstParty returns false...

    // ...but context explicitly says internal/embedded — should route embedded
    mockEnsure.mockResolvedValue(true)
    mockCallEmbedded.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
    })

    const ctx: PluginToolContext = {
      ...embeddedCtx,
      pluginSlug: 'custom-verified',
      source: 'community', // deprecated field disagrees with trustLevel — trustLevel wins
    }

    const result = await executePluginTool('custom-verified', 'check', {}, ctx)
    expect(result).toContain('ok')
    expect(mockEnsure).toHaveBeenCalledWith('custom-verified')
  })
})
