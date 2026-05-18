import 'server-only'

import {
  normalizeProviderBaseUrl,
  normalizeProviderSecret,
  resolveProviderOverride,
} from '@/lib/ai/provider-policy'
import { buildProviderCacheKey } from '@/lib/ai/provider-runtime'
import { isDirectOpenAIImageFallbackEnabled } from '@/lib/ai/control-plane/flags'
import type { ImageProviderCandidate, ImageProviderMode } from './types'

const DEFAULT_IMAGE_MODEL = 'gpt-image-2'

export function resolveImageProviderMode(): ImageProviderMode {
  return resolveProviderOverride<ImageProviderMode>(
    process.env.IMAGE_PROVIDER,
    ['trustgate', 'openai', 'auto'] as const,
    'auto',
  )
}

export function resolveImageModel(model?: string | null): string {
  return model?.trim() || process.env.IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL
}

export function buildImageProviderCandidates(modelOverride?: string | null): ImageProviderCandidate[] {
  const mode = resolveImageProviderMode()
  const candidates: ImageProviderCandidate[] = []

  const pushCandidate = (
    provider: ImageProviderCandidate['provider'],
    baseUrl: string | undefined,
    apiKey: string | undefined,
  ) => {
    if (!baseUrl || !apiKey) return
    const model = resolveImageModel(modelOverride)
    candidates.push({
      provider,
      baseUrl,
      apiKey,
      model,
      cacheKey: buildProviderCacheKey(provider, baseUrl, model),
    })
  }

  const pushTrustGateCandidates = () => {
    pushCandidate(
      'trustgate',
      normalizeProviderBaseUrl(process.env.IMAGE_BASE_URL),
      normalizeProviderSecret(process.env.TRUSTGATE_API_KEY),
    )
    pushCandidate(
      'trustgate',
      normalizeProviderBaseUrl(process.env.TRUSTGATE_BASE_URL),
      normalizeProviderSecret(process.env.TRUSTGATE_API_KEY),
    )
    pushCandidate(
      'trustgate',
      normalizeProviderBaseUrl(process.env.LUCID_API_BASE_URL),
      normalizeProviderSecret(process.env.LUCID_API_KEY),
    )
  }

  const pushOpenAICandidate = () => {
    pushCandidate(
      'openai',
      normalizeProviderBaseUrl(process.env.OPENAI_IMAGE_BASE_URL)
        ?? normalizeProviderBaseUrl(process.env.OPENAI_BASE_URL)
        ?? 'https://api.openai.com/v1',
      normalizeProviderSecret(process.env.OPENAI_IMAGE_API_KEY)
        ?? normalizeProviderSecret(process.env.OPENAI_API_KEY),
    )
  }

  switch (mode) {
    case 'trustgate':
      pushTrustGateCandidates()
      break
    case 'openai':
      pushOpenAICandidate()
      break
    case 'auto':
    default:
      pushTrustGateCandidates()
      if (isDirectOpenAIImageFallbackEnabled()) {
        pushOpenAICandidate()
      }
      break
  }

  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = `${candidate.provider}:${candidate.baseUrl}:${candidate.apiKey}:${candidate.model}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
