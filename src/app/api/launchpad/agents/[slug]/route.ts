import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getLaunchedAgentBySlug, getStakingPool, getEpochsForAgent } from '@/lib/db'
import { updateLaunchedAgent, resolveAgent } from '@/lib/db/launchpad'
import { transitionAgentStatus } from '@/lib/launchpad'
import { UpdateLaunchedAgentInput } from '@contracts/launchpad'
import { FEATURES } from '@/lib/features'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

/** GET /api/launchpad/agents/[slug] — Public agent detail */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!FEATURES.launchpad) {
    return NextResponse.json({ error: 'Launchpad not enabled' }, { status: 404 })
  }

  const { slug } = await params
  const agent = await resolveAgent(slug)
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const [stakingPool, epochs] = await Promise.all([
    getStakingPool(agent.id),
    getEpochsForAgent(agent.id),
  ])

  return NextResponse.json({ agent, stakingPool, epochs })
}

/** PATCH /api/launchpad/agents/[slug] — Update agent (creator only) */
export const PATCH = withCSRF(async (
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) => {
  if (!FEATURES.launchpad) {
    return NextResponse.json({ error: 'Launchpad not enabled' }, { status: 404 })
  }

  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = await params
  const agent = await getLaunchedAgentBySlug(slug)
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  if (agent.creator_id !== userId) {
    return NextResponse.json({ error: 'Only the creator can update this agent' }, { status: 403 })
  }

  const body = await req.json()

  // Handle status transition separately
  if (body.status) {
    const result = await transitionAgentStatus(agent.id, body.status)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
  }

  const validated = UpdateLaunchedAgentInput.omit({ status: true }).parse(body)
  if (Object.keys(validated).length > 0) {
    const updated = await updateLaunchedAgent(agent.id, validated)
    if (!updated) {
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
    return NextResponse.json({ agent: updated })
  }

  const refreshed = await getLaunchedAgentBySlug(slug)
  return NextResponse.json({ agent: refreshed })
})
