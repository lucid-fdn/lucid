import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getCrew } from '@/lib/db/crews'
import { createSharedContextRecord, listSharedContextRecords, resolveSharedContext } from '@/lib/db/shared-context'
import { resolveCrewProjectScope } from '@/lib/crews/project-scope'
import { CreateSharedContextRecordSchema } from '@contracts/shared-context'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

async function authorizeTeam(request: NextRequest, crewId: string, userId: string) {
  const orgId = request.nextUrl.searchParams.get('org_id')
  const projectId = request.nextUrl.searchParams.get('project_id') || undefined
  if (!orgId) return { error: NextResponse.json({ error: 'org_id required' }, { status: 400 }) }

  const isMember = await isUserOrgMember(userId, orgId)
  if (!isMember) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const effectiveProjectId = await resolveCrewProjectScope({
    orgId,
    projectId,
    endpoint: '/api/crews/[id]/context',
    userId,
  })
  if (!effectiveProjectId) {
    return { error: NextResponse.json({ error: 'Workspace does not have a project yet' }, { status: 500 }) }
  }

  const crew = await getCrew(crewId, orgId, effectiveProjectId)
  if (!crew) return { error: NextResponse.json({ error: 'Team not found' }, { status: 404 }) }

  return { orgId, projectId: effectiveProjectId, crew }
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: crewId } = await params
    const auth = await authorizeTeam(request, crewId, userId)
    if (auth.error) return auth.error

    if (request.nextUrl.searchParams.get('resolve') === 'true') {
      const context = await resolveSharedContext({
        workspaceId: auth.orgId,
        projectId: auth.projectId,
        teamId: crewId,
        userId,
      })
      return NextResponse.json({ context })
    }

    const records = await listSharedContextRecords({
      workspaceId: auth.orgId,
      projectId: auth.projectId,
      scopeType: 'team',
      scopeId: crewId,
      recordType: request.nextUrl.searchParams.get('record_type') ?? undefined,
      limit: Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 50), 200),
    })

    return NextResponse.json({ records })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/crews/[id]/context', method: 'GET' },
      tags: { layer: 'api', route: 'team-context' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withCSRF(async (request: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: crewId } = await (ctx as Params).params
    const auth = await authorizeTeam(request, crewId, userId)
    if (auth.error) return auth.error

    const input = CreateSharedContextRecordSchema.parse({
      ...(await request.json()),
      project_id: auth.projectId,
      scope_type: 'team',
      scope_id: crewId,
    })

    const record = await createSharedContextRecord(auth.orgId, input, userId)
    if (!record) return NextResponse.json({ error: 'Failed to create context record' }, { status: 500 })

    return NextResponse.json({ record }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/crews/[id]/context', method: 'POST' },
      tags: { layer: 'api', route: 'team-context' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
