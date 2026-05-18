import { NextRequest } from 'next/server'
import { SellerPaymentGrantSchema } from '@contracts/agent-commerce'
import {
  agentCommerceErrorResponse,
  agentCommerceOk,
  agentCommerceRequestId,
  guardAgentCommerceSurface,
} from '@/lib/agent-commerce/api'
import { verifyAgentCommerceInternalAuth } from '@/lib/agent-commerce/internal-auth'
import {
  AGENT_COMMERCE_RATE_LIMITS,
  agentCommerceRateLimitScope,
  enforceAgentCommerceRateLimits,
} from '@/lib/agent-commerce/rate-limit'
import { createAgentCommerceSellerGrant } from '@/lib/agent-commerce/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const guard = guardAgentCommerceSurface('seller', request)
  if (guard) return guard
  const requestId = agentCommerceRequestId(request)

  try {
    const auth = await verifyAgentCommerceInternalAuth(request)
    const input = SellerPaymentGrantSchema.parse(JSON.parse(auth.body || '{}'))
    await enforceAgentCommerceRateLimits([
      {
        scope: agentCommerceRateLimitScope('org', input.org_id, 'provider', input.provider),
        bucket: 'agent-commerce:seller:grant-receive',
        ...AGENT_COMMERCE_RATE_LIMITS.sellerGrantReceive,
      },
      {
        scope: agentCommerceRateLimitScope('org', input.org_id, 'resource', input.resource_type, input.resource_id),
        bucket: 'agent-commerce:seller:grant-resource',
        ...AGENT_COMMERCE_RATE_LIMITS.sellerGrantResource,
      },
      {
        scope: agentCommerceRateLimitScope('org', input.org_id, 'currency', input.amount.currency),
        bucket: 'agent-commerce:seller:grant-currency',
        ...AGENT_COMMERCE_RATE_LIMITS.sellerGrantCurrency,
      },
    ])
    const grant = await createAgentCommerceSellerGrant(input, {
      type: 'runtime',
      requestId: auth.requestId,
    })
    return agentCommerceOk({ grant }, requestId, { status: 201 })
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}
