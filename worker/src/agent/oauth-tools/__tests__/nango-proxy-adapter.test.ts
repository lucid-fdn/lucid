import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Nango client
const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockPatch = vi.fn()
const mockDelete = vi.fn()
const mockGetConnection = vi.fn()

vi.mock('../nango-client.js', () => ({
  getNangoClient: () => ({
    get: mockGet,
    post: mockPost,
    put: mockPut,
    patch: mockPatch,
    delete: mockDelete,
    getConnection: mockGetConnection,
  }),
}))

import { createNangoProxyAdapter, ActionError } from '../nango-proxy-adapter.js'

const axiosResp = (data: unknown, status = 200) => ({
  data,
  status,
  headers: { 'content-type': 'application/json' },
})

describe('createNangoProxyAdapter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates adapter with connectionId and providerConfigKey', () => {
    const adapter = createNangoProxyAdapter('conn-1', 'slack')
    expect(adapter.connectionId).toBe('conn-1')
    expect(adapter.providerConfigKey).toBe('slack')
  })

  it('get() delegates to SDK proxy with GET method', async () => {
    mockGet.mockResolvedValue(axiosResp({ channels: ['#general'] }))
    const adapter = createNangoProxyAdapter('conn-1', 'slack')
    const result = await adapter.get({ endpoint: 'conversations.list' })
    expect(result.data).toEqual({ channels: ['#general'] })
    expect(result.status).toBe(200)
    expect(mockGet).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'conversations.list',
        providerConfigKey: 'slack',
        connectionId: 'conn-1',
      }),
    )
  })

  it('post() delegates to SDK proxy with POST method', async () => {
    mockPost.mockResolvedValue(axiosResp({ ok: true }))
    const adapter = createNangoProxyAdapter('conn-1', 'slack')
    const result = await adapter.post({
      endpoint: 'chat.postMessage',
      data: { channel: '#general', text: 'hello' },
    })
    expect(result.data).toEqual({ ok: true })
    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'chat.postMessage',
        data: { channel: '#general', text: 'hello' },
      }),
    )
  })

  it('put() delegates to SDK proxy with PUT method', async () => {
    mockPut.mockResolvedValue(axiosResp({ updated: true }))
    const adapter = createNangoProxyAdapter('conn-1', 'notion')
    const result = await adapter.put({ endpoint: 'pages/abc', data: { title: 'New' } })
    expect(result.data).toEqual({ updated: true })
    expect(mockPut).toHaveBeenCalled()
  })

  it('patch() delegates to SDK proxy with PATCH method', async () => {
    mockPatch.mockResolvedValue(axiosResp({ patched: true }))
    const adapter = createNangoProxyAdapter('conn-1', 'notion')
    const result = await adapter.patch({ endpoint: 'pages/abc', data: { archived: true } })
    expect(result.data).toEqual({ patched: true })
    expect(mockPatch).toHaveBeenCalled()
  })

  it('delete() delegates to SDK proxy with DELETE method', async () => {
    mockDelete.mockResolvedValue(axiosResp(null, 204))
    const adapter = createNangoProxyAdapter('conn-1', 'github')
    const result = await adapter.delete({ endpoint: 'repos/foo/bar' })
    expect(result.status).toBe(204)
    expect(mockDelete).toHaveBeenCalled()
  })

  it('proxy() routes by method field', async () => {
    mockPost.mockResolvedValue(axiosResp({ ok: true }))
    const adapter = createNangoProxyAdapter('conn-1', 'slack')
    await adapter.proxy({ endpoint: 'test', method: 'POST' })
    expect(mockPost).toHaveBeenCalled()
  })

  it('proxy() defaults to GET when no method specified', async () => {
    mockGet.mockResolvedValue(axiosResp({ ok: true }))
    const adapter = createNangoProxyAdapter('conn-1', 'slack')
    await adapter.proxy({ endpoint: 'test' })
    expect(mockGet).toHaveBeenCalled()
  })

  it('passes params and headers through to SDK config', async () => {
    mockGet.mockResolvedValue(axiosResp([]))
    const adapter = createNangoProxyAdapter('conn-1', 'google')
    await adapter.get({
      endpoint: 'v1/calendars',
      params: { maxResults: 10 },
      headers: { 'X-Custom': 'value' },
      retries: 3,
    })
    expect(mockGet).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { maxResults: 10 },
        headers: { 'X-Custom': 'value' },
        retries: 3,
      }),
    )
  })

  it('allows providerConfigKey override per-request', async () => {
    mockGet.mockResolvedValue(axiosResp({}))
    const adapter = createNangoProxyAdapter('conn-1', 'google')
    await adapter.get({ endpoint: 'test', providerConfigKey: 'google-calendar' })
    expect(mockGet).toHaveBeenCalledWith(
      expect.objectContaining({ providerConfigKey: 'google-calendar' }),
    )
  })

  it('getConnection() delegates to SDK getConnection', async () => {
    mockGetConnection.mockResolvedValue({ credentials: { access_token: 'tok' } })
    const adapter = createNangoProxyAdapter('conn-1', 'google')
    const conn = await adapter.getConnection()
    expect(conn).toEqual({ credentials: { access_token: 'tok' } })
    expect(mockGetConnection).toHaveBeenCalledWith('google', 'conn-1')
  })

  it('log() calls console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const adapter = createNangoProxyAdapter('conn-1', 'slack')
    adapter.log('test message', { level: 'warn' })
    expect(spy).toHaveBeenCalledWith('[nango-action][warn] test message')
    spy.mockRestore()
  })

  it('exposes ActionError class', () => {
    const adapter = createNangoProxyAdapter('conn-1', 'slack')
    const err = new adapter.ActionError({ message: 'bad input', code: 'INVALID' })
    expect(err).toBeInstanceOf(ActionError)
    expect(err.message).toBe('bad input')
    expect(err.payload).toEqual({ message: 'bad input', code: 'INVALID' })
    expect(err.type).toBe('action_script_runtime_error')
  })
})
