import { beforeEach, describe, expect, it, vi } from 'vitest'

const renewLease = vi.fn().mockResolvedValue(undefined)
const sendTextMock = vi.fn()
const removeReactionMock = vi.fn().mockResolvedValue({ ok: true })
const markOutboundStageMock = vi.fn().mockResolvedValue(undefined)
const createSlackPluginMock = vi.fn()
const decryptChannelSecretsMock = vi.fn()

vi.mock('../../adapters/supabase.js', () => ({
  renewLease: (...args: unknown[]) => renewLease(...args),
}))

vi.mock('../../channels/bridge/telegram/TelegramPlugin.js', () => ({
  createTelegramPlugin: () => ({ outbound: { sendText: vi.fn(), sendMedia: vi.fn() } }),
}))

vi.mock('../../channels/bridge/whatsapp/WhatsAppPlugin.js', () => ({
  createWhatsAppPlugin: () => ({ outbound: { sendText: vi.fn(), sendMedia: vi.fn() } }),
}))

vi.mock('../../channels/bridge/discord/DiscordPlugin.js', () => ({
  createDiscordPlugin: () => ({ outbound: { sendText: vi.fn(), sendMedia: vi.fn() } }),
}))

vi.mock('../../channels/bridge/slack/SlackPlugin.js', () => ({
  createSlackPlugin: (...args: unknown[]) => {
    createSlackPluginMock(...args)
    return {
      outbound: {
        sendText: (...args: unknown[]) => sendTextMock(...args),
      },
      reactions: {
        remove: (...args: unknown[]) => removeReactionMock(...args),
      },
    }
  },
}))

vi.mock('../../crypto/decrypt-channel-secrets.js', () => ({
  decryptChannelSecrets: (...args: unknown[]) => decryptChannelSecretsMock(...args),
}))

vi.mock('../../core/lifecycle/message-lifecycle.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/lifecycle/message-lifecycle.js')>()
  return {
    ...actual,
    markOutboundStage: (...args: unknown[]) => markOutboundStageMock(...args),
  }
})

import { processOutboundEvent } from '../outbound.js'

