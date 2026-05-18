export const TELEGRAM_VOICE_OPTIONS = [
  { value: '__default__', label: 'Default voice' },
  { value: 'coral', label: 'Coral - warm, smooth' },
  { value: 'onyx', label: 'Onyx - deep, masculine' },
  { value: 'echo', label: 'Echo - clear, masculine' },
  { value: 'alloy', label: 'Alloy - neutral' },
  { value: 'ash', label: 'Ash - grounded' },
  { value: 'ballad', label: 'Ballad - rich, expressive' },
  { value: 'fable', label: 'Fable - animated' },
  { value: 'nova', label: 'Nova - bright' },
  { value: 'sage', label: 'Sage - calm' },
  { value: 'shimmer', label: 'Shimmer - airy' },
  { value: 'verse', label: 'Verse - polished' },
] as const

export const TELEGRAM_VOICE_STYLE_PRESETS = {
  default: '',
  warm: 'Speak warmly, confidently, and naturally. Add gentle emotional range without sounding theatrical.',
  deep: 'Speak with a lower, steady, confident tone. Keep the delivery grounded, composed, and deliberate.',
  playful: 'Speak with light playfulness and charm. Keep the pacing energetic and the tone lively without becoming cartoonish.',
  calm: 'Speak calmly and clearly with a relaxed, reassuring tone. Keep the pacing even and controlled.',
  dramatic: 'Speak with strong emphasis, emotional color, and presence. Keep it polished and engaging, not exaggerated.',
} as const

export type TelegramVoiceStylePreset = keyof typeof TELEGRAM_VOICE_STYLE_PRESETS
export type TrustGateInferenceMode = 'auto' | 'managed' | 'byok'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function getTrustGateInferenceMode(policyConfig: unknown): TrustGateInferenceMode {
  if (isRecord(policyConfig)) {
    const trustgate = policyConfig.trustgate
    if (isRecord(trustgate)) {
      const mode = trustgate.inference_mode
      if (mode === 'auto' || mode === 'managed' || mode === 'byok') return mode
    }
    const legacy = policyConfig.inference_mode
    if (legacy === 'auto' || legacy === 'managed' || legacy === 'byok') return legacy
  }
  return 'auto'
}

export function buildTrustGatePolicyConfig(
  currentPolicyConfig: unknown,
  inferenceMode: TrustGateInferenceMode,
): Record<string, unknown> {
  const current = isRecord(currentPolicyConfig) ? currentPolicyConfig : {}
  const currentTrustGate = isRecord(current.trustgate) ? current.trustgate : {}
  return {
    ...current,
    trustgate: {
      ...currentTrustGate,
      inference_mode: inferenceMode,
    },
  }
}

