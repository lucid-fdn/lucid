import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()
const fromMock = vi.fn()
const selectMock = vi.fn()
const eqMock = vi.fn()
const orderMock = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db/client', () => ({
  supabase: {
    rpc: rpcMock,
    from: fromMock,
  },
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
  },
}))

describe('getCatalogToolsForProvider', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    fromMock.mockReset()
    selectMock.mockReset()
    eqMock.mockReset()
    orderMock.mockReset()

    const builder = {
      eq: eqMock,
      order: orderMock,
    }

    fromMock.mockReturnValue({ select: selectMock })
    selectMock.mockReturnValue(builder)
    eqMock.mockReturnValue(builder)
  })

  it('maps oauth action catalog rows into plugin tool definitions from direct table query', async () => {
    const builder = { eq: eqMock, order: orderMock }
    orderMock
      .mockImplementationOnce(() => builder)
      .mockImplementationOnce(() => Promise.resolve({
      data: [
        {
          action_name: 'search',
          description: 'Search Notion pages and databases.',
          parameter_schema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          },
        },
      ],
      error: null,
    }))

    const { getCatalogToolsForProvider } = await import('@/lib/oauth/catalog-tools')
    const tools = await getCatalogToolsForProvider('notion')

    expect(fromMock).toHaveBeenCalledWith('oauth_action_catalog')
    expect(rpcMock).not.toHaveBeenCalled()
    expect(tools).toEqual([
      {
        name: 'search',
        description: 'Search Notion pages and databases.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
        },
      },
    ])
  })

  it('falls back to provider rpc when direct query returns no rows', async () => {
    const builder = { eq: eqMock, order: orderMock }
    orderMock
      .mockImplementationOnce(() => builder)
      .mockImplementationOnce(() => Promise.resolve({ data: [], error: null }))
    rpcMock.mockResolvedValue({
      data: [
        {
          action_name: 'search',
          description: 'Search Notion pages and databases.',
          parameter_schema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          },
        },
      ],
      error: null,
    })

    const { getCatalogToolsForProvider } = await import('@/lib/oauth/catalog-tools')
    const tools = await getCatalogToolsForProvider('notion')

    expect(rpcMock).toHaveBeenCalledWith('get_oauth_provider_actions', { p_provider: 'notion' })
    expect(tools).toHaveLength(1)
  })

  it('normalizes invalid array schemas from the catalog', async () => {
    const builder = { eq: eqMock, order: orderMock }
    orderMock
      .mockImplementationOnce(() => builder)
      .mockImplementationOnce(() => Promise.resolve({
        data: [
          {
            action_name: 'append_block_children',
            description: 'Append children.',
            parameter_schema: {
              type: 'object',
              properties: {
                children: {
                  type: 'array',
                },
              },
            },
          },
        ],
        error: null,
      }))

    const { getCatalogToolsForProvider } = await import('@/lib/oauth/catalog-tools')
    const tools = await getCatalogToolsForProvider('notion')

    expect(tools).toEqual([
      {
        name: 'append_block_children',
        description: 'Append children.',
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

  it('returns empty when both direct query and rpc fail', async () => {
    const builder = { eq: eqMock, order: orderMock }
    orderMock
      .mockImplementationOnce(() => builder)
      .mockImplementationOnce(() => Promise.resolve({ data: null, error: { message: 'select failed' } }))
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    })

    const { getCatalogToolsForProvider } = await import('@/lib/oauth/catalog-tools')
    await expect(getCatalogToolsForProvider('notion')).resolves.toEqual([])
  })
})
