import { NextRequest, NextResponse } from 'next/server'
import { authenticateRuntime } from '../_auth'
import { createPendingApproval } from '@/lib/db/mission-control'
import { runtimeApprovalSchema } from '@/lib/mission-control/schemas'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

// POST /api/runtimes/approvals — Submit approval request (API key auth)
export async function POST(request: NextRequest) {
  try {
    const runtime = await authenticateRuntime(request.headers.get('authorization'))
    if (!runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = runtimeApprovalSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await createPendingApproval({
      orgId: runtime.orgId,
      agentId: parsed.data.agentId,
      runId: parsed.data.runId,
      toolName: parsed.data.toolName,
      toolArgs: parsed.data.toolArgs,
      timeoutSeconds: Math.floor(parsed.data.timeoutMs / 1000),
    })

    if (!result) {
      return NextResponse.json({ error: 'Failed to create approval' }, { status: 500 })
    }

    return NextResponse.json({ approvalId: result.id })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/approvals' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
