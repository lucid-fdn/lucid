export type TelegramParseMode = 'HTML'

export function escapeTelegramHtml(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function telegramBold(value: string): string {
  return `<b>${escapeTelegramHtml(value)}</b>`
}
