import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getCrew, removeCrewMember, updateCrewMember } from '@/lib/db/crews'
import { UpdateCrewMemberSchema } from '@contracts/crew'
import { ErrorService } from '@/lib/errors/error-service'
import { resolveCrewProjectScope } from '@/lib/crews/project-scope'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; memberId: string }> }

// PATCH /api/crews/[id]/members/[memberId]
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: crewId, memberId } = await params
    const body = await request.json()
    const orgId = body.org_id
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const effectiveProjectId = await resolveCrewProjectScope({
      orgId,
      projectId: body.project_id,
      endpoint: '/api/crews/[id]/members/[memberId] PATCH',
      userId,
    })
    if (!effectiveProjectId) {
      return NextResponse.json({ error: 'Workspace does not have a project yet' }, { status: 500 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const crew = await getCrew(crewId, orgId, effectiveProjectId)
    if (!crew) {
      return NextResponse.json({ error: 'Crew not found' }, { status: 404 })
    }

    const parsed = UpdateCrewMemberSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const member = await updateCrewMember(crewId, memberId, parsed.data)
    if (!member) {
      return NextResponse.json({ error: 'Failed to update member' }, { status: 500 })
    }

    return NextResponse.json({ member })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/crews/[id]/members/[memberId] PATCH' },
      tags: { layer: 'api', route: 'crews' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// DELETE /api/crews/[id]/members/[memberId]
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: crewId, memberId } = await params
    const orgId = request.nextUrl.searchParams.get('org_id')
    const projectId = request.nextUrl.searchParams.get('project_id') || undefined
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const effectiveProjectId = await resolveCrewProjectScope({
      orgId,
      projectId,
      endpoint: '/api/crews/[id]/members/[memberId] DELETE',
      userId,
    })
    if (!effectiveProjectId) {
      return NextResponse.json({ error: 'Workspace does not have a project yet' }, { status: 500 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const crew = await getCrew(crewId, orgId, effectiveProjectId)
    if (!crew) {
      return NextResponse.json({ error: 'Crew not found' }, { status: 404 })
    }

    const ok = await removeCrewMember(crewId, memberId)
    if (!ok) {
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/crews/[id]/members/[memberId] DELETE' },
      tags: { layer: 'api', route: 'crews' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
