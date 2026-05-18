import { beforeEach, describe, expect, it, vi } from 'vitest'

const markOutboundSent = vi.fn().mockResolvedValue(undefined)
const markOutboundFailed = vi.fn().mockResolvedValue(undefined)
const renewLease = vi.fn().mockResolvedValue(undefined)
const sendTextMock = vi.fn()
const sendMediaMock = vi.fn()
const reactMessageMock = vi.fn()
const sendStickerMock = vi.fn()
const synthesizeSpeechMock = vi.fn()
const createTelegramPluginMock = vi.fn()
const decryptChannelSecretsMock = vi.fn()

vi.mock('../../adapters/supabase.js', () => ({
  renewLease: (...args: unknown[]) => renewLease(...args),
  markOutboundSent: (...args: unknown[]) => markOutboundSent(...args),
  markOutboundFailed: (...args: unknown[]) => markOutboundFailed(...args),
}))

vi.mock('../../channels/bridge/telegram/TelegramPlugin.js', () => ({
  createTelegramPlugin: (...args: unknown[]) => {
    createTelegramPluginMock(...args)
    return {
      outbound: {
        sendText: (...args: unknown[]) => sendTextMock(...args),
        sendMedia: (...args: unknown[]) => sendMediaMock(...args),
        chunker: (text: string) => [text],
      },
      reactMessage: (...args: unknown[]) => reactMessageMock(...args),
      sendSticker: (...args: unknown[]) => sendStickerMock(...args),
    }
  },
}))

vi.mock('../../channels/bridge/discord/DiscordPlugin.js', () => ({
  createDiscordPlugin: () => ({ outbound: { sendText: vi.fn() } }),
}))

vi.mock('../../channels/bridge/whatsapp/WhatsAppPlugin.js', () => ({
  createWhatsAppPlugin: () => ({ outbound: { sendText: vi.fn() } }),
}))

vi.mock('../../crypto/decrypt-channel-secrets.js', () => ({
  decryptChannelSecrets: (...args: unknown[]) => decryptChannelSecretsMock(...args),
}))

vi.mock('../../ai/media-gateway.js', () => ({
  synthesizeSpeech: (...args: unknown[]) => synthesizeSpeechMock(...args),
}))

import { processOutboundEvent } from '../outbound.js'

