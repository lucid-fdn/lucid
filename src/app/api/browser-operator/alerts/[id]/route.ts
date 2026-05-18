import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { UpdateBrowserOperatorAlertSchema } from '@contracts/browser-operator'
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
  getBrowserOperatorAlert,
  updateBrowserOperatorAlert,
} from '@/lib/db/browser-operator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const paramsSchema = z.object({ id: z.string().uuid() })
const querySchema = z.object({ orgId: z.string().uuid() })

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = browserOperatorRequestId(request)
  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const { id } = paramsSchema.parse(await context.params)
    const query = querySchema.parse({ orgId: request.nextUrl.searchParams.get('orgId') })
    await requireAgentCommerceOrgMembership(userId, query.orgId)
    const alert = await getBrowserOperatorAlert({ orgId: query.orgId, alertId: id })
    if (!alert) throw new AgentCommerceError('not_found', 'Browser Operator alert not found.', 404)
    return browserOperatorOk({ alert }, requestId)
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}

export const PATCH = withCSRF(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  const requestId = browserOperatorRequestId(request)
  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const { id } = paramsSchema.parse(await context.params)
    const body = await request.json()
    const query = querySchema.parse({ orgId: body.orgId ?? body.org_id })
    const patch = UpdateBrowserOperatorAlertSchema.parse(body.patch ?? body)
    await requireAgentCommerceOrgWriteAccess(userId, query.orgId)
    const alert = await updateBrowserOperatorAlert({
      orgId: query.orgId,
      alertId: id,
      patch: {
        ...patch,
        metadata: {
          ...(patch.metadata ?? {}),
          updated_by_user_id: userId,
          source: 'browser_operator_alert_detail_api',
        },
      },
    })
    return browserOperatorOk({ alert }, requestId)
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}) as (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Promise<NextResponse | Response>
