import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { recordDeposit, getLaunchedAgentById } from '@/lib/db'
import { RecordDepositInput } from '@contracts/launchpad'
import { FEATURES } from '@/lib/features'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

/** POST /api/launchpad/deposits — Record a deposit (after on-chain confirmation) */
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
    const validated = RecordDepositInput.parse(body)

    // Verify agent exists and is in launching state
    const agent = await getLaunchedAgentById(validated.launched_agent_id)
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    if (agent.status !== 'launching') {
      return NextResponse.json({ error: 'Agent is not accepting deposits' }, { status: 400 })
    }

    const deposit = await recordDeposit({
      ...validated,
      depositor_user_id: userId ?? undefined,
    })
    if (!deposit) {
      return NextResponse.json({ error: 'Failed to record deposit' }, { status: 500 })
    }

    return NextResponse.json({ deposit }, { status: 201 })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/launchpad/deposits', method: 'POST' },
      tags: { layer: 'api', route: 'launchpad-deposits' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
