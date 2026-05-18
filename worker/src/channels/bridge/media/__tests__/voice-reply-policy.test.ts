import { describe, expect, it } from 'vitest'

import {
  resolveDiscordVoiceReplySettings,
  resolveTelegramVoiceReplySettings,
  resolveWhatsAppVoiceReplySettings,
  shouldSendVoiceReply,
} from '../voice-reply-policy.js'

describe('voice reply policy', () => {
  it('prefers channel overrides for Telegram voice settings', () => {
    expect(
      resolveTelegramVoiceReplySettings({
        channelConfig: {
          telegram_voice_mode: 'always',
          telegram_voice_id: 'coral',
          telegram_voice_instructions: 'be calm',
        },
        assistant: {
          telegram_voice_mode: 'auto',
          telegram_voice_id: 'alloy',
          telegram_voice_instructions: 'be fast',
        },
      }),
    ).toEqual({
      mode: 'always',
      voiceId: 'coral',
      instructions: 'be calm',
    })
  })

  it('normalizes WhatsApp and Discord voice settings', () => {
    expect(
      resolveWhatsAppVoiceReplySettings({
        channelConfig: {
          whatsapp_voice_mode: 'off',
          whatsapp_voice_id: 'alloy',
          whatsapp_voice_instructions: 'be concise',
        },
      }),
    ).toEqual({
      mode: 'off',
      voiceId: 'alloy',
      instructions: 'be concise',
    })

    expect(
      resolveDiscordVoiceReplySettings({
        channelConfig: {
          discord_voice_mode: 'always',
          discord_voice_id: 'onyx',
          discord_voice_instructions: 'be warm',
        },
      }),
    ).toEqual({
      mode: 'always',
      voiceId: 'onyx',
      instructions: 'be warm',
    })
  })

  it('only enables voice replies when policy and input allow it', () => {
    expect(
      shouldSendVoiceReply({
        text: 'Hello there',
        mode: 'always',
        hasVoiceInput: false,
      }),
    ).toBe(true)

    expect(
      shouldSendVoiceReply({
        text: 'Hello there',
        mode: 'auto',
        hasVoiceInput: true,
      }),
    ).toBe(true)

    expect(
      shouldSendVoiceReply({
        text: 'Hello there',
        mode: 'auto',
        hasVoiceInput: false,
      }),
    ).toBe(false)
  })
})
