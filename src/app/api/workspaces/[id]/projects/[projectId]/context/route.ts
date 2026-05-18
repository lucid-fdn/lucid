import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getProjectByIdForWorkspace } from '@/lib/db/projects'
import { createSharedContextRecord, listSharedContextRecords, resolveSharedContext } from '@/lib/db/shared-context'
import { CreateSharedContextRecordSchema } from '@contracts/shared-context'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; projectId: string }> }

async function authorize(userId: string, workspaceId: string, projectId: string) {
  const isMember = await isUserOrgMember(userId, workspaceId)
  if (!isMember) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const project = await getProjectByIdForWorkspace(workspaceId, projectId)
  if (!project) return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) }

  return { project }
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: workspaceId, projectId } = await params
    const auth = await authorize(userId, workspaceId, projectId)
    if (auth.error) return auth.error

    if (request.nextUrl.searchParams.get('resolve') === 'true') {
      const context = await resolveSharedContext({ workspaceId, projectId, userId })
      return NextResponse.json({ context })
    }

    const records = await listSharedContextRecords({
      workspaceId,
      projectId,
      scopeType: request.nextUrl.searchParams.get('scope_type') ?? undefined,
      scopeId: request.nextUrl.searchParams.get('scope_id') ?? undefined,
      recordType: request.nextUrl.searchParams.get('record_type') ?? undefined,
      limit: Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 50), 200),
    })

    return NextResponse.json({ records })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/workspaces/[id]/projects/[projectId]/context', method: 'GET' },
      tags: { layer: 'api', route: 'shared-context' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withCSRF(async (request: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: workspaceId, projectId } = await (ctx as Params).params
    const auth = await authorize(userId, workspaceId, projectId)
    if (auth.error) return auth.error

    const input = CreateSharedContextRecordSchema.parse({
      ...(await request.json()),
      project_id: projectId,
    })
    const record = await createSharedContextRecord(workspaceId, input, userId)
    if (!record) return NextResponse.json({ error: 'Failed to create context record' }, { status: 500 })

    return NextResponse.json({ record }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/workspaces/[id]/projects/[projectId]/context', method: 'POST' },
      tags: { layer: 'api', route: 'shared-context' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
