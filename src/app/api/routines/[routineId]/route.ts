import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { cancelRoutine, deleteRoutine, getRoutine, updateRoutine } from '@/lib/routines/service'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ routineId: string }> }

async function authorize(request: NextRequest): Promise<{ userId: string; orgId: string } | NextResponse> {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = request.nextUrl.searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  const isMember = await isUserOrgMember(userId, orgId)
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return { userId, orgId }
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await authorize(request)
    if (auth instanceof NextResponse) return auth

    const { routineId } = await params
    const routine = await getRoutine({ routineId, orgId: auth.orgId })
    if (!routine) return NextResponse.json({ error: 'Routine not found' }, { status: 404 })
    return NextResponse.json({ routine })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/routines/[routineId] GET' },
      tags: { layer: 'api', route: 'routines' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await authorize(request)
    if (auth instanceof NextResponse) return auth

    const { routineId } = await params
    const body = await request.json()

    if (body.action === 'cancel') {
      const success = await cancelRoutine(routineId, auth.orgId, auth.userId)
      return NextResponse.json({ success })
    }

    const routine = await updateRoutine(routineId, auth.orgId, body, auth.userId)
    if (!routine) return NextResponse.json({ error: 'Routine not found' }, { status: 404 })
    return NextResponse.json({ routine })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/routines/[routineId] PATCH' },
      tags: { layer: 'api', route: 'routines' },
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 400 },
    )
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await authorize(request)
    if (auth instanceof NextResponse) return auth

    const { routineId } = await params
    const success = await deleteRoutine(routineId, auth.orgId, auth.userId)
    return NextResponse.json({ success })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/routines/[routineId] DELETE' },
      tags: { layer: 'api', route: 'routines' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
