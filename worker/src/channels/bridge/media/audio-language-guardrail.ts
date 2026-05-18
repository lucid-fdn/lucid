interface MessageLike {
  role?: string
  content?: string
}

function collectScriptSignal(text: string): { latin: number; cyrillic: number } {
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) ?? []).length
  return { latin, cyrillic }
}

export function inferConversationScript(messages: MessageLike[]): 'latin' | 'cyrillic' | null {
  let latin = 0
  let cyrillic = 0

  for (const message of messages.slice(-8)) {
    const content = typeof message.content === 'string' ? message.content.trim() : ''
    if (!content) continue
    const signal = collectScriptSignal(content)
    latin += signal.latin
    cyrillic += signal.cyrillic
  }

  if (latin >= 12 && latin > cyrillic * 1.2) return 'latin'
  if (cyrillic >= 12 && cyrillic > latin * 1.2) return 'cyrillic'
  return null
}

function hasAudioInput(messageData: Record<string, unknown> | null | undefined): boolean {
  if (!messageData || typeof messageData !== 'object') return false
  if (
    messageData.discord_audio_input === true ||
    messageData.telegram_voice_input === true ||
    messageData.whatsapp_audio_input === true
  ) {
    return true
  }

  const attachmentSets = [
    Array.isArray(messageData.attachments) ? messageData.attachments : [],
    Array.isArray(messageData.discord_attachments) ? messageData.discord_attachments : [],
    Array.isArray(messageData.whatsapp_attachments) ? messageData.whatsapp_attachments : [],
  ]

  return attachmentSets.some((items) =>
    items.some((item) => {
      if (!item || typeof item !== 'object') return false
      const kind = (item as { kind?: unknown }).kind
      return kind === 'audio' || kind === 'voice'
    }),
  )
}

export function applyAudioLanguageGuardrail(params: {
  userMessage: string
  recentMessages: MessageLike[]
  messageData?: Record<string, unknown> | null
}): string {
  const userMessage = params.userMessage.trim()
  if (!userMessage) return userMessage
  if (!hasAudioInput(params.messageData)) return userMessage

  const script = inferConversationScript(params.recentMessages)
  const guidance =
    script === 'latin'
      ? 'Audio transcription can be imperfect. Respond in the same language/script as the recent conversation context above (currently Latin-script), and do not switch to Russian/Cyrillic unless the user clearly asks you to.'
      : script === 'cyrillic'
        ? 'Audio transcription can be imperfect. Respond in the same language/script as the recent conversation context above (currently Cyrillic-script), and do not switch scripts unless the user clearly asks you to.'
        : 'Audio transcription can be imperfect. Respond naturally, but do not switch languages just because the transcript may be uncertain.'

  return `${userMessage}\n\n[Transcribed audio guidance: ${guidance}]`
}
