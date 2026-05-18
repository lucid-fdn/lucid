import { NextRequest, NextResponse } from 'next/server'

import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { getCurrentAgentAvatarAsset } from '@/lib/ai/agent-avatar/storage'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assistantId } = await ctx.params
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const asset = await getCurrentAgentAvatarAsset(assistantId)
    return NextResponse.json({ data: asset })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/avatar', method: 'GET' },
      tags: { layer: 'api', route: 'assistant-avatar-current' },
    })
    return NextResponse.json({ error: 'Failed to load assistant avatar' }, { status: 500 })
  }
}
