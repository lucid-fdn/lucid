import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember, getAssistant } from '@/lib/db'
import { getAgentGuardrails, updateAgentGuardrails } from '@/lib/db/mission-control'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const guardrailsUpdateSchema = z.object({
  approval_required_tools: z.array(z.string()).optional(),
  cost_limit_per_run_usd: z.number().min(0).nullable().optional(),
  cost_limit_daily_usd: z.number().min(0).nullable().optional(),
  cost_limit_monthly_usd: z.number().min(0).nullable().optional(),
})

// GET /api/mission-control/agents/[agent-id]/guardrails
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ 'agent-id': string }> }
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { 'agent-id': agentId } = await params

    const assistant = await getAssistant(agentId)
    if (!assistant) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const guardrails = await getAgentGuardrails(agentId, assistant.org_id)
    if (!guardrails) {
      return NextResponse.json({ error: 'Failed to fetch guardrails' }, { status: 500 })
    }

    return NextResponse.json(guardrails)
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/agents/[agent-id]/guardrails' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// PUT /api/mission-control/agents/[agent-id]/guardrails
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

    const parsed = guardrailsUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid guardrails data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const assistant = await getAssistant(agentId)
    if (!assistant) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await updateAgentGuardrails(agentId, assistant.org_id, parsed.data)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/agents/[agent-id]/guardrails' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
})