describe('processOutboundEvent telegram routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    decryptChannelSecretsMock.mockReturnValue({})
    sendTextMock.mockResolvedValue({ ok: true, messageId: 'm-1', chatId: 'chat-1' })
    sendMediaMock.mockResolvedValue({ ok: true, messageId: 'm-media', chatId: 'chat-1' })
    reactMessageMock.mockResolvedValue({ ok: true })
    sendStickerMock.mockResolvedValue({ ok: true, messageId: 'm-sticker', chatId: 'chat-1' })
    synthesizeSpeechMock.mockResolvedValue({
      buffer: Buffer.from('voice-bytes'),
      mimeType: 'audio/ogg',
      fileName: 'assistant-voice.ogg',
      provider: 'trustgate',
      model: 'gpt-4o-mini-tts',
    })
  })

  it('forwards non-primary agent messages through the active room speaker with a switch button', async () => {
    const senderAssistantId = '11111111-2222-3333-4444-555555555555'
    const primaryAssistantId = '99999999-8888-7777-6666-555555555555'
    const channelSingle = {
      id: 'ch-sender',
      assistant_id: senderAssistantId,
      channel_type: 'telegram',
      external_channel_id: 'chat-1',
      ai_assistants: { name: 'Background Analyst', telegram_display_name: 'Lucid First Agent' },
      encrypted_secrets: null,
    }
    const roomBindings = [
      {
        id: 'ch-primary',
        assistant_id: primaryAssistantId,
        is_primary: true,
        ai_assistants: { name: 'Active Agent', telegram_display_name: 'Current Agent' },
      },
      {
        id: 'ch-sender',
        assistant_id: senderAssistantId,
        is_primary: false,
        ai_assistants: { name: 'Background Analyst', telegram_display_name: 'Lucid First Agent' },
      },
    ]

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))

    const listEqChat = vi.fn().mockResolvedValue({ data: roomBindings, error: null })
    const listEqActive = vi.fn(() => ({ eq: listEqChat }))
    const listEqType = vi.fn(() => ({ eq: listEqActive }))

    const fromMock = vi
      .fn()
      .mockImplementationOnce(() => ({ select: singleSelect }))
      .mockImplementationOnce(() => ({ select: vi.fn(() => ({ eq: listEqType })) }))

    const supabase = {
      from: fromMock,
    } as any

    await processOutboundEvent(
      {
        id: 'out-1',
        channel_id: 'ch-sender',
        inbound_event_id: null,
        conversation_id: null,
        message_text: 'Signal flipped bearish.',
        reply_to_external_id: null,
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        TELEGRAM_HOSTED_BOT_TOKEN: 'bot-token',
        ENCRYPTION_KEY: '',
      } as any,
    )

    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'chat-1',
        text: '<b>Message from Lucid First Agent</b>\n\nSignal flipped bearish.',
        platformOptions: {
          parse_mode: 'HTML',
          link_preview_options: {
            is_disabled: true,
          },
          reply_markup: {
            inline_keyboard: [[
              {
                text: 'Switch to Lucid First Agent',
                callback_data: `switch:${senderAssistantId}`,
                style: 'primary',
              },
            ]],
          },
        },
      }),
    )
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-1', 'm-1')
  })

  it('injects the hosted Telegram bot token when channel secrets are absent', async () => {
    const channelSingle = {
      id: 'ch-hosted',
      assistant_id: null,
      channel_type: 'telegram',
      external_channel_id: 'chat-hosted',
      ai_assistants: { name: 'Hosted', telegram_display_name: 'Hosted' },
      encrypted_secrets: null,
    }

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))
    const fromMock = vi.fn().mockImplementationOnce(() => ({ select: singleSelect }))
    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-hosted',
        channel_id: 'ch-hosted',
        inbound_event_id: null,
        conversation_id: null,
        message_text: 'hello hosted telegram',
        reply_to_external_id: null,
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        TELEGRAM_HOSTED_BOT_TOKEN: 'hosted-telegram-token',
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(createTelegramPluginMock).toHaveBeenCalledWith(
      expect.objectContaining({ bot_token: 'hosted-telegram-token' }),
    )
    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'chat-hosted',
        text: 'hello hosted telegram',
      }),
    )
  })

  it('uses decrypted BYO Telegram secrets without requiring the hosted bot token', async () => {
    decryptChannelSecretsMock.mockReturnValueOnce({ bot_token: 'byo-telegram-token' })

    const channelSingle = {
      id: 'ch-byo',
      assistant_id: null,
      channel_type: 'telegram',
      external_channel_id: 'chat-byo',
      ai_assistants: { name: 'BYO', telegram_display_name: 'BYO' },
      encrypted_secrets: { id: 'sec-byo', encrypted_data: 'cipher' },
    }

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))
    const fromMock = vi.fn().mockImplementationOnce(() => ({ select: singleSelect }))
    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-byo',
        channel_id: 'ch-byo',
        inbound_event_id: null,
        conversation_id: null,
        message_text: 'hello byo telegram',
        reply_to_external_id: null,
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

    expect(createTelegramPluginMock).toHaveBeenCalledWith(
      expect.objectContaining({ bot_token: 'byo-telegram-token' }),
    )
    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'chat-byo',
        text: 'hello byo telegram',
      }),
    )
  })

  it('routes MEDIA directives through Telegram sendMedia with audioAsVoice', async () => {
    const channelSingle = {
      id: 'ch-sender',
      assistant_id: null,
      channel_type: 'telegram',
      external_channel_id: 'chat-1',
      ai_assistants: { name: 'Closer', telegram_display_name: 'Closer' },
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))
    const fromMock = vi.fn().mockImplementationOnce(() => ({ select: singleSelect }))
    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-media',
        channel_id: 'ch-sender',
        inbound_event_id: null,
        conversation_id: null,
        message_text: 'Voice note for the user\nMEDIA: https://example.com/voice.ogg\n[[audio_as_voice]]',
        reply_to_external_id: '42',
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        TELEGRAM_HOSTED_BOT_TOKEN: 'bot-token',
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(sendMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'chat-1',
        text: 'Voice note for the user',
        mediaUrl: 'https://example.com/voice.ogg',
        replyToId: '42',
        platformOptions: {
          audioAsVoice: true,
          link_preview_options: { is_disabled: true },
        },
      }),
    )
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-media', 'm-media')
  })

  it('synthesizes Telegram voice replies when the assistant voice mode is always', async () => {
    const channelSingle = {
      id: 'ch-voice',
      assistant_id: null,
      channel_type: 'telegram',
      external_channel_id: 'chat-voice',
      ai_assistants: {
        name: 'Closer',
        telegram_display_name: 'Closer',
        telegram_voice_mode: 'always',
        telegram_voice_id: 'coral',
        telegram_voice_instructions: 'Speak with warmth and confidence.',
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
        id: 'out-voice',
        channel_id: 'ch-voice',
        inbound_event_id: null,
        conversation_id: null,
        message_text: 'Talk back as a voice note',
        reply_to_external_id: '42',
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        TELEGRAM_HOSTED_BOT_TOKEN: 'bot-token',
        LUCID_API_BASE_URL: 'https://api.lucid.foundation',
        LUCID_API_KEY: 'lucid-key',
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(synthesizeSpeechMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Talk back as a voice note',
        voice: 'coral',
        instructions: 'Speak with warmth and confidence.',
        format: 'opus',
      }),
    )
    expect(sendMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'chat-voice',
        text: '',
        replyToId: '42',
        mediaUrl: expect.stringMatching(/^file:\/\//),
        platformOptions: expect.objectContaining({
          audioAsVoice: true,
          mediaLocalRoots: expect.any(Array),
        }),
      }),
    )
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-voice', 'm-media')
  })

  it('uses auto mode only when inbound Telegram metadata marks voice input', async () => {
    const channelSingle = {
      id: 'ch-auto',
      assistant_id: null,
      channel_type: 'telegram',
      external_channel_id: 'chat-auto',
      channel_config: null,
      ai_assistants: {
        name: 'Closer',
        telegram_display_name: 'Closer',
        telegram_voice_mode: 'auto',
        telegram_voice_id: null,
      },
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    const inboundSingle = vi.fn().mockResolvedValue({
      data: { message_data: { telegram_voice_input: true } },
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
        id: 'out-auto',
        channel_id: 'ch-auto',
        inbound_event_id: 'in-voice',
        conversation_id: null,
        message_text: 'Voice reply please',
        reply_to_external_id: null,
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        TELEGRAM_HOSTED_BOT_TOKEN: 'bot-token',
        LUCID_API_BASE_URL: 'https://api.lucid.foundation',
        LUCID_API_KEY: 'lucid-key',
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(synthesizeSpeechMock).toHaveBeenCalled()
    expect(sendMediaMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'chat-auto' }))
  })

  it('defaults Telegram channel voice mode to auto when no explicit voice mode is set', async () => {
    const channelSingle = {
      id: 'ch-auto-default',
      assistant_id: null,
      channel_type: 'telegram',
      external_channel_id: 'chat-auto-default',
      channel_config: null,
      ai_assistants: {
        name: 'Closer',
        telegram_display_name: 'Closer',
        telegram_voice_mode: null,
        telegram_voice_id: null,
      },
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    const inboundSingle = vi.fn().mockResolvedValue({
      data: { message_data: { telegram_voice_input: true } },
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
        id: 'out-auto-default',
        channel_id: 'ch-auto-default',
        inbound_event_id: 'in-voice-default',
        conversation_id: null,
        message_text: 'Voice reply by default',
        reply_to_external_id: null,
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        TELEGRAM_HOSTED_BOT_TOKEN: 'bot-token',
        LUCID_API_BASE_URL: 'https://api.lucid.foundation',
        LUCID_API_KEY: 'lucid-key',
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(synthesizeSpeechMock).toHaveBeenCalled()
    expect(sendMediaMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'chat-auto-default' }))
  })

  it('falls back to text when Telegram speech synthesis fails', async () => {
    synthesizeSpeechMock.mockRejectedValueOnce(new Error('tts unavailable'))

    const channelSingle = {
      id: 'ch-voice-fallback',
      assistant_id: null,
      channel_type: 'telegram',
      external_channel_id: 'chat-voice-fallback',
      channel_config: null,
      ai_assistants: {
        name: 'Closer',
        telegram_display_name: 'Closer',
        telegram_voice_mode: 'always',
        telegram_voice_id: 'coral',
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
        id: 'out-voice-fallback',
        channel_id: 'ch-voice-fallback',
        inbound_event_id: null,
        conversation_id: null,
        message_text: 'Talk back as a voice note',
        reply_to_external_id: null,
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        TELEGRAM_HOSTED_BOT_TOKEN: 'bot-token',
        LUCID_API_BASE_URL: 'https://api.lucid.foundation',
        LUCID_API_KEY: 'lucid-key',
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'chat-voice-fallback',
        text: 'Talk back as a voice note',
      }),
    )
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-voice-fallback', 'm-1')
  })

  it('falls back to text when Telegram voice delivery fails', async () => {
    sendMediaMock.mockResolvedValueOnce({ ok: false, error: 'voice send failed' })

    const channelSingle = {
      id: 'ch-channel-override',
      assistant_id: null,
      channel_type: 'telegram',
      external_channel_id: 'chat-channel-override',
      channel_config: {
        telegram_voice_mode: 'always',
        telegram_voice_id: 'alloy',
      },
      ai_assistants: {
        name: 'Closer',
        telegram_display_name: 'Closer',
        telegram_voice_mode: 'off',
        telegram_voice_id: 'coral',
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
        id: 'out-channel-override',
        channel_id: 'ch-channel-override',
        inbound_event_id: null,
        conversation_id: null,
        message_text: 'Prefer the channel voice',
        reply_to_external_id: null,
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        TELEGRAM_HOSTED_BOT_TOKEN: 'bot-token',
        LUCID_API_BASE_URL: 'https://api.lucid.foundation',
        LUCID_API_KEY: 'lucid-key',
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(synthesizeSpeechMock).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: 'alloy',
      }),
    )
    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'chat-channel-override',
        text: 'Prefer the channel voice',
      }),
    )
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-channel-override', 'm-1')
  })

  it('routes REACTION directives to the replied Telegram message', async () => {
    const channelSingle = {
      id: 'ch-sender',
      assistant_id: null,
      channel_type: 'telegram',
      external_channel_id: 'chat-1',
      ai_assistants: { name: 'Closer', telegram_display_name: 'Closer' },
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))
    const fromMock = vi.fn().mockImplementationOnce(() => ({ select: singleSelect }))
    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-react',
        channel_id: 'ch-sender',
        inbound_event_id: null,
        conversation_id: null,
        message_text: 'REACTION: ✅',
        reply_to_external_id: '77',
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        TELEGRAM_HOSTED_BOT_TOKEN: 'bot-token',
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(reactMessageMock).toHaveBeenCalledWith({
      to: 'chat-1',
      messageId: '77',
      emoji: '✅',
    })
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-react', 'reaction:77')
  })

  it('falls back to a visible reply when Telegram rejects a reaction', async () => {
    reactMessageMock.mockResolvedValueOnce({ ok: false, warning: 'REACTION_INVALID' })

    const channelSingle = {
      id: 'ch-sender',
      assistant_id: null,
      channel_type: 'telegram',
      external_channel_id: 'chat-1',
      ai_assistants: { name: 'Closer', telegram_display_name: 'Closer' },
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))
    const listEqChat = vi.fn().mockResolvedValue({ data: [], error: null })
    const listEqActive = vi.fn(() => ({ eq: listEqChat }))
    const listEqType = vi.fn(() => ({ eq: listEqActive }))
    const fromMock = vi
      .fn()
      .mockImplementationOnce(() => ({ select: singleSelect }))
      .mockImplementationOnce(() => ({ select: vi.fn(() => ({ eq: listEqType })) }))
    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-react-fallback',
        channel_id: 'ch-sender',
        inbound_event_id: null,
        conversation_id: null,
        message_text: 'REACTION: ✅',
        reply_to_external_id: '77',
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        TELEGRAM_HOSTED_BOT_TOKEN: 'bot-token',
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(reactMessageMock).toHaveBeenCalledWith({
      to: 'chat-1',
      messageId: '77',
      emoji: '✅',
    })
    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'chat-1',
        text: '✅',
        replyToId: '77',
      }),
    )
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-react-fallback', 'm-1')
  })

  it('routes STICKER directives through Telegram sticker sends', async () => {
    const channelSingle = {
      id: 'ch-sender',
      assistant_id: null,
      channel_type: 'telegram',
      external_channel_id: 'chat-1',
      ai_assistants: { name: 'Closer', telegram_display_name: 'Closer' },
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    const singleSingle = vi.fn().mockResolvedValue({ data: channelSingle, error: null })
    const singleEq = vi.fn(() => ({ single: singleSingle }))
    const singleSelect = vi.fn(() => ({ eq: singleEq }))
    const fromMock = vi.fn().mockImplementationOnce(() => ({ select: singleSelect }))
    const supabase = { from: fromMock } as any

    await processOutboundEvent(
      {
        id: 'out-sticker',
        channel_id: 'ch-sender',
        inbound_event_id: null,
        conversation_id: null,
        message_text: 'STICKER: CAACAgIAAxkBAAIB-sticker',
        reply_to_external_id: '88',
        attempts: 1,
        max_attempts: 3,
      },
      supabase,
      {
        WORKER_ID: 'worker-1',
        HEARTBEAT_INTERVAL: 60_000,
        TELEGRAM_HOSTED_BOT_TOKEN: 'bot-token',
        ENCRYPTION_KEY: 'key',
      } as any,
    )

    expect(sendStickerMock).toHaveBeenCalledWith({
      to: 'chat-1',
      fileId: 'CAACAgIAAxkBAAIB-sticker',
      replyToId: '88',
    })
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-sticker', 'm-sticker')
  })
})
