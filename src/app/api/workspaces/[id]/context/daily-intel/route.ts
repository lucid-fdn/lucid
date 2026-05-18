import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
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

    const { id: workspaceId } = await (ctx as Params).params
    if (!(await isUserOrgMember(userId, workspaceId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const input = GenerateDailyIntelPreviewSchema.parse(await request.json())
    const intel = await generateSharedContextDailyIntel({
      ...input,
      workspaceId,
      scopeType: 'workspace',
      scopeId: workspaceId,
      userId,
    })

    return NextResponse.json({ intel, record: intel.contextRecord }, { status: input.publish ? 201 : 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/workspaces/[id]/context/daily-intel', method: 'POST' },
      tags: { layer: 'api', route: 'shared-context' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
