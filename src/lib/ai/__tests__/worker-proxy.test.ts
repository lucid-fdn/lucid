import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { transformPluginRows } from '@/lib/ai/worker-proxy'

describe('transformPluginRows', () => {
  it('normalizes malformed tool schemas before sending them to the worker', () => {
    const [plugin] = transformPluginRows([
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
  })
})
