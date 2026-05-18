import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withCSRF } from '@/lib/auth/csrf'
import { getUserId } from '@/lib/auth/server-utils'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import { requireAgentCommerceOrgWriteAccess } from '@/lib/agent-commerce/operator-auth'
import {
  browserOperatorErrorResponse,
  browserOperatorOk,
  browserOperatorRequestId,
} from '@/lib/browser-operator/api'
import {
  getBrowserOperatorAccount,
} from '@/lib/db/browser-operator'
import { requestBrowserOperatorSecureTakeover } from '@/lib/browser-operator/provider-connections'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const paramsSchema = z.object({ id: z.string().uuid() })
const bodySchema = z.object({
  orgId: z.string().uuid().optional(),
  org_id: z.string().uuid().optional(),
  return_url: z.string().url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => value.orgId || value.org_id, {
  message: 'orgId is required',
})

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
    await requireAgentCommerceOrgWriteAccess(userId, orgId)

    const existing = await getBrowserOperatorAccount({ orgId, accountId: id })
    if (!existing) throw new AgentCommerceError('not_found', 'Browser Operator account not found.', 404)

    const connectSession = await requestBrowserOperatorSecureTakeover({
      orgId,
      userId,
      account: existing,
      returnUrl: body.return_url,
      metadata: body.metadata,
    })

    return browserOperatorOk({
      account: existing,
      connect_session: {
        ...connectSession,
        mode: 'secure_browser_takeover',
        reason: connectSession.takeover_url
          ? 'Open the secure takeover URL once, log in to the merchant, then Lucid can reuse the provider profile/context.'
          : 'Provider session is ready, but no takeover URL was returned. Check provider live-view configuration.',
      },
    }, requestId, { status: 202 })
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}) as (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Promise<NextResponse | Response>
