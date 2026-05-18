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
import {
  listAgentCommerceProviderManifests,
  registerDefaultAgentCommerceProviders,
} from '@/lib/agent-commerce/provider-registry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const querySchema = z.object({
  orgId: z.string().uuid(),
})

export async function GET(request: NextRequest) {
  const guard = guardAgentCommerceSurface('core', request)
  if (guard) return guard
  const requestId = agentCommerceRequestId(request)

  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)

    const query = querySchema.parse({
      orgId: request.nextUrl.searchParams.get('orgId'),
    })
    await requireAgentCommerceOrgMembership(userId, query.orgId)
    registerDefaultAgentCommerceProviders()

    return agentCommerceOk({
      providers: listAgentCommerceProviderManifests(),
    }, requestId)
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}
