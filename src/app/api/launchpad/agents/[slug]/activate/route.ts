import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { resolveAgent } from '@/lib/db/launchpad'
import { activateAgent } from '@/lib/launchpad'
import { FEATURES } from '@/lib/features'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

/** POST /api/launchpad/agents/[slug]/activate — Activate a draft agent (mint + pool + trading) */
export const POST = withCSRF(async (
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) => {
  if (!FEATURES.launchpad) {
    return NextResponse.json({ error: 'Launchpad not enabled' }, { status: 404 })
  }

  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { slug } = await params
    const agent = await resolveAgent(slug)
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (agent.creator_id !== userId) {
      return NextResponse.json({ error: 'Only the creator can activate this agent' }, { status: 403 })
    }

    const result = await activateAgent(agent.id)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      tokenMint: result.tokenMint ?? null,
      stakePoolId: result.stakePoolId ?? null,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/launchpad/agents/[slug]/activate', method: 'POST' },
      tags: { layer: 'api', route: 'launchpad-activate' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
