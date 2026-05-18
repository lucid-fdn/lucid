/**
 * DiscordNativeAdapter tests.
 *
 * Covers the pieces we can exercise without a real Discord gateway:
 *   - channelType identifier
 *   - missing credentials → PermanentChannelError
 *   - 401/403 on /users/@me → PermanentChannelError
 *   - 401/403 on /gateway/bot → PermanentChannelError
 *   - Non-permanent REST failures surface as regular Errors
 *
 * The WebSocket handshake itself is not exercised here — it's driven by
 * real Discord servers in integration tests. We stop at "REST discovery
 * succeeded, connection attempted" to keep the unit surface tight.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { discordNativeAdapter } from '../DiscordNativeAdapter.js'
import { PermanentChannelError } from '../../errors.js'

const ORIGINAL_FETCH = globalThis.fetch
const ORIGINAL_WS = (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket

function mockFetchSequence(responses: Array<{ url: RegExp; status: number; body?: unknown }>): void {
  const queue = [...responses]
  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString()
    const idx = queue.findIndex((r) => r.url.test(url))
    if (idx === -1) {
      throw new Error(`unmocked fetch: ${url}`)
    }
    const [match] = queue.splice(idx, 1)
    return new Response(
      match.body ? JSON.stringify(match.body) : '',
      { status: match.status, statusText: match.status === 401 ? 'Unauthorized' : match.status === 403 ? 'Forbidden' : 'OK' },
    )
  }) as typeof fetch
}

/**
 * Fake WebSocket that never fires events — the adapter will sit in
 * handshake until we abort. Good enough for the "happy REST path" tests
 * below, which exit via an abort.
 */
class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  readyState = FakeWebSocket.CONNECTING
  constructor(public url: string) {}
  addEventListener(): void {}
  removeEventListener(): void {}
  send(): void {}
  close(): void {
    this.readyState = FakeWebSocket.CLOSED
  }
}

describe('discordNativeAdapter', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket
  })

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    if (ORIGINAL_WS) {
      ;(globalThis as unknown as { WebSocket: unknown }).WebSocket = ORIGINAL_WS
    } else {
      delete (globalThis as unknown as { WebSocket?: unknown }).WebSocket
    }
    vi.clearAllMocks()
  })

  it('exposes channelType=discord', () => {
    expect(discordNativeAdapter.channelType).toBe('discord')
  })

  it('rejects with PermanentChannelError when bot_token is missing', async () => {
    const ac = new AbortController()
    await expect(
      discordNativeAdapter.start(
        { accountId: 'acct_1', credentials: {} },
        ac.signal,
        { onMessage: async () => undefined },
      ),
    ).rejects.toBeInstanceOf(PermanentChannelError)
  })

  it('rejects with PermanentChannelError on 401 from /users/@me', async () => {
    mockFetchSequence([
      { url: /users\/@me/, status: 401 },
    ])

    const ac = new AbortController()
    await expect(
      discordNativeAdapter.start(
        { accountId: 'acct_1', credentials: { bot_token: 'revoked' } },
        ac.signal,
        { onMessage: async () => undefined },
      ),
    ).rejects.toBeInstanceOf(PermanentChannelError)
  })

  it('rejects with PermanentChannelError on 403 from /gateway/bot', async () => {
    mockFetchSequence([
      { url: /users\/@me/, status: 200, body: { id: 'bot_user_id' } },
      { url: /gateway\/bot/, status: 403 },
    ])

    const ac = new AbortController()
    await expect(
      discordNativeAdapter.start(
        { accountId: 'acct_1', credentials: { bot_token: 'banned' } },
        ac.signal,
        { onMessage: async () => undefined },
      ),
    ).rejects.toBeInstanceOf(PermanentChannelError)
  })

  it('surfaces transient REST errors as regular Errors (not PermanentChannelError)', async () => {
    mockFetchSequence([
      { url: /users\/@me/, status: 500 },
    ])

    const ac = new AbortController()
    let caught: unknown
    try {
      await discordNativeAdapter.start(
        { accountId: 'acct_1', credentials: { bot_token: 'good' } },
        ac.signal,
        { onMessage: async () => undefined },
      )
    } catch (err) {
      caught = err
    }

    // Must be a plain Error (transient — manager will retry), not a PermanentChannelError.
    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(PermanentChannelError)
    expect((caught as Error).message).toMatch(/500/)
  })

  it('rejects with PermanentChannelError on 401 from /gateway/bot', async () => {
    mockFetchSequence([
      { url: /users\/@me/, status: 200, body: { id: 'bot_user_id' } },
      { url: /gateway\/bot/, status: 401 },
    ])

    const ac = new AbortController()
    await expect(
      discordNativeAdapter.start(
        { accountId: 'acct_1', credentials: { bot_token: 'expired' } },
        ac.signal,
        { onMessage: async () => undefined },
      ),
    ).rejects.toBeInstanceOf(PermanentChannelError)
  })
})
