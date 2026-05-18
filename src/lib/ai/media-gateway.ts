import 'server-only'

import {
  buildAudioTranscriptionCandidates,
  transcribeAudioWithCandidates,
  transcribeAudioWithCandidatesDetailed,
  type AudioTranscriptionCandidate,
  type AudioTranscriptionResult,
} from '@/lib/media/audio-transcription'
import {
  synthesizeAudioSpeech,
  type AudioSpeechFormat,
  type AudioSpeechResult,
} from '@/lib/media/audio-speech'

export interface MediaGatewayTranscriptionInput {
  buffer: Buffer
  mimeType: string
  fileName: string
  gatewayBaseUrls?: string[]
  gatewayApiKeys?: string[]
  candidates?: AudioTranscriptionCandidate[]
}

export interface MediaGatewaySpeechInput {
  text: string
  gatewayBaseUrls?: string[]
  gatewayApiKeys?: string[]
  voice?: string
  model?: string
  instructions?: string
  format?: AudioSpeechFormat | string | null
  fileBaseName?: string
}

export async function transcribeAudio(input: MediaGatewayTranscriptionInput): Promise<string> {
  const candidates = input.candidates ?? buildAudioTranscriptionCandidates({
    gatewayBaseUrls: input.gatewayBaseUrls ?? [],
    gatewayApiKeys: input.gatewayApiKeys ?? [],
  })

  return transcribeAudioWithCandidates({
    buffer: input.buffer,
    mimeType: input.mimeType,
    fileName: input.fileName,
    candidates,
  })
}

export async function transcribeAudioDetailed(input: MediaGatewayTranscriptionInput): Promise<AudioTranscriptionResult> {
  const candidates = input.candidates ?? buildAudioTranscriptionCandidates({
    gatewayBaseUrls: input.gatewayBaseUrls ?? [],
    gatewayApiKeys: input.gatewayApiKeys ?? [],
  })

  return transcribeAudioWithCandidatesDetailed({
    buffer: input.buffer,
    mimeType: input.mimeType,
    fileName: input.fileName,
    candidates,
  })
}

export async function synthesizeSpeech(input: MediaGatewaySpeechInput): Promise<AudioSpeechResult> {
  return synthesizeAudioSpeech({
    text: input.text,
    gatewayBaseUrls: input.gatewayBaseUrls ?? [],
    gatewayApiKeys: input.gatewayApiKeys ?? [],
    voice: input.voice,
    model: input.model,
    instructions: input.instructions,
    format: input.format,
    fileBaseName: input.fileBaseName,
  })
}
