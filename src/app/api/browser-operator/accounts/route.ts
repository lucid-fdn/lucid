import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { CreateBrowserOperatorAccountSchema } from '@contracts/browser-operator'
import { withCSRF } from '@/lib/auth/csrf'
import { getUserId } from '@/lib/auth/server-utils'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import { requireAgentCommerceOrgMembership } from '@/lib/agent-commerce/operator-auth'
import {
  browserOperatorErrorResponse,
  browserOperatorOk,
  browserOperatorRequestId,
} from '@/lib/browser-operator/api'
import {
  createBrowserOperatorAccount,
  listBrowserOperatorAccounts,
} from '@/lib/db/browser-operator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const querySchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  merchantKey: z.string().min(1).max(160).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
})

export async function GET(request: NextRequest) {
  const requestId = browserOperatorRequestId(request)
  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const query = querySchema.parse({
      orgId: request.nextUrl.searchParams.get('orgId'),
      userId: request.nextUrl.searchParams.get('userId') ?? undefined,
      merchantKey: request.nextUrl.searchParams.get('merchantKey') ?? undefined,
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    })
    await requireAgentCommerceOrgMembership(userId, query.orgId)
    const accounts = await listBrowserOperatorAccounts({
      orgId: query.orgId,
      userId: query.userId,
      merchantKey: query.merchantKey,
      limit: query.limit,
    })
    return browserOperatorOk({ accounts }, requestId)
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}

export const POST = withCSRF(async (request: NextRequest) => {
  const requestId = browserOperatorRequestId(request)
  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const body = await request.json()
    const accountInput = CreateBrowserOperatorAccountSchema.parse({
      ...body,
      user_id: body.user_id ?? userId,
    })
    await requireAgentCommerceOrgMembership(userId, accountInput.org_id)
    const account = await createBrowserOperatorAccount(accountInput)
    return browserOperatorOk({ account }, requestId, { status: 201 })
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}) as (request: NextRequest) => Promise<NextResponse | Response>
