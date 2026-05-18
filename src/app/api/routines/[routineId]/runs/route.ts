import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { listRoutineRuns } from '@/lib/routines/service'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ routineId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { routineId } = await params
    const limit = Number(request.nextUrl.searchParams.get('limit') ?? 25)
    const runs = await listRoutineRuns({ routineId, orgId, limit })
    return NextResponse.json({ runs })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/routines/[routineId]/runs GET' },
      tags: { layer: 'api', route: 'routines' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
