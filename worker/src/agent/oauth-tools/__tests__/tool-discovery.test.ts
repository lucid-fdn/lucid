import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock getNangoClient to return a mock Nango SDK instance
const mockGetScriptsConfig = vi.fn()
vi.mock('../nango-client.js', () => ({
  getNangoClient: vi.fn(() => ({
    getScriptsConfig: mockGetScriptsConfig,
  })),
}))

import { discoverTools, discoverToolsBatch, clearDiscoveryCache } from '../tool-discovery.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_SCRIPTS_CONFIG = [
  {
    providerConfigKey: 'slack',
    actions: [
      {
        name: 'send-message',
        description: 'Send a Slack message',
        input: {
          fields: [
            { name: 'channel', type: 'string', description: 'Channel ID' },
            { name: 'text', type: 'string', description: 'Message text' },
          ],
        },
      },
      {
        name: 'list-channels',
        description: 'List Slack channels',
        input: {
          fields: [
            { name: 'limit', type: 'number', description: 'Max results', optional: true },
          ],
        },
      },
    ],
  },
  {
    providerConfigKey: 'google-sheets',
    actions: [
      {
        name: 'get-sheet-data',
        description: 'Read spreadsheet data',
        input: {
          fields: [
            { name: 'spreadsheetId', type: 'string', description: 'Spreadsheet ID' },
            { name: 'range', type: 'string', description: 'A1 notation range' },
          ],
        },
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('discoverTools', () => {
  beforeEach(() => {
    clearDiscoveryCache()
    mockGetScriptsConfig.mockReset()
  })

  afterEach(() => {
    clearDiscoveryCache()
  })

  it('discovers tools from Nango SDK getScriptsConfig()', async () => {
    mockGetScriptsConfig.mockResolvedValue(MOCK_SCRIPTS_CONFIG)

    const tools = await discoverTools('slack')

    expect(mockGetScriptsConfig).toHaveBeenCalledOnce()
    expect(tools).toHaveLength(2)
    expect(tools[0].actionName).toBe('send-message')
    expect(tools[0].description).toBe('Send a Slack message')
    expect(tools[0].inputSchema).toEqual({
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel ID' },
        text: { type: 'string', description: 'Message text' },
      },
      required: ['channel', 'text'],
      additionalProperties: false,
    })
    expect(tools[1].actionName).toBe('list-channels')
  })

  it('returns cached results on second call', async () => {
    mockGetScriptsConfig.mockResolvedValue(MOCK_SCRIPTS_CONFIG)

    await discoverTools('slack')
    await discoverTools('slack')

    expect(mockGetScriptsConfig).toHaveBeenCalledOnce()
  })

  it('returns empty array for unknown integration', async () => {
    mockGetScriptsConfig.mockResolvedValue(MOCK_SCRIPTS_CONFIG)

    const tools = await discoverTools('unknown-provider')
    expect(tools).toEqual([])
  })

  it('handles SDK errors gracefully', async () => {
    mockGetScriptsConfig.mockRejectedValue(new Error('Network error'))

    const tools = await discoverTools('slack')
    expect(tools).toEqual([])
  })

  it('marks optional fields correctly in schema', async () => {
    mockGetScriptsConfig.mockResolvedValue(MOCK_SCRIPTS_CONFIG)

    const tools = await discoverTools('slack')
    const listChannels = tools.find(t => t.actionName === 'list-channels')!

    // 'limit' is optional, so should NOT be in required
    expect(listChannels.inputSchema).toEqual({
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results' },
      },
      additionalProperties: false,
    })
  })

  it('maps Nango types to JSON Schema types', async () => {
    const configWithTypes = [{
      providerConfigKey: 'test',
      actions: [{
        name: 'test-action',
        description: 'Test',
        input: {
          fields: [
            { name: 'name', type: 'string' },
            { name: 'count', type: 'integer' },
            { name: 'rate', type: 'float' },
            { name: 'active', type: 'bool' },
            { name: 'tags', type: 'string[]' },
            { name: 'meta', type: 'json' },
            { name: 'date', type: 'date' },
          ],
        },
      }],
    }]

    mockGetScriptsConfig.mockResolvedValue(configWithTypes)

    const tools = await discoverTools('test')
    const schema = tools[0].inputSchema as Record<string, any>

    expect(schema.properties.name.type).toBe('string')
    expect(schema.properties.count.type).toBe('number')
    expect(schema.properties.rate.type).toBe('number')
    expect(schema.properties.active.type).toBe('boolean')
    expect(schema.properties.tags.type).toBe('array')
    expect(schema.properties.meta.type).toBe('object')
    expect(schema.properties.date.type).toBe('string')
  })

  it('returns null client gracefully', async () => {
    // Override the mock to return null for this test
    const { getNangoClient } = await import('../nango-client.js')
    vi.mocked(getNangoClient).mockReturnValueOnce(null)
    clearDiscoveryCache()

    const tools = await discoverTools('slack')
    expect(tools).toEqual([])
  })

  it('batch discovers tools for multiple integrations', async () => {
    mockGetScriptsConfig.mockResolvedValue(MOCK_SCRIPTS_CONFIG)

    const result = await discoverToolsBatch(['slack', 'google-sheets', 'unknown'])

    expect(mockGetScriptsConfig).toHaveBeenCalledOnce()
    expect(result.get('slack')).toHaveLength(2)
    expect(result.get('google-sheets')).toHaveLength(1)
    expect(result.get('unknown')).toEqual([])
  })
})
