import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  agentCommerceErrorResponse,
  agentCommerceOk,
  agentCommerceRequestId,
  guardAgentCommerceSurface,
} from '@/lib/agent-commerce/api'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import { verifyAgentCommerceInternalAuth } from '@/lib/agent-commerce/internal-auth'
import { getAgentSpendRequest } from '@/lib/db/agent-commerce'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const paramsSchema = z.object({ id: z.string().uuid() })
const bodySchema = z.object({ orgId: z.string().uuid() })

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
    const spendRequest = await getAgentSpendRequest(id, body.orgId)
    if (!spendRequest) throw new AgentCommerceError('not_found', 'Spend request was not found.', 404)
    return agentCommerceOk({ spend_request: spendRequest }, requestId)
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}
