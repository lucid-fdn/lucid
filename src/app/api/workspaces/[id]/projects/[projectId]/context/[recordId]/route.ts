import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getProjectByIdForWorkspace } from '@/lib/db/projects'
import { getSharedContextRecord, updateSharedContextRecord } from '@/lib/db/shared-context'
import { UpdateSharedContextRecordSchema } from '@contracts/shared-context'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; projectId: string; recordId: string }> }

async function authorize(userId: string, workspaceId: string, projectId: string, recordId: string) {
  const isMember = await isUserOrgMember(userId, workspaceId)
  if (!isMember) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const project = await getProjectByIdForWorkspace(workspaceId, projectId)
  if (!project) return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) }

  const record = await getSharedContextRecord(recordId)
  if (!record || record.workspace_id !== workspaceId || record.project_id !== projectId) {
    return { error: NextResponse.json({ error: 'Context record not found' }, { status: 404 }) }
  }

  return { project, record }
}

export const PATCH = withCSRF(async (request: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: workspaceId, projectId, recordId } = await (ctx as Params).params
    const auth = await authorize(userId, workspaceId, projectId, recordId)
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
      context: { endpoint: '/api/workspaces/[id]/projects/[projectId]/context/[recordId]', method: 'PATCH' },
      tags: { layer: 'api', route: 'shared-context' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})

export const DELETE = withCSRF(async (_request: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: workspaceId, projectId, recordId } = await (ctx as Params).params
    const auth = await authorize(userId, workspaceId, projectId, recordId)
    if (auth.error) return auth.error

    const record = await updateSharedContextRecord(recordId, { status: 'archived' }, { userId })
    if (!record) return NextResponse.json({ error: 'Failed to archive context record' }, { status: 500 })

    return NextResponse.json({ record })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/workspaces/[id]/projects/[projectId]/context/[recordId]', method: 'DELETE' },
      tags: { layer: 'api', route: 'shared-context' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
