/**
 * E2E test: Full chat → plugin → tool call → result path
 *
 * Simulates the exact flow that happens in production:
 * 1. BFF sends plugin config to worker
 * 2. Worker's executePluginTool resolves to embedded execution
 * 3. Embedded skill processes the tool call
 * 4. Result is returned as a string (as AgentLoop expects)
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import type { PluginToolContext } from '../PluginBridge.js'

// Skip all tests when @lucid-fdn/plugins-embedded is a stub (no lucid-plugins link)
const isStub = await import('@lucid-fdn/plugins-embedded').then(m => m.VERSION === '0.0.0-stub').catch(() => true)

// Mock heavy infra modules to speed up PluginBridge import
vi.mock('../../observability/tracing.js', () => ({
  withSpan: async (_name: string, _attrs: Record<string, unknown>, fn: (span: any) => Promise<any>) =>
    fn({ setAttribute: vi.fn(), setStatus: vi.fn() }),
  classifyError: () => 'unknown',
}))
vi.mock('../../monitoring/sentry.js', () => ({
  addBreadcrumb: vi.fn(),
  captureError: vi.fn(),
}))

// Set dummy env vars before any skill factory imports
beforeAll(() => {
  const prefixes = [
    'TRADE', 'PREDICT', 'QUANTUM', 'SEO', 'AUDIT', 'TAX', 'VEILLE',
    'HYPE', 'COMPETE', 'PROSPECT', 'RECRUIT', 'BRIDGE', 'MEET',
    'INVOICE', 'PROPOSE', 'METRICS', 'FEEDBACK', 'VIDEO', 'OBSERVABILITY',
  ]
  for (const p of prefixes) {
    process.env[`${p}_SUPABASE_URL`] ??= 'https://test.supabase.co'
    process.env[`${p}_SUPABASE_KEY`] ??= 'test-key'
    process.env[`${p}_TENANT_ID`] ??= 'test-tenant'
  }
  process.env.SUPABASE_URL ??= 'https://test.supabase.co'
  process.env.SUPABASE_KEY ??= 'test-key'
  process.env.TENANT_ID ??= 'test-tenant'
})

/** Internal embedded context (first-party, in-process) */
function embeddedCtx(slug: string): PluginToolContext {
  return {
    pluginSlug: slug,
    config: {},
    trustLevel: 'internal',
    executionMode: 'in_process',
    transport: 'embedded',
    authType: 'none',
    authProvider: null,
  }
}

/** Community remote context (gateway-only) */
function communityCtx(slug: string): PluginToolContext {
  return {
    pluginSlug: slug,
    config: {},
    trustLevel: 'community',
    executionMode: 'gateway',
    transport: 'remote-mcp',
    authType: 'none',
    authProvider: null,
  }
}

describe.skipIf(isStub)('E2E: Plugin Execution Pipeline', () => {
  // Single import for the entire suite
  let bridge: Awaited<ReturnType<typeof import('../PluginBridge.js')>>
  let registry: Awaited<ReturnType<typeof import('../embedded-registry.js')>>

  beforeAll(async () => {
    vi.resetModules()
    bridge = await import('../PluginBridge.js')
    registry = await import('../embedded-registry.js')
    // Pre-warm: first executePluginTool triggers skill cold-load (~20s on WSL2)
    await bridge.executePluginTool('lucid-seo', 'seo_status', {}, embeddedCtx('lucid-seo'))
  })

  describe('embedded path (first-party)', () => {
    it('full pipeline: executePluginTool → ensureEmbeddedPlugin → callEmbeddedTool → result', async () => {
      const result = await bridge.executePluginTool(
        'lucid-seo',
        'seo_status',
        {},
        embeddedCtx('lucid-seo'),
      )

      // Result should be a JSON string (as AgentLoop feeds to LLM)
      expect(typeof result).toBe('string')
      const parsed = JSON.parse(result)
      // seo_status returns an array of content items
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed.length).toBeGreaterThan(0)
    })

    it('tool error propagates as "Tool error: ..." string', async () => {
      const result = await bridge.executePluginTool(
        'lucid-seo',
        'nonexistent_tool_xyz',
        {},
        embeddedCtx('lucid-seo'),
      )

      // Should be an error string, not a thrown exception
      expect(typeof result).toBe('string')
      // Either "Tool error:" from MCP or a fallback error
      expect(
        result.includes('error') || result.includes('Error') || result.includes('not configured'),
      ).toBe(true)
    })

    it('multiple skills can be called in sequence (simulating multi-tool agent turn)', async () => {
      const [seoResult, hypeResult] = await Promise.all([
        bridge.executePluginTool('lucid-seo', 'seo_status', {}, embeddedCtx('lucid-seo')),
        bridge.executePluginTool('lucid-hype', 'campaign_status', {}, embeddedCtx('lucid-hype')),
      ])

      // Both return strings (either JSON content or "Tool error: ..." — both valid for AgentLoop)
      expect(typeof seoResult).toBe('string')
      expect(typeof hypeResult).toBe('string')
      // Neither should fall through to MCPGate "not configured" error
      expect(seoResult).not.toContain('not configured')
      expect(hypeResult).not.toContain('not configured')
    })
  })

  describe('HTTP fallback path', () => {
    it('community plugin returns MCPGate-not-configured when env vars missing', async () => {
      delete process.env.MCPGATE_URL
      delete process.env.MCPGATE_API_KEY

      const result = await bridge.executePluginTool(
        'community-plugin',
        'some_tool',
        { arg: 'value' },
        communityCtx('community-plugin'),
      )

      // community → gateway-mcp → no gateway → Tool error
      expect(result).toMatch(/^Tool error:/)
      const parsed = JSON.parse(result.replace('Tool error: ', ''))
      expect(parsed.error).toBe('MCPGate gateway not configured')
    })
  })

  describe('health check data', () => {
    it('getLoadedPlugins reports loaded plugins after execution', async () => {
      // Fresh import needed to start from clean registry
      vi.resetModules()
      const freshBridge = await import('../PluginBridge.js')
      const freshRegistry = await import('../embedded-registry.js')

      // Before any call, registry is empty
      expect(freshRegistry.embeddedServerCount()).toBe(0)

      await freshBridge.executePluginTool(
        'lucid-seo',
        'seo_status',
        {},
        embeddedCtx('lucid-seo'),
      )

      expect(freshRegistry.embeddedServerCount()).toBe(1)
      const plugins = freshRegistry.getLoadedPlugins()
      expect(plugins).toHaveLength(1)
      expect(plugins[0].name).toBe('lucid-seo')
      expect(plugins[0].connected).toBe(true)
      expect(plugins[0].connectedAt).toBeGreaterThan(0)
    })
  })
})
