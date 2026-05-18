import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import { requireAgentCommerceOrgMembership } from '@/lib/agent-commerce/operator-auth'
import {
  browserOperatorErrorResponse,
  browserOperatorOk,
  browserOperatorRequestId,
} from '@/lib/browser-operator/api'
import { listBrowserOperatorCheckoutAdapterManifests } from '@/lib/browser-operator/checkout-adapters'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const querySchema = z.object({
  orgId: z.string().uuid(),
})

export async function GET(request: NextRequest) {
  const requestId = browserOperatorRequestId(request)
  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const query = querySchema.parse({
      orgId: request.nextUrl.searchParams.get('orgId'),
    })
    await requireAgentCommerceOrgMembership(userId, query.orgId)
    return browserOperatorOk({
      checkout_adapters: listBrowserOperatorCheckoutAdapterManifests(),
    }, requestId)
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}
