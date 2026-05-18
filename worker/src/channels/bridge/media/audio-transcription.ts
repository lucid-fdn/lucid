import { isDeploymentLevelUnavailable } from '../../../ai/provider-errors.js'
import {
  normalizeProviderBaseUrl,
  normalizeProviderSecret,
  resolveProviderOverride,
  isDirectOpenAIFallbackEnabled,
} from '../../../ai/provider-policy.js'
import { buildProviderCacheKey, createProviderRuntimeState } from '../../../ai/provider-runtime.js'
import type { WorkerMediaGatewayEndpoint } from '../../../ai/media-provider-config.js'
import { postOpenAiCompatibleAudioForm } from './openai-compatible-audio.js'

const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe'
const DEFAULT_GROQ_AUDIO_MODEL = 'whisper-large-v3-turbo'
const DEFAULT_DEEPGRAM_AUDIO_MODEL = 'nova-3'
const DEFAULT_MISTRAL_AUDIO_MODEL = 'voxtral-mini-latest'
const MEDIA_PROVIDER_UNAVAILABLE_COOLDOWN_MS = 5 * 60 * 1000
const providerRuntime = createProviderRuntimeState(MEDIA_PROVIDER_UNAVAILABLE_COOLDOWN_MS)

export type AudioTranscriptionProvider =
  | 'auto'
  | 'trustgate'
  | 'openai'
  | 'groq'
  | 'deepgram'
  | 'mistral'

export type AudioTranscriptionCandidate =
  | {
      kind: 'openai-compatible'
      provider: Exclude<AudioTranscriptionProvider, 'auto' | 'deepgram'>
      cacheKey: string
      baseUrl: string
      apiKey: string
      model: string
    }
  | {
      kind: 'deepgram'
      provider: 'deepgram'
      cacheKey: string
      baseUrl: string
      apiKey: string
      model: string
    }

export function resolveAudioTranscriptionProvider(): AudioTranscriptionProvider {
  return resolveProviderOverride<AudioTranscriptionProvider>(
    process.env.STT_PROVIDER,
    ['trustgate', 'openai', 'groq', 'deepgram', 'mistral', 'auto'] as const,
    'auto',
  )
}

async function transcribeOpenAiCompatibleAudio(params: {
  buffer: Buffer
  mimeType: string
  fileName: string
  baseUrl: string
  apiKey: string
  model: string
}): Promise<string> {
  const form = new FormData()
  const blob = new Blob([new Uint8Array(params.buffer)], { type: params.mimeType })
  form.append('file', blob, params.fileName)
  form.append('model', params.model)

  const res = await postOpenAiCompatibleAudioForm({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    capabilityPath: 'audio/transcriptions',
    form,
  })

  const payload = (await res.json().catch(() => null)) as
    | { text?: string; error?: { message?: string } }
    | null
  if (!res.ok || !payload?.text) {
    if (res.status === 404) {
      throw new Error('Audio transcription is unavailable in this deployment.')
    }
    throw new Error(payload?.error?.message ?? `Audio transcription failed (${res.status})`)
  }
  return payload.text.trim()
}

