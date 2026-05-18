export type VoiceReplyMode = 'off' | 'auto' | 'always'

export interface VoiceReplySettings {
  mode: VoiceReplyMode
  voiceId: string | null
  instructions: string | null
}

function trimNonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function resolveVoiceMode(value: unknown, fallback: VoiceReplyMode): VoiceReplyMode {
  switch (value) {
    case 'off':
    case 'auto':
    case 'always':
      return value
    default:
      return fallback
  }
}

export function resolveTelegramVoiceReplySettings(params: {
  channelConfig?: Record<string, unknown> | null
  assistant?: {
    telegram_voice_mode?: VoiceReplyMode | null
    telegram_voice_id?: string | null
    telegram_voice_instructions?: string | null
  } | null
}): VoiceReplySettings {
  const mode = resolveVoiceMode(
    params.channelConfig?.telegram_voice_mode,
    resolveVoiceMode(params.assistant?.telegram_voice_mode, 'auto'),
  )

  return {
    mode,
    voiceId:
      trimNonEmpty(params.channelConfig?.telegram_voice_id)
      ?? trimNonEmpty(params.assistant?.telegram_voice_id)
      ?? null,
    instructions:
      trimNonEmpty(params.channelConfig?.telegram_voice_instructions)
      ?? trimNonEmpty(params.assistant?.telegram_voice_instructions)
      ?? null,
  }
}

export function resolveWhatsAppVoiceReplySettings(params: {
  channelConfig?: Record<string, unknown> | null
}): VoiceReplySettings {
  return {
    mode: resolveVoiceMode(params.channelConfig?.whatsapp_voice_mode, 'auto'),
    voiceId: trimNonEmpty(params.channelConfig?.whatsapp_voice_id) ?? null,
    instructions: trimNonEmpty(params.channelConfig?.whatsapp_voice_instructions) ?? null,
  }
}

export function resolveDiscordVoiceReplySettings(params: {
  channelConfig?: Record<string, unknown> | null
}): VoiceReplySettings {
  return {
    mode: resolveVoiceMode(params.channelConfig?.discord_voice_mode, 'auto'),
    voiceId: trimNonEmpty(params.channelConfig?.discord_voice_id) ?? null,
    instructions: trimNonEmpty(params.channelConfig?.discord_voice_instructions) ?? null,
  }
}

export function shouldSendVoiceReply(params: {
  text: string
  mode: VoiceReplyMode
  hasVoiceInput: boolean
}): boolean {
  if (!params.text.trim()) return false
  if (params.mode === 'off') return false
  if (params.mode === 'always') return true
  return params.hasVoiceInput
}
