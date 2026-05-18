import { describe, it, expect } from 'vitest'
import { normalizePluginRow } from '../manifest.js'

describe('normalizePluginRow', () => {
  it('transforms snake_case DB row to camelCase ActivatedPlugin', () => {
    const row = {
      plugin_slug: 'lucid-seo',
      plugin_name: 'Lucid SEO',
      tool_manifest: [{ name: 'research', description: 'Research', parameters: {} }],
      enabled_tools: null,
      plugin_config: { depth: 3 },
      org_config: { orgKey: 'val' },
      source: 'first-party',
      mcpgate_server_id: null,
      kind: 'plugin',
      transport: 'embedded',
      trust_level: 'internal',
      execution_mode: 'in_process',
      auth_type: 'none',
      auth_provider: null,
    }

    const result = normalizePluginRow(row)
    expect(result.slug).toBe('lucid-seo')
    expect(result.name).toBe('Lucid SEO')
    expect(result.tools).toHaveLength(1)
    expect(result.config).toEqual({ orgKey: 'val', depth: 3 })
    expect(result.kind).toBe('plugin')
    expect(result.transport).toBe('embedded')
    expect(result.trustLevel).toBe('internal')
    expect(result.executionMode).toBe('in_process')
    expect(result.authType).toBe('none')
  })

  it('filters tools by enabled_tools', () => {
    const row = {
      plugin_slug: 'lucid-seo',
      plugin_name: 'SEO',
      tool_manifest: [
        { name: 'research', description: 'A', parameters: {} },
        { name: 'analyze', description: 'B', parameters: {} },
      ],
      enabled_tools: ['research'],
      plugin_config: {},
      org_config: {},
      source: 'first-party',
    }

    const result = normalizePluginRow(row)
    expect(result.tools).toHaveLength(1)
    expect(result.tools[0].name).toBe('research')
  })

  it('handles missing unified fields (old format)', () => {
    const row = {
      plugin_slug: 'old-plugin',
      plugin_name: 'Old Plugin',
      manifest_snapshot: [{ name: 'tool1', description: 'T', parameters: {} }],
      enabled_tools: null,
      config: { key: 'val' },
      source: 'mcpgate',
      mcpgate_server_id: 'server-1',
    }

    const result = normalizePluginRow(row)
    expect(result.slug).toBe('old-plugin')
    expect(result.tools).toHaveLength(1)
    expect(result.mcpgateServerId).toBe('server-1')
    // Missing UCA fields get safe defaults (least-privileged posture)
    expect(result.kind).toBe('plugin')
    expect(result.transport).toBe('remote-mcp')
    expect(result.trustLevel).toBe('community')
    expect(result.executionMode).toBe('gateway')
  })

  it('merges org config and plugin config (plugin wins)', () => {
    const row = {
      plugin_slug: 'test',
      plugin_name: 'Test',
      tool_manifest: [],
      enabled_tools: null,
      org_config: { shared: 'org', orgOnly: 'yes' },
      plugin_config: { shared: 'plugin', pluginOnly: 'yes' },
      source: 'first-party',
    }

    const result = normalizePluginRow(row)
    expect(result.config).toEqual({ shared: 'plugin', orgOnly: 'yes', pluginOnly: 'yes' })
  })
})
