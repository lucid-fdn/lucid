import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { CreateBrowserOperatorProfileSchema } from '@contracts/browser-operator'
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
  createBrowserOperatorProfile,
  listBrowserOperatorProfiles,
} from '@/lib/db/browser-operator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const querySchema = z.object({
  orgId: z.string().uuid(),
  browserAccountId: z.string().uuid().optional(),
  status: z.enum(['active', 'degraded', 'expired', 'migration_required', 'revoked']).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
})

export async function GET(request: NextRequest) {
  const requestId = browserOperatorRequestId(request)
  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const query = querySchema.parse({
      orgId: request.nextUrl.searchParams.get('orgId'),
      browserAccountId: request.nextUrl.searchParams.get('browserAccountId') ?? undefined,
      status: request.nextUrl.searchParams.get('status') ?? undefined,
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    })
    await requireAgentCommerceOrgMembership(userId, query.orgId)
    const profiles = await listBrowserOperatorProfiles({
      orgId: query.orgId,
      browserAccountId: query.browserAccountId,
      status: query.status,
      limit: query.limit,
    })
    return browserOperatorOk({ profiles }, requestId)
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
    const input = CreateBrowserOperatorProfileSchema.parse({
      ...body,
      user_id: body.user_id ?? userId,
    })
    await requireAgentCommerceOrgMembership(userId, input.org_id)
    const profile = await createBrowserOperatorProfile(input)
    return browserOperatorOk({ profile }, requestId, { status: 201 })
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}) as (request: NextRequest) => Promise<NextResponse | Response>
