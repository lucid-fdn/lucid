import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getPendingApprovals } from '@/lib/db/mission-control'
import { ErrorService } from '@/lib/errors/error-service'
import { withReadFallback } from '@/lib/api/read-fallback'

export const dynamic = 'force-dynamic'

// GET /api/mission-control/approvals?org_id=xxx
export async function GET(request: NextRequest) {
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

    const approvals = await withReadFallback(
      getPendingApprovals(orgId),
      [],
      { endpoint: '/api/mission-control/approvals', orgId },
    )

    return NextResponse.json({ approvals })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/approvals' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
