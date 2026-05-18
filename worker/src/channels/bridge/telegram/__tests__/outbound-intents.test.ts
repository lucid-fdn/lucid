import { describe, expect, it } from 'vitest'

import { parseTelegramOutboundIntents } from '../outbound-intents.js'

describe('parseTelegramOutboundIntents', () => {
  it('extracts media urls and audio-as-voice tags', () => {
    const parsed = parseTelegramOutboundIntents(
      'Here is the memo\nMEDIA: https://example.com/voice.ogg\n[[audio_as_voice]]',
    )

    expect(parsed).toEqual({
      text: 'Here is the memo',
      mediaUrls: ['https://example.com/voice.ogg'],
      audioAsVoice: true,
      reactionEmoji: null,
      stickerFileId: null,
    })
  })

  it('extracts reaction and sticker directives', () => {
    const parsed = parseTelegramOutboundIntents(
      'REACTION: ✅\nSTICKER: CAACAgIAAxkBAAIB-sticker\n',
    )

    expect(parsed.reactionEmoji).toBe('✅')
    expect(parsed.stickerFileId).toBe('CAACAgIAAxkBAAIB-sticker')
    expect(parsed.text).toBe('')
  })
})
