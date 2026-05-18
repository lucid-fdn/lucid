import { isDeploymentLevelUnavailable } from '../../../ai/provider-errors.js'
import {
  normalizeProviderBaseUrl,
  normalizeProviderSecret,
  resolveProviderOverride,
  isDirectOpenAIFallbackEnabled,
} from '../../../ai/provider-policy.js'
import { buildProviderCacheKey, createProviderRuntimeState } from '../../../ai/provider-runtime.js'
import type { WorkerMediaGatewayEndpoint } from '../../../ai/media-provider-config.js'
import { postOpenAiCompatibleAudioJson } from './openai-compatible-audio.js'

const DEFAULT_SPEECH_MODEL = 'gpt-4o-mini-tts'
const DEFAULT_SPEECH_VOICE = 'coral'
const MEDIA_PROVIDER_UNAVAILABLE_COOLDOWN_MS = 5 * 60 * 1000
const providerRuntime = createProviderRuntimeState(MEDIA_PROVIDER_UNAVAILABLE_COOLDOWN_MS)

export type AudioSpeechProvider = 'auto' | 'trustgate' | 'openai'
export type AudioSpeechFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'

export interface AudioSpeechResult {
  buffer: Buffer
  mimeType: string
  fileName: string
  provider: Exclude<AudioSpeechProvider, 'auto'>
  model: string
}

export interface AudioSpeechCandidate {
  provider: Exclude<AudioSpeechProvider, 'auto'>
  cacheKey: string
  baseUrl: string
  apiKey: string
  model: string
}

export function resolveAudioSpeechProvider(): AudioSpeechProvider {
  return resolveProviderOverride<AudioSpeechProvider>(
    process.env.TTS_PROVIDER,
    ['trustgate', 'openai', 'auto'] as const,
    'auto',
  )
}

export function resolveAudioSpeechFormat(format?: string | null): AudioSpeechFormat {
  switch (format?.trim().toLowerCase()) {
    case 'mp3':
    case 'opus':
    case 'aac':
    case 'flac':
    case 'wav':
    case 'pcm':
      return format.trim().toLowerCase() as AudioSpeechFormat
    default:
      return 'opus'
  }
}

function getSpeechFormatMetadata(format: AudioSpeechFormat): { mimeType: string; extension: string } {
  switch (format) {
    case 'mp3':
      return { mimeType: 'audio/mpeg', extension: 'mp3' }
    case 'aac':
      return { mimeType: 'audio/aac', extension: 'aac' }
    case 'flac':
      return { mimeType: 'audio/flac', extension: 'flac' }
    case 'wav':
      return { mimeType: 'audio/wav', extension: 'wav' }
    case 'pcm':
      return { mimeType: 'audio/pcm', extension: 'pcm' }
    case 'opus':
    default:
      return { mimeType: 'audio/ogg', extension: 'ogg' }
  }
}

export function buildAudioSpeechFileName(format: AudioSpeechFormat, baseName = 'assistant-voice'): string {
  return `${baseName}.${getSpeechFormatMetadata(format).extension}`
}

