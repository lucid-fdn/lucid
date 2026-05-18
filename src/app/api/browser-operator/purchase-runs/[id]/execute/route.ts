import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withCSRF } from '@/lib/auth/csrf'
import { getUserId } from '@/lib/auth/server-utils'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import { requireAgentCommerceOrgMembership } from '@/lib/agent-commerce/operator-auth'
import {
  browserOperatorErrorResponse,
  browserOperatorOk,
  browserOperatorRequestId,
} from '@/lib/browser-operator/api'
import { executeAutonomousBrowserOperatorPurchase } from '@/lib/browser-operator/purchase-runs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const paramsSchema = z.object({ id: z.string().uuid() })
const bodySchema = z.object({
  orgId: z.string().uuid().optional(),
  org_id: z.string().uuid().optional(),
}).refine((value) => value.orgId || value.org_id, { message: 'orgId is required' })

export const POST = withCSRF(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  const requestId = browserOperatorRequestId(request)
  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const { id } = paramsSchema.parse(await context.params)
    const body = bodySchema.parse(await request.json())
    const orgId = body.orgId ?? body.org_id!
    await requireAgentCommerceOrgMembership(userId, orgId)

    const result = await executeAutonomousBrowserOperatorPurchase({
      orgId,
      purchaseRunId: id,
      actor: { type: 'user', id: userId, requestId },
    })

    return browserOperatorOk({
      purchase_run: result.purchaseRun,
      receipt_id: result.receiptId,
    }, requestId)
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}) as (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Promise<NextResponse | Response>
