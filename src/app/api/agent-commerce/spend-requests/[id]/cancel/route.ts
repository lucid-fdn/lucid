import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { withCSRF } from '@/lib/auth/csrf'
import {
  agentCommerceErrorResponse,
  agentCommerceOk,
  agentCommerceRequestId,
  guardAgentCommerceSurface,
} from '@/lib/agent-commerce/api'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import { requireAgentCommerceOrgMembership } from '@/lib/agent-commerce/operator-auth'
import {
  AGENT_COMMERCE_RATE_LIMITS,
  agentCommerceRateLimitScope,
  enforceAgentCommerceRateLimit,
} from '@/lib/agent-commerce/rate-limit'
import { cancelAgentCommerceSpendRequest } from '@/lib/agent-commerce/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const paramsSchema = z.object({ id: z.string().uuid() })
const bodySchema = z.object({ orgId: z.string().uuid() })

export const POST = withCSRF(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  const guard = guardAgentCommerceSurface('wallets', request)
  if (guard) return guard
  const requestId = agentCommerceRequestId(request)

  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const { id } = paramsSchema.parse(await context.params)
    const body = bodySchema.parse(await request.json())
    await requireAgentCommerceOrgMembership(userId, body.orgId)
    await enforceAgentCommerceRateLimit({
      scope: agentCommerceRateLimitScope('org', body.orgId, 'user', userId),
      bucket: 'agent-commerce:public:spend-cancel',
      ...AGENT_COMMERCE_RATE_LIMITS.publicSpendMutation,
    })
    const spendRequest = await cancelAgentCommerceSpendRequest({
      id,
      orgId: body.orgId,
      actor: { type: 'user', id: userId, requestId },
    })
    return agentCommerceOk({ spend_request: spendRequest }, requestId)
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}) as (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<NextResponse | Response>