export function buildAudioSpeechCandidates(params: {
  gatewayEndpoints?: WorkerMediaGatewayEndpoint[]
  gatewayBaseUrls: string[]
  gatewayApiKeys: string[]
}): AudioSpeechCandidate[] {
  const candidates: AudioSpeechCandidate[] = []
  const provider = resolveAudioSpeechProvider()

  const pushCandidate = (
    candidateProvider: Exclude<AudioSpeechProvider, 'auto'>,
    baseUrl: string | undefined,
    apiKey: string | undefined,
    model: string,
  ) => {
    if (!baseUrl || !apiKey) return
    const cacheKey = buildProviderCacheKey(candidateProvider, baseUrl, model)
    if (providerRuntime.isTemporarilyUnavailable(cacheKey)) return
    candidates.push({
      provider: candidateProvider,
      cacheKey,
      baseUrl,
      apiKey,
      model,
    })
  }

  const pushTrustGate = () => {
    const gatewayEndpoints =
      params.gatewayEndpoints ??
      params.gatewayBaseUrls.flatMap((baseUrl) =>
        params.gatewayApiKeys.map((apiKey) => ({ baseUrl, apiKey })),
      )
    for (const endpoint of gatewayEndpoints) {
      pushCandidate('trustgate', endpoint.baseUrl, endpoint.apiKey, process.env.OPENAI_TTS_MODEL?.trim() || DEFAULT_SPEECH_MODEL)
    }
  }

  const pushOpenAi = () => {
    pushCandidate(
      'openai',
      normalizeProviderBaseUrl(process.env.OPENAI_TTS_BASE_URL)
        ?? normalizeProviderBaseUrl(process.env.OPENAI_BASE_URL)
        ?? 'https://api.openai.com/v1',
      normalizeProviderSecret(process.env.OPENAI_TTS_API_KEY)
        ?? normalizeProviderSecret(process.env.OPENAI_API_KEY),
      process.env.OPENAI_TTS_MODEL?.trim() || DEFAULT_SPEECH_MODEL,
    )
  }

  switch (provider) {
    case 'trustgate':
      pushTrustGate()
      break
    case 'openai':
      pushOpenAi()
      break
    case 'auto':
    default:
      pushTrustGate()
      if (isDirectOpenAIFallbackEnabled()) pushOpenAi()
      break
  }

  return candidates
}

async function synthesizeOpenAiCompatibleSpeech(params: {
  text: string
  baseUrl: string
  apiKey: string
  model: string
  voice: string
  format: AudioSpeechFormat
  instructions?: string
}): Promise<Buffer> {
  const res = await postOpenAiCompatibleAudioJson({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    capabilityPath: 'audio/speech',
    body: {
      model: params.model,
      input: params.text,
      voice: params.voice,
      response_format: params.format,
      ...(params.instructions ? { instructions: params.instructions } : {}),
    },
  })

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null
    if (res.status === 404) {
      throw new Error('Audio speech generation is unavailable in this deployment.')
    }
    throw new Error(payload?.error?.message ?? `Audio speech generation failed (${res.status})`)
  }

  return Buffer.from(await res.arrayBuffer())
}

export async function synthesizeAudioSpeech(params: {
  text: string
  gatewayEndpoints?: WorkerMediaGatewayEndpoint[]
  gatewayBaseUrls?: string[]
  gatewayApiKeys?: string[]
  voice?: string
  model?: string
  instructions?: string
  format?: AudioSpeechFormat | string | null
  fileBaseName?: string
}): Promise<AudioSpeechResult> {
  const format = resolveAudioSpeechFormat(params.format)
  const voice = params.voice?.trim() || process.env.OPENAI_TTS_VOICE?.trim() || DEFAULT_SPEECH_VOICE
  const instructions = params.instructions?.trim() || process.env.OPENAI_TTS_INSTRUCTIONS?.trim() || undefined
  const candidates = buildAudioSpeechCandidates({
    gatewayEndpoints: params.gatewayEndpoints,
    gatewayBaseUrls: params.gatewayBaseUrls ?? [],
    gatewayApiKeys: params.gatewayApiKeys ?? [],
  })

  let unavailableError: Error | null = null
  let lastError: Error | null = null

  for (const candidate of candidates) {
    try {
      const buffer = await synthesizeOpenAiCompatibleSpeech({
        text: params.text,
        baseUrl: candidate.baseUrl,
        apiKey: candidate.apiKey,
        model: params.model?.trim() || candidate.model,
        voice,
        format,
        instructions,
      })
      providerRuntime.clearUnavailable(candidate.cacheKey)
      const metadata = getSpeechFormatMetadata(format)
      return {
        buffer,
        mimeType: metadata.mimeType,
        fileName: buildAudioSpeechFileName(format, params.fileBaseName),
        provider: candidate.provider,
        model: params.model?.trim() || candidate.model,
      }
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error(String(error))
      lastError = typedError
      if (isDeploymentLevelUnavailable(typedError)) {
        providerRuntime.markTemporarilyUnavailable(candidate.cacheKey)
        unavailableError = unavailableError ?? typedError
        continue
      }
    }
  }

  if (unavailableError) throw unavailableError
  throw lastError ?? new Error('No audio speech provider is configured.')
}
