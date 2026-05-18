import { NextRequest } from 'next/server'
import { AgentCommerceIntentSchema } from '@contracts/agent-commerce'
import {
  agentCommerceErrorResponse,
  agentCommerceOk,
  agentCommerceRequestId,
  guardAgentCommerceSurface,
} from '@/lib/agent-commerce/api'
import { normalizeIdempotencyKey } from '@/lib/agent-commerce/idempotency'
import { verifyAgentCommerceInternalAuth } from '@/lib/agent-commerce/internal-auth'
import {
  AGENT_COMMERCE_RATE_LIMITS,
  agentCommerceRateLimitScope,
  enforceAgentCommerceRateLimits,
} from '@/lib/agent-commerce/rate-limit'
import { createAgentCommerceSpendRequest } from '@/lib/agent-commerce/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const guard = guardAgentCommerceSurface('wallets', request)
  if (guard) return guard
  const requestId = agentCommerceRequestId(request)

  try {
    const auth = await verifyAgentCommerceInternalAuth(request)
    const body = JSON.parse(auth.body || '{}')
    const idempotencyKey = normalizeIdempotencyKey(request.headers.get('idempotency-key') ?? body.idempotency_key)
    const intent = AgentCommerceIntentSchema.parse({
      ...body,
      idempotency_key: idempotencyKey,
    })
    await enforceAgentCommerceRateLimits([
      {
        scope: agentCommerceRateLimitScope('org', intent.org_id, 'assistant', intent.assistant_id, 'runtime'),
        bucket: 'agent-commerce:internal:spend-request',
        ...AGENT_COMMERCE_RATE_LIMITS.internalSpendRequest,
      },
      {
        scope: agentCommerceRateLimitScope('org', intent.org_id, 'merchant', intent.merchant.domain ?? intent.merchant.name),
        bucket: 'agent-commerce:internal:spend-merchant',
        ...AGENT_COMMERCE_RATE_LIMITS.internalSpendMerchant,
      },
      {
        scope: agentCommerceRateLimitScope('org', intent.org_id, 'currency', intent.amount.currency),
        bucket: 'agent-commerce:internal:spend-currency',
        ...AGENT_COMMERCE_RATE_LIMITS.internalSpendCurrency,
      },
    ])
    const result = await createAgentCommerceSpendRequest(intent, {
      type: 'runtime',
      id: intent.assistant_id,
      requestId: auth.requestId,
    })
    return agentCommerceOk({
      spend_request: result.spendRequest,
      idempotent: result.idempotent,
    }, requestId, { status: result.idempotent ? 200 : 201 })
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}
