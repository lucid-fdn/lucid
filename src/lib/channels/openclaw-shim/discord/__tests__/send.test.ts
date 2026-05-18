/**
 * Tests for sendDiscordViaShim().
 *
 * We mock `@lucid/openclaw-runtime` so tests don't actually pull in the heavy
 * compiled runtime package. Each test resets the shim's cached runtime promise
 * via __resetDiscordShimForTests so the dynamic import re-runs and picks up
 * the fresh mock state.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { PermanentChannelError } from '../../shared/errors'

const sendMessageDiscord = vi.fn()
const setRuntimeConfigSnapshot = vi.fn()

vi.mock('@lucid/openclaw-runtime', () => ({
  sendMessageDiscord: (...args: unknown[]) => sendMessageDiscord(...args),
  setRuntimeConfigSnapshot: (...args: unknown[]) => setRuntimeConfigSnapshot(...args),
}))

// Import after vi.mock so the mock is registered first.
import { sendDiscordViaShim } from '../send'
import { __resetOpenClawRuntimeForTests } from '../../shared/runtime'

describe('sendDiscordViaShim', () => {
  beforeEach(() => {
    sendMessageDiscord.mockReset()
    setRuntimeConfigSnapshot.mockReset()
    __resetOpenClawRuntimeForTests()
  })

  it('throws when bot token is missing', async () => {
    await expect(
      sendDiscordViaShim({}, 'channel-123', 'hi', null),
    ).rejects.toThrow(/bot token/i)
  })

  it('sends a message and returns the external message id', async () => {
    sendMessageDiscord.mockResolvedValueOnce({ messageId: 'msg-1', channelId: 'channel-123' })

    const result = await sendDiscordViaShim(
      { bot_token: 'Bot abc' },
      'channel-123',
      'hello world',
      null,
    )

    expect(result).toEqual({ delivered: true, externalMessageId: 'msg-1' })
    expect(setRuntimeConfigSnapshot).toHaveBeenCalledWith({})
    expect(sendMessageDiscord).toHaveBeenCalledWith('channel-123', 'hello world', {
      token: 'Bot abc',
      replyTo: undefined,
    })
  })

  it("maps 'unknown' messageId to null so we don't persist sentinel values", async () => {
    sendMessageDiscord.mockResolvedValueOnce({ messageId: 'unknown', channelId: 'c' })

    const result = await sendDiscordViaShim({ bot_token: 't' }, 'c', 'hi', null)

    expect(result.externalMessageId).toBeNull()
  })

  it('forwards replyTo when a reply target is provided', async () => {
    sendMessageDiscord.mockResolvedValueOnce({ messageId: 'm', channelId: 'c' })

    await sendDiscordViaShim({ bot_token: 't' }, 'c', 'hi', 'parent-id')

    expect(sendMessageDiscord).toHaveBeenCalledWith('c', 'hi', {
      token: 't',
      replyTo: 'parent-id',
    })
  })

  it('maps DiscordSendError kind=missing-permissions to PermanentChannelError', async () => {
    const err = Object.assign(new Error('insufficient perms'), {
      name: 'DiscordSendError',
      kind: 'missing-permissions',
      channelId: 'c',
    })
    sendMessageDiscord.mockRejectedValueOnce(err)

    await expect(sendDiscordViaShim({ bot_token: 't' }, 'c', 'hi', null)).rejects.toMatchObject({
      name: 'PermanentChannelError',
      kind: 'missing_permissions',
    })
  })

  it('maps HTTP 401 to PermanentChannelError(auth_revoked)', async () => {
    const err = Object.assign(new Error('unauthorized'), { status: 401 })
    sendMessageDiscord.mockRejectedValueOnce(err)

    const promise = sendDiscordViaShim({ bot_token: 't' }, 'c', 'hi', null)
    await expect(promise).rejects.toBeInstanceOf(PermanentChannelError)
    await expect(promise).rejects.toMatchObject({ kind: 'auth_revoked', httpStatus: 401 })
  })

  it('maps HTTP 404 to PermanentChannelError(channel_gone)', async () => {
    const err = Object.assign(new Error('not found'), { statusCode: 404 })
    sendMessageDiscord.mockRejectedValueOnce(err)

    await expect(sendDiscordViaShim({ bot_token: 't' }, 'c', 'hi', null)).rejects.toMatchObject({
      kind: 'channel_gone',
    })
  })

  it('re-throws transient errors unchanged so retries can pick them up', async () => {
    const err = new Error('ECONNRESET')
    sendMessageDiscord.mockRejectedValueOnce(err)

    await expect(sendDiscordViaShim({ bot_token: 't' }, 'c', 'hi', null)).rejects.toBe(err)
  })

  it('caches the runtime module across calls (single setRuntimeConfigSnapshot)', async () => {
    sendMessageDiscord
      .mockResolvedValueOnce({ messageId: '1', channelId: 'c' })
      .mockResolvedValueOnce({ messageId: '2', channelId: 'c' })

    await sendDiscordViaShim({ bot_token: 't' }, 'c', 'a', null)
    await sendDiscordViaShim({ bot_token: 't' }, 'c', 'b', null)

    expect(setRuntimeConfigSnapshot).toHaveBeenCalledTimes(1)
  })
})
