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
import { requireAgentCommerceOrgWriteAccess } from '@/lib/agent-commerce/operator-auth'
import { runAgentCommerceReconciliation } from '@/lib/agent-commerce/reconciliation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const bodySchema = z.object({
  orgId: z.string().uuid(),
})

export const POST = withCSRF(async (request: NextRequest) => {
  const guard = guardAgentCommerceSurface('wallets', request)
  if (guard) return guard
  const requestId = agentCommerceRequestId(request)

  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const body = bodySchema.parse(await request.json())
    await requireAgentCommerceOrgWriteAccess(userId, body.orgId)
    const result = await runAgentCommerceReconciliation({
      orgId: body.orgId,
      actor: { type: 'user', id: userId, requestId },
    })
    return agentCommerceOk({ reconciliation: result }, requestId)
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}) as (request: NextRequest) => Promise<NextResponse | Response>
