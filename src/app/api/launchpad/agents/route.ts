import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getLaunchedAgents } from '@/lib/db'
import { launchAgent } from '@/lib/launchpad'
import { CreateLaunchedAgentInput } from '@contracts/launchpad'
import { FEATURES } from '@/lib/features'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

/** GET /api/launchpad/agents — Public listing */
export async function GET(req: NextRequest) {
  if (!FEATURES.launchpad) {
    return NextResponse.json({ error: 'Launchpad not enabled' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category') ?? undefined
  const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100)
  const offset = Number(searchParams.get('offset') ?? 0)

  const agents = await getLaunchedAgents({
    status: 'trading',
    category,
    limit,
    offset,
  })

  return NextResponse.json({ agents })
}

/** POST /api/launchpad/agents — Create launched agent (auth required) */
export const POST = withCSRF(async (req: NextRequest) => {
  if (!FEATURES.launchpad) {
    return NextResponse.json({ error: 'Launchpad not enabled' }, { status: 404 })
  }

  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const validated = CreateLaunchedAgentInput.parse(body)

    const result = await launchAgent({ ...validated, creator_id: userId })
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Attempt full activation (mint + pool + trading) — non-blocking
    // If activation fails, agent stays in draft and user can retry via /activate
    let activation: { tokenMint?: string; stakePoolId?: string } = {}
    if (result.agent) {
      try {
        const { activateAgent } = await import('@/lib/launchpad')
        const activationResult = await activateAgent(result.agent.id)
        if (!activationResult.error) {
          activation = {
            tokenMint: activationResult.tokenMint,
            stakePoolId: activationResult.stakePoolId,
          }
        }
      } catch {
        // Activation failed — agent stays in draft, user can retry
      }
    }

    // Re-fetch agent to get updated status
    const { getLaunchedAgentById } = await import('@/lib/db/launchpad')
    const updatedAgent = result.agent ? await getLaunchedAgentById(result.agent.id) : result.agent

    return NextResponse.json({
      agent: updatedAgent ?? result.agent,
      activation,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message.includes('Feature not available')) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof Error && error.message.includes('Usage limit exceeded')) {
      return NextResponse.json({ error: error.message }, { status: 429 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/launchpad/agents', method: 'POST' },
      tags: { layer: 'api', route: 'launchpad-agents' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
