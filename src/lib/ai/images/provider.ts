import 'server-only'

import { isDeploymentLevelUnavailable } from '@/lib/ai/provider-errors'
import { createProviderRuntimeState } from '@/lib/ai/provider-runtime'
import { ImageGenerationError } from './errors'
import { buildImageProviderCandidates } from './provider-config'
import { editOpenAICompatibleImage, generateOpenAICompatibleImage } from './openai-compatible'
import type { ImageGenerationRequest, ImageGenerationResult } from './types'

const IMAGE_PROVIDER_UNAVAILABLE_COOLDOWN_MS = 5 * 60 * 1000
const providerRuntime = createProviderRuntimeState(IMAGE_PROVIDER_UNAVAILABLE_COOLDOWN_MS)

export async function generateImage(request: ImageGenerationRequest & { model?: string }): Promise<ImageGenerationResult> {
  return runImageGeneration({ ...request, mode: 'generate' })
}

export async function editImage(request: ImageGenerationRequest & { model?: string }): Promise<ImageGenerationResult> {
  return runImageGeneration({ ...request, mode: 'edit' })
}

export async function runImageGeneration(
  request: ImageGenerationRequest & { model?: string },
): Promise<ImageGenerationResult> {
  const candidates = buildImageProviderCandidates(request.model)
    .filter((candidate) => !providerRuntime.isTemporarilyUnavailable(candidate.cacheKey))

  if (candidates.length === 0) {
    throw new ImageGenerationError('missing_credentials', 'No image generation provider is configured.', 500)
  }

  let unavailableError: Error | null = null
  let lastError: Error | null = null

  for (const candidate of candidates) {
    try {
      const result = request.mode === 'edit'
        ? await editOpenAICompatibleImage(candidate, request)
        : await generateOpenAICompatibleImage(candidate, request)
      providerRuntime.clearUnavailable(candidate.cacheKey)
      return result
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error(String(error))
      lastError = typedError
      if (
        isDeploymentLevelUnavailable(typedError)
        || (typedError instanceof ImageGenerationError && typedError.code === 'capability_unavailable')
        || (typedError instanceof ImageGenerationError && typedError.code === 'provider_quota_exceeded')
      ) {
        providerRuntime.markTemporarilyUnavailable(candidate.cacheKey)
        unavailableError = unavailableError ?? typedError
        continue
      }
    }
  }

  if (lastError) throw lastError
  if (unavailableError) throw unavailableError
  throw new ImageGenerationError('provider_unavailable', 'Image generation failed for every configured provider.', 502)
}
