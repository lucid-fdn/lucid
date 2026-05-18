/**
 * Tests for sendSlackViaShim().
 *
 * Mirrors discord/__tests__/send.test.ts — mocks @lucid/openclaw-runtime
 * and resets the cached runtime promise between tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { PermanentChannelError } from '../../shared/errors'

const sendMessageSlack = vi.fn()
const setRuntimeConfigSnapshot = vi.fn()

vi.mock('@lucid/openclaw-runtime', () => ({
  sendMessageSlack: (...args: unknown[]) => sendMessageSlack(...args),
  setRuntimeConfigSnapshot: (...args: unknown[]) => setRuntimeConfigSnapshot(...args),
}))

import { sendSlackViaShim } from '../send'
import { __resetOpenClawRuntimeForTests } from '../../shared/runtime'

describe('sendSlackViaShim', () => {
  beforeEach(() => {
    sendMessageSlack.mockReset()
    setRuntimeConfigSnapshot.mockReset()
    __resetOpenClawRuntimeForTests()
  })

  it('throws when bot token is missing', async () => {
    await expect(
      sendSlackViaShim({}, 'C123', 'hi', null),
    ).rejects.toThrow(/bot token/i)
  })

  it('sends a message and returns the external message id', async () => {
    sendMessageSlack.mockResolvedValueOnce({ messageId: '1234567890.123456', channelId: 'C123' })

    const result = await sendSlackViaShim(
      { bot_token: 'xoxb-test' },
      'C123',
      'hello world',
      null,
    )

    expect(result).toEqual({ delivered: true, externalMessageId: '1234567890.123456' })
    expect(setRuntimeConfigSnapshot).toHaveBeenCalledWith({})
    expect(sendMessageSlack).toHaveBeenCalledWith('C123', 'hello world', {
      token: 'xoxb-test',
      threadTs: undefined,
    })
  })

  it("maps 'unknown' messageId to null", async () => {
    sendMessageSlack.mockResolvedValueOnce({ messageId: 'unknown', channelId: 'C123' })

    const result = await sendSlackViaShim({ bot_token: 'xoxb-t' }, 'C123', 'hi', null)

    expect(result.externalMessageId).toBeNull()
  })

  it('forwards threadTs when a reply target is provided', async () => {
    sendMessageSlack.mockResolvedValueOnce({ messageId: 'm', channelId: 'C123' })

    await sendSlackViaShim({ bot_token: 'xoxb-t' }, 'C123', 'hi', '1234567890.123456')

    expect(sendMessageSlack).toHaveBeenCalledWith('C123', 'hi', {
      token: 'xoxb-t',
      threadTs: '1234567890.123456',
    })
  })

  it('passes custom identity through to the OpenClaw Slack sender', async () => {
    sendMessageSlack.mockResolvedValueOnce({ messageId: 'm', channelId: 'C123' })

    await sendSlackViaShim(
      { bot_token: 'xoxb-t' },
      'C123',
      'hi',
      null,
      { username: 'Sales Agent' },
    )

    expect(sendMessageSlack).toHaveBeenCalledWith('C123', 'hi', {
      token: 'xoxb-t',
      threadTs: undefined,
      identity: { username: 'Sales Agent' },
    })
  })

  it('maps not_authed Slack error to PermanentChannelError(auth_revoked)', async () => {
    const err = Object.assign(new Error('An API error occurred: not_authed'), {
      data: { error: 'not_authed' },
      code: 'slack_webapi_platform_error',
    })
    sendMessageSlack.mockRejectedValueOnce(err)

    await expect(sendSlackViaShim({ bot_token: 'xoxb-t' }, 'C123', 'hi', null)).rejects.toMatchObject({
      name: 'PermanentChannelError',
      kind: 'auth_revoked',
    })
  })

  it('maps invalid_auth to PermanentChannelError(auth_revoked)', async () => {
    const err = Object.assign(new Error('invalid_auth'), {
      data: { error: 'invalid_auth' },
    })
    sendMessageSlack.mockRejectedValueOnce(err)

    await expect(sendSlackViaShim({ bot_token: 'xoxb-t' }, 'C123', 'hi', null)).rejects.toMatchObject({
      kind: 'auth_revoked',
    })
  })

  it('maps channel_not_found to PermanentChannelError(channel_gone)', async () => {
    const err = Object.assign(new Error('channel_not_found'), {
      data: { error: 'channel_not_found' },
    })
    sendMessageSlack.mockRejectedValueOnce(err)

    await expect(sendSlackViaShim({ bot_token: 'xoxb-t' }, 'C123', 'hi', null)).rejects.toMatchObject({
      kind: 'channel_gone',
    })
  })

  it('maps not_in_channel to PermanentChannelError(missing_permissions)', async () => {
    const err = Object.assign(new Error('not_in_channel'), {
      data: { error: 'not_in_channel' },
    })
    sendMessageSlack.mockRejectedValueOnce(err)

    await expect(sendSlackViaShim({ bot_token: 'xoxb-t' }, 'C123', 'hi', null)).rejects.toMatchObject({
      kind: 'missing_permissions',
    })
  })

  it('maps is_archived to PermanentChannelError(channel_gone)', async () => {
    const err = Object.assign(new Error('is_archived'), {
      data: { error: 'is_archived' },
    })
    sendMessageSlack.mockRejectedValueOnce(err)

    await expect(sendSlackViaShim({ bot_token: 'xoxb-t' }, 'C123', 'hi', null)).rejects.toMatchObject({
      kind: 'channel_gone',
    })
  })

  it('maps restricted_action to PermanentChannelError(missing_permissions)', async () => {
    const err = Object.assign(new Error('restricted_action'), {
      data: { error: 'restricted_action' },
    })
    sendMessageSlack.mockRejectedValueOnce(err)

    await expect(sendSlackViaShim({ bot_token: 'xoxb-t' }, 'C123', 'hi', null)).rejects.toMatchObject({
      kind: 'missing_permissions',
    })
  })

  it('re-throws transient errors unchanged', async () => {
    const err = new Error('ECONNRESET')
    sendMessageSlack.mockRejectedValueOnce(err)

    await expect(sendSlackViaShim({ bot_token: 'xoxb-t' }, 'C123', 'hi', null)).rejects.toBe(err)
  })

  it('caches the runtime module across calls', async () => {
    sendMessageSlack
      .mockResolvedValueOnce({ messageId: '1', channelId: 'C123' })
      .mockResolvedValueOnce({ messageId: '2', channelId: 'C123' })

    await sendSlackViaShim({ bot_token: 'xoxb-t' }, 'C123', 'a', null)
    await sendSlackViaShim({ bot_token: 'xoxb-t' }, 'C123', 'b', null)

    expect(setRuntimeConfigSnapshot).toHaveBeenCalledTimes(1)
  })
})
