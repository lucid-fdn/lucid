import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getCrewRunDetail } from '@/lib/db/crews'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; runId: string }> }

// GET /api/crews/[id]/runs/[runId]?org_id=xxx
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { runId } = await params
    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const detail = await getCrewRunDetail(runId)
    if (!detail) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    // Verify run belongs to correct org
    if (detail.run.org_id !== orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/crews/[id]/runs/[runId] GET' },
      tags: { layer: 'api', route: 'crews' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
