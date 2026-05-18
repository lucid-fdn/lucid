import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { withCSRF } from '@/lib/auth/csrf'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { speechGenerationAdapter } from '@/lib/ai/control-plane/adapters/speech'
import { runAIGeneration } from '@/lib/ai/control-plane/run-generation'
import { getMediaProviderConfig } from '@/lib/ai/media-provider-config'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const previewSchema = z.object({
  voice_id: z.string().max(100).nullable().optional(),
  voice_instructions: z.string().max(1000).nullable().optional(),
  preview_text: z.string().max(240).nullable().optional(),
})

export const POST = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await (ctx as { params: Promise<{ id: string }> }).params
    const assistant = await getAssistant(id)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    if (assistant.org_id) {
      const isMember = await isUserOrgMember(userId, assistant.org_id)
      if (!isMember) {
        return NextResponse.json({ error: 'You do not have access to this assistant' }, { status: 403 })
      }
    }

    const body = previewSchema.parse(await req.json())
    const previewText =
      body.preview_text?.trim() ||
      `Hello, I'm ${assistant.telegram_display_name || assistant.name}. This is how I sound in Telegram voice replies.`
    const mediaProviderConfig = getMediaProviderConfig()

    const { output: speech } = await runAIGeneration({
      context: {
        userId,
        orgId: assistant.org_id,
        assistantId: assistant.id,
      },
      feature: 'voice-preview',
      modality: 'speech',
      prompt: previewText,
      input: {
        text: previewText,
        gatewayBaseUrls: mediaProviderConfig.gatewayBaseUrls,
        gatewayApiKeys: mediaProviderConfig.gatewayApiKeys,
        voice: body.voice_id?.trim() || assistant.telegram_voice_id || undefined,
        instructions: body.voice_instructions?.trim() || assistant.telegram_voice_instructions || undefined,
        format: 'opus',
        fileBaseName: 'telegram-voice-preview',
      },
      metadata: {
        assistantName: assistant.name,
        route: '/api/assistants/[id]/telegram-voice-preview',
      },
      adapter: speechGenerationAdapter,
    })

    return new NextResponse(Uint8Array.from(speech.buffer), {
      status: 200,
      headers: {
        'Content-Type': speech.mimeType,
        'Content-Disposition': `inline; filename="${speech.fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/telegram-voice-preview', method: 'POST' },
      tags: { layer: 'api', route: 'assistants-telegram-voice-preview' },
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate Telegram voice preview' },
      { status: 500 },
    )
  }
})
