import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireOrgRequestContext } from '@/lib/request-context/org'
import { getOrgAppConnectionOptions } from '@/lib/capabilities/agent-app-bindings'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const routeParamsSchema = z.object({
  id: z.string().uuid(),
})

export async function GET(
  _req: NextRequest,
  ctx: unknown,
): Promise<NextResponse> {
  try {
    const { id: orgId } = routeParamsSchema.parse(
      await (ctx as { params: Promise<{ id: string }> }).params,
    )

    const contextResult = await requireOrgRequestContext({ orgId, permission: 'editProjects' })
    if (!contextResult.ok) {
      return contextResult.response as NextResponse
    }

    const connections = await getOrgAppConnectionOptions(orgId)
    return NextResponse.json({ connections })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/app-connections', method: 'GET' },
      tags: { layer: 'api', route: 'org-app-connections' },
    })
    return NextResponse.json({ error: 'Failed to load app connections' }, { status: 500 })
  }
}
