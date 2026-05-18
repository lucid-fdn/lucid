/**
 * Unit tests for `upsertHostedTelegramChannel`.
 *
 * The function is now a thin wrapper around the `bind_hosted_telegram_channel`
 * RPC (added in supabase/migrations/20260407140000_telegram_multi_agent_atomic_bind.sql).
 * The atomic locking + share-flag check + primary swap is exercised end-to-end
 * by the SQL smoke + concurrency suites under /tmp/lucid-pg-smoke. These tests
 * cover the TypeScript surface area only:
 *   - Calls the right RPC with the right params
 *   - Forwards `requireShareEnabled` accurately
 *   - Unwraps array vs object response shapes
 *   - Throws on RPC error (and reports to ErrorService)
 *   - Throws on empty/missing channel_id (and reports to ErrorService)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const rpcMock = vi.fn()
const captureExceptionMock = vi.fn()

vi.mock('../client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
  ErrorService: {
    captureException: (...args: unknown[]) => captureExceptionMock(...args),
  },
}))

import { upsertHostedTelegramChannel } from '@/lib/db'

const ASSISTANT_ID = '11111111-2222-3333-4444-555555555555'
const CHAT_ID = '-1001234567890'
const SECRET = 'webhook-secret'
const BOT_TOKEN = 'bot-token'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('upsertHostedTelegramChannel', () => {
  it('calls bind_hosted_telegram_channel RPC with the expected params', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ channel_id: 'chan-1', assistant_id: ASSISTANT_ID }],
      error: null,
    })

    const result = await upsertHostedTelegramChannel({
      assistantId: ASSISTANT_ID,
      telegramChatId: CHAT_ID,
      webhookSecret: SECRET,
      botToken: BOT_TOKEN,
      requireShareEnabled: true,
    })

    expect(result).toEqual({ channelId: 'chan-1' })
    expect(rpcMock).toHaveBeenCalledTimes(1)
    const [fn, args] = rpcMock.mock.calls[0]
    expect(fn).toBe('bind_hosted_telegram_channel')
    expect(args).toMatchObject({
      p_assistant_id: ASSISTANT_ID,
      p_chat_id: CHAT_ID,
      p_require_share_enabled: true,
    })
    expect(typeof (args as { p_secret_token: string }).p_secret_token).toBe('string')
    expect((args as { p_secret_token: string }).p_secret_token.length).toBeGreaterThan(0)
  })

  it('defaults requireShareEnabled to false when not provided', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ channel_id: 'chan-2', assistant_id: ASSISTANT_ID }],
      error: null,
    })

    await upsertHostedTelegramChannel({
      assistantId: ASSISTANT_ID,
      telegramChatId: CHAT_ID,
      webhookSecret: SECRET,
      botToken: BOT_TOKEN,
    })

    const [, args] = rpcMock.mock.calls[0]
    expect((args as { p_require_share_enabled: boolean }).p_require_share_enabled).toBe(false)
  })

  it('treats truthy non-true values as false (only strict true forwards true)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ channel_id: 'chan-3', assistant_id: ASSISTANT_ID }],
      error: null,
    })

    await upsertHostedTelegramChannel({
      assistantId: ASSISTANT_ID,
      telegramChatId: CHAT_ID,
      webhookSecret: SECRET,
      botToken: BOT_TOKEN,
      // @ts-expect-error — verifying defensive comparison `=== true`
      requireShareEnabled: 1,
    })

    const [, args] = rpcMock.mock.calls[0]
    expect((args as { p_require_share_enabled: boolean }).p_require_share_enabled).toBe(false)
  })

  it('unwraps a non-array response shape', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { channel_id: 'chan-4', assistant_id: ASSISTANT_ID },
      error: null,
    })

    const result = await upsertHostedTelegramChannel({
      assistantId: ASSISTANT_ID,
      telegramChatId: CHAT_ID,
      webhookSecret: SECRET,
      botToken: BOT_TOKEN,
    })

    expect(result).toEqual({ channelId: 'chan-4' })
  })

  it('throws and reports when the RPC returns an error', async () => {
    const rpcError = { message: 'connection refused', code: '08000' }
    rpcMock.mockResolvedValueOnce({ data: null, error: rpcError })

    await expect(
      upsertHostedTelegramChannel({
        assistantId: ASSISTANT_ID,
        telegramChatId: CHAT_ID,
        webhookSecret: SECRET,
        botToken: BOT_TOKEN,
      }),
    ).rejects.toBe(rpcError)

    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    const [exc, meta] = captureExceptionMock.mock.calls[0]
    expect(exc).toBe(rpcError)
    expect(meta).toMatchObject({
      severity: 'error',
      context: expect.objectContaining({
        assistantId: ASSISTANT_ID,
        chatId: CHAT_ID,
        operation: 'upsertHostedTelegramChannel',
      }),
    })
  })

  it('throws and reports when the RPC returns an empty result (share-disabled / agent missing)', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null })

    await expect(
      upsertHostedTelegramChannel({
        assistantId: ASSISTANT_ID,
        telegramChatId: CHAT_ID,
        webhookSecret: SECRET,
        botToken: BOT_TOKEN,
        requireShareEnabled: true,
      }),
    ).rejects.toThrow(/Failed to bind hosted telegram channel/)

    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    const [, meta] = captureExceptionMock.mock.calls[0]
    expect(meta).toMatchObject({
      context: expect.objectContaining({
        assistantId: ASSISTANT_ID,
        chatId: CHAT_ID,
        requireShareEnabled: true,
        operation: 'upsertHostedTelegramChannel.emptyResult',
      }),
    })
  })

  it('throws when RPC returns a row missing channel_id', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ assistant_id: ASSISTANT_ID }],
      error: null,
    })

    await expect(
      upsertHostedTelegramChannel({
        assistantId: ASSISTANT_ID,
        telegramChatId: CHAT_ID,
        webhookSecret: SECRET,
        botToken: BOT_TOKEN,
      }),
    ).rejects.toThrow(/Failed to bind hosted telegram channel/)
  })
})
