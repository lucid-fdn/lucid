import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  AgentCommerceIntentSchema,
  AgentSpendRequestStatusSchema,
} from '@contracts/agent-commerce'
import { getUserId } from '@/lib/auth/server-utils'
import { withCSRF } from '@/lib/auth/csrf'
import {
  agentCommerceErrorResponse,
  agentCommerceOk,
  agentCommerceRequestId,
  guardAgentCommerceSurface,
} from '@/lib/agent-commerce/api'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import { normalizeIdempotencyKey } from '@/lib/agent-commerce/idempotency'
import { requireAgentCommerceOrgMembership } from '@/lib/agent-commerce/operator-auth'
import {
  AGENT_COMMERCE_RATE_LIMITS,
  agentCommerceRateLimitScope,
  enforceAgentCommerceRateLimits,
} from '@/lib/agent-commerce/rate-limit'
import { createAgentCommerceSpendRequest } from '@/lib/agent-commerce/service'
import { listAgentSpendRequests } from '@/lib/db/agent-commerce'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const querySchema = z.object({
  orgId: z.string().uuid(),
  status: AgentSpendRequestStatusSchema.optional(),
  assistantId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
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
      status: request.nextUrl.searchParams.get('status') ?? undefined,
      assistantId: request.nextUrl.searchParams.get('assistantId') ?? undefined,
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    })
    await requireAgentCommerceOrgMembership(userId, query.orgId)
    const spendRequests = await listAgentSpendRequests({
      orgId: query.orgId,
      status: query.status,
      assistantId: query.assistantId,
      limit: query.limit,
    })
    return agentCommerceOk({ spend_requests: spendRequests }, requestId)
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
    const body = await request.json()
    const idempotencyKey = normalizeIdempotencyKey(request.headers.get('idempotency-key') ?? body.idempotency_key)
    const intent = AgentCommerceIntentSchema.parse({
      ...body,
      actor_user_id: userId,
      idempotency_key: idempotencyKey,
    })
    await requireAgentCommerceOrgMembership(userId, intent.org_id)
    await enforceAgentCommerceRateLimits([
      {
        scope: agentCommerceRateLimitScope('org', intent.org_id, 'user', userId),
        bucket: 'agent-commerce:public:spend-request',
        ...AGENT_COMMERCE_RATE_LIMITS.publicSpendRequest,
      },
      {
        scope: agentCommerceRateLimitScope('org', intent.org_id, 'merchant', intent.merchant.domain ?? intent.merchant.name),
        bucket: 'agent-commerce:public:spend-merchant',
        ...AGENT_COMMERCE_RATE_LIMITS.publicSpendMerchant,
      },
      {
        scope: agentCommerceRateLimitScope('org', intent.org_id, 'currency', intent.amount.currency),
        bucket: 'agent-commerce:public:spend-currency',
        ...AGENT_COMMERCE_RATE_LIMITS.publicSpendCurrency,
      },
    ])
    const result = await createAgentCommerceSpendRequest(intent, {
      type: 'user',
      id: userId,
      requestId,
    })
    return agentCommerceOk({
      spend_request: result.spendRequest,
      idempotent: result.idempotent,
    }, requestId, { status: result.idempotent ? 200 : 201 })
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}) as (request: NextRequest) => Promise<NextResponse | Response>
