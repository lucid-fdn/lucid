import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import {
  agentCommerceErrorResponse,
  agentCommerceOk,
  agentCommerceRequestId,
  guardAgentCommerceSurface,
} from '@/lib/agent-commerce/api'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import { requireAgentCommerceOrgMembership } from '@/lib/agent-commerce/operator-auth'
import { getAgentSpendRequest } from '@/lib/db/agent-commerce'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const paramsSchema = z.object({ id: z.string().uuid() })
const querySchema = z.object({ orgId: z.string().uuid() })

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guard = guardAgentCommerceSurface('wallets', request)
  if (guard) return guard
  const requestId = agentCommerceRequestId(request)

  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const { id } = paramsSchema.parse(await context.params)
    const query = querySchema.parse({ orgId: request.nextUrl.searchParams.get('orgId') })
    await requireAgentCommerceOrgMembership(userId, query.orgId)
    const spendRequest = await getAgentSpendRequest(id, query.orgId)
    if (!spendRequest) throw new AgentCommerceError('not_found', 'Spend request was not found.', 404)
    return agentCommerceOk({ spend_request: spendRequest }, requestId)
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}
