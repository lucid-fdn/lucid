import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getCrews, getCrewsTopologyBatch, createCrew } from '@/lib/db/crews'
import { CreateCrewSchema } from '@contracts/crew'
import { ErrorService } from '@/lib/errors/error-service'
import { withReadFallback } from '@/lib/api/read-fallback'
import { resolveCrewProjectScope } from '@/lib/crews/project-scope'

export const dynamic = 'force-dynamic'

// GET /api/crews?org_id=xxx
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('org_id')
    const projectId = request.nextUrl.searchParams.get('project_id') || undefined
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const effectiveProjectId = await resolveCrewProjectScope({
      orgId,
      projectId,
      endpoint: '/api/crews GET',
      userId,
    })
    if (!effectiveProjectId) {
      return NextResponse.json({ error: 'Workspace does not have a project yet' }, { status: 500 })
    }

    const crews = await withReadFallback(
      getCrews(orgId, effectiveProjectId),
      [],
      { endpoint: '/api/crews GET', orgId, projectId: effectiveProjectId, step: 'crews' },
    )

    // ?topology=true — batch-fetch members + edges for all crews (2 queries, not N+1)
    const includeTopology = request.nextUrl.searchParams.get('topology') === 'true'
    if (includeTopology && crews.length > 0) {
      const { members, edges } = await withReadFallback(
        getCrewsTopologyBatch(
          crews.map((c) => c.id),
          orgId,
          effectiveProjectId,
        ),
        { members: {}, edges: {} },
        { endpoint: '/api/crews GET', orgId, projectId: effectiveProjectId, step: 'topology' },
      )
      return NextResponse.json({ crews, members, edges })
    }

    return NextResponse.json({ crews })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/crews GET' },
      tags: { layer: 'api', route: 'crews' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/crews — Create crew (with optional inline members + edges)
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const orgId = body.org_id
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const effectiveProjectId = await resolveCrewProjectScope({
      orgId,
      projectId: body.project_id,
      endpoint: '/api/crews POST',
      userId,
    })
    if (!effectiveProjectId) {
      return NextResponse.json({ error: 'Workspace does not have a project yet' }, { status: 500 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = CreateCrewSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const result = await createCrew(orgId, {
      ...parsed.data,
      project_id: effectiveProjectId,
    }, userId)
    if (!result) {
      return NextResponse.json({ error: 'Failed to create crew' }, { status: 500 })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/crews POST' },
      tags: { layer: 'api', route: 'crews' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
