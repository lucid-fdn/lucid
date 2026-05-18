import { NextRequest, NextResponse } from 'next/server'
import {
  agentCommerceErrorResponse,
  agentCommerceOk,
  agentCommerceRequestId,
  guardAgentCommerceSurface,
} from '@/lib/agent-commerce/api'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import {
  STRIPE_ISSUING_API_VERSION,
  STRIPE_ISSUING_AUTHORIZATION_REQUEST_EVENT,
  createStripeIssuingAuthorizationDecision,
  parseStripeIssuingAuthorizationRequest,
  stripeIssuingAuthorizationWebhookBody,
} from '@/lib/agent-commerce/providers/stripe-issuing'
import {
  extractWebhookOrgId,
  normalizeAgentCommerceWebhookEntity,
  verifyStripeAgentCommerceWebhook,
} from '@/lib/agent-commerce/webhooks'
import {
  applyStripeAgentCommerceProviderEvent,
  decideStripeIssuingAuthorizationRequest,
} from '@/lib/agent-commerce/service'
import { appendAgentCommerceEvent } from '@/lib/db/agent-commerce'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function stripeProviderForEvent(eventType: string): 'stripe_issuing' | 'stripe_link_agents' | 'stripe_shared_payment_tokens' {
  if (eventType.startsWith('issuing_authorization.')) return 'stripe_issuing'
  if (
    eventType.startsWith('v2.orchestrated_commerce.')
    || eventType.startsWith('v2.commerce.')
    || eventType.startsWith('agentic_commerce.')
    || eventType.startsWith('requested_session.')
    || eventType.startsWith('checkout.session.')
  ) {
    return 'stripe_link_agents'
  }
  return 'stripe_shared_payment_tokens'
}

function stripeIssuingResponse(
  body: ReturnType<typeof stripeIssuingAuthorizationWebhookBody>,
  requestId: string,
): NextResponse {
  return NextResponse.json(body, {
    status: 200,
    headers: {
      'stripe-version': process.env.STRIPE_API_VERSION?.trim() || STRIPE_ISSUING_API_VERSION,
      'x-request-id': requestId,
    },
  })
}

function appliedStripeLinkEntity(applied: Awaited<ReturnType<typeof applyStripeAgentCommerceProviderEvent>>) {
  if (!applied?.id) return null
  return 'provider_connection_id' in applied
    ? { entity_type: 'connection' as const, entity_id: applied.id, matched: true }
    : { entity_type: 'spend_request' as const, entity_id: applied.id, matched: true }
}

export async function POST(request: NextRequest) {
  const requestId = agentCommerceRequestId(request)

  try {
    const payload = await request.text()
    verifyStripeAgentCommerceWebhook({
      payload,
      signatureHeader: request.headers.get('stripe-signature'),
      secret: process.env.STRIPE_AGENT_COMMERCE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET,
    })
    const event = JSON.parse(payload) as Record<string, unknown>
    const eventType = typeof event.type === 'string' ? event.type : 'unknown'

    if (eventType === STRIPE_ISSUING_AUTHORIZATION_REQUEST_EVENT) {
      const decision = await decideStripeIssuingAuthorizationRequest(event, {
        type: 'provider',
        requestId,
      }).catch((error) => createStripeIssuingAuthorizationDecision({
        approved: false,
        reason: 'internal_error',
        request: parseStripeIssuingAuthorizationRequest(event),
        metadata: { error_code: error instanceof Error ? error.name : 'unknown' },
      }))

      return stripeIssuingResponse(stripeIssuingAuthorizationWebhookBody(decision), requestId)
    }

    const provider = stripeProviderForEvent(eventType)
    const guard = guardAgentCommerceSurface(
      provider === 'stripe_issuing' || provider === 'stripe_link_agents' ? 'wallets' : 'seller',
      request,
    )
    if (guard) return guard

    const initialOrgId = extractWebhookOrgId(event)
    const normalizedEntity = normalizeAgentCommerceWebhookEntity(event)

    if (initialOrgId) {
      await appendAgentCommerceEvent({
        org_id: initialOrgId,
        entity_type: normalizedEntity.entity_type,
        entity_id: normalizedEntity.entity_id,
        event_type: `stripe.${eventType}`,
        provider,
        provider_event_id: typeof event.id === 'string' ? event.id : undefined,
        actor_type: 'provider',
        request_id: requestId,
        payload: {
          stackId: 'commerce',
          provider: 'stripe',
          event_type: eventType,
          livemode: event.livemode,
          matched_entity: normalizedEntity.matched,
        },
      })
    }

    if (provider === 'stripe_issuing') {
      return agentCommerceOk({ received: true }, requestId)
    }

    const applied = await applyStripeAgentCommerceProviderEvent(event, {
      type: 'provider',
      requestId,
    })

    if (!initialOrgId) {
      const orgId = applied?.org_id
      if (!orgId) throw new AgentCommerceError('validation_failed', 'Stripe webhook event is missing metadata.org_id.', 400)
      const stripeLinkEntity = provider === 'stripe_link_agents' ? appliedStripeLinkEntity(applied) : null
      const entity = stripeLinkEntity ?? (applied?.id
        ? { entity_type: 'seller_grant' as const, entity_id: applied.id, matched: true }
        : normalizedEntity)

      await appendAgentCommerceEvent({
        org_id: orgId,
        entity_type: entity.entity_type,
        entity_id: entity.entity_id,
        event_type: `stripe.${eventType}`,
        provider,
        provider_event_id: typeof event.id === 'string' ? event.id : undefined,
        actor_type: 'provider',
        request_id: requestId,
        payload: {
          stackId: 'commerce',
          provider: 'stripe',
          event_type: eventType,
          livemode: event.livemode,
          matched_entity: entity.matched,
          matched_after_provider_lookup: true,
        },
      })
    }

    const appliedConnectionId = applied && 'provider_connection_id' in applied ? applied.id : undefined
    const appliedSpendRequestId = provider === 'stripe_link_agents' && applied && !('provider_connection_id' in applied)
      ? applied.id
      : undefined
    const appliedGrantId = provider !== 'stripe_link_agents' ? applied?.id : undefined

    return agentCommerceOk({
      received: true,
      applied_entity_id: applied?.id,
      ...(appliedConnectionId ? { applied_connection_id: appliedConnectionId } : {}),
      ...(appliedSpendRequestId ? { applied_spend_request_id: appliedSpendRequestId } : {}),
      ...(appliedGrantId ? { applied_grant_id: appliedGrantId } : {}),
    }, requestId)
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}
