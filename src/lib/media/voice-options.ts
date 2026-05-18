export type SharedVoiceOption = {
  id: string
  label: string
  shortLabel: string
  description: string
}

export const SHARED_VOICE_OPTIONS: SharedVoiceOption[] = [
  { id: 'alloy', label: 'Alloy', shortLabel: 'Neutral', description: 'balanced, versatile' },
  { id: 'ash', label: 'Ash', shortLabel: 'Dark', description: 'dark, smooth' },
  { id: 'coral', label: 'Coral', shortLabel: 'Warm', description: 'warm, smooth' },
  { id: 'echo', label: 'Echo', shortLabel: 'Clear', description: 'clear, masculine' },
  { id: 'fable', label: 'Fable', shortLabel: 'Story', description: 'storyteller, expressive' },
  { id: 'nova', label: 'Nova', shortLabel: 'Bright', description: 'bright, lively' },
  { id: 'onyx', label: 'Onyx', shortLabel: 'Deep', description: 'deep, masculine' },
  { id: 'sage', label: 'Sage', shortLabel: 'Calm', description: 'calm, grounded' },
  { id: 'shimmer', label: 'Shimmer', shortLabel: 'Soft', description: 'soft, airy' },
]

export const SHARED_VOICE_IDS = SHARED_VOICE_OPTIONS.map((voice) => voice.id)

export function getSharedVoiceOption(voiceId: string | null | undefined): SharedVoiceOption | null {
  if (!voiceId) return null
  return SHARED_VOICE_OPTIONS.find((voice) => voice.id === voiceId) ?? null
}

export function normalizeSharedVoiceId(rawVoice: string | null | undefined): string | null {
  const normalized = rawVoice?.trim().toLowerCase()
  if (!normalized) return null
  return SHARED_VOICE_IDS.includes(normalized) ? normalized : null
}
