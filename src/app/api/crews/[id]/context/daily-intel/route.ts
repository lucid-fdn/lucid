import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getCrew } from '@/lib/db/crews'
import { resolveCrewProjectScope } from '@/lib/crews/project-scope'
import { generateSharedContextDailyIntel } from '@/lib/db/shared-context'
import { GenerateDailyIntelPreviewSchema } from '@contracts/shared-context'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const POST = withCSRF(async (request: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: crewId } = await (ctx as Params).params
    const orgId = request.nextUrl.searchParams.get('org_id')
    const requestedProjectId = request.nextUrl.searchParams.get('project_id') || undefined
    if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    if (!(await isUserOrgMember(userId, orgId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const projectId = await resolveCrewProjectScope({
      orgId,
      projectId: requestedProjectId,
      endpoint: '/api/crews/[id]/context/daily-intel',
      userId,
    })
    if (!projectId) return NextResponse.json({ error: 'Workspace does not have a project yet' }, { status: 500 })

    const crew = await getCrew(crewId, orgId, projectId)
    if (!crew) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    const input = GenerateDailyIntelPreviewSchema.parse(await request.json())
    const intel = await generateSharedContextDailyIntel({
      ...input,
      workspaceId: orgId,
      projectId,
      teamId: crewId,
      scopeType: 'team',
      scopeId: crewId,
      userId,
    })

    return NextResponse.json({ intel, record: intel.contextRecord }, { status: input.publish ? 201 : 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/crews/[id]/context/daily-intel', method: 'POST' },
      tags: { layer: 'api', route: 'team-context' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
