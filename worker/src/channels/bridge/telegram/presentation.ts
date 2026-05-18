function escapeTelegramHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function buildTelegramLinkPreviewOptions(text: string): Record<string, unknown> | undefined {
  const urlMatches = text.match(/https?:\/\/\S+/gi)
  if (!urlMatches || urlMatches.length === 0) {
    return { link_preview_options: { is_disabled: true } }
  }
  return {
    link_preview_options: {
      is_disabled: false,
      prefer_large_media: true,
      show_above_text: true,
    },
  }
}

export function buildTelegramReactionFallbackText(input: { emoji: string; text: string }): string {
  const cleanedText = input.text.trim()
  if (!cleanedText) return input.emoji
  return `${input.emoji} ${cleanedText}`
}

export function buildHostedTelegramReplyMarkup(): Record<string, unknown> {
  return {
    buttons: [
      [
        { text: 'Switch Agent', callback_data: 'panel:switch' },
        { text: 'Meet Others', callback_data: 'panel:agents' },
        { text: 'Help', callback_data: 'panel:help' },
      ],
    ],
  }
}

export function formatHostedTelegramFinalText(text: string, assistantName: string): string {
  return `${text}\n\n${assistantName} • Lucid`
}

export function decorateTelegramSpeakerDelivery(input: {
  text: string
  senderName: string
  senderId: string
  hosted: boolean
}): {
  text: string
  platformOptions?: Record<string, unknown>
} {
  const escapedSenderName = escapeTelegramHtml(input.senderName)
  const escapedText = escapeTelegramHtml(input.text)

  return {
    text: `<b>Message from ${escapedSenderName}</b>\n\n${escapedText}`,
    platformOptions: input.hosted
      ? {
          parse_mode: 'HTML',
          ...buildTelegramLinkPreviewOptions(input.text),
          reply_markup: {
            inline_keyboard: [[
              {
                text: `Switch to ${input.senderName}`,
                callback_data: `switch:${input.senderId}`,
                style: 'primary',
              },
            ]],
          },
        }
      : buildTelegramLinkPreviewOptions(input.text),
  }
}
