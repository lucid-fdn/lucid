import { NextRequest } from 'next/server'
import { z } from 'zod'
import { AgentCommerceProviderIdSchema } from '@contracts/agent-commerce'
import {
  agentCommerceErrorResponse,
  agentCommerceOk,
  agentCommerceRequestId,
  guardAgentCommerceSurface,
} from '@/lib/agent-commerce/api'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import {
  extractWebhookOrgId,
  normalizeAgentCommerceWebhookEntity,
  verifyGenericAgentCommerceWebhook,
} from '@/lib/agent-commerce/webhooks'
import { appendAgentCommerceEvent } from '@/lib/db/agent-commerce'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const paramsSchema = z.object({ provider: AgentCommerceProviderIdSchema })

function surfaceForProvider(provider: z.infer<typeof AgentCommerceProviderIdSchema>): 'wallets' | 'seller' {
  return provider === 'stripe_link_agents' || provider === 'stripe_issuing' || provider === 'crypto_wallet'
    ? 'wallets'
    : 'seller'
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const requestId = agentCommerceRequestId(request)

  try {
    const { provider } = paramsSchema.parse(await context.params)
    const guard = guardAgentCommerceSurface(surfaceForProvider(provider), request)
    if (guard) return guard
    const payload = await request.text()
    verifyGenericAgentCommerceWebhook({
      payload,
      signatureHeader: request.headers.get('x-agent-commerce-signature'),
      secret: process.env.AGENT_COMMERCE_WEBHOOK_SECRET,
    })
    const event = JSON.parse(payload) as Record<string, unknown>
    const orgId = extractWebhookOrgId(event)
    if (!orgId) throw new AgentCommerceError('validation_failed', 'Webhook event is missing org_id or metadata.org_id.', 400)
    const entity = normalizeAgentCommerceWebhookEntity(event)

    await appendAgentCommerceEvent({
      org_id: orgId,
      entity_type: entity.entity_type,
      entity_id: entity.entity_id,
      event_type: `provider.${String(event.type ?? 'unknown')}`,
      provider,
      provider_event_id: typeof event.id === 'string' ? event.id : undefined,
      actor_type: 'provider',
      request_id: requestId,
      payload: {
        stackId: 'commerce',
        provider,
        event_type: event.type,
        matched_entity: entity.matched,
      },
    })

    return agentCommerceOk({ received: true }, requestId)
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}
