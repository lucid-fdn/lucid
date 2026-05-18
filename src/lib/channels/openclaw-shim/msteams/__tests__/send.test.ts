/**
 * Tests for sendTeamsViaShim().
 *
 * Mirrors slack/__tests__/send.test.ts — mocks @lucid/openclaw-runtime
 * and resets the cached runtime promise between tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { PermanentChannelError } from '../../shared/errors'

const sendMessageMSTeams = vi.fn()
const setRuntimeConfigSnapshot = vi.fn()

vi.mock('@lucid/openclaw-runtime', () => ({
  sendMessageMSTeams: (...args: unknown[]) => sendMessageMSTeams(...args),
  setRuntimeConfigSnapshot: (...args: unknown[]) => setRuntimeConfigSnapshot(...args),
}))

import { sendTeamsViaShim } from '../send'
import { __resetOpenClawRuntimeForTests } from '../../shared/runtime'

describe('sendTeamsViaShim', () => {
  beforeEach(() => {
    sendMessageMSTeams.mockReset()
    setRuntimeConfigSnapshot.mockReset()
    __resetOpenClawRuntimeForTests()
  })

  it('throws when app credentials are missing', async () => {
    await expect(
      sendTeamsViaShim({}, 'conv-123', 'hi', null),
    ).rejects.toThrow(/app credentials/i)
  })

  it('throws when only app_id is provided', async () => {
    await expect(
      sendTeamsViaShim({ app_id: 'abc' }, 'conv-123', 'hi', null),
    ).rejects.toThrow(/app credentials/i)
  })

  it('sends a message and returns the external message id', async () => {
    sendMessageMSTeams.mockResolvedValueOnce({ messageId: 'act-123', conversationId: 'conv-123' })

    const result = await sendTeamsViaShim(
      { app_id: 'uuid-app', app_password: 'secret', tenant_id: 'uuid-tenant' },
      'conv-123',
      'hello world',
      null,
    )

    expect(result).toEqual({ delivered: true, externalMessageId: 'act-123' })
    expect(setRuntimeConfigSnapshot).toHaveBeenCalledWith({})
    expect(sendMessageMSTeams).toHaveBeenCalledWith('conv-123', 'hello world', {
      appId: 'uuid-app',
      appPassword: 'secret',
      tenantId: 'uuid-tenant',
      replyToActivityId: undefined,
    })
  })

  it('defaults tenantId to "common" when not provided', async () => {
    sendMessageMSTeams.mockResolvedValueOnce({ messageId: 'act-1', conversationId: 'c' })

    await sendTeamsViaShim(
      { app_id: 'app', app_password: 'pw' },
      'conv-1',
      'hi',
      null,
    )

    expect(sendMessageMSTeams).toHaveBeenCalledWith('conv-1', 'hi', expect.objectContaining({
      tenantId: 'common',
    }))
  })

  it("maps 'unknown' messageId to null", async () => {
    sendMessageMSTeams.mockResolvedValueOnce({ messageId: 'unknown', conversationId: 'c' })

    const result = await sendTeamsViaShim(
      { app_id: 'a', app_password: 'p' },
      'conv-1',
      'hi',
      null,
    )

    expect(result.externalMessageId).toBeNull()
  })

  it('forwards replyToActivityId when provided', async () => {
    sendMessageMSTeams.mockResolvedValueOnce({ messageId: 'm', conversationId: 'c' })

    await sendTeamsViaShim(
      { app_id: 'a', app_password: 'p' },
      'conv-1',
      'hi',
      'activity-456',
    )

    expect(sendMessageMSTeams).toHaveBeenCalledWith('conv-1', 'hi', expect.objectContaining({
      replyToActivityId: 'activity-456',
    }))
  })

  it('maps 401 Teams error to PermanentChannelError(auth_revoked)', async () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 })
    sendMessageMSTeams.mockRejectedValueOnce(err)

    await expect(
      sendTeamsViaShim({ app_id: 'a', app_password: 'p' }, 'c', 'hi', null),
    ).rejects.toMatchObject({
      name: 'PermanentChannelError',
      kind: 'auth_revoked',
    })
  })

  it('maps 404 Teams error to PermanentChannelError(channel_gone)', async () => {
    const err = Object.assign(new Error('Not Found'), { status: 404 })
    sendMessageMSTeams.mockRejectedValueOnce(err)

    await expect(
      sendTeamsViaShim({ app_id: 'a', app_password: 'p' }, 'c', 'hi', null),
    ).rejects.toMatchObject({
      kind: 'channel_gone',
    })
  })

  it('maps BotNotInConversationRoster to PermanentChannelError(missing_permissions)', async () => {
    const err = new Error('BotNotInConversationRoster')
    sendMessageMSTeams.mockRejectedValueOnce(err)

    await expect(
      sendTeamsViaShim({ app_id: 'a', app_password: 'p' }, 'c', 'hi', null),
    ).rejects.toMatchObject({
      kind: 'missing_permissions',
    })
  })

  it('re-throws transient errors unchanged', async () => {
    const err = new Error('ECONNRESET')
    sendMessageMSTeams.mockRejectedValueOnce(err)

    await expect(
      sendTeamsViaShim({ app_id: 'a', app_password: 'p' }, 'c', 'hi', null),
    ).rejects.toBe(err)
  })

  it('caches the runtime module across calls', async () => {
    sendMessageMSTeams
      .mockResolvedValueOnce({ messageId: '1', conversationId: 'c' })
      .mockResolvedValueOnce({ messageId: '2', conversationId: 'c' })

    await sendTeamsViaShim({ app_id: 'a', app_password: 'p' }, 'c', 'a', null)
    await sendTeamsViaShim({ app_id: 'a', app_password: 'p' }, 'c', 'b', null)

    expect(setRuntimeConfigSnapshot).toHaveBeenCalledTimes(1)
  })
})
