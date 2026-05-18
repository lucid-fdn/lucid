import { NextRequest, NextResponse } from 'next/server'
import { authenticateRuntime } from '../../_auth'
import { getApprovalStatus } from '@/lib/db/mission-control'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

// GET /api/runtimes/approvals/pending?approval_id=xxx — Poll for approval resolution (API key auth)
export async function GET(request: NextRequest) {
  try {
    const runtime = await authenticateRuntime(request.headers.get('authorization'))
    if (!runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const approvalId = request.nextUrl.searchParams.get('approval_id')
    if (!approvalId) {
      return NextResponse.json({ error: 'approval_id required' }, { status: 400 })
    }

    const result = await getApprovalStatus(approvalId, runtime.orgId)
    if (!result) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }

    if (result.status === 'pending') {
      return NextResponse.json({ status: 'pending' })
    }

    return NextResponse.json({
      status: result.status,
      resolvedAt: result.resolvedAt,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/approvals/pending' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
