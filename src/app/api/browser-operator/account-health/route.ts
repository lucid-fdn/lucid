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
import { listLatestBrowserOperatorAccountHealthSnapshots } from '@/lib/db/browser-operator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const querySchema = z.object({
  orgId: z.string().uuid(),
  accountIds: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(250).optional(),
})

export async function GET(request: NextRequest) {
  const requestId = browserOperatorRequestId(request)
  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const query = querySchema.parse({
      orgId: request.nextUrl.searchParams.get('orgId'),
      accountIds: request.nextUrl.searchParams.get('accountIds') ?? undefined,
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    })
    await requireAgentCommerceOrgMembership(userId, query.orgId)
    const snapshots = await listLatestBrowserOperatorAccountHealthSnapshots({
      orgId: query.orgId,
      browserAccountIds: parseAccountIds(query.accountIds),
      limit: query.limit,
    })
    return browserOperatorOk({ account_health: snapshots }, requestId)
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}

function parseAccountIds(value: string | undefined): string[] | undefined {
  if (!value) return undefined
  const ids = value.split(',').map((item) => item.trim()).filter(Boolean)
  return ids.length ? z.array(z.string().uuid()).parse(ids) : undefined
}
