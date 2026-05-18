import {
  SHARED_VOICE_OPTIONS,
  getSharedVoiceOption,
  type SharedVoiceOption,
} from '@/lib/media/voice-options'

export type TelegramVoiceMode = 'off' | 'auto' | 'always'

export type TelegramVoiceOption = SharedVoiceOption

export type TelegramVoiceStylePreset = {
  id: string
  label: string
  instructions: string
}

export const TELEGRAM_VOICE_OPTIONS: TelegramVoiceOption[] = SHARED_VOICE_OPTIONS

export const TELEGRAM_VOICE_STYLE_PRESETS: TelegramVoiceStylePreset[] = [
  { id: 'default', label: 'Default', instructions: '' },
  { id: 'warm', label: 'Warm', instructions: 'Speak with warmth, softness, and steady confidence.' },
  { id: 'deep', label: 'Deep', instructions: 'Speak with a deeper, grounded, confident tone and restrained emotion.' },
  { id: 'playful', label: 'Playful', instructions: 'Speak with playful energy, light charm, and subtle expressiveness.' },
  { id: 'calm', label: 'Calm', instructions: 'Speak calmly, with measured pacing and reassuring clarity.' },
  { id: 'dramatic', label: 'Dramatic', instructions: 'Speak with dramatic emphasis, vivid pacing, and emotional texture.' },
]

export function getTelegramVoiceOption(voiceId: string | null | undefined): TelegramVoiceOption | null {
  return getSharedVoiceOption(voiceId)
}

export function getTelegramVoiceStylePreset(presetId: string | null | undefined): TelegramVoiceStylePreset | null {
  if (!presetId) return null
  return TELEGRAM_VOICE_STYLE_PRESETS.find((preset) => preset.id === presetId) ?? null
}

export function describeTelegramVoiceMode(mode: TelegramVoiceMode): string {
  switch (mode) {
    case 'off':
      return 'Text only'
    case 'auto':
      return 'Voice in, voice out'
    case 'always':
      return 'Always reply in voice'
  }
}
