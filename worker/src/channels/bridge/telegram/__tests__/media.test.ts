import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  extractTelegramPhotoPayload,
  mergeTelegramPlatformOptions,
  sendTelegramPhoto,
} from '../media.js'

describe('telegram media helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('merges telegram platform options', () => {
    expect(
      mergeTelegramPlatformOptions(
        { parse_mode: 'HTML' },
        { audioAsVoice: true },
      ),
    ).toEqual({
      parse_mode: 'HTML',
      audioAsVoice: true,
    })
  })

  it('extracts markdown image payloads', () => {
    expect(
      extractTelegramPhotoPayload('Look ![](https://example.com/chart.png) now'),
    ).toEqual({
      photoUrl: 'https://example.com/chart.png',
      caption: 'Look  now',
    })
  })

  it('extracts raw image urls', () => {
    expect(
      extractTelegramPhotoPayload('https://example.com/chart.webp'),
    ).toEqual({
      photoUrl: 'https://example.com/chart.webp',
    })
  })

  it('sends telegram photos via the bot api', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 123 } }),
    } as Response)

    await expect(
      sendTelegramPhoto({
        botToken: 'telegram-token',
        chatId: 'chat-1',
        photoUrl: 'https://example.com/chart.png',
        caption: 'caption',
        replyToId: '77',
        platformOptions: { parse_mode: 'HTML' },
      }),
    ).resolves.toEqual({
      ok: true,
      messageId: '123',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/bottelegram-token/sendPhoto',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })
})
