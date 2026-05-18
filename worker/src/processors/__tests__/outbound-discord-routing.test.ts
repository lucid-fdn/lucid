import { beforeEach, describe, expect, it, vi } from 'vitest'

const markOutboundSent = vi.fn().mockResolvedValue(undefined)
const markOutboundFailed = vi.fn().mockResolvedValue(undefined)
const renewLease = vi.fn().mockResolvedValue(undefined)
const sendTextMock = vi.fn()
const sendMediaMock = vi.fn()
const synthesizeSpeechMock = vi.fn()

vi.mock('../../adapters/supabase.js', () => ({
  renewLease: (...args: unknown[]) => renewLease(...args),
  markOutboundSent: (...args: unknown[]) => markOutboundSent(...args),
  markOutboundFailed: (...args: unknown[]) => markOutboundFailed(...args),
}))

vi.mock('../../channels/bridge/telegram/TelegramPlugin.js', () => ({
  createTelegramPlugin: () => ({ outbound: { sendText: vi.fn(), sendMedia: vi.fn() } }),
}))

vi.mock('../../channels/bridge/discord/DiscordPlugin.js', () => ({
  createDiscordPlugin: () => ({
    outbound: {
      sendText: (...args: unknown[]) => sendTextMock(...args),
      sendMedia: (...args: unknown[]) => sendMediaMock(...args),
      chunker: (text: string, limit: number) => (text.length > limit ? [text.slice(0, limit), text.slice(limit)] : [text]),
      textChunkLimit: 2000,
    },
  }),
}))

vi.mock('../../channels/bridge/whatsapp/WhatsAppPlugin.js', () => ({
  createWhatsAppPlugin: () => ({ outbound: { sendText: vi.fn(), sendMedia: vi.fn() } }),
}))

vi.mock('../../crypto/decrypt-channel-secrets.js', () => ({
  decryptChannelSecrets: () => ({}),
}))

vi.mock('../../ai/media-gateway.js', () => ({
  synthesizeSpeech: (...args: unknown[]) => synthesizeSpeechMock(...args),
}))

import { processOutboundEvent } from '../outbound.js'

