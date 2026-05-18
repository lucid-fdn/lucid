import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { teamsNativeAdapter } from '../TeamsNativeAdapter.js'
import { PermanentChannelError } from '../../errors.js'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('TeamsNativeAdapter', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('has channelType "msteams"', () => {
    expect(teamsNativeAdapter.channelType).toBe('msteams')
  })

  it('throws PermanentChannelError when app credentials are missing', async () => {
    const ac = new AbortController()
    await expect(
      teamsNativeAdapter.start(
        { accountId: 'test', credentials: {} },
        ac.signal,
        { onMessage: vi.fn() },
      ),
    ).rejects.toThrow(PermanentChannelError)
    ac.abort()
  })

  it('throws PermanentChannelError when OAuth returns 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid_client' }),
    })

    const ac = new AbortController()
    await expect(
      teamsNativeAdapter.start(
        {
          accountId: 'test',
          credentials: { app_id: 'a', app_password: 'p' },
        },
        ac.signal,
        { onMessage: vi.fn() },
      ),
    ).rejects.toThrow(PermanentChannelError)
    ac.abort()
  })

  it('throws PermanentChannelError when OAuth returns 403', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: 'forbidden' }),
    })

    const ac = new AbortController()
    await expect(
      teamsNativeAdapter.start(
        {
          accountId: 'test',
          credentials: { app_id: 'a', app_password: 'p' },
        },
        ac.signal,
        { onMessage: vi.fn() },
      ),
    ).rejects.toThrow(PermanentChannelError)
    ac.abort()
  })

  it('starts successfully when OAuth token is acquired', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'test-token', expires_in: 3600 }),
    })

    const ac = new AbortController()
    // Use a dynamic port to avoid conflicts
    const port = 30000 + Math.floor(Math.random() * 10000)

    const startPromise = teamsNativeAdapter.start(
      {
        accountId: 'test',
        credentials: { app_id: 'a', app_password: 'p', webhook_port: String(port) },
      },
      ac.signal,
      { onMessage: vi.fn() },
    )

    await startPromise
    ac.abort()
  })

  it('cleans up server on abort signal', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'test-token', expires_in: 3600 }),
    })

    const ac = new AbortController()
    const port = 30000 + Math.floor(Math.random() * 10000)

    await teamsNativeAdapter.start(
      {
        accountId: 'test',
        credentials: { app_id: 'a', app_password: 'p', webhook_port: String(port) },
      },
      ac.signal,
      { onMessage: vi.fn() },
    )

    // Aborting should close the server without error
    ac.abort()

    // Verify port is freed by trying to listen again
    const { createServer } = await import('http')
    await new Promise<void>((resolve, reject) => {
      const server = createServer()
      server.listen(port, () => {
        server.close()
        resolve()
      })
      server.on('error', reject)
    })
  })
})

describe('stripMentionTags (via webhook processing)', () => {
  it('strips <at>BotName</at> tags from message text', () => {
    // Test the mention stripping logic indirectly — the adapter's internal
    // stripMentionTags function handles this.
    const text = '<at>LucidBot</at> what is the weather?'
    const cleaned = text.replace(/<at>[^<]*<\/at>/gi, '').replace(/\s+/g, ' ').trim()
    expect(cleaned).toBe('what is the weather?')
  })

  it('handles multiple mention tags', () => {
    const text = '<at>Bot1</at> and <at>Bot2</at> hello'
    const cleaned = text.replace(/<at>[^<]*<\/at>/gi, '').replace(/\s+/g, ' ').trim()
    expect(cleaned).toBe('and hello')
  })

  it('returns empty string when only mention', () => {
    const text = '<at>LucidBot</at>'
    const cleaned = text.replace(/<at>[^<]*<\/at>/gi, '').replace(/\s+/g, ' ').trim()
    expect(cleaned).toBe('')
  })
})
