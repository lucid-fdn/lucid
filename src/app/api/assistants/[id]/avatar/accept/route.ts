import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { markAgentAvatarAssetCurrent } from '@/lib/ai/agent-avatar/storage'

export const dynamic = 'force-dynamic'

const acceptAvatarSchema = z.object({
  assetId: z.string().uuid(),
})

export const POST = withCSRF(async (
  req: NextRequest,
  ctx: unknown,
): Promise<NextResponse> => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assistantId } = await (ctx as { params: Promise<{ id: string }> }).params
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = acceptAvatarSchema.parse(await req.json())
    const asset = await markAgentAvatarAssetCurrent({
      assetId: body.assetId,
      assistantId,
      orgId: assistant.org_id,
    })

    return NextResponse.json({ data: asset })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/avatar/accept', method: 'POST' },
      tags: { layer: 'api', route: 'assistant-avatar-accept' },
    })
    return NextResponse.json({ error: 'Failed to accept assistant avatar' }, { status: 500 })
  }
})
