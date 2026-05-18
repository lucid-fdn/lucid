import 'server-only'

import {
  transcribeAudioDetailed,
  type MediaGatewayTranscriptionInput,
} from '@/lib/ai/media-gateway'
import type { AIGenerationAdapterOutput } from '../types'

export interface TranscriptionGenerationOutput extends AIGenerationAdapterOutput {
  text: string
  provider: string
  model: string
  inputBytes: number
  mimeType: string
  fileName: string
}

export async function transcriptionGenerationAdapter(
  input: MediaGatewayTranscriptionInput,
): Promise<TranscriptionGenerationOutput> {
  const result = await transcribeAudioDetailed(input)

  return {
    text: result.text,
    provider: result.provider,
    model: result.model,
    inputBytes: result.inputBytes,
    mimeType: result.mimeType,
    fileName: result.fileName,
    usage: {
      bytes: result.inputBytes,
    },
    receipt: {
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      metadata: {
        mimeType: result.mimeType,
        fileName: result.fileName,
        inputBytes: result.inputBytes,
      },
    },
  }
}
