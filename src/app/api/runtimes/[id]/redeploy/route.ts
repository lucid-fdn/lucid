import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { redeployResultSchema } from '@/lib/mission-control/schemas'
import { performRuntimeMaintenanceAction } from '@/lib/runtimes/maintenance'

export const dynamic = 'force-dynamic'

// Compatibility wrapper around the provider-neutral maintenance service.
// POST /api/runtimes/[id]/redeploy?org_id=xxx
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const outcome = await performRuntimeMaintenanceAction({
      runtimeId: id,
      orgId,
      requestedBy: userId,
      action: 'redeploy',
    })

    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    }

    const parsed = redeployResultSchema.safeParse({
      success: outcome.result.success,
      deployment_id: outcome.result.deploymentId ?? '',
      status: outcome.result.status === 'succeeded' ? 'running' : outcome.result.status,
      url: outcome.result.url ?? undefined,
      operation_id: outcome.result.operationId ?? undefined,
    })

    return NextResponse.json({ result: parsed.success ? parsed.data : outcome.result })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id]/redeploy POST' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
