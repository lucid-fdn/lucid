import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getCrew } from '@/lib/db/crews'
import { getSharedContextRecord, updateSharedContextRecord } from '@/lib/db/shared-context'
import { resolveCrewProjectScope } from '@/lib/crews/project-scope'
import { UpdateSharedContextRecordSchema } from '@contracts/shared-context'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; recordId: string }> }

async function authorizeTeam(request: NextRequest, crewId: string, recordId: string, userId: string) {
  const orgId = request.nextUrl.searchParams.get('org_id')
  const projectId = request.nextUrl.searchParams.get('project_id') || undefined
  if (!orgId) return { error: NextResponse.json({ error: 'org_id required' }, { status: 400 }) }

  const isMember = await isUserOrgMember(userId, orgId)
  if (!isMember) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const effectiveProjectId = await resolveCrewProjectScope({
    orgId,
    projectId,
    endpoint: '/api/crews/[id]/context/[recordId]',
    userId,
  })
  if (!effectiveProjectId) {
    return { error: NextResponse.json({ error: 'Workspace does not have a project yet' }, { status: 500 }) }
  }

  const crew = await getCrew(crewId, orgId, effectiveProjectId)
  if (!crew) return { error: NextResponse.json({ error: 'Team not found' }, { status: 404 }) }

  const record = await getSharedContextRecord(recordId)
  if (
    !record ||
    record.workspace_id !== orgId ||
    record.project_id !== effectiveProjectId ||
    record.scope_type !== 'team' ||
    record.scope_id !== crewId
  ) {
    return { error: NextResponse.json({ error: 'Context record not found' }, { status: 404 }) }
  }

  return { orgId, projectId: effectiveProjectId, crew, record }
}

export const PATCH = withCSRF(async (request: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: crewId, recordId } = await (ctx as Params).params
    const auth = await authorizeTeam(request, crewId, recordId, userId)
    if (auth.error) return auth.error

    const input = UpdateSharedContextRecordSchema.parse(await request.json())
    const record = await updateSharedContextRecord(recordId, input, { userId })
    if (!record) return NextResponse.json({ error: 'Failed to update context record' }, { status: 500 })

    return NextResponse.json({ record })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/crews/[id]/context/[recordId]', method: 'PATCH' },
      tags: { layer: 'api', route: 'team-context' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})

export const DELETE = withCSRF(async (request: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: crewId, recordId } = await (ctx as Params).params
    const auth = await authorizeTeam(request, crewId, recordId, userId)
    if (auth.error) return auth.error

    const record = await updateSharedContextRecord(recordId, { status: 'archived' }, { userId })
    if (!record) return NextResponse.json({ error: 'Failed to archive context record' }, { status: 500 })

    return NextResponse.json({ record })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/crews/[id]/context/[recordId]', method: 'DELETE' },
      tags: { layer: 'api', route: 'team-context' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
