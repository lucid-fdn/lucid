import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import { requireAgentCommerceOrgMembership } from '@/lib/agent-commerce/operator-auth'
import {
  browserOperatorErrorResponse,
  browserOperatorOk,
  browserOperatorRequestId,
} from '@/lib/browser-operator/api'
import { listBrowserOperatorConnectSessions } from '@/lib/db/browser-operator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const querySchema = z.object({
  orgId: z.string().uuid(),
  browserAccountId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
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
    })
    await requireAgentCommerceOrgMembership(userId, query.orgId)
    const connectSessions = await listBrowserOperatorConnectSessions({
      orgId: query.orgId,
      browserAccountId: query.browserAccountId,
      limit: query.limit,
    })
    return browserOperatorOk({ connect_sessions: connectSessions }, requestId)
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}
