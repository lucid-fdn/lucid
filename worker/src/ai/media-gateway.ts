import { transcribeAudio as transcribeAudioSingle } from '../channels/bridge/media/audio-transcription.js'
import {
  synthesizeAudioSpeech,
  type AudioSpeechFormat,
  type AudioSpeechResult,
} from '../channels/bridge/media/audio-speech.js'
import type { WorkerMediaGatewayEndpoint } from './media-provider-config.js'

export interface MediaGatewayTranscriptionInput {
  buffer: Buffer
  mimeType: string
  fileName: string
  gatewayEndpoints?: WorkerMediaGatewayEndpoint[]
  gatewayBaseUrls?: string[]
  gatewayApiKeys?: string[]
  model?: string
}

export interface MediaGatewaySpeechInput {
  text: string
  gatewayEndpoints?: WorkerMediaGatewayEndpoint[]
  gatewayBaseUrls?: string[]
  gatewayApiKeys?: string[]
  voice?: string
  model?: string
  instructions?: string
  format?: AudioSpeechFormat | string | null
  fileBaseName?: string
}

export async function transcribeAudio(input: MediaGatewayTranscriptionInput): Promise<string> {
  return transcribeAudioSingle({
    buffer: input.buffer,
    mimeType: input.mimeType,
    fileName: input.fileName,
    gatewayEndpoints: input.gatewayEndpoints ?? [],
    gatewayBaseUrls: input.gatewayBaseUrls ?? [],
    gatewayApiKeys: input.gatewayApiKeys ?? [],
  })
}

export async function synthesizeSpeech(input: MediaGatewaySpeechInput): Promise<AudioSpeechResult> {
  return synthesizeAudioSpeech({
    text: input.text,
    gatewayEndpoints: input.gatewayEndpoints ?? [],
    gatewayBaseUrls: input.gatewayBaseUrls ?? [],
    gatewayApiKeys: input.gatewayApiKeys ?? [],
    voice: input.voice,
    model: input.model,
    instructions: input.instructions,
    format: input.format,
    fileBaseName: input.fileBaseName,
  })
}
