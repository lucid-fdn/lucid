import { NextRequest, NextResponse } from 'next/server'
import { recordUsage, getLaunchedAgentById, incrementAgentStats } from '@/lib/db'
import { RecordUsageInput } from '@contracts/launchpad'
import { FEATURES } from '@/lib/features'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/** POST /api/launchpad/usage — Record agent usage (called by worker or payment webhook) */
export async function POST(req: NextRequest) {
  if (!FEATURES.launchpad) {
    return NextResponse.json({ error: 'Launchpad not enabled' }, { status: 404 })
  }

  // Service-to-service auth via worker secret
  const authHeader = req.headers.get('authorization')
  const secret = process.env.WORKER_TRIGGER_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const validated = RecordUsageInput.parse(body)

    // Verify agent exists
    const agent = await getLaunchedAgentById(validated.launched_agent_id)
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const usage = await recordUsage(validated)
    if (!usage) {
      return NextResponse.json({ error: 'Failed to record usage' }, { status: 500 })
    }

    // Update denormalized stats
    await incrementAgentStats(agent.id, {
      total_requests: 1,
      total_revenue_usdc: validated.amount_usdc,
    })

    return NextResponse.json({ usage }, { status: 201 })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/launchpad/usage', method: 'POST' },
      tags: { layer: 'api', route: 'launchpad-usage' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
