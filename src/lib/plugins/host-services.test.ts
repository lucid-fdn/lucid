import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureMessage: vi.fn(),
  },
}))
vi.mock('@/lib/oauth/catalog-tools', () => ({
  getCatalogToolsForProvider: vi.fn(),
}))
vi.mock('@/lib/oauth/discover-integration-tools', () => ({
  discoverIntegrationTools: vi.fn(),
}))

import { buildPluginRuntimePayloads, resolveIntegrationHostManifest } from './host-services'
import { getCatalogToolsForProvider } from '@/lib/oauth/catalog-tools'
import { discoverIntegrationTools } from '@/lib/oauth/discover-integration-tools'

describe('plugin host services', () => {
  it('prefers oauth action catalog for integration manifests', async () => {
    vi.mocked(getCatalogToolsForProvider).mockResolvedValueOnce([
      {
        name: 'search',
        description: 'Search',
        parameters: { type: 'object', properties: {} },
      },
    ])

    const result = await resolveIntegrationHostManifest('notion')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.config.manifest_source).toBe('oauth_action_catalog')
      expect(result.tools).toHaveLength(1)
    }
  })

  it('falls back to plugin catalog manifest when discovery is empty', async () => {
    vi.mocked(getCatalogToolsForProvider).mockResolvedValueOnce([])
    vi.mocked(discoverIntegrationTools).mockResolvedValueOnce({
      ok: false,
      error: 'missing',
      provider: 'notion',
      tools: [],
      action_count: 0,
      discovered_at: '2026-04-21T00:00:00.000Z',
    })

    const result = await resolveIntegrationHostManifest('notion', [
      {
        name: 'fallback_tool',
        description: 'Fallback',
        parameters: { type: 'object', properties: {} },
      },
    ])

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.config.manifest_source).toBe('plugin_catalog')
      expect(result.tools[0]?.name).toBe('fallback_tool')
    }
  })

  it('normalizes runtime plugin payloads through plugin-policy', () => {
    const [plugin] = buildPluginRuntimePayloads([
      {
        plugin_slug: 'notion',
        plugin_name: 'Notion',
        tool_manifest: [
          {
            name: 'append_block_children',
            description: 'Append block children',
            parameters: {
              type: 'object',
              properties: {
                children: {
                  type: 'array',
                },
              },
            },
          },
        ],
        enabled_tools: null,
        org_config: {},
        plugin_config: {},
        kind: 'integration',
        transport: 'nango',
        trust_level: 'verified',
        execution_mode: 'in_process',
        auth_type: 'oauth2',
        auth_provider: 'notion',
        connection_id: 'conn-1',
        source: 'first-party',
      },
    ])

    expect(plugin.tools).toEqual([
      {
        name: 'append_block_children',
        description: 'Append block children',
        parameters: {
          type: 'object',
          properties: {
            children: {
              type: 'array',
              items: {},
            },
          },
        },
      },
    ])
    expect(plugin.connectionId).toBe('conn-1')
  })
})
