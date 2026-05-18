import 'server-only'

import type { AgentCommerceMerchant, AgentCommerceProviderId } from '@contracts/agent-commerce'

export const STRIPE_ISSUING_API_VERSION = '2026-02-25.clover'
export const STRIPE_ISSUING_AUTHORIZATION_REQUEST_EVENT = 'issuing_authorization.request'

export type StripeIssuingAuthorizationDecisionReason =
  | 'approved'
  | 'feature_disabled'
  | 'lookup_failed'
  | 'authorization_data_missing'
  | 'invalid_provider_rail'
  | 'invalid_spend_state'
  | 'currency_mismatch'
  | 'amount_exceeds_limit'
  | 'policy_denied'
  | 'risk_manual_review'
  | 'internal_error'

export interface StripeIssuingAuthorizationRequest {
  event_id?: string
  livemode?: boolean
  authorization_id?: string
  org_id?: string
  spend_request_id?: string
  amount?: number
  currency?: string
  is_amount_controllable: boolean
  merchant: AgentCommerceMerchant
  risk_score?: number
  metadata: Record<string, unknown>
}

export interface StripeIssuingAuthorizationDecision {
  approved: boolean
  reason: StripeIssuingAuthorizationDecisionReason
  provider: Extract<AgentCommerceProviderId, 'stripe_issuing'>
  authorization_id?: string
  org_id?: string
  spend_request_id?: string
  amount?: number
  currency?: string
  metadata: Record<string, string>
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function metadataString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function metadataNumber(metadata: Record<string, unknown>, key: string): number | undefined {
  const value = metadata[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function safeMetadataValue(value: unknown): string | undefined {
  if (value == null) return undefined
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  return raw?.slice(0, 500)
}

function normalizedCurrency(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : undefined
}

function positiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10)
    return parsed > 0 ? parsed : undefined
  }
  return undefined
}

function mergedStripeIssuingMetadata(object: Record<string, unknown>): Record<string, unknown> {
  const card = objectRecord(object.card)
  return {
    ...objectRecord(card.metadata),
    ...objectRecord(object.metadata),
  }
}

function stripeIssuingMerchant(
  object: Record<string, unknown>,
  metadata: Record<string, unknown>,
): AgentCommerceMerchant {
  const merchantData = objectRecord(object.merchant_data)
  const rawName = String(
    merchantData.name
      ?? metadataString(metadata, 'merchant_name')
      ?? metadataString(metadata, 'seller_name')
      ?? '',
  ).trim()
  const name = (rawName || 'Unknown merchant').slice(0, 160)

  const domain = metadataString(metadata, 'merchant_domain')
    ?? metadataString(metadata, 'seller_domain')
    ?? undefined
  const country = typeof merchantData.country === 'string' && /^[a-z]{2}$/i.test(merchantData.country)
    ? merchantData.country.toUpperCase()
    : undefined
  const category = typeof merchantData.category === 'string'
    ? merchantData.category.slice(0, 120)
    : undefined

  return {
    name,
    ...(domain ? { domain } : {}),
    ...(country ? { country } : {}),
    ...(category ? { category } : {}),
  }
}

export function parseStripeIssuingAuthorizationRequest(
  event: Record<string, unknown>,
): StripeIssuingAuthorizationRequest {
  const data = objectRecord(event.data)
  const object = objectRecord(data.object)
  const pendingRequest = objectRecord(object.pending_request)
  const metadata = mergedStripeIssuingMetadata(object)
  const amount = positiveInt(pendingRequest.amount)
    ?? positiveInt(object.merchant_amount)
    ?? positiveInt(object.amount)
  const currency = normalizedCurrency(pendingRequest.currency)
    ?? normalizedCurrency(object.merchant_currency)
    ?? normalizedCurrency(object.currency)
  const riskScore = metadataNumber(metadata, 'risk_score')
    ?? metadataNumber(objectRecord(object.fraud_details), 'risk_score')
    ?? metadataNumber(object, 'risk_score')

  return {
    event_id: typeof event.id === 'string' ? event.id : undefined,
    livemode: typeof event.livemode === 'boolean' ? event.livemode : undefined,
    authorization_id: typeof object.id === 'string' ? object.id : undefined,
    org_id: metadataString(metadata, 'org_id'),
    spend_request_id: metadataString(metadata, 'agent_spend_request_id')
      ?? metadataString(metadata, 'spend_request_id')
      ?? metadataString(metadata, 'lucid_spend_request_id'),
    amount,
    currency,
    is_amount_controllable: objectRecord(object.pending_request).is_amount_controllable === true,
    merchant: stripeIssuingMerchant(object, metadata),
    risk_score: riskScore,
    metadata,
  }
}

export function createStripeIssuingAuthorizationDecision(params: {
  approved: boolean
  reason: StripeIssuingAuthorizationDecisionReason
  request: StripeIssuingAuthorizationRequest
  amount?: number
  metadata?: Record<string, unknown>
}): StripeIssuingAuthorizationDecision {
  const metadata: Record<string, string> = {
    lucid_decision: params.approved ? 'approved' : 'declined',
    lucid_reason: params.reason,
  }
  if (params.request.org_id) metadata.org_id = params.request.org_id
  if (params.request.spend_request_id) metadata.agent_spend_request_id = params.request.spend_request_id
  if (params.request.authorization_id) metadata.stripe_authorization_id = params.request.authorization_id
  for (const [key, value] of Object.entries(params.metadata ?? {})) {
    const safe = safeMetadataValue(value)
    if (safe !== undefined) metadata[`lucid_${key.replace(/[^a-zA-Z0-9_]/g, '_')}`.slice(0, 40)] = safe
  }

  return {
    approved: params.approved,
    reason: params.reason,
    provider: 'stripe_issuing',
    authorization_id: params.request.authorization_id,
    org_id: params.request.org_id,
    spend_request_id: params.request.spend_request_id,
    amount: params.amount,
    currency: params.request.currency,
    metadata,
  }
}

export function stripeIssuingAuthorizationWebhookBody(
  decision: StripeIssuingAuthorizationDecision,
): {
  approved: boolean
  amount?: number
  metadata: Record<string, string>
} {
  return {
    approved: decision.approved,
    ...(decision.approved && decision.amount ? { amount: decision.amount } : {}),
    metadata: decision.metadata,
  }
}
