import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { restoreRoutineVersion } from '@/lib/routines/service'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ routineId: string; versionId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const orgId = body.org_id
    if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { routineId, versionId } = await params
    const result = await restoreRoutineVersion({
      orgId,
      routineId,
      versionId,
      actorUserId: userId,
      expectedCurrentSnapshotHash: body.expected_current_snapshot_hash ?? null,
    })

    if (result.conflict) {
      return NextResponse.json({
        error: 'Routine changed since this version was loaded',
        conflict: true,
        current_snapshot_hash: result.currentSnapshotHash,
      }, { status: 409 })
    }
    if (!result.task) return NextResponse.json({ error: 'Routine version not found' }, { status: 404 })
    return NextResponse.json({ routine: result.task })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/routines/[routineId]/versions/[versionId]/restore POST' },
      tags: { layer: 'api', route: 'routines' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
