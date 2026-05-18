import { NextRequest } from 'next/server'
import { MachinePaymentProofClaimInputSchema } from '@contracts/agent-commerce'
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
import { claimAgentCommerceMachinePaymentProof } from '@/lib/agent-commerce/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const guard = guardAgentCommerceSurface('seller', request)
  if (guard) return guard
  const requestId = agentCommerceRequestId(request)

  try {
    const auth = await verifyAgentCommerceInternalAuth(request)
    const input = MachinePaymentProofClaimInputSchema.parse(JSON.parse(auth.body || '{}'))
    await enforceAgentCommerceRateLimit({
      scope: agentCommerceRateLimitScope('org', input.org_id, 'provider', input.provider),
      bucket: 'agent-commerce:machine:proof-claim',
      ...AGENT_COMMERCE_RATE_LIMITS.machineProofClaim,
    })
    const claim = await claimAgentCommerceMachinePaymentProof(input, {
      type: 'runtime',
      requestId: auth.requestId,
    })
    return agentCommerceOk({ claim }, requestId, { status: claim.first_claim ? 201 : 409 })
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}
