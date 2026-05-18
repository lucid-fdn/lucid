import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { createSharedContextRecord, listSharedContextRecords, resolveSharedContext } from '@/lib/db/shared-context'
import { CreateSharedContextRecordSchema } from '@contracts/shared-context'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: workspaceId } = await params
    const isMember = await isUserOrgMember(userId, workspaceId)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (request.nextUrl.searchParams.get('resolve') === 'true') {
      const context = await resolveSharedContext({ workspaceId, userId })
      return NextResponse.json({ context })
    }

    const records = await listSharedContextRecords({
      workspaceId,
      scopeType: request.nextUrl.searchParams.get('scope_type') ?? undefined,
      scopeId: request.nextUrl.searchParams.get('scope_id') ?? undefined,
      recordType: request.nextUrl.searchParams.get('record_type') ?? undefined,
      limit: Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 50), 200),
    })

    return NextResponse.json({ records })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/workspaces/[id]/context', method: 'GET' },
      tags: { layer: 'api', route: 'shared-context' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withCSRF(async (request: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: workspaceId } = await (ctx as Params).params
    const isMember = await isUserOrgMember(userId, workspaceId)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const input = CreateSharedContextRecordSchema.parse(await request.json())
    const record = await createSharedContextRecord(workspaceId, input, userId)
    if (!record) return NextResponse.json({ error: 'Failed to create context record' }, { status: 500 })

    return NextResponse.json({ record }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/workspaces/[id]/context', method: 'POST' },
      tags: { layer: 'api', route: 'shared-context' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
