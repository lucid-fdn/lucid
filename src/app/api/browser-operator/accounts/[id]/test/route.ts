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
import { refreshBrowserOperatorAccountHealth } from '@/lib/browser-operator/alerts'
import {
  getBrowserOperatorAccount,
  listBrowserOperatorProfiles,
  recordBrowserOperatorAuditEvent,
} from '@/lib/db/browser-operator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const paramsSchema = z.object({ id: z.string().uuid() })
const bodySchema = z.object({
  orgId: z.string().uuid().optional(),
  org_id: z.string().uuid().optional(),
  workspaceSlug: z.string().min(1).max(255).optional(),
  workspace_slug: z.string().min(1).max(255).optional(),
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

    const account = await getBrowserOperatorAccount({ orgId, accountId: id })
    if (!account) throw new AgentCommerceError('not_found', 'Browser Operator account not found.', 404)
    const profiles = await listBrowserOperatorProfiles({
      orgId,
      browserAccountId: account.id,
      limit: 5,
    })
    const result = await refreshBrowserOperatorAccountHealth({
      orgId,
      userId,
      account,
      profiles,
      workspaceSlug: body.workspaceSlug ?? body.workspace_slug,
      metadata: {
        source: 'browser_operator_account_health_test_api',
        request_id: requestId,
        ...(body.metadata ?? {}),
      },
    })

    await recordBrowserOperatorAuditEvent({
      orgId,
      browserAccountId: account.id,
      actorType: 'user',
      actorId: userId,
      eventType: 'account.health_tested',
      severity: result.snapshot.health_state === 'ready' ? 'info' : 'warn',
      result: result.snapshot.health_state,
      metadata: {
        score: result.snapshot.score,
        alert_id: result.alert?.id ?? null,
      },
    })

    return browserOperatorOk({
      account,
      account_health: result.snapshot,
      alert: result.alert,
    }, requestId)
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}) as (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Promise<NextResponse | Response>
