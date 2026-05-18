/**
 * Tests for validateDiscordBotToken().
 *
 * The helper is a thin shell around fetch() — we mock global.fetch and assert
 * that each HTTP status maps to the documented reason. Network / abort errors
 * collapse to `network` because the POST route treats them as transient (the
 * operator retries instead of persisting a token we couldn't verify).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { validateDiscordBotToken } from '../validate-discord-token'

const ORIGINAL_FETCH = globalThis.fetch

function mockResponse(status: number, body?: unknown): void {
  globalThis.fetch = vi.fn(async () =>
    new Response(body ? JSON.stringify(body) : '', {
      status,
      statusText: String(status),
    }),
  ) as typeof fetch
}

describe('validateDiscordBotToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
  })

  it('returns ok=true with bot info on 200', async () => {
    mockResponse(200, { id: 'bot_user_1', username: 'LucidBot' })
    const result = await validateDiscordBotToken('good-token')
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.bot).toEqual({ id: 'bot_user_1', username: 'LucidBot' })
  })

  it('returns invalid on 200 without body id (defensive)', async () => {
    mockResponse(200, {})
    const result = await validateDiscordBotToken('weird-ok')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('invalid')
  })

  it('returns invalid on 401', async () => {
    mockResponse(401)
    const result = await validateDiscordBotToken('revoked')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('invalid')
    expect(result.status).toBe(401)
  })

  it('returns forbidden on 403', async () => {
    mockResponse(403)
    const result = await validateDiscordBotToken('banned')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('forbidden')
  })

  it('returns rate_limited on 429', async () => {
    mockResponse(429)
    const result = await validateDiscordBotToken('spammy')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('rate_limited')
  })

  it('returns server_error on 5xx', async () => {
    mockResponse(503)
    const result = await validateDiscordBotToken('ok')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('server_error')
    expect(result.status).toBe(503)
  })

  it('returns network on fetch throw', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNRESET')
    }) as typeof fetch
    const result = await validateDiscordBotToken('ok')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('network')
  })

  it('sends Authorization: Bot <token> header', async () => {
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'x', username: 'y' }), { status: 200 }),
    ) as typeof fetch
    globalThis.fetch = spy
    await validateDiscordBotToken('abc')
    const call = (spy as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
    const init = call[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bot abc')
  })
})
