import { NextRequest } from 'next/server'
import { z } from 'zod'
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
  enforceAgentCommerceRateLimit,
} from '@/lib/agent-commerce/rate-limit'
import { completeAgentCommerceSpendRequest } from '@/lib/agent-commerce/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const paramsSchema = z.object({ id: z.string().uuid() })
const bodySchema = z.object({
  orgId: z.string().uuid(),
  providerRequestId: z.string().min(1).max(255),
  providerCredentialId: z.string().min(1).max(255),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guard = guardAgentCommerceSurface('wallets', request)
  if (guard) return guard
  const requestId = agentCommerceRequestId(request)

  try {
    const auth = await verifyAgentCommerceInternalAuth(request)
    const { id } = paramsSchema.parse(await context.params)
    const body = bodySchema.parse(JSON.parse(auth.body || '{}'))
    await enforceAgentCommerceRateLimit({
      scope: agentCommerceRateLimitScope('org', body.orgId, 'spend-request', id),
      bucket: 'agent-commerce:internal:spend-complete',
      ...AGENT_COMMERCE_RATE_LIMITS.internalSpendRequest,
    })
    const spendRequest = await completeAgentCommerceSpendRequest({
      id,
      orgId: body.orgId,
      actor: { type: 'runtime', requestId: auth.requestId },
      providerRequestId: body.providerRequestId,
      providerCredentialId: body.providerCredentialId,
      metadata: body.metadata,
    })
    return agentCommerceOk({ spend_request: spendRequest }, requestId)
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}
