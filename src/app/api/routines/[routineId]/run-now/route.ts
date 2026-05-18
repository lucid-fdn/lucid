import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { triggerRoutineNow } from '@/lib/routines/service'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ routineId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const orgId = body.org_id ?? request.nextUrl.searchParams.get('org_id')
    if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { routineId } = await params
    const routine = await triggerRoutineNow(routineId, orgId, userId)
    if (!routine) return NextResponse.json({ error: 'Routine not found' }, { status: 404 })
    return NextResponse.json({ routine })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/routines/[routineId]/run-now POST' },
      tags: { layer: 'api', route: 'routines' },
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 400 },
    )
  }
}
