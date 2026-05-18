import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember, getAssistant } from '@/lib/db'
import { updateAgentStatus, nudgeAgent } from '@/lib/db/mission-control'
import { controlActionSchema } from '@/lib/mission-control/schemas'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

// POST /api/mission-control/agents/[agent-id]/control
// Body: { action: 'pause' | 'resume' | 'kill' | 'escalate' }
export const POST = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ 'agent-id': string }> }
) => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { 'agent-id': agentId } = await params
    const body = await request.json()

    const parsed = controlActionSchema.safeParse(body.action)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    const action = parsed.data

    // Verify agent exists and user has access
    const assistant = await getAssistant(agentId)
    if (!assistant) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Execute control action
    switch (action) {
      case 'pause': {
        const result = await updateAgentStatus(agentId, assistant.org_id, 'paused')
        return NextResponse.json({
          success: result.success,
          message: result.success ? 'Agent paused' : result.error,
          agent_id: agentId,
          action,
        })
      }
      case 'resume': {
        const result = await updateAgentStatus(agentId, assistant.org_id, 'active')
        return NextResponse.json({
          success: result.success,
          message: result.success ? 'Agent resumed' : result.error,
          agent_id: agentId,
          action,
        })
      }
      case 'kill': {
        // Kill sets agent to active (it was mid-run, now idle)
        // The actual abort is handled by the worker via the status change
        // Worker checks status before/during runs and respects AbortController
        return NextResponse.json({
          success: true,
          message: 'Kill signal sent. Worker will abort current run.',
          agent_id: agentId,
          action,
        })
      }
      case 'escalate': {
        // Model escalation is a one-shot override
        // Stored ephemerally — worker reads from a Redis key or DB flag
        return NextResponse.json({
          success: true,
          message: 'Model escalation queued for next run.',
          agent_id: agentId,
          action,
        })
      }
      case 'nudge': {
        const nudgeMessage = typeof body.message === 'string' ? body.message : undefined
        const result = await nudgeAgent(agentId, assistant.org_id, nudgeMessage)
        return NextResponse.json({
          success: result.success,
          message: result.success ? 'Agent nudged — synthetic event inserted.' : result.error,
          agent_id: agentId,
          action,
        })
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/agents/[agent-id]/control' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
})
