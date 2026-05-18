import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { UpdateBrowserOperatorPurchasePolicySchema } from '@contracts/browser-operator'
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
  getBrowserOperatorPurchasePolicy,
  updateBrowserOperatorPurchasePolicy,
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
    const policy = await getBrowserOperatorPurchasePolicy({ orgId: query.orgId, policyId: id })
    if (!policy) throw new AgentCommerceError('not_found', 'Browser Operator purchase policy not found.', 404)
    return browserOperatorOk({ policy }, requestId)
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
    const patch = UpdateBrowserOperatorPurchasePolicySchema.parse(body.patch ?? body)
    await requireAgentCommerceOrgWriteAccess(userId, query.orgId)
    const policy = await updateBrowserOperatorPurchasePolicy({
      orgId: query.orgId,
      policyId: id,
      patch,
    })
    return browserOperatorOk({ policy }, requestId)
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
    const policy = await updateBrowserOperatorPurchasePolicy({
      orgId: query.orgId,
      policyId: id,
      patch: { status: 'revoked' },
    })
    return browserOperatorOk({ policy, revoked: true }, requestId)
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}) as (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Promise<NextResponse | Response>
