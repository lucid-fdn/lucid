import 'server-only'

import { synthesizeSpeech, type MediaGatewaySpeechInput } from '@/lib/ai/media-gateway'
import type { AudioSpeechFormat } from '@/lib/media/audio-speech'
import type { AIGenerationAdapterOutput } from '../types'

export interface SpeechGenerationInput extends MediaGatewaySpeechInput {
  voice?: string
  format?: AudioSpeechFormat | string | null
}

export interface SpeechGenerationOutput extends AIGenerationAdapterOutput {
  buffer: Buffer
  mimeType: string
  fileName: string
  provider: string
  model: string
  voice?: string
  format?: AudioSpeechFormat
}

export async function speechGenerationAdapter(
  input: SpeechGenerationInput,
): Promise<SpeechGenerationOutput> {
  const startedAt = Date.now()
  const speech = await synthesizeSpeech(input)
  const latencyMs = speech.latencyMs ?? Date.now() - startedAt

  return {
    ...speech,
    usage: {
      bytes: speech.buffer.byteLength,
    },
    receipt: {
      provider: speech.provider,
      model: speech.model,
      latencyMs,
      metadata: {
        voice: speech.voice ?? input.voice,
        format: speech.format ?? input.format,
        mimeType: speech.mimeType,
        outputBytes: speech.buffer.byteLength,
      },
    },
  }
}
