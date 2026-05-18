import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { AgentCommerceProviderIdSchema } from '@contracts/agent-commerce'
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
import {
  evaluateAgentCommerceProviderHealthPromotionGuard,
  MANUAL_PROVIDER_LIVE_PROMOTION_EVIDENCE,
} from '@/lib/agent-commerce/provider-promotion'
import {
  listAgentCommerceProviderManifests,
  listAgentCommerceProviders,
  registerDefaultAgentCommerceProviders,
} from '@/lib/agent-commerce/provider-registry'
import { captureAgentCommerceError } from '@/lib/agent-commerce/observability'
import { appendAgentCommerceEvent, recordAgentCommerceProviderHealth } from '@/lib/db/agent-commerce'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const paramsSchema = z.object({
  provider: AgentCommerceProviderIdSchema,
})

const bodySchema = z.object({
  orgId: z.string().uuid(),
  mode: z.enum(['live', 'preview', 'waitlist', 'disabled']),
  status: z.enum(['healthy', 'degraded', 'disabled']),
  reason: z.string().max(500).optional(),
})

export const POST = withCSRF(async (
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) => {
  const guard = guardAgentCommerceSurface('wallets', request)
  if (guard) return guard
  const requestId = agentCommerceRequestId(request)

  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const { provider } = paramsSchema.parse(await context.params)
    const body = bodySchema.parse(await request.json())
    await requireAgentCommerceOrgWriteAccess(userId, body.orgId)
    registerDefaultAgentCommerceProviders()

    const promotionGuard = evaluateAgentCommerceProviderHealthPromotionGuard({
      providerId: provider,
      requestedMode: body.mode,
      manifests: listAgentCommerceProviderManifests(),
      registeredProviderIds: listAgentCommerceProviders().map((item) => item.manifest.id),
      evidence: {
        manual: [...MANUAL_PROVIDER_LIVE_PROMOTION_EVIDENCE],
      },
    })
    if (!promotionGuard.allowed) {
      try {
        await appendAgentCommerceEvent({
          org_id: body.orgId,
          entity_type: 'provider_health',
          entity_id: randomUUID(),
          event_type: 'provider_promotion.blocked',
          provider,
          actor_type: 'user',
          actor_id: userId,
          request_id: requestId,
          payload: {
            requested_mode: body.mode,
            requested_status: body.status,
            blockers: promotionGuard.promotion?.blockers ?? [],
            missing_evidence: promotionGuard.promotion?.missingEvidence ?? [],
            reason: promotionGuard.reason,
          },
        })
      } catch (auditError) {
        captureAgentCommerceError(auditError, {
          operation: 'provider_promotion_blocked_audit',
          surface: 'mission_control_provider_health',
          provider,
          status: 'audit_failed',
          context: {
            request_id: requestId,
            reason: promotionGuard.reason,
          },
        })
      }
      throw new AgentCommerceError(
        'forbidden',
        'Provider cannot be marked live until Agent Commerce promotion evidence is complete.',
        403,
        {
          details: {
            reason_code: 'provider_promotion_blocked',
            provider,
            requested_mode: body.mode,
            blockers: promotionGuard.promotion?.blockers ?? [],
            missing_evidence: promotionGuard.promotion?.missingEvidence ?? [],
            reason: promotionGuard.reason,
          },
        },
      )
    }

    const health = await recordAgentCommerceProviderHealth({
      provider,
      mode: body.mode,
      status: body.status,
      success: body.status === 'healthy',
      metadata: {
        last_operator_id: userId,
        last_operator_reason: body.reason,
        request_id: requestId,
      },
    })

    return agentCommerceOk({ provider_health: health }, requestId)
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}) as (
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) => Promise<NextResponse | Response>
