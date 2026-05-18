import { describe, it, expect } from 'vitest'
import { PluginRegistry } from '../registry.js'
import type { ActivatedPlugin } from '../types.js'

const seoPlugin: ActivatedPlugin = {
  slug: 'lucid-seo',
  name: 'Lucid SEO',
  tools: [
    { name: 'research_keywords', description: 'Research keywords', parameters: {} },
    { name: 'analyze_serp', description: 'Analyze SERP', parameters: {} },
  ],
  config: {},
  kind: 'plugin',
  transport: 'embedded',
  trustLevel: 'internal',
  executionMode: 'in_process',
  authType: 'none',
  authProvider: null,
}

const slackPlugin: ActivatedPlugin = {
  slug: 'slack',
  name: 'Slack',
  tools: [{ name: 'send_message', description: 'Send a Slack message', parameters: {} }],
  config: {},
  kind: 'integration',
  transport: 'remote-mcp',
  trustLevel: 'community',
  executionMode: 'gateway',
  authType: 'oauth2',
  authProvider: 'slack',
}

describe('PluginRegistry', () => {
  it('registers and retrieves plugins', () => {
    const reg = new PluginRegistry([seoPlugin])
    expect(reg.get('lucid-seo')).toEqual(seoPlugin)
    expect(reg.has('lucid-seo')).toBe(true)
    expect(reg.has('missing')).toBe(false)
  })

  it('returns all plugins', () => {
    const reg = new PluginRegistry([seoPlugin, slackPlugin])
    expect(reg.getAll()).toHaveLength(2)
    expect(reg.size).toBe(2)
  })

  it('resolves wire tool names with double underscore', () => {
    const reg = new PluginRegistry([seoPlugin])
    const resolved = reg.resolveWireToolName('lucid-seo__research_keywords')
    expect(resolved?.plugin.slug).toBe('lucid-seo')
    expect(resolved?.tool.name).toBe('research_keywords')
  })

  it('resolves wire tool names with underscore slug (sanitized)', () => {
    const reg = new PluginRegistry([seoPlugin])
    // Wire names replace hyphens with underscores
    const resolved = reg.resolveWireToolName('lucid_seo__research_keywords')
    expect(resolved?.plugin.slug).toBe('lucid-seo')
    expect(resolved?.tool.name).toBe('research_keywords')
  })

  it('returns null for unknown wire tool names', () => {
    const reg = new PluginRegistry([seoPlugin])
    expect(reg.resolveWireToolName('unknown__tool')).toBeNull()
    expect(reg.resolveWireToolName('no-separator')).toBeNull()
  })

  it('returns null for known plugin but unknown tool', () => {
    const reg = new PluginRegistry([seoPlugin])
    expect(reg.resolveWireToolName('lucid-seo__nonexistent_tool')).toBeNull()
  })
})
