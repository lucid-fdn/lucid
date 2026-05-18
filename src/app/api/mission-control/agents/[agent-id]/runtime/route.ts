import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember, getAssistant } from '@/lib/db'
import { updateAgentRuntime } from '@/lib/db/mission-control'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'
import { assignRuntimeSchema } from '@/lib/mission-control/schemas'

export const dynamic = 'force-dynamic'

// PUT /api/mission-control/agents/[agent-id]/runtime
// Body: { runtimeId: "uuid" | null }
export const PUT = withCSRF(async (
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

    const parsed = assignRuntimeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Verify agent exists and user has access
    const assistant = await getAssistant(agentId)
    if (!assistant) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await updateAgentRuntime(agentId, assistant.org_id, parsed.data.runtimeId)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to update runtime' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      runtime_id: parsed.data.runtimeId,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/agents/[agent-id]/runtime' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
})
