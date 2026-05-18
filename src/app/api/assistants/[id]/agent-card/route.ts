import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { ErrorService } from '@/lib/errors/error-service'
import { getAgentCardState } from '@/lib/agent-personalization/agent-card-service'
import { authorizeAgentCardRequest } from './_auth'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: assistantId } = await params
    const auth = await authorizeAgentCardRequest(userId, assistantId)
    if (auth.error) return auth.error

    const state = await getAgentCardState(assistantId, userId)
    return NextResponse.json({
      card: state.card,
      resolution: state.resolution,
      scope: {
        workspace_id: state.assistant.org_id,
        project_id: state.assistant.project_id ?? null,
      },
      source: 'lucid',
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/agent-card', method: 'GET' },
      tags: { layer: 'api', route: 'agent-card' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
