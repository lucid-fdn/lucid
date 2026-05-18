import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { withCSRF } from '@/lib/auth/csrf'
import { ErrorService } from '@/lib/errors/error-service'
import { getAgentCardState } from '@/lib/agent-personalization/agent-card-service'
import { normalizeAgentCard } from '@/lib/lucid-cards/card-core'
import { resolveLucidCards } from '@/lib/lucid-cards/card-resolution'
import { resolveAgentSharedContext } from '@/lib/db/shared-context'
import { authorizeAgentCardRequest } from '../_auth'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const POST = withCSRF(async (request: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: assistantId } = await (ctx as Params).params
    const auth = await authorizeAgentCardRequest(userId, assistantId)
    if (auth.error) return auth.error
    const body = await request.json().catch(() => ({}))
    const state = await getAgentCardState(assistantId, userId)
    const card = body.card ? normalizeAgentCard(body.card, state.assistant) : state.card
    const sharedContext = await resolveAgentSharedContext(assistantId, state.assistant.org_id, state.assistant.project_id ?? null, userId)
    const resolution = resolveLucidCards({ agentCard: card, sharedContext })
    return NextResponse.json({
      prompt_sections: resolution.prompt_sections,
      prompt_budget: resolution.prompt_budget,
      conflicts: resolution.conflicts,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/agent-card/preview', method: 'POST' },
      tags: { layer: 'api', route: 'agent-card' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
