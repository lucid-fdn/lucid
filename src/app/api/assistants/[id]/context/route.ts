import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import {
  createSharedContextRecord,
  listSharedContextRecords,
  resolveAgentSharedContext,
} from '@/lib/db/shared-context'
import { CreateSharedContextRecordSchema } from '@contracts/shared-context'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

async function authorizeAssistant(userId: string, assistantId: string) {
  const assistant = await getAssistant(assistantId)
  if (!assistant) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }

  const isMember = await isUserOrgMember(userId, assistant.org_id)
  if (!isMember) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  return { assistant }
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: assistantId } = await params
    const auth = await authorizeAssistant(userId, assistantId)
    if (auth.error) return auth.error

    if (request.nextUrl.searchParams.get('resolve') === 'true') {
      const context = await resolveAgentSharedContext(
        assistantId,
        auth.assistant.org_id,
        auth.assistant.project_id ?? null,
        userId,
      )
      return NextResponse.json({ context })
    }

    const records = await listSharedContextRecords({
      workspaceId: auth.assistant.org_id,
      projectId: auth.assistant.project_id ?? null,
      agentId: assistantId,
      scopeType: 'agent',
      scopeId: assistantId,
      recordType: request.nextUrl.searchParams.get('record_type') ?? undefined,
      limit: Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 50), 200),
    })

    return NextResponse.json({ records })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/context', method: 'GET' },
      tags: { layer: 'api', route: 'agent-context' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withCSRF(async (request: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: assistantId } = await (ctx as Params).params
    const auth = await authorizeAssistant(userId, assistantId)
    if (auth.error) return auth.error

    const input = CreateSharedContextRecordSchema.parse({
      ...(await request.json()),
      project_id: auth.assistant.project_id ?? null,
      agent_id: assistantId,
      scope_type: 'agent',
      scope_id: assistantId,
    })

    const record = await createSharedContextRecord(auth.assistant.org_id, input, userId)
    if (!record) return NextResponse.json({ error: 'Failed to create context record' }, { status: 500 })

    return NextResponse.json({ record }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/context', method: 'POST' },
      tags: { layer: 'api', route: 'agent-context' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
