export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from 'zod'
import { withCSRF } from '@/lib/auth/csrf'
import { checkAIGenerationRateLimit } from '@/lib/ai/rate-limit'
import { imageGenerationAdapter } from '@/lib/ai/control-plane/adapters/image'
import { runAIGeneration } from '@/lib/ai/control-plane/run-generation'
import { isAIGenerationFeatureDisabledError } from '@/lib/ai/control-plane/flags'
import { isImageGenerationError } from '@/lib/ai/images/errors'
import { mimeTypeForImageFormat, resolveImageOutputFormat } from '@/lib/ai/images/normalize'
import { uploadBuffer } from '@/lib/uploads/storage'
import {
  avatarGenerateRequestSchema,
  buildAvatarSpec,
  resolveAvatarOrgContext,
} from '@/lib/ai/agent-avatar/request'
import { generateAgentAvatar } from '@/lib/ai/agent-avatar/generate'

export const dynamic = 'force-dynamic'

const genericImageRequestSchema = z.object({
  orgId: z.string().uuid().optional(),
  purpose: z.enum(['agent-avatar', 'agent-cover', 'generic-image', 'workflow-asset']).default('generic-image'),
  mode: z.enum(['generate', 'edit']).default('generate'),
  prompt: z.string().trim().min(1).max(4000),
  stylePreset: z.string().trim().optional(),
  angle: z.string().trim().optional(),
  expression: z.string().trim().optional(),
  genderPresentation: z.string().trim().optional(),
  pose: z.string().trim().optional(),
  referenceImageUrl: z.string().url().optional(),
  referenceAssetId: z.string().uuid().optional(),
  size: z.enum(['1024x1024', '1024x1536', '1536x1024', 'auto']).optional(),
  quality: z.enum(['low', 'medium', 'high', 'auto']).optional(),
  outputFormat: z.enum(['png', 'webp', 'jpeg']).optional(),
  background: z.enum(['opaque', 'transparent', 'auto']).optional(),
  name: z.string().trim().optional(),
  description: z.string().trim().optional(),
})

export const POST = withCSRF(async (req: NextRequest): Promise<NextResponse> => {
  try {
    const body = genericImageRequestSchema.parse(await req.json())
    const prompt = body.prompt
    const context = await resolveAvatarOrgContext(body.orgId)
    if (!context.ok) return context.response as NextResponse

    const rateLimit = await checkAIGenerationRateLimit(context.userId)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 })
    }

    if (body.purpose === 'agent-avatar') {
      const avatarBody = avatarGenerateRequestSchema.parse({
        orgId: context.orgId,
        draftId: crypto.randomUUID(),
        name: body.name || 'Lucid Agent',
        description: body.description || body.prompt,
        stylePreset: body.stylePreset,
        angle: body.angle,
        expression: body.expression,
        genderPresentation: body.genderPresentation,
        pose: body.pose,
        referenceImageUrl: body.referenceImageUrl,
        referenceAssetId: body.referenceAssetId,
        lockIdentity: Boolean(body.referenceImageUrl || body.referenceAssetId),
      })
      const asset = await generateAgentAvatar(buildAvatarSpec({
        body: avatarBody,
        userId: context.userId,
        orgId: context.orgId,
      }))
      return NextResponse.json({
        data: {
          id: asset.id,
          status: 'succeeded',
          url: asset.url,
          provider: asset.provider,
          model: asset.model,
          width: asset.width,
          height: asset.height,
          mimeType: asset.mimeType,
          metadata: asset.metadata,
        },
      }, { status: 201 })
    }

    const outputFormat = resolveImageOutputFormat(body.outputFormat)
    const generation = await runAIGeneration({
      context: {
        userId: context.userId,
        orgId: context.orgId,
      },
      feature: body.purpose === 'agent-cover' ? 'agent-cover-generation' : 'generic-image-generation',
      modality: 'image',
      prompt,
      input: {
        purpose: body.purpose,
        mode: body.mode,
        prompt: body.prompt,
        size: body.size,
        quality: body.quality,
        outputFormat,
        background: body.background,
        referenceImages: body.referenceImageUrl
          ? [{ url: body.referenceImageUrl, assetId: body.referenceAssetId, role: 'identity' }]
          : undefined,
      },
      adapter: imageGenerationAdapter,
      metadata: {
        purpose: body.purpose,
        referenceAssetId: body.referenceAssetId,
      },
    })
    const result = generation.output

    const id = crypto.randomUUID()
    const url = await uploadBuffer(
      Buffer.from(result.imageBytes),
      'avatars',
      `generated/${context.orgId}/${id}.${outputFormat === 'jpeg' ? 'jpg' : outputFormat}`,
      mimeTypeForImageFormat(outputFormat),
    )

    return NextResponse.json({
      data: {
        id,
        status: 'succeeded',
        url,
        provider: result.provider,
        model: result.model,
        width: body.size === '1536x1024' ? 1536 : 1024,
        height: body.size === '1024x1536' ? 1536 : 1024,
        mimeType: mimeTypeForImageFormat(outputFormat),
        metadata: {
          usage: result.usage,
          receipt: result.receipt,
          revisedPrompt: result.revisedPrompt,
        },
      },
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    if (isImageGenerationError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode })
    }

    if (isAIGenerationFeatureDisabledError(error)) {
      return NextResponse.json({ error: error.message, code: 'feature_disabled', flag: error.flag }, { status: 503 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
})
