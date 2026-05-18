import { NextRequest, NextResponse } from 'next/server'
import { getEpochsForAgent, getLaunchedAgentById } from '@/lib/db'
import { FEATURES } from '@/lib/features'

export const dynamic = 'force-dynamic'

/** GET /api/launchpad/epochs/[agentId] — Public epoch history */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  if (!FEATURES.launchpad) {
    return NextResponse.json({ error: 'Launchpad not enabled' }, { status: 404 })
  }

  const { agentId } = await params
  const agent = await getLaunchedAgentById(agentId)
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const epochs = await getEpochsForAgent(agentId)
  return NextResponse.json({ epochs })
}
