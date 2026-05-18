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
import { acceptAgentCommerceSellerGrant } from '@/lib/agent-commerce/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const paramsSchema = z.object({ id: z.string().uuid() })
const bodySchema = z.object({ orgId: z.string().uuid() })

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guard = guardAgentCommerceSurface('seller', request)
  if (guard) return guard
  const requestId = agentCommerceRequestId(request)

  try {
    const auth = await verifyAgentCommerceInternalAuth(request)
    const { id } = paramsSchema.parse(await context.params)
    const body = bodySchema.parse(JSON.parse(auth.body || '{}'))
    await enforceAgentCommerceRateLimit({
      scope: agentCommerceRateLimitScope('org', body.orgId, 'seller-grant', id),
      bucket: 'agent-commerce:seller:grant-accept',
      ...AGENT_COMMERCE_RATE_LIMITS.sellerGrantAccept,
    })
    const grant = await acceptAgentCommerceSellerGrant({
      id,
      orgId: body.orgId,
      actor: { type: 'runtime', requestId: auth.requestId },
    })
    return agentCommerceOk({ grant }, requestId)
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}
