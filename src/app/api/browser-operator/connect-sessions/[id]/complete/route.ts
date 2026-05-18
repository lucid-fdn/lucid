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
  createBrowserOperatorProfile,
  getBrowserOperatorAccount,
  getBrowserOperatorConnectSession,
  recordBrowserOperatorAuditEvent,
  updateBrowserOperatorAccount,
  updateBrowserOperatorConnectSession,
} from '@/lib/db/browser-operator'
import { maskIdentifier, summarizeError } from '@/lib/logging/safe-log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const paramsSchema = z.object({ id: z.string().uuid() })
const bodySchema = z.object({
  orgId: z.string().uuid().optional(),
  org_id: z.string().uuid().optional(),
  verified: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional(),
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
    await requireAgentCommerceOrgWriteAccess(userId, orgId)

    const existing = await getBrowserOperatorConnectSession({ orgId, connectSessionId: id })
    if (!existing) throw new AgentCommerceError('not_found', 'Browser Operator connect session not found.', 404)
    const existingAccount = await getBrowserOperatorAccount({
      orgId,
      accountId: existing.browser_account_id,
    })
    if (!existingAccount) throw new AgentCommerceError('not_found', 'Browser Operator account not found.', 404)
    if (!['provider_ready', 'active'].includes(existing.status)) {
      throw new AgentCommerceError('invalid_state_transition', `Cannot complete connect session from ${existing.status}.`, 409)
    }

    const connectedAt = new Date().toISOString()
    const connectSession = await updateBrowserOperatorConnectSession({
      orgId,
      connectSessionId: id,
      patch: {
        status: body.verified ? 'connected' : 'failed',
        connected_at: body.verified ? connectedAt : undefined,
        failure_reason: body.verified ? undefined : 'Operator marked secure takeover as not verified.',
        metadata: {
          ...(existing.metadata ?? {}),
          completed_by_user_id: userId,
          completed_at: connectedAt,
          verified: body.verified,
          ...(body.metadata ?? {}),
        },
      },
    })

    const account = await updateBrowserOperatorAccount({
      orgId,
      accountId: existing.browser_account_id,
      patch: {
        auth_state: body.verified ? 'connected' : 'failed',
        provider_profile_ref: existing.provider_profile_ref,
        provider_context_ref: existing.provider_context_ref,
        last_verified_at: body.verified ? connectedAt : undefined,
        metadata: {
          ...(existingAccount.metadata ?? {}),
          latest_connect_session_id: existing.id,
          latest_connect_session_status: connectSession.status,
          secure_takeover_completed_at: body.verified ? connectedAt : null,
        },
      },
    })

    const profile = body.verified
      ? await createBrowserOperatorProfile({
          org_id: orgId,
          user_id: userId,
          browser_account_id: existing.browser_account_id,
          provider: existing.provider,
          provider_profile_ref: existing.provider_profile_ref,
          provider_context_ref: existing.provider_context_ref,
          status: 'active',
          last_verified_at: connectedAt,
          metadata: {
            source: 'secure_takeover_complete',
            connect_session_id: existing.id,
          },
        }).catch((error) => {
          console.warn('[browser-operator]', {
            event: 'profile_create_failed',
            orgId: maskIdentifier(orgId),
            browserAccountId: maskIdentifier(existing.browser_account_id),
            error: summarizeError(error),
          })
          return null
        })
      : null

    await recordBrowserOperatorAuditEvent({
      orgId,
      browserAccountId: existing.browser_account_id,
      actorType: 'user',
      actorId: userId,
      eventType: body.verified ? 'connect_session.connected' : 'connect_session.failed',
      severity: body.verified ? 'info' : 'error',
      result: connectSession.status,
      metadata: {
        connect_session_id: existing.id,
        provider: existing.provider,
      },
    })

    await refreshBrowserOperatorAccountHealth({
      orgId,
      userId,
      account,
      profiles: profile ? [profile] : [],
      metadata: {
        source: 'secure_takeover_complete',
        connect_session_id: existing.id,
      },
    }).catch((error) => {
      console.warn('[browser-operator]', {
        event: 'account_health_refresh_failed',
        orgId: maskIdentifier(orgId),
        browserAccountId: maskIdentifier(existing.browser_account_id),
        error: summarizeError(error),
      })
    })

    return browserOperatorOk({ connect_session: connectSession, account, profile }, requestId)
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}) as (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Promise<NextResponse | Response>
