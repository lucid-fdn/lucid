import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { createRoutine, listRoutines } from '@/lib/routines/service'
import { ErrorService } from '@/lib/errors/error-service'
import type { RoutineTargetType } from '@/lib/routines/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const routines = await listRoutines({
      orgId,
      assistantId: request.nextUrl.searchParams.get('assistant_id') ?? request.nextUrl.searchParams.get('agent_id') ?? undefined,
      teamId: request.nextUrl.searchParams.get('team_id') ?? undefined,
      targetType: request.nextUrl.searchParams.get('target_type') as RoutineTargetType | null ?? undefined,
      status: request.nextUrl.searchParams.get('status') ?? undefined,
      limit: Number(request.nextUrl.searchParams.get('limit') ?? 50),
    })

    return NextResponse.json({ routines })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/routines GET' },
      tags: { layer: 'api', route: 'routines' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    if (!body?.org_id) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const routine = await createRoutine(body, userId)
    return NextResponse.json({ routine }, { status: 201 })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/routines POST' },
      tags: { layer: 'api', route: 'routines' },
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 400 },
    )
  }
}
