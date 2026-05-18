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
  createDiscordPlugin: () => ({ outbound: { sendText: vi.fn() } }),
}))

vi.mock('../../channels/bridge/whatsapp/WhatsAppPlugin.js', () => ({
  createWhatsAppPlugin: () => ({
    outbound: {
      sendText: (...args: unknown[]) => sendTextMock(...args),
      sendMedia: (...args: unknown[]) => sendMediaMock(...args),
      chunker: (text: string) => [text],
    },
  }),
}))

vi.mock('../../crypto/decrypt-channel-secrets.js', () => ({
  decryptChannelSecrets: () => ({}),
}))

vi.mock('../../ai/media-gateway.js', () => ({
  synthesizeSpeech: (...args: unknown[]) => synthesizeSpeechMock(...args),
}))

import { processOutboundEvent } from '../outbound.js'

describe('processOutboundEvent whatsapp routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendTextMock.mockResolvedValue({ ok: true, messageId: 'wa-text-1', chatId: 'chat-wa' })
    sendMediaMock.mockResolvedValue({ ok: true, messageId: 'wa-media-1', chatId: 'chat-wa' })
    synthesizeSpeechMock.mockResolvedValue({
      buffer: Buffer.from('voice-bytes'),
      mimeType: 'audio/ogg',
      fileName: 'assistant-voice.ogg',
      provider: 'trustgate',
      model: 'gpt-4o-mini-tts',
    })
  })

  it('synthesizes WhatsApp voice replies when channel voice mode is always', async () => {
    const channelSingle = {
      id: 'ch-wa',
      assistant_id: null,
      channel_type: 'whatsapp',
      external_channel_id: 'chat-wa',
      channel_config: {
        whatsapp_voice_mode: 'always',
        whatsapp_voice_id: 'coral',
        whatsapp_voice_instructions: 'Speak warmly.',
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
        id: 'out-wa-voice',
        channel_id: 'ch-wa',
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
        voice: 'coral',
        instructions: 'Speak warmly.',
        format: 'opus',
      }),
    )
    expect(sendMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'chat-wa',
        text: '',
        mediaUrl: expect.stringMatching(/^file:\/\//),
        platformOptions: expect.objectContaining({
          mediaMimeType: 'audio/ogg',
          mediaFileName: 'assistant-voice.ogg',
        }),
      }),
    )
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-wa-voice', 'wa-media-1')
  })

  it('falls back to text when WhatsApp voice delivery fails', async () => {
    sendMediaMock.mockResolvedValueOnce({ ok: false, error: 'voice send failed' })

    const channelSingle = {
      id: 'ch-wa-fallback',
      assistant_id: null,
      channel_type: 'whatsapp',
      external_channel_id: 'chat-wa',
      channel_config: {
        whatsapp_voice_mode: 'always',
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
        id: 'out-wa-fallback',
        channel_id: 'ch-wa-fallback',
        inbound_event_id: null,
        conversation_id: null,
        message_text: 'Fallback to text',
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

    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'chat-wa',
        text: 'Fallback to text',
      }),
    )
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-wa-fallback', 'wa-text-1')
  })

  it('defaults WhatsApp channel voice mode to auto when inbound metadata marks audio input', async () => {
    const channelSingle = {
      id: 'ch-wa-auto-default',
      assistant_id: null,
      channel_type: 'whatsapp',
      external_channel_id: 'chat-wa',
      channel_config: {},
      encrypted_secrets: { id: 'sec-1', encrypted_data: 'cipher' },
    }

    const inboundSingle = vi.fn().mockResolvedValue({
      data: { message_data: { whatsapp_audio_input: true } },
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
        id: 'out-wa-auto-default',
        channel_id: 'ch-wa-auto-default',
        inbound_event_id: 'in-wa-audio',
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
    expect(sendMediaMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'chat-wa' }))
    expect(markOutboundSent).toHaveBeenCalledWith(supabase, 'out-wa-auto-default', 'wa-media-1')
  })
})
