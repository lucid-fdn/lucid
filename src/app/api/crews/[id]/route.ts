import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getCrew, getCrewTopology, updateCrew, deleteCrew } from '@/lib/db/crews'
import { UpdateCrewSchema } from '@contracts/crew'
import { ErrorService } from '@/lib/errors/error-service'
import { resolveCrewProjectScope } from '@/lib/crews/project-scope'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// GET /api/crews/[id]?org_id=xxx
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: crewId } = await params
    const orgId = request.nextUrl.searchParams.get('org_id')
    const projectId = request.nextUrl.searchParams.get('project_id') || undefined
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const effectiveProjectId = await resolveCrewProjectScope({
      orgId,
      projectId,
      endpoint: '/api/crews/[id] GET',
      userId,
    })
    if (!effectiveProjectId) {
      return NextResponse.json({ error: 'Workspace does not have a project yet' }, { status: 500 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const full = request.nextUrl.searchParams.get('topology') === 'true'
    if (full) {
      const topology = await getCrewTopology(crewId, orgId, effectiveProjectId)
      if (!topology) {
        return NextResponse.json({ error: 'Crew not found' }, { status: 404 })
      }
      return NextResponse.json(topology)
    }

    const crew = await getCrew(crewId, orgId, effectiveProjectId)
    if (!crew) {
      return NextResponse.json({ error: 'Crew not found' }, { status: 404 })
    }
    return NextResponse.json({ crew })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/crews/[id] GET' },
      tags: { layer: 'api', route: 'crews' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// PATCH /api/crews/[id]
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: crewId } = await params
    const body = await request.json()
    const orgId = body.org_id
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const effectiveProjectId = await resolveCrewProjectScope({
      orgId,
      projectId: body.project_id,
      endpoint: '/api/crews/[id] PATCH',
      userId,
    })
    if (!effectiveProjectId) {
      return NextResponse.json({ error: 'Workspace does not have a project yet' }, { status: 500 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = UpdateCrewSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const crew = await updateCrew(crewId, orgId, parsed.data, effectiveProjectId)
    if (!crew) {
      return NextResponse.json({ error: 'Crew not found' }, { status: 404 })
    }
    return NextResponse.json({ crew })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/crews/[id] PATCH' },
      tags: { layer: 'api', route: 'crews' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// DELETE /api/crews/[id] (soft delete)
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: crewId } = await params
    const orgId = request.nextUrl.searchParams.get('org_id')
    const projectId = request.nextUrl.searchParams.get('project_id') || undefined
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const effectiveProjectId = await resolveCrewProjectScope({
      orgId,
      projectId,
      endpoint: '/api/crews/[id] DELETE',
      userId,
    })
    if (!effectiveProjectId) {
      return NextResponse.json({ error: 'Workspace does not have a project yet' }, { status: 500 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const ok = await deleteCrew(crewId, orgId, effectiveProjectId)
    if (!ok) {
      return NextResponse.json({ error: 'Failed to delete crew' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/crews/[id] DELETE' },
      tags: { layer: 'api', route: 'crews' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
