import 'server-only'

import crypto from 'crypto'
import { AgentCommerceError } from './errors'
import type { AgentCommerceEventInput } from '@contracts/agent-commerce'

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

export function verifyStripeAgentCommerceWebhook(params: {
  payload: string
  signatureHeader: string | null
  secret?: string
}): void {
  const secret = params.secret?.trim()
  if (!secret) {
    throw new AgentCommerceError('unauthorized', 'Stripe Agent Commerce webhook secret is not configured.', 401)
  }
  const header = params.signatureHeader ?? ''
  const timestamp = header.split(',').find((part) => part.startsWith('t='))?.slice(2)
  const signatures = header
    .split(',')
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3))

  if (!timestamp || signatures.length === 0) {
    throw new AgentCommerceError('unauthorized', 'Invalid Stripe webhook signature header.', 401)
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number.parseInt(timestamp, 10))
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    throw new AgentCommerceError('unauthorized', 'Stripe webhook timestamp is outside tolerance.', 401)
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${params.payload}`)
    .digest('hex')

  if (!signatures.some((signature) => timingSafeEqualHex(signature, expected))) {
    throw new AgentCommerceError('unauthorized', 'Invalid Stripe webhook signature.', 401)
  }
}

export function verifyGenericAgentCommerceWebhook(params: {
  payload: string
  signatureHeader: string | null
  secret?: string
}): void {
  const secret = params.secret?.trim()
  if (!secret) {
    throw new AgentCommerceError('unauthorized', 'Agent Commerce webhook secret is not configured.', 401)
  }
  const signature = params.signatureHeader?.trim()
  if (!signature) {
    throw new AgentCommerceError('unauthorized', 'Missing Agent Commerce webhook signature.', 401)
  }
  const expected = crypto.createHmac('sha256', secret).update(params.payload).digest('hex')
  if (!timingSafeEqualHex(signature, expected)) {
    throw new AgentCommerceError('unauthorized', 'Invalid Agent Commerce webhook signature.', 401)
  }
}

export function extractWebhookOrgId(event: Record<string, unknown>): string | null {
  const data = event.data as Record<string, unknown> | undefined
  const object = data?.object as Record<string, unknown> | undefined
  const metadata = object?.metadata as Record<string, unknown> | undefined
  const card = object?.card as Record<string, unknown> | undefined
  const paymentIntent = object?.payment_intent as Record<string, unknown> | undefined
  const charge = object?.charge as Record<string, unknown> | undefined
  const cardMetadata = card && typeof card === 'object'
    ? card.metadata as Record<string, unknown> | undefined
    : undefined
  const paymentIntentMetadata = paymentIntent && typeof paymentIntent === 'object'
    ? paymentIntent.metadata as Record<string, unknown> | undefined
    : undefined
  const chargeMetadata = charge && typeof charge === 'object'
    ? charge.metadata as Record<string, unknown> | undefined
    : undefined
  const orgId = metadata?.org_id ?? cardMetadata?.org_id ?? paymentIntentMetadata?.org_id ?? chargeMetadata?.org_id ?? event.org_id
  return typeof orgId === 'string' ? orgId : null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function webhookObject(event: Record<string, unknown>): Record<string, unknown> {
  const data = event.data as Record<string, unknown> | undefined
  const object = data?.object
  return object && typeof object === 'object' && !Array.isArray(object)
    ? object as Record<string, unknown>
    : {}
}

function webhookMetadata(event: Record<string, unknown>): Record<string, unknown> {
  const object = webhookObject(event)
  const card = object.card && typeof object.card === 'object' && !Array.isArray(object.card)
    ? object.card as Record<string, unknown>
    : {}
  const cardMetadata = card.metadata && typeof card.metadata === 'object' && !Array.isArray(card.metadata)
    ? card.metadata as Record<string, unknown>
    : {}
  const metadata = object.metadata && typeof object.metadata === 'object' && !Array.isArray(object.metadata)
    ? object.metadata as Record<string, unknown>
    : {}
  return { ...cardMetadata, ...metadata }
}

function firstUuid(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && UUID_PATTERN.test(value)) return value
  }
  return null
}

export function normalizeAgentCommerceWebhookEntity(
  event: Record<string, unknown>,
): Pick<AgentCommerceEventInput, 'entity_type' | 'entity_id'> & { matched: boolean } {
  const object = webhookObject(event)
  const metadata = webhookMetadata(event)

  const spendRequestId = firstUuid(
    metadata.agent_spend_request_id,
    metadata.spend_request_id,
    object.agent_spend_request_id,
    object.spend_request_id,
    event.agent_spend_request_id,
    event.spend_request_id,
  )
  if (spendRequestId) {
    return { entity_type: 'spend_request', entity_id: spendRequestId, matched: true }
  }

  const sellerGrantId = firstUuid(
    metadata.seller_grant_id,
    object.seller_grant_id,
    event.seller_grant_id,
  )
  if (sellerGrantId) {
    return { entity_type: 'seller_grant', entity_id: sellerGrantId, matched: true }
  }

  const machineChallengeId = firstUuid(
    metadata.machine_challenge_id,
    metadata.challenge_id,
    object.machine_challenge_id,
    object.challenge_id,
    event.machine_challenge_id,
    event.challenge_id,
  )
  if (machineChallengeId) {
    return { entity_type: 'machine_challenge', entity_id: machineChallengeId, matched: true }
  }

  const proofClaimId = firstUuid(
    metadata.proof_claim_id,
    object.proof_claim_id,
    event.proof_claim_id,
  )
  if (proofClaimId) {
    return { entity_type: 'proof_claim', entity_id: proofClaimId, matched: true }
  }

  return { entity_type: 'provider_health', entity_id: crypto.randomUUID(), matched: false }
}
