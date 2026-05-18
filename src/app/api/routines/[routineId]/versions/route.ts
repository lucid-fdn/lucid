import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { listRoutineVersions } from '@/lib/routines/service'
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
    const versions = await listRoutineVersions({ orgId, routineId })
    return NextResponse.json({ versions })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/routines/[routineId]/versions GET' },
      tags: { layer: 'api', route: 'routines' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
