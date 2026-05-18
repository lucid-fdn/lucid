export interface TelegramOutboundIntents {
  text: string
  mediaUrls: string[]
  audioAsVoice: boolean
  reactionEmoji: string | null
  stickerFileId: string | null
}

const MEDIA_LINE_RE = /^\s*MEDIA:\s*(.+?)\s*$/gim
const REACTION_LINE_RE = /^\s*REACTION:\s*(.+?)\s*$/gim
const STICKER_LINE_RE = /^\s*STICKER:\s*(.+?)\s*$/gim
const AUDIO_AS_VOICE_RE = /\[\[\s*audio_as_voice\s*]]/gi

function stripDirectiveLines(text: string, pattern: RegExp): { text: string; matches: string[] } {
  const matches: string[] = []
  const next = text.replace(pattern, (_full, value: string) => {
    matches.push(value.trim())
    return ''
  })
  return { text: next, matches }
}

export function parseTelegramOutboundIntents(text: string): TelegramOutboundIntents {
  let cleaned = text
  const mediaResult = stripDirectiveLines(cleaned, MEDIA_LINE_RE)
  cleaned = mediaResult.text

  const reactionResult = stripDirectiveLines(cleaned, REACTION_LINE_RE)
  cleaned = reactionResult.text

  const stickerResult = stripDirectiveLines(cleaned, STICKER_LINE_RE)
  cleaned = stickerResult.text

  const hasAudioAsVoice = AUDIO_AS_VOICE_RE.test(cleaned)
  cleaned = cleaned.replace(AUDIO_AS_VOICE_RE, '')

  cleaned = cleaned
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    text: cleaned,
    mediaUrls: mediaResult.matches.filter(Boolean),
    audioAsVoice: hasAudioAsVoice,
    reactionEmoji: reactionResult.matches[0] || null,
    stickerFileId: stickerResult.matches[0] || null,
  }
}
