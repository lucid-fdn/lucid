import { describe, it, expect } from 'vitest'
import { routePlugin } from '../router.js'
import type { ActivatedPlugin } from '../types.js'

function makePlugin(overrides: Partial<ActivatedPlugin> = {}): ActivatedPlugin {
  return {
    slug: 'test-plugin',
    name: 'Test Plugin',
    tools: [],
    config: {},
    kind: 'plugin',
    transport: 'embedded',
    trustLevel: 'internal',
    executionMode: 'in_process',
    authType: 'none',
    authProvider: null,
    ...overrides,
  }
}

describe('routePlugin', () => {
  it('routes embedded + internal to embedded path', () => {
    const result = routePlugin(makePlugin({
      transport: 'embedded',
      trustLevel: 'internal',
      executionMode: 'in_process',
    }))
    expect(result.path).toBe('embedded')
  })

  it('routes embedded + community to gateway-mcp (policy override)', () => {
    const result = routePlugin(makePlugin({
      transport: 'embedded',
      trustLevel: 'community',
      executionMode: 'in_process',
    }))
    expect(result.path).toBe('gateway-mcp')
    expect(result.policy.reason).toContain('gateway-only')
  })

  it('routes remote-mcp to gateway-mcp', () => {
    const result = routePlugin(makePlugin({
      transport: 'remote-mcp',
      trustLevel: 'verified',
      executionMode: 'gateway',
      mcpgateServerId: 'server-xyz',
    }))
    expect(result.path).toBe('gateway-mcp')
    expect(result.target).toBe('server-xyz')
  })

  it('routes rest transport to gateway-rest with endpointUrl as target', () => {
    const result = routePlugin(makePlugin({
      transport: 'rest',
      trustLevel: 'verified',
      executionMode: 'gateway',
      endpointUrl: 'https://api.weather.com/v1',
    }))
    expect(result.path).toBe('gateway-rest')
    expect(result.target).toBe('https://api.weather.com/v1')
  })

  it('blocks plugins on admin blocklist', () => {
    const result = routePlugin(
      makePlugin({ slug: 'bad-plugin', transport: 'embedded', trustLevel: 'internal' }),
      { policy: { blockedPlugins: ['bad-plugin'] } },
    )
    expect(result.path).toBe('blocked')
  })

  it('defaults unknown fields to safe values', () => {
    // Plugin with no unified fields (old format) — cast to bypass required fields
    const result = routePlugin(makePlugin({
      transport: undefined as any,
      trustLevel: undefined as any,
      executionMode: undefined as any,
    }))
    // Defaults: transport=remote-mcp, trustLevel=community, executionMode=gateway
    expect(result.path).toBe('gateway-mcp')
    expect(result.policy.effectiveMode).toBe('gateway')
  })

  it('uses builtin: prefix for fallback server ID', () => {
    const result = routePlugin(makePlugin({
      slug: 'lucid-seo',
      transport: 'remote-mcp',
      mcpgateServerId: undefined,
    }))
    expect(result.target).toBe('builtin:lucid-seo')
  })
})