describe('processOutboundEvent slack routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    decryptChannelSecretsMock.mockReturnValue({ bot_token: 'xoxb-test' })
    sendTextMock.mockResolvedValue({
      ok: true,
      messageId: '171.0002',
      chatId: 'C123',
    })
    removeReactionMock.mockResolvedValue({ ok: true })
  })

  it('delivers hosted Slack replies into the inbound thread when thread_ts exists', async () => {
    const channelSingle = {
      id: 'ch-slack',
      assistant_id: null,
      channel_type: 'slack',
      external_channel_id: 'C123',
      channel_config: { hosted: true, slack_team_id: 'T123' },
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    const inboundSingle = vi.fn().mockResolvedValue({
      data: { message_data: { thread_ts: '171.0001' } },
      error: null,
    })
    const inboundEq = vi.fn(() => ({ maybeSingle: inboundSingle }))
    const inboundSelect = vi.fn(() => ({ eq: inboundEq }))

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))

    const updateEq = vi.fn(() => Promise.resolve({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))

    const fromMock = vi
      .fn()
      .mockImplementationOnce(() => ({ select: singleSelect }))
      .mockImplementationOnce(() => ({ select: inboundSelect }))
      .mockImplementationOnce(() => ({ update }))

    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-slack-thread',
        channel_id: 'ch-slack',
        inbound_event_id: 'in-slack-1',
        conversation_id: null,
        message_text: 'hello slack thread',
        reply_to_external_id: '171.0000',
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'C123',
        text: 'hello slack thread',
        threadId: '171.0001',
        platformOptions: { threadTs: '171.0001' },
      }),
    )
    expect(removeReactionMock).toHaveBeenCalledWith({
      channel: 'C123',
      timestamp: '171.0000',
      name: 'hourglass_flowing_sand',
    })
    expect(markOutboundStageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase,
        eventId: 'out-slack-thread',
        stage: 'outbound_sent',
        externalMessageId: '171.0002',
      }),
    )
    expect(update).not.toHaveBeenCalled()
  })

  it('delivers top-level Slack replies back into the channel instead of forcing a thread', async () => {
    const channelSingle = {
      id: 'ch-slack',
      assistant_id: null,
      channel_type: 'slack',
      external_channel_id: 'C123',
      channel_config: { hosted: true, slack_team_id: 'T123' },
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    const inboundSingle = vi.fn().mockResolvedValue({
      data: { message_data: {} },
      error: null,
    })
    const inboundEq = vi.fn(() => ({ maybeSingle: inboundSingle }))
    const inboundSelect = vi.fn(() => ({ eq: inboundEq }))

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))

    const updateEq = vi.fn(() => Promise.resolve({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))

    const fromMock = vi
      .fn()
      .mockImplementationOnce(() => ({ select: singleSelect }))
      .mockImplementationOnce(() => ({ select: inboundSelect }))
      .mockImplementationOnce(() => ({ update }))

    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-slack-channel',
        channel_id: 'ch-slack',
        inbound_event_id: 'in-slack-plain',
        conversation_id: null,
        message_text: 'hello slack channel',
        reply_to_external_id: '171.0000',
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'C123',
        text: 'hello slack channel',
      }),
    )
    expect(sendTextMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: expect.anything(),
      }),
    )
    expect(removeReactionMock).toHaveBeenCalledWith({
      channel: 'C123',
      timestamp: '171.0000',
      name: 'hourglass_flowing_sand',
    })
    expect(markOutboundStageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase,
        eventId: 'out-slack-channel',
        stage: 'outbound_sent',
        externalMessageId: '171.0002',
      }),
    )
    expect(update).not.toHaveBeenCalled()
  })

  it('still clears the processing reaction when Slack send fails', async () => {
    sendTextMock.mockResolvedValue({
      ok: false,
      error: 'rate_limited',
    })

    const channelSingle = {
      id: 'ch-slack',
      assistant_id: null,
      channel_type: 'slack',
      external_channel_id: 'C123',
      channel_config: { hosted: true, slack_team_id: 'T123' },
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    const inboundSingle = vi.fn().mockResolvedValue({
      data: { message_data: {} },
      error: null,
    })
    const inboundEq = vi.fn(() => ({ maybeSingle: inboundSingle }))
    const inboundSelect = vi.fn(() => ({ eq: inboundEq }))

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))

    const updateEq = vi.fn(() => Promise.resolve({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))

    const fromMock = vi
      .fn()
      .mockImplementationOnce(() => ({ select: singleSelect }))
      .mockImplementationOnce(() => ({ select: inboundSelect }))
      .mockImplementationOnce(() => ({ update }))

    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-slack-fail',
        channel_id: 'ch-slack',
        inbound_event_id: 'in-slack-fail',
        conversation_id: null,
        message_text: 'hello slack failure',
        reply_to_external_id: '171.0000',
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(removeReactionMock).toHaveBeenCalledWith({
      channel: 'C123',
      timestamp: '171.0000',
      name: 'hourglass_flowing_sand',
    })
    expect(markOutboundStageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase,
        eventId: 'out-slack-fail',
        stage: 'failed',
      }),
    )
    expect(update).not.toHaveBeenCalled()
  })

  it('uses the configured Slack typing reaction when cleaning up processing state', async () => {
    const channelSingle = {
      id: 'ch-slack',
      assistant_id: null,
      channel_type: 'slack',
      external_channel_id: 'C123',
      channel_config: {
        hosted: true,
        slack_team_id: 'T123',
        slack_typing_reaction: 'thinking_face',
      },
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    const inboundSingle = vi.fn().mockResolvedValue({
      data: { message_data: {} },
      error: null,
    })
    const inboundEq = vi.fn(() => ({ maybeSingle: inboundSingle }))
    const inboundSelect = vi.fn(() => ({ eq: inboundEq }))

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))

    const updateEq = vi.fn(() => Promise.resolve({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))

    const fromMock = vi
      .fn()
      .mockImplementationOnce(() => ({ select: singleSelect }))
      .mockImplementationOnce(() => ({ select: inboundSelect }))
      .mockImplementationOnce(() => ({ update }))

    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-slack-custom-reaction',
        channel_id: 'ch-slack',
        inbound_event_id: 'in-slack-custom',
        conversation_id: null,
        message_text: 'hello slack custom reaction',
        reply_to_external_id: '171.0000',
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(removeReactionMock).toHaveBeenCalledWith({
      channel: 'C123',
      timestamp: '171.0000',
      name: 'thinking_face',
    })
  })

  it('uses decrypted BYO Slack secrets when the channel is not hosted', async () => {
    decryptChannelSecretsMock.mockReturnValueOnce({ bot_token: 'xoxb-byo-token' })

    const channelSingle = {
      id: 'ch-slack-byo',
      assistant_id: null,
      channel_type: 'slack',
      external_channel_id: 'C456',
      channel_config: { hosted: false },
      encrypted_secrets: { id: 'sec-byo', encrypted_data: 'cipher' },
    }

    const inboundSingle = vi.fn().mockResolvedValue({
      data: { message_data: {} },
      error: null,
    })
    const inboundEq = vi.fn(() => ({ maybeSingle: inboundSingle }))
    const inboundSelect = vi.fn(() => ({ eq: inboundEq }))

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))

    const updateEq = vi.fn(() => Promise.resolve({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))

    const supabase = {
      from: vi
        .fn()
        .mockImplementationOnce(() => ({ select: singleSelect }))
        .mockImplementationOnce(() => ({ select: inboundSelect }))
        .mockImplementationOnce(() => ({ update })),
    } as any

    await processOutboundEvent(
      {
        id: 'out-slack-byo',
        channel_id: 'ch-slack-byo',
        inbound_event_id: 'in-slack-byo',
        conversation_id: null,
        message_text: 'hello slack byo',
        reply_to_external_id: '171.1000',
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(createSlackPluginMock).toHaveBeenCalledWith(
      expect.objectContaining({ bot_token: 'xoxb-byo-token' }),
    )
    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'C456',
        text: 'hello slack byo',
      }),
    )
  })
})
