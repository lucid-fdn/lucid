import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { withCSRF } from '@/lib/auth/csrf'
import { ErrorService } from '@/lib/errors/error-service'
import { validateAgentCardPayload } from '@/lib/agent-personalization/agent-card-service'
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
    const report = await validateAgentCardPayload({ assistantId, payload: body.card ?? body, userId })
    return NextResponse.json(report)
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/agent-card/validate', method: 'POST' },
      tags: { layer: 'api', route: 'agent-card' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
