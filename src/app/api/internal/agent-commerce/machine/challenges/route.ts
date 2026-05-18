import { NextRequest } from 'next/server'
import { CreateMachinePaymentChallengeSchema } from '@contracts/agent-commerce'
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
import { createAgentCommerceMachineChallenge } from '@/lib/agent-commerce/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const guard = guardAgentCommerceSurface('seller', request)
  if (guard) return guard
  const requestId = agentCommerceRequestId(request)

  try {
    const auth = await verifyAgentCommerceInternalAuth(request)
    const input = CreateMachinePaymentChallengeSchema.parse(JSON.parse(auth.body || '{}'))
    await enforceAgentCommerceRateLimit({
      scope: agentCommerceRateLimitScope('org', input.org_id, 'resource', input.resource_type, input.resource_id),
      bucket: 'agent-commerce:machine:challenge-create',
      ...AGENT_COMMERCE_RATE_LIMITS.machineChallengeCreate,
    })
    const challenge = await createAgentCommerceMachineChallenge(input, {
      type: 'runtime',
      requestId: auth.requestId,
    })
    return agentCommerceOk({ challenge }, requestId, { status: 201 })
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}
