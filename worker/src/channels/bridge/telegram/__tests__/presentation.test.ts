import { describe, expect, it } from 'vitest'

import {
  buildHostedTelegramReplyMarkup,
  buildTelegramLinkPreviewOptions,
  buildTelegramReactionFallbackText,
  decorateTelegramSpeakerDelivery,
  formatHostedTelegramFinalText,
} from '../presentation.js'

describe('telegram presentation helpers', () => {
  it('disables link previews when there are no urls', () => {
    expect(buildTelegramLinkPreviewOptions('hello')).toEqual({
      link_preview_options: { is_disabled: true },
    })
  })

  it('enables rich previews when urls are present', () => {
    expect(buildTelegramLinkPreviewOptions('see https://example.com')).toEqual({
      link_preview_options: {
        is_disabled: false,
        prefer_large_media: true,
        show_above_text: true,
      },
    })
  })

  it('builds hosted reply markup controls', () => {
    expect(buildHostedTelegramReplyMarkup()).toEqual({
      buttons: [[
        { text: 'Switch Agent', callback_data: 'panel:switch' },
        { text: 'Meet Others', callback_data: 'panel:agents' },
        { text: 'Help', callback_data: 'panel:help' },
      ]],
    })
  })

  it('formats hosted final telegram text with Lucid branding', () => {
    expect(formatHostedTelegramFinalText('hello', 'Shared')).toBe('hello\n\nShared • Lucid')
  })

  it('builds a reaction fallback message', () => {
    expect(buildTelegramReactionFallbackText({ emoji: '✅', text: 'done' })).toBe('✅ done')
    expect(buildTelegramReactionFallbackText({ emoji: '✅', text: '   ' })).toBe('✅')
  })

  it('decorates hosted speaker delivery with html banner and switch button', () => {
    expect(
      decorateTelegramSpeakerDelivery({
        text: 'Signal flipped bearish.',
        senderName: 'Lucid First Agent',
        senderId: 'assistant-1',
        hosted: true,
      }),
    ).toEqual({
      text: '<b>Message from Lucid First Agent</b>\n\nSignal flipped bearish.',
      platformOptions: {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: {
          inline_keyboard: [[
            {
              text: 'Switch to Lucid First Agent',
              callback_data: 'switch:assistant-1',
              style: 'primary',
            },
          ]],
        },
      },
    })
  })
})
