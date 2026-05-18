import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { CreateAgentCommerceConnectionSchema, AgentCommerceProviderIdSchema } from '@contracts/agent-commerce'
import { getUserId } from '@/lib/auth/server-utils'
import { withCSRF } from '@/lib/auth/csrf'
import {
  agentCommerceErrorResponse,
  agentCommerceOk,
  agentCommerceRequestId,
  guardAgentCommerceSurface,
} from '@/lib/agent-commerce/api'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import {
  requireAgentCommerceOrgMembership,
  requireAgentCommerceOrgWriteAccess,
} from '@/lib/agent-commerce/operator-auth'
import {
  AGENT_COMMERCE_RATE_LIMITS,
  agentCommerceRateLimitScope,
  enforceAgentCommerceRateLimit,
} from '@/lib/agent-commerce/rate-limit'
import {
  createAgentCommerceConnection,
  listAgentCommerceConnections,
} from '@/lib/db/agent-commerce'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const querySchema = z.object({
  orgId: z.string().uuid(),
  provider: AgentCommerceProviderIdSchema.optional(),
})

export async function GET(request: NextRequest) {
  const guard = guardAgentCommerceSurface('wallets', request)
  if (guard) return guard
  const requestId = agentCommerceRequestId(request)

  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)

    const query = querySchema.parse({
      orgId: request.nextUrl.searchParams.get('orgId'),
      provider: request.nextUrl.searchParams.get('provider') ?? undefined,
    })
    await requireAgentCommerceOrgMembership(userId, query.orgId)
    const connections = await listAgentCommerceConnections({
      orgId: query.orgId,
      provider: query.provider,
    })
    return agentCommerceOk({ connections }, requestId)
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}

export const POST = withCSRF(async (request: NextRequest) => {
  const guard = guardAgentCommerceSurface('wallets', request)
  if (guard) return guard
  const requestId = agentCommerceRequestId(request)

  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const input = CreateAgentCommerceConnectionSchema.parse(await request.json())
    await requireAgentCommerceOrgWriteAccess(userId, input.org_id)
    await enforceAgentCommerceRateLimit({
      scope: agentCommerceRateLimitScope('org', input.org_id, 'user', userId),
      bucket: 'agent-commerce:public:connection-create',
      ...AGENT_COMMERCE_RATE_LIMITS.publicConnectionCreate,
    })
    const connection = await createAgentCommerceConnection({
      ...input,
      user_id: input.user_id ?? userId,
    })
    return agentCommerceOk({ connection }, requestId, { status: 201 })
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}) as (request: NextRequest) => Promise<NextResponse | Response>
