import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { UpdateBrowserOperatorAccountSchema } from '@contracts/browser-operator'
import { withCSRF } from '@/lib/auth/csrf'
import { getUserId } from '@/lib/auth/server-utils'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import {
  requireAgentCommerceOrgMembership,
  requireAgentCommerceOrgWriteAccess,
} from '@/lib/agent-commerce/operator-auth'
import {
  browserOperatorErrorResponse,
  browserOperatorOk,
  browserOperatorRequestId,
} from '@/lib/browser-operator/api'
import {
  getBrowserOperatorAccount,
  updateBrowserOperatorAccount,
} from '@/lib/db/browser-operator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const paramsSchema = z.object({ id: z.string().uuid() })
const querySchema = z.object({ orgId: z.string().uuid() })

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = browserOperatorRequestId(request)
  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const { id } = paramsSchema.parse(await context.params)
    const query = querySchema.parse({ orgId: request.nextUrl.searchParams.get('orgId') })
    await requireAgentCommerceOrgMembership(userId, query.orgId)
    const account = await getBrowserOperatorAccount({ orgId: query.orgId, accountId: id })
    if (!account) throw new AgentCommerceError('not_found', 'Browser Operator account not found.', 404)
    return browserOperatorOk({ account }, requestId)
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}

export const PATCH = withCSRF(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  const requestId = browserOperatorRequestId(request)
  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const { id } = paramsSchema.parse(await context.params)
    const body = await request.json()
    const query = querySchema.parse({ orgId: body.orgId ?? body.org_id })
    const patch = UpdateBrowserOperatorAccountSchema.parse(body.patch ?? body)
    await requireAgentCommerceOrgWriteAccess(userId, query.orgId)
    const account = await updateBrowserOperatorAccount({
      orgId: query.orgId,
      accountId: id,
      patch,
    })
    return browserOperatorOk({ account }, requestId)
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}) as (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Promise<NextResponse | Response>

export const DELETE = withCSRF(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  const requestId = browserOperatorRequestId(request)
  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const { id } = paramsSchema.parse(await context.params)
    const query = querySchema.parse({ orgId: request.nextUrl.searchParams.get('orgId') })
    await requireAgentCommerceOrgWriteAccess(userId, query.orgId)
    const account = await updateBrowserOperatorAccount({
      orgId: query.orgId,
      accountId: id,
      patch: { auth_state: 'revoked' },
    })
    return browserOperatorOk({ account, revoked: true }, requestId)
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}) as (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Promise<NextResponse | Response>