async function transcribeDeepgramAudio(params: {
  buffer: Buffer
  mimeType: string
  baseUrl: string
  apiKey: string
  model: string
}): Promise<string> {
  const url = new URL(
    params.baseUrl.endsWith('/v1')
      ? `${params.baseUrl}/listen`
      : `${params.baseUrl}/v1/listen`,
  )
  url.searchParams.set('model', params.model)
  url.searchParams.set('smart_format', 'true')

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${params.apiKey}`,
      'Content-Type': params.mimeType || 'application/octet-stream',
    },
    body: new Uint8Array(params.buffer),
  })

  const payload = (await res.json().catch(() => null)) as
    | { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> }; err_code?: string; err_msg?: string }
    | null
  const transcript = payload?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim()
  if (!res.ok || !transcript) {
    if (res.status === 404) {
      throw new Error('Audio transcription is unavailable in this deployment.')
    }
    throw new Error(payload?.err_msg ?? `Audio transcription failed (${res.status})`)
  }
  return transcript
}

export function buildAudioTranscriptionCandidates(params: {
  gatewayEndpoints?: WorkerMediaGatewayEndpoint[]
  gatewayBaseUrls: string[]
  gatewayApiKeys: string[]
}): AudioTranscriptionCandidate[] {
  const candidates: AudioTranscriptionCandidate[] = []
  const sttProvider = resolveAudioTranscriptionProvider()

  const pushOpenAiCompatible = (
    provider: Exclude<AudioTranscriptionProvider, 'auto' | 'deepgram'>,
    baseUrl: string | undefined,
    apiKey: string | undefined,
    model: string,
  ) => {
    if (!baseUrl || !apiKey) return
    const cacheKey = buildProviderCacheKey(provider, baseUrl, model)
    if (providerRuntime.isTemporarilyUnavailable(cacheKey)) return
    candidates.push({ kind: 'openai-compatible', provider, cacheKey, baseUrl, apiKey, model })
  }

  const pushTrustGate = () => {
    const gatewayEndpoints =
      params.gatewayEndpoints ??
      params.gatewayBaseUrls.flatMap((baseUrl) =>
        params.gatewayApiKeys.map((apiKey) => ({ baseUrl, apiKey })),
      )
    for (const endpoint of gatewayEndpoints) {
      pushOpenAiCompatible('trustgate', endpoint.baseUrl, endpoint.apiKey, DEFAULT_TRANSCRIPTION_MODEL)
    }
  }

  const pushOpenAi = () =>
    pushOpenAiCompatible(
      'openai',
      normalizeProviderBaseUrl(process.env.OPENAI_BASE_URL) ?? 'https://api.openai.com/v1',
      normalizeProviderSecret(process.env.OPENAI_API_KEY),
      DEFAULT_TRANSCRIPTION_MODEL,
    )

  const pushGroq = () =>
    pushOpenAiCompatible(
      'groq',
      normalizeProviderBaseUrl(process.env.GROQ_BASE_URL) ?? 'https://api.groq.com/openai/v1',
      normalizeProviderSecret(process.env.GROQ_API_KEY),
      DEFAULT_GROQ_AUDIO_MODEL,
    )

  const pushDeepgram = () => {
    const apiKey = normalizeProviderSecret(process.env.DEEPGRAM_API_KEY)
    if (!apiKey) return
    const baseUrl = normalizeProviderBaseUrl(process.env.DEEPGRAM_BASE_URL) ?? 'https://api.deepgram.com/v1'
    const cacheKey = buildProviderCacheKey('deepgram', baseUrl, DEFAULT_DEEPGRAM_AUDIO_MODEL)
    if (providerRuntime.isTemporarilyUnavailable(cacheKey)) return
    candidates.push({
      kind: 'deepgram',
      provider: 'deepgram',
      cacheKey,
      baseUrl,
      apiKey,
      model: DEFAULT_DEEPGRAM_AUDIO_MODEL,
    })
  }

  const pushMistral = () =>
    pushOpenAiCompatible(
      'mistral',
      normalizeProviderBaseUrl(process.env.MISTRAL_BASE_URL) ?? 'https://api.mistral.ai/v1',
      normalizeProviderSecret(process.env.MISTRAL_API_KEY),
      DEFAULT_MISTRAL_AUDIO_MODEL,
    )

  switch (sttProvider) {
    case 'trustgate':
      pushTrustGate()
      break
    case 'openai':
      pushOpenAi()
      break
    case 'groq':
      pushGroq()
      break
    case 'deepgram':
      pushDeepgram()
      break
    case 'mistral':
      pushMistral()
      break
    case 'auto':
    default:
      pushTrustGate()
      if (isDirectOpenAIFallbackEnabled()) pushOpenAi()
      pushGroq()
      pushDeepgram()
      pushMistral()
      break
  }

  return candidates
}

export async function transcribeAudio(params: {
  buffer: Buffer
  mimeType: string
  fileName: string
  gatewayEndpoints?: WorkerMediaGatewayEndpoint[]
  gatewayBaseUrls?: string[]
  gatewayApiKeys?: string[]
  candidates?: AudioTranscriptionCandidate[]
}): Promise<string> {
  const candidates =
    params.candidates ??
    buildAudioTranscriptionCandidates({
      gatewayEndpoints: params.gatewayEndpoints,
      gatewayBaseUrls: params.gatewayBaseUrls ?? [],
      gatewayApiKeys: params.gatewayApiKeys ?? [],
    })

  let lastError: Error | null = null

  for (const candidate of candidates) {
    try {
      const transcript =
        candidate.kind === 'deepgram'
          ? await transcribeDeepgramAudio({
              buffer: params.buffer,
              mimeType: params.mimeType,
              baseUrl: candidate.baseUrl,
              apiKey: candidate.apiKey,
              model: candidate.model,
            })
          : await transcribeOpenAiCompatibleAudio({
              buffer: params.buffer,
              mimeType: params.mimeType,
              fileName: params.fileName,
              baseUrl: candidate.baseUrl,
              apiKey: candidate.apiKey,
              model: candidate.model,
            })
      providerRuntime.clearUnavailable(candidate.cacheKey)
      return transcript
    } catch (error) {
      if (isDeploymentLevelUnavailable(error)) {
        providerRuntime.markTemporarilyUnavailable(candidate.cacheKey)
      }
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw lastError ?? new Error('Audio transcription is unavailable in this deployment.')
}
