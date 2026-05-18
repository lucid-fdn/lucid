import 'server-only'

import { imageGenerationAdapter } from '@/lib/ai/control-plane/adapters/image'
import { runAIGeneration } from '@/lib/ai/control-plane/run-generation'
import { buildAgentAvatarPrompt, hashAvatarPrompt } from './prompt'
import { storeAgentAvatarAsset } from './storage'
import { supportsImageStreaming } from '@/lib/ai/images/capabilities'
import type { AgentAvatarAsset, AgentAvatarSpec } from './types'
import type { ImageGenerationProgressEvent, ImageQuality } from '@/lib/ai/images/types'

function resolveAvatarImageQuality(): ImageQuality {
  const configured = process.env.AGENT_AVATAR_IMAGE_QUALITY?.trim()
  return configured === 'low' || configured === 'medium' || configured === 'high' || configured === 'auto'
    ? configured
    : 'medium'
}

export async function generateAgentAvatar(
  spec: AgentAvatarSpec,
  options?: {
    onProgress?: (event: ImageGenerationProgressEvent) => Promise<void> | void
  },
): Promise<AgentAvatarAsset> {
  const prompt = buildAgentAvatarPrompt(spec)
  const promptHash = hashAvatarPrompt(prompt)
  const model = process.env.IMAGE_MODEL?.trim() || 'gpt-image-2'
  const generation = await runAIGeneration({
    context: {
      userId: spec.userId,
      orgId: spec.orgId,
      assistantId: spec.assistantId,
    },
    feature: 'agent-avatar-generation',
    modality: 'image',
    prompt,
    input: {
      purpose: 'agent-avatar',
      mode: spec.lockIdentity && spec.referenceImageUrl ? 'edit' : 'generate',
      prompt,
      size: '1024x1024',
      quality: resolveAvatarImageQuality(),
      outputFormat: 'webp',
      background: spec.background === 'transparent-safe' ? 'transparent' : 'auto',
      streamProgress: process.env.AGENT_AVATAR_IMAGE_PROGRESS_ENABLED !== 'false'
        && supportsImageStreaming(model),
      partialImages: 3,
      onProgress: options?.onProgress,
      referenceImages: spec.referenceImageUrl
        ? [{ url: spec.referenceImageUrl, assetId: spec.referenceAssetId, role: 'identity' }]
        : undefined,
      metadata: {
        feature: 'agent-avatar-generation',
        promptVersion: spec.promptVersion,
        stylePreset: spec.stylePreset,
        assistantId: spec.assistantId,
        draftId: spec.draftId,
      },
    },
    adapter: imageGenerationAdapter,
    metadata: {
      feature: 'agent-avatar-generation',
      promptVersion: spec.promptVersion,
      stylePreset: spec.stylePreset,
      assistantId: spec.assistantId,
      draftId: spec.draftId,
      promptHash,
    },
  })

  return storeAgentAvatarAsset({
    spec,
    result: generation.output,
    prompt,
    promptHash,
    generationEventId: generation.generationEventId,
  })
}