describe('processOutboundEvent discord routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendTextMock.mockResolvedValue({ ok: true, messageId: 'discord-text-1', chatId: 'guild-1' })
    sendMediaMock.mockResolvedValue({ ok: true, messageId: 'discord-media-1', chatId: 'guild-1' })
    synthesizeSpeechMock.mockResolvedValue({
      buffer: Buffer.from('voice-bytes'),
      mimeType: 'audio/ogg',
      fileName: 'assistant-voice.ogg',
      provider: 'trustgate',
      model: 'gpt-4o-mini-tts',
    })
  })

  it('synthesizes Discord voice replies when channel voice mode is always', async () => {
    const channelSingle = {
      id: 'ch-discord',
      assistant_id: null,
      channel_type: 'discord',
      external_channel_id: 'channel:discord-1',
      channel_config: {
        discord_voice_mode: 'always',
        discord_voice_id: 'onyx',
      },
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))
    const fromMock = vi.fn().mockImplementationOnce(() => ({ select: singleSelect }))
    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-discord-voice',
        channel_id: 'ch-discord',
        inbound_event_id: null,
        conversation_id: null,
        message_text: 'Reply in voice',
        reply_to_external_id: null,
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        LUCID_API_BASE_URL: 'https://api.lucid.foundation',
        LUCID_API_KEY: 'lucid-key',
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(synthesizeSpeechMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Reply in voice',
        voice: 'onyx',
        format: 'opus',
      }),
    )
    expect(sendMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'channel:discord-1',
        text: '',
        mediaUrl: expect.stringMatching(/^file:\/\//),
        platformOptions: expect.objectContaining({
          audioAsVoice: true,
          mediaLocalRoots: expect.any(Array),
        }),
      }),
    )
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-discord-voice', 'discord-media-1')
  })

  it('falls back to text when Discord voice delivery fails', async () => {
    sendMediaMock.mockResolvedValueOnce({ ok: false, error: 'voice send failed' })

    const channelSingle = {
      id: 'ch-discord-fallback',
      assistant_id: null,
      channel_type: 'discord',
      external_channel_id: 'channel:discord-1',
      channel_config: {
        discord_voice_mode: 'always',
      },
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))
    const fromMock = vi.fn().mockImplementationOnce(() => ({ select: singleSelect }))
    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-discord-fallback',
        channel_id: 'ch-discord-fallback',
        inbound_event_id: null,
        conversation_id: null,
        message_text: 'Fallback to text',
        reply_to_external_id: 'reply-1',
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        LUCID_API_BASE_URL: 'https://api.lucid.foundation',
        LUCID_API_KEY: 'lucid-key',
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'channel:discord-1',
        text: 'Fallback to text',
        replyToId: 'reply-1',
      }),
    )
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-discord-fallback', 'discord-text-1')
  })

  it('defaults Discord channel voice mode to auto when inbound metadata marks audio input', async () => {
    const channelSingle = {
      id: 'ch-discord-auto-default',
      assistant_id: null,
      channel_type: 'discord',
      external_channel_id: 'channel:discord-1',
      channel_config: {},
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    const inboundSingle = vi.fn().mockResolvedValue({
      data: { message_data: { discord_audio_input: true } },
      error: null,
    })
    const inboundEq = vi.fn(() => ({ maybeSingle: inboundSingle }))
    const inboundSelect = vi.fn(() => ({ eq: inboundEq }))

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))
    const fromMock = vi
      .fn()
      .mockImplementationOnce(() => ({ select: singleSelect }))
      .mockImplementationOnce(() => ({ select: inboundSelect }))
    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-discord-auto-default',
        channel_id: 'ch-discord-auto-default',
        inbound_event_id: 'in-discord-audio',
        conversation_id: null,
        message_text: 'Reply in voice because the user sent audio',
        reply_to_external_id: null,
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        LUCID_API_BASE_URL: 'https://api.lucid.foundation',
        LUCID_API_KEY: 'lucid-key',
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(synthesizeSpeechMock).toHaveBeenCalled()
    expect(sendMediaMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'channel:discord-1' }))
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-discord-auto-default', 'discord-media-1')
  })

  it('uses the inbound Discord text channel for hosted guild-bound replies', async () => {
    const channelSingle = {
      id: 'ch-discord-hosted',
      assistant_id: null,
      channel_type: 'discord',
      external_channel_id: 'guild-1',
      channel_config: {},
      encrypted_secrets: null,
    }

    const inboundSingle = vi.fn().mockResolvedValue({
      data: { message_data: { discord_channel_id: 'channel:discord-99' } },
      error: null,
    })
    const inboundEq = vi.fn(() => ({ maybeSingle: inboundSingle }))
    const inboundSelect = vi.fn(() => ({ eq: inboundEq }))

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))
    const fromMock = vi
      .fn()
      .mockImplementationOnce(() => ({ select: singleSelect }))
      .mockImplementationOnce(() => ({ select: inboundSelect }))
    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-discord-hosted',
        channel_id: 'ch-discord-hosted',
        inbound_event_id: 'in-discord-hosted',
        conversation_id: null,
        message_text: 'Reply to the real Discord text channel',
        reply_to_external_id: 'reply-99',
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        LUCID_API_BASE_URL: 'https://api.lucid.foundation',
        LUCID_API_KEY: 'lucid-key',
        ENCRYPTION_KEY: 'key',
        DISCORD_HOSTED_BOT_TOKEN: 'discord-hosted-token',
      } as any,
    )

    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'channel:discord-99',
        text: 'Reply to the real Discord text channel',
        replyToId: 'reply-99',
      }),
    )
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-discord-hosted', 'discord-text-1')
  })

  it('replies only on the first physical Discord chunk for long outbound text', async () => {
    const channelSingle = {
      id: 'ch-discord-long',
      assistant_id: null,
      channel_type: 'discord',
      external_channel_id: 'channel:discord-1',
      channel_config: {},
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    sendTextMock
      .mockResolvedValueOnce({ ok: true, messageId: 'discord-text-1', chatId: 'guild-1' })
      .mockResolvedValueOnce({ ok: true, messageId: 'discord-text-2', chatId: 'guild-1' })

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))
    const fromMock = vi.fn().mockImplementationOnce(() => ({ select: singleSelect }))
    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-discord-long',
        channel_id: 'ch-discord-long',
        inbound_event_id: null,
        conversation_id: null,
        message_text: 'A'.repeat(2105),
        reply_to_external_id: 'reply-long',
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        LUCID_API_BASE_URL: 'https://api.lucid.foundation',
        LUCID_API_KEY: 'lucid-key',
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(sendTextMock).toHaveBeenCalledTimes(2)
    expect(sendTextMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: 'channel:discord-1',
        replyToId: 'reply-long',
      }),
    )
    expect(sendTextMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        to: 'channel:discord-1',
        replyToId: undefined,
      }),
    )
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-discord-long', 'discord-text-2')
  })

  it('keeps reply references on every Discord chunk when channel reply mode is all', async () => {
    const channelSingle = {
      id: 'ch-discord-all',
      assistant_id: null,
      channel_type: 'discord',
      external_channel_id: 'channel:discord-1',
      channel_config: {
        discord_reply_to_mode: 'all',
      },
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    sendTextMock
      .mockResolvedValueOnce({ ok: true, messageId: 'discord-text-1', chatId: 'guild-1' })
      .mockResolvedValueOnce({ ok: true, messageId: 'discord-text-2', chatId: 'guild-1' })

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))
    const fromMock = vi.fn().mockImplementationOnce(() => ({ select: singleSelect }))
    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-discord-all',
        channel_id: 'ch-discord-all',
        inbound_event_id: null,
        conversation_id: null,
        message_text: 'B'.repeat(2105),
        reply_to_external_id: 'reply-all',
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        LUCID_API_BASE_URL: 'https://api.lucid.foundation',
        LUCID_API_KEY: 'lucid-key',
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(sendTextMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ replyToId: 'reply-all' }),
    )
    expect(sendTextMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ replyToId: 'reply-all' }),
    )
  })

  it('suppresses Discord reply references when channel reply mode is off', async () => {
    const channelSingle = {
      id: 'ch-discord-off',
      assistant_id: null,
      channel_type: 'discord',
      external_channel_id: 'channel:discord-1',
      channel_config: {
        discord_reply_to_mode: 'off',
      },
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))
    const fromMock = vi.fn().mockImplementationOnce(() => ({ select: singleSelect }))
    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-discord-off',
        channel_id: 'ch-discord-off',
        inbound_event_id: null,
        conversation_id: null,
        message_text: 'Reply without thread reference',
        reply_to_external_id: 'reply-off',
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        LUCID_API_BASE_URL: 'https://api.lucid.foundation',
        LUCID_API_KEY: 'lucid-key',
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        replyToId: undefined,
      }),
    )
  })

  it('normalizes raw hosted Discord channel ids to channel recipients', async () => {
    const channelSingle = {
      id: 'ch-discord-hosted-raw',
      assistant_id: null,
      channel_type: 'discord',
      external_channel_id: 'guild-1',
      channel_config: {},
      encrypted_secrets: null,
    }

    const inboundSingle = vi.fn().mockResolvedValue({
      data: { message_data: { discord_channel_id: '1419760739522056213' } },
      error: null,
    })
    const inboundEq = vi.fn(() => ({ maybeSingle: inboundSingle }))
    const inboundSelect = vi.fn(() => ({ eq: inboundEq }))

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))
    const fromMock = vi
      .fn()
      .mockImplementationOnce(() => ({ select: singleSelect }))
      .mockImplementationOnce(() => ({ select: inboundSelect }))
    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-discord-hosted-raw',
        channel_id: 'ch-discord-hosted-raw',
        inbound_event_id: 'in-discord-hosted-raw',
        conversation_id: null,
        message_text: 'Reply to the normalized hosted Discord channel',
        reply_to_external_id: 'reply-raw',
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        LUCID_API_BASE_URL: 'https://api.lucid.foundation',
        LUCID_API_KEY: 'lucid-key',
        ENCRYPTION_KEY: 'key',
        DISCORD_HOSTED_BOT_TOKEN: 'discord-hosted-token',
      } as any,
    )

    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'channel:1419760739522056213',
        text: 'Reply to the normalized hosted Discord channel',
        replyToId: 'reply-raw',
      }),
    )
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-discord-hosted-raw', 'discord-text-1')
  })
})
