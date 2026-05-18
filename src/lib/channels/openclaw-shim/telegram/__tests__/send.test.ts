/**
 * Tests for sendTelegramViaShim().
 *
 * Mirrors the Discord shim test structure — mock `@lucid/openclaw-runtime`,
 * reset the cached runtime promise between tests, exercise the chunking +
 * reply-threading behaviour that Lucid owns on top of OpenClaw's sender.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const sendMessageTelegram = vi.fn()
const setRuntimeConfigSnapshot = vi.fn()

vi.mock('@lucid/openclaw-runtime', () => ({
  sendMessageTelegram: (...args: unknown[]) => sendMessageTelegram(...args),
  setRuntimeConfigSnapshot: (...args: unknown[]) => setRuntimeConfigSnapshot(...args),
}))

import { sendTelegramViaShim } from '../send'
import { __resetOpenClawRuntimeForTests } from '../../shared/runtime'

describe('sendTelegramViaShim', () => {
  beforeEach(() => {
    sendMessageTelegram.mockReset()
    setRuntimeConfigSnapshot.mockReset()
    __resetOpenClawRuntimeForTests()
  })

  it('throws when bot token is missing', async () => {
    await expect(
      sendTelegramViaShim({}, 'chat-1', 'hi', null),
    ).rejects.toThrow(/bot token/i)
  })

  it('sends a single chunk and returns the first message id', async () => {
    sendMessageTelegram.mockResolvedValueOnce({ messageId: '42', chatId: 'chat-1' })

    const result = await sendTelegramViaShim({ bot_token: 't' }, 'chat-1', 'hello', null)

    expect(result).toEqual({ delivered: true, externalMessageId: '42' })
    expect(sendMessageTelegram).toHaveBeenCalledTimes(1)
    expect(sendMessageTelegram).toHaveBeenCalledWith('chat-1', 'hello', {
      token: 't',
      textMode: 'markdown',
    })
  })

  it("parses numeric replyToId into replyToMessageId on the first chunk only", async () => {
    sendMessageTelegram.mockResolvedValueOnce({ messageId: '1', chatId: 'chat-1' })

    await sendTelegramViaShim({ bot_token: 't' }, 'chat-1', 'hi', '99')

    expect(sendMessageTelegram).toHaveBeenCalledWith('chat-1', 'hi', {
      token: 't',
      textMode: 'markdown',
      replyToMessageId: 99,
    })
  })

  it('ignores non-numeric replyToId rather than passing garbage upstream', async () => {
    sendMessageTelegram.mockResolvedValueOnce({ messageId: '1', chatId: 'chat-1' })

    await sendTelegramViaShim({ bot_token: 't' }, 'chat-1', 'hi', 'not-a-number')

    expect(sendMessageTelegram).toHaveBeenCalledWith('chat-1', 'hi', {
      token: 't',
      textMode: 'markdown',
    })
  })

  it('sends multiple chunks, replies only on first, returns first message id', async () => {
    // Build a >4096 char message so splitTelegramMessage actually chunks.
    const longText = 'a'.repeat(5000)
    sendMessageTelegram
      .mockResolvedValueOnce({ messageId: '10', chatId: 'chat-1' })
      .mockResolvedValueOnce({ messageId: '11', chatId: 'chat-1' })

    const result = await sendTelegramViaShim({ bot_token: 't' }, 'chat-1', longText, '5')

    expect(sendMessageTelegram).toHaveBeenCalledTimes(2)
    expect(result.externalMessageId).toBe('10')
    const firstOpts = sendMessageTelegram.mock.calls[0]![2] as Record<string, unknown>
    const secondOpts = sendMessageTelegram.mock.calls[1]![2] as Record<string, unknown>
    expect(firstOpts.replyToMessageId).toBe(5)
    expect(secondOpts.replyToMessageId).toBeUndefined()
  })

  it('maps messageId="unknown" to null', async () => {
    sendMessageTelegram.mockResolvedValueOnce({ messageId: 'unknown', chatId: 'chat-1' })

    const result = await sendTelegramViaShim({ bot_token: 't' }, 'chat-1', 'hi', null)

    expect(result.externalMessageId).toBeNull()
  })

  it('returns delivered with null id for empty messages (nothing to send)', async () => {
    const result = await sendTelegramViaShim({ bot_token: 't' }, 'chat-1', '', null)

    expect(result).toEqual({ delivered: true, externalMessageId: null })
    expect(sendMessageTelegram).not.toHaveBeenCalled()
  })

  it('caches the runtime module across calls (single setRuntimeConfigSnapshot)', async () => {
    sendMessageTelegram
      .mockResolvedValueOnce({ messageId: '1', chatId: 'c' })
      .mockResolvedValueOnce({ messageId: '2', chatId: 'c' })

    await sendTelegramViaShim({ bot_token: 't' }, 'c', 'a', null)
    await sendTelegramViaShim({ bot_token: 't' }, 'c', 'b', null)

    expect(setRuntimeConfigSnapshot).toHaveBeenCalledTimes(1)
  })

  it('bubbles up runtime errors unchanged (retry logic owns the response)', async () => {
    const err = new Error('network down')
    sendMessageTelegram.mockRejectedValueOnce(err)

    await expect(sendTelegramViaShim({ bot_token: 't' }, 'c', 'hi', null)).rejects.toBe(err)
  })

  it('maps grammy error_code=401 to PermanentChannelError(auth_revoked)', async () => {
    const err = Object.assign(new Error('grammy'), {
      error_code: 401,
      description: 'Unauthorized',
    })
    sendMessageTelegram.mockRejectedValueOnce(err)

    await expect(sendTelegramViaShim({ bot_token: 't' }, 'c', 'hi', null)).rejects.toMatchObject({
      name: 'PermanentChannelError',
      kind: 'auth_revoked',
    })
  })

  it('maps grammy error_code=403 to PermanentChannelError(dm_blocked)', async () => {
    const err = Object.assign(new Error('grammy'), {
      error_code: 403,
      description: 'Forbidden: bot was blocked by the user',
    })
    sendMessageTelegram.mockRejectedValueOnce(err)

    await expect(sendTelegramViaShim({ bot_token: 't' }, 'c', 'hi', null)).rejects.toMatchObject({
      kind: 'dm_blocked',
    })
  })

  it("maps 'chat not found' (400) to PermanentChannelError(channel_gone)", async () => {
    const err = Object.assign(new Error('grammy'), {
      error_code: 400,
      description: 'Bad Request: chat not found',
    })
    sendMessageTelegram.mockRejectedValueOnce(err)

    await expect(sendTelegramViaShim({ bot_token: 't' }, 'c', 'hi', null)).rejects.toMatchObject({
      kind: 'channel_gone',
    })
  })
})
