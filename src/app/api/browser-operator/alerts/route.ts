import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  BrowserOperatorAlertStatusSchema,
  CreateBrowserOperatorAlertSchema,
} from '@contracts/browser-operator'
import { withCSRF } from '@/lib/auth/csrf'
import { getUserId } from '@/lib/auth/server-utils'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import {
  requireAgentCommerceOrgMembership,
  requireAgentCommerceOrgWriteAccess,
} from '@/lib/agent-commerce/operator-auth'
import {
  browserOperatorErrorResponse,
  browserOperatorOk,
  browserOperatorRequestId,
} from '@/lib/browser-operator/api'
import {
  createBrowserOperatorAlert,
  listBrowserOperatorAlerts,
} from '@/lib/db/browser-operator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const querySchema = z.object({
  orgId: z.string().uuid(),
  browserAccountId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const requestId = browserOperatorRequestId(request)
  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const query = querySchema.parse({
      orgId: request.nextUrl.searchParams.get('orgId'),
      browserAccountId: request.nextUrl.searchParams.get('browserAccountId') ?? undefined,
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
      status: request.nextUrl.searchParams.get('status') ?? undefined,
    })
    await requireAgentCommerceOrgMembership(userId, query.orgId)
    const statuses = parseStatuses(query.status)
    const alerts = await listBrowserOperatorAlerts({
      orgId: query.orgId,
      browserAccountId: query.browserAccountId,
      status: statuses.length ? statuses : undefined,
      limit: query.limit,
    })
    return browserOperatorOk({ alerts }, requestId)
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}

export const POST = withCSRF(async (request: NextRequest) => {
  const requestId = browserOperatorRequestId(request)
  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const body = CreateBrowserOperatorAlertSchema.parse(await request.json())
    await requireAgentCommerceOrgWriteAccess(userId, body.org_id)
    const alert = await createBrowserOperatorAlert({
      ...body,
      user_id: body.user_id ?? userId,
      metadata: {
        ...(body.metadata ?? {}),
        source: 'browser_operator_alerts_api',
      },
    })
    return browserOperatorOk({ alert }, requestId, { status: 201 })
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}) as (request: NextRequest) => Promise<NextResponse | Response>

function parseStatuses(value: string | undefined): Array<z.infer<typeof BrowserOperatorAlertStatusSchema>> {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => BrowserOperatorAlertStatusSchema.parse(item))
}
