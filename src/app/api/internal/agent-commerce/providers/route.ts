import { NextRequest } from 'next/server'
import {
  agentCommerceErrorResponse,
  agentCommerceOk,
  agentCommerceRequestId,
  guardAgentCommerceSurface,
} from '@/lib/agent-commerce/api'
import { verifyAgentCommerceInternalAuth } from '@/lib/agent-commerce/internal-auth'
import {
  listAgentCommerceProviderManifests,
  registerDefaultAgentCommerceProviders,
} from '@/lib/agent-commerce/provider-registry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const guard = guardAgentCommerceSurface('core', request)
  if (guard) return guard
  const requestId = agentCommerceRequestId(request)

  try {
    await verifyAgentCommerceInternalAuth(request)
    registerDefaultAgentCommerceProviders()
    return agentCommerceOk({
      providers: listAgentCommerceProviderManifests(),
    }, requestId)
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}
