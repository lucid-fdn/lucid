import 'server-only'

import { randomUUID } from 'crypto'
import {
  AgentCommerceIntentSchema,
  CreateMachinePaymentChallengeSchema,
  MachinePaymentProofClaimInputSchema,
  SellerPaymentGrantSchema,
  type AgentCommerceConnection,
  type AgentCommerceConnectionStatus,
  type AgentCommerceCredential,
  type AgentCommerceIntentInput,
  type AgentSpendRequest,
  type CreateMachinePaymentChallenge,
  type MachinePaymentChallenge,
  type MachinePaymentProofClaim,
  type MachinePaymentProofClaimInput,
  type SellerPaymentGrant,
  type SellerPaymentGrantInput,
} from '@contracts/agent-commerce'
import {
  appendAgentCommerceEvent,
  assertAgentCommerceAssistantScope,
  claimAgentCommerceIdempotencyKey,
  claimMachinePaymentProof,
  completeAgentSpendRequestWithLedger,
  completeAgentCommerceIdempotencyKey,
  createAgentCommerceCredential,
  createAgentSpendRequest,
  createMachinePaymentChallenge,
  createSellerPaymentGrant,
  fulfillSellerPaymentGrantEntitlement,
  getAgentSpendRequest,
  getSellerPaymentGrant,
  getSellerPaymentGrantByProviderGrantId,
  getSellerPaymentGrantByProviderPaymentId,
  listAgentCommerceConnections,
  releaseAgentSpendBudget,
  reserveAgentSpendBudget,
  revokeSellerPaymentGrantEntitlement,
  transitionAgentSpendRequest,
  transitionSellerPaymentGrant,
  upsertAgentCommerceConnection,
} from '@/lib/db/agent-commerce'
import { AgentCommerceError } from './errors'
import {
  assertAgentCommerceEnabled,
  isAgentCommerceEnabled,
  isAgentCommerceKillSwitchActive,
  isAgentCommerceSellerEnabled,
  isAgentCommerceWalletsEnabled,
} from './feature-gates'
import { normalizeIdempotencyKey, requestHash } from './idempotency'
import {
  isSellerCommerceProvider,
  isWalletCommerceProvider,
} from './provider'
import {
  defaultAgentCommerceProviderManifests,
  getAgentCommerceProvider,
  registerDefaultAgentCommerceProviders,
} from './provider-registry'
import { evaluateAgentCommercePolicy } from './policy'
import { resolveCommerceRail } from './rail-router'
import {
  safeAgentCommerceErrorMessage,
  sanitizeAgentCommerceLogContext,
} from './observability'
import {
  createStripeIssuingAuthorizationDecision,
  parseStripeIssuingAuthorizationRequest,
  type StripeIssuingAuthorizationDecision,
  type StripeIssuingAuthorizationDecisionReason,
  type StripeIssuingAuthorizationRequest,
} from './providers/stripe-issuing'
import { STRIPE_LINK_AGENTS_PROVIDER_MANIFEST } from './providers/stripe-link'

export interface AgentCommerceActor {
  type: 'user' | 'agent' | 'runtime' | 'provider' | 'system'
  id?: string
  requestId?: string
}

export interface CreateSpendRequestResult {
  spendRequest: AgentSpendRequest
  idempotent: boolean
}

function eventActor(actor?: AgentCommerceActor): Pick<Parameters<typeof appendAgentCommerceEvent>[0], 'actor_type' | 'actor_id' | 'request_id'> {
  return {
    actor_type: actor?.type ?? 'system',
    actor_id: actor?.id,
    request_id: actor?.requestId,
  }
}

async function appendSpendEvent(
  spendRequest: AgentSpendRequest,
  eventType: string,
  actor?: AgentCommerceActor,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await appendAgentCommerceEvent({
    org_id: spendRequest.org_id,
    entity_type: 'spend_request',
    entity_id: spendRequest.id,
    event_type: eventType,
    provider: spendRequest.provider,
    run_id: spendRequest.run_id,
    payload: {
      stackId: 'commerce',
      status: spendRequest.status,
      ...(sanitizeAgentCommerceLogContext(payload) as Record<string, unknown>),
    },
    ...eventActor(actor),
  })
}

async function appendSellerGrantEvent(
  grant: SellerPaymentGrant,
  eventType: string,
  actor?: AgentCommerceActor,
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (!grant.id) return
  await appendAgentCommerceEvent({
    org_id: grant.org_id,
    entity_type: 'seller_grant',
    entity_id: grant.id,
    event_type: eventType,
    provider: grant.provider,
    payload: {
      stackId: 'commerce',
      status: grant.status,
      resource_type: grant.resource_type,
      ...(sanitizeAgentCommerceLogContext(payload) as Record<string, unknown>),
    },
    ...eventActor(actor),
  })
}

async function appendConnectionEvent(
  connection: AgentCommerceConnection,
  eventType: string,
  actor?: AgentCommerceActor,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await appendAgentCommerceEvent({
    org_id: connection.org_id,
    entity_type: 'connection',
    entity_id: connection.id,
    event_type: eventType,
    provider: connection.provider,
    payload: {
      stackId: 'commerce',
      status: connection.status,
      provider_account_id: connection.provider_account_id,
      provider_connection_id: connection.provider_connection_id,
      ...(sanitizeAgentCommerceLogContext(payload) as Record<string, unknown>),
    },
    ...eventActor(actor),
  })
}

async function activateSellerGrantEntitlement(
  grant: SellerPaymentGrant,
  actor?: AgentCommerceActor,
  payload: Record<string, unknown> = {},
): Promise<SellerPaymentGrant> {
  if (!grant.id || grant.status !== 'completed') return grant

  const entitlement = await fulfillSellerPaymentGrantEntitlement({
    id: grant.id,
    orgId: grant.org_id,
  })
  await appendAgentCommerceEvent({
    org_id: grant.org_id,
    entity_type: 'seller_entitlement',
    entity_id: entitlement.id,
    event_type: 'seller_entitlement.active',
    provider: grant.provider,
    payload: {
      stackId: 'commerce',
      seller_grant_id: grant.id,
      target_type: entitlement.target_type,
      target_id: entitlement.target_id,
      resource_type: entitlement.resource_type,
      ...(sanitizeAgentCommerceLogContext(payload) as Record<string, unknown>),
    },
    ...eventActor(actor),
  })
  await appendSellerGrantEvent(grant, 'seller_grant.entitlement_active', actor, {
    entitlement_id: entitlement.id,
    entitlement_ref: `${entitlement.target_type}:${entitlement.target_id ?? entitlement.id}`,
    target_type: entitlement.target_type,
    ...(sanitizeAgentCommerceLogContext(payload) as Record<string, unknown>),
  })

  return (await getSellerPaymentGrant(grant.id, grant.org_id)) ?? grant
}

async function revokeSellerGrantEntitlement(
  grant: SellerPaymentGrant,
  reason: string,
  actor?: AgentCommerceActor,
  payload: Record<string, unknown> = {},
): Promise<SellerPaymentGrant> {
  if (!grant.id) return grant
  const entitlement = await revokeSellerPaymentGrantEntitlement({
    id: grant.id,
    orgId: grant.org_id,
    reason,
    metadata: payload,
  })
  const updated = (await getSellerPaymentGrant(grant.id, grant.org_id)) ?? {
    ...grant,
    status: 'revoked' as const,
  }

  if (entitlement) {
    await appendAgentCommerceEvent({
      org_id: grant.org_id,
      entity_type: 'seller_entitlement',
      entity_id: entitlement.id,
      event_type: 'seller_entitlement.revoked',
      provider: grant.provider,
      payload: {
        stackId: 'commerce',
        seller_grant_id: grant.id,
        target_type: entitlement.target_type,
        target_id: entitlement.target_id,
        reason,
        ...(sanitizeAgentCommerceLogContext(payload) as Record<string, unknown>),
      },
      ...eventActor(actor),
    })
  }

  await appendSellerGrantEvent(updated, 'seller_grant.revoked', actor, {
    reason,
    entitlement_id: entitlement?.id,
    ...(sanitizeAgentCommerceLogContext(payload) as Record<string, unknown>),
  })
  return updated
}

function errorMessage(error: unknown): string {
  return safeAgentCommerceErrorMessage(error)
}

function metadataString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

export async function createAgentCommerceSpendRequest(
  input: AgentCommerceIntentInput,
  actor: AgentCommerceActor = { type: 'system' },
): Promise<CreateSpendRequestResult> {
  assertAgentCommerceEnabled('wallets')
  registerDefaultAgentCommerceProviders()

  const intent = AgentCommerceIntentSchema.parse({
    ...input,
    idempotency_key: normalizeIdempotencyKey(input.idempotency_key),
    created_at: input.created_at ?? new Date().toISOString(),
  })
  await assertAgentCommerceAssistantScope({
    orgId: intent.org_id,
    assistantId: intent.assistant_id,
    projectId: intent.project_id,
  })
  const hash = requestHash({
    ...intent,
    // Server-generated timestamps must not make normal idempotent retries look
    // like different spend requests.
    created_at: undefined,
  })
  const idempotency = await claimAgentCommerceIdempotencyKey({
    orgId: intent.org_id,
    operation: 'create_spend_request',
    idempotencyKey: intent.idempotency_key,
    requestHash: hash,
  })

  if (!idempotency.firstSeen) {
    if (idempotency.status === 'completed' && idempotency.entityType === 'spend_request' && idempotency.entityId) {
      const existing = await getAgentSpendRequest(idempotency.entityId, intent.org_id)
      if (existing) return { spendRequest: existing, idempotent: true }
    }
    throw new AgentCommerceError(
      'idempotency_conflict',
      'An Agent Commerce request with this Idempotency-Key is already in progress.',
      409,
    )
  }

  const connections = await listAgentCommerceConnections({
    orgId: intent.org_id,
    userId: intent.actor_user_id,
  })
  const routerDecision = resolveCommerceRail({
    intent,
    policy: intent.metadata.policy as never,
    userConnections: connections,
    providerManifests: defaultAgentCommerceProviderManifests(),
    features: {
      coreEnabled: isAgentCommerceEnabled(),
      walletsEnabled: isAgentCommerceWalletsEnabled(),
      sellerEnabled: isAgentCommerceSellerEnabled(),
      killSwitchActive: isAgentCommerceKillSwitchActive(),
    },
  })

  const spendRequest = await createAgentSpendRequest({
    org_id: intent.org_id,
    project_id: intent.project_id,
    assistant_id: intent.assistant_id,
    user_id: intent.actor_user_id,
    run_id: intent.run_id,
    tool_call_id: intent.tool_call_id,
    idempotency_key: intent.idempotency_key,
    provider: routerDecision.selected_provider ?? intent.preferred_provider ?? 'manual',
    rail: routerDecision.selected_rail ?? intent.preferred_rail ?? 'manual_approval',
    merchant: intent.merchant,
    amount: intent.amount,
    context: intent.purpose,
    policy: routerDecision.policy_snapshot,
    router_decision: routerDecision,
    expires_at: intent.expires_at,
    metadata: {
      ...intent.metadata,
      intent_id: intent.intent_id,
      requested_capabilities: intent.requested_capabilities,
      resource: intent.resource,
      seller: intent.seller,
    },
  })

  await appendSpendEvent(spendRequest, 'spend_request.created', actor, {
    router_decision: routerDecision,
  })
  await completeAgentCommerceIdempotencyKey({
    orgId: intent.org_id,
    operation: 'create_spend_request',
    idempotencyKey: intent.idempotency_key,
    entityType: 'spend_request',
    entityId: spendRequest.id,
  })

  return { spendRequest, idempotent: false }
}

export async function approveAgentCommerceSpendRequest(params: {
  id: string
  orgId: string
  userId: string
  requestId?: string
}): Promise<AgentSpendRequest> {
  assertAgentCommerceEnabled('wallets')
  const updated = await transitionAgentSpendRequest({
    id: params.id,
    orgId: params.orgId,
    status: 'approved',
    actorUserId: params.userId,
  })
  await appendSpendEvent(updated, 'spend_request.approved', {
    type: 'user',
    id: params.userId,
    requestId: params.requestId,
  })
  return updated
}

export async function cancelAgentCommerceSpendRequest(params: {
  id: string
  orgId: string
  actor: AgentCommerceActor
}): Promise<AgentSpendRequest> {
  assertAgentCommerceEnabled('wallets')
  const updated = await transitionAgentSpendRequest({
    id: params.id,
    orgId: params.orgId,
    status: 'cancelled',
  })
  await releaseAgentSpendBudget({
    spendRequestId: updated.id,
    orgId: updated.org_id,
    reason: 'spend_request_cancelled',
    metadata: { cancelled_by: params.actor.type },
  })
  await appendSpendEvent(updated, 'spend_request.cancelled', params.actor)
  return updated
}

export async function issueAgentCommerceCredential(params: {
  id: string
  orgId: string
  actor?: AgentCommerceActor
}): Promise<{ spendRequest: AgentSpendRequest; credential: unknown }> {
  assertAgentCommerceEnabled('wallets')
  registerDefaultAgentCommerceProviders()

  const spendRequest = await getAgentSpendRequest(params.id, params.orgId)
  if (!spendRequest) throw new AgentCommerceError('not_found', 'Spend request was not found.', 404)
  if (spendRequest.status !== 'approved') {
    throw new AgentCommerceError('invalid_state_transition', 'Credential issuance requires an approved spend request.', 409)
  }
  if (!spendRequest.idempotency_key) {
    throw new AgentCommerceError('idempotency_required', 'Credential issuance requires a reserved idempotent spend request.', 409)
  }
  if (spendRequest.approval_required && !spendRequest.approved_at) {
    throw new AgentCommerceError('invalid_state_transition', 'Credential issuance requires a recorded approval.', 409)
  }
  if (spendRequest.expires_at && new Date(spendRequest.expires_at).getTime() <= Date.now()) {
    const expired = await transitionAgentSpendRequest({
      id: spendRequest.id,
      orgId: spendRequest.org_id,
      status: 'expired',
      metadata: { expiry_reason: 'credential_issuance_after_expiry' },
    })
    await releaseAgentSpendBudget({
      spendRequestId: expired.id,
      orgId: expired.org_id,
      reason: 'spend_request_expired_before_credential',
      metadata: { expiry_reason: 'credential_issuance_after_expiry' },
    })
    await appendSpendEvent(expired, 'spend_request.expired', params.actor, {
      reason: 'credential_issuance_after_expiry',
    })
    throw new AgentCommerceError('invalid_state_transition', 'Spend request expired before credential issuance.', 409)
  }

  const provider = getAgentCommerceProvider(spendRequest.provider)
  if (!isWalletCommerceProvider(provider) || !provider.issueCredential) {
    throw new AgentCommerceError('provider_unavailable', 'Selected provider cannot issue credentials yet.', 503, { retryable: true })
  }

  const issuing = await transitionAgentSpendRequest({
    id: spendRequest.id,
    orgId: spendRequest.org_id,
    status: 'credential_issuing',
  })
  await appendSpendEvent(issuing, 'credential.issuing', params.actor)

  let reservation: Awaited<ReturnType<typeof reserveAgentSpendBudget>>
  try {
    reservation = await reserveAgentSpendBudget({
      spendRequestId: issuing.id,
      orgId: issuing.org_id,
      amountCents: issuing.amount.amount,
      currency: issuing.amount.currency,
      expiresAt: issuing.expires_at,
      metadata: {
        stackId: 'commerce',
        provider: issuing.provider,
        rail: issuing.rail,
        run_id: issuing.run_id,
      },
    })
  } catch (error) {
    const failed = await transitionAgentSpendRequest({
      id: issuing.id,
      orgId: issuing.org_id,
      status: 'failed',
      metadata: {
        failure_reason: 'budget_reservation_failed',
        reservation_error: errorMessage(error),
      },
    })
    await appendSpendEvent(failed, 'budget.failed', params.actor, {
      reason: 'budget_reservation_failed',
      error: errorMessage(error),
    })
    throw error
  }

  if (reservation.status !== 'reserved') {
    const failed = await transitionAgentSpendRequest({
      id: issuing.id,
      orgId: issuing.org_id,
      status: 'failed',
      metadata: {
        failure_reason: 'budget_reservation_unavailable',
        budget_reservation_status: reservation.status,
      },
    })
    await appendSpendEvent(failed, 'credential.failed', params.actor, {
      reason: 'budget_reservation_unavailable',
      budget_reservation_status: reservation.status,
    })
    throw new AgentCommerceError(
      'invalid_state_transition',
      'Budget reservation is not available for this spend request.',
      409,
    )
  }

  await appendSpendEvent(issuing, 'budget.reserved', params.actor, {
    budget_reservation_id: reservation.id,
    first_reservation: reservation.first_reservation,
  })

  let credential: AgentCommerceCredential
  try {
    credential = await provider.issueCredential(issuing, {
      requestId: params.actor?.requestId,
      orgId: spendRequest.org_id,
      projectId: spendRequest.project_id,
      assistantId: spendRequest.assistant_id,
      runId: spendRequest.run_id,
    })
  } catch (error) {
    await releaseAgentSpendBudget({
      spendRequestId: issuing.id,
      orgId: issuing.org_id,
      reason: 'provider_credential_issue_failed',
      metadata: { error: errorMessage(error) },
    })
    const failed = await transitionAgentSpendRequest({
      id: issuing.id,
      orgId: issuing.org_id,
      status: 'failed',
      metadata: {
        failure_reason: 'provider_credential_issue_failed',
        provider_error: errorMessage(error),
      },
    })
    await appendSpendEvent(failed, 'credential.failed', params.actor, {
      reason: 'provider_credential_issue_failed',
      error: errorMessage(error),
    })
    if (error instanceof AgentCommerceError) throw error
    throw new AgentCommerceError('provider_unavailable', errorMessage(error), 503, { retryable: true })
  }

  const persisted = await createAgentCommerceCredential(credential)
  const providerCredentialId = metadataString(persisted.metadata, 'provider_credential_id')
    ?? metadataString(persisted.metadata, 'provider_card_id')
    ?? persisted.secret_ref
  const updated = await transitionAgentSpendRequest({
    id: spendRequest.id,
    orgId: spendRequest.org_id,
    status: 'credential_issued',
    credentialKind: credential.kind,
    providerCredentialId,
  })
  await appendSpendEvent(updated, 'credential.issued', params.actor, {
    credential_id: persisted.id,
    credential_kind: credential.kind,
  })

  return { spendRequest: updated, credential: persisted }
}

export async function completeAgentCommerceSpendRequest(params: {
  id: string
  orgId: string
  actor?: AgentCommerceActor
  providerRequestId?: string
  providerCredentialId?: string
  metadata?: Record<string, unknown>
}): Promise<AgentSpendRequest> {
  assertAgentCommerceEnabled('wallets')
  if (!params.providerRequestId || !params.providerCredentialId) {
    throw new AgentCommerceError(
      'invalid_state_transition',
      'Spend requests can only be completed with provider request and credential evidence.',
      400,
    )
  }
  const updated = await completeAgentSpendRequestWithLedger({
    id: params.id,
    orgId: params.orgId,
    providerRequestId: params.providerRequestId,
    providerCredentialId: params.providerCredentialId,
    metadata: params.metadata,
  })
  await appendSpendEvent(updated, 'spend_request.completed', params.actor, params.metadata ?? {})
  return updated
}

export async function createAgentCommerceSellerGrant(
  input: SellerPaymentGrantInput,
  actor: AgentCommerceActor = { type: 'system' },
): Promise<SellerPaymentGrant> {
  assertAgentCommerceEnabled('seller')
  const parsed = SellerPaymentGrantSchema.parse(input)
  const grant = await createSellerPaymentGrant(parsed)
  await appendAgentCommerceEvent({
    org_id: grant.org_id,
    entity_type: 'seller_grant',
    entity_id: grant.id!,
    event_type: 'seller_grant.received',
    provider: grant.provider,
    payload: { stackId: 'commerce', status: grant.status, resource_type: grant.resource_type },
    ...eventActor(actor),
  })
  return grant
}

export async function acceptAgentCommerceSellerGrant(params: {
  id: string
  orgId: string
  actor?: AgentCommerceActor
}): Promise<SellerPaymentGrant> {
  assertAgentCommerceEnabled('seller')
  registerDefaultAgentCommerceProviders()

  const grant = await getSellerPaymentGrant(params.id, params.orgId)
  if (!grant || !grant.id) throw new AgentCommerceError('not_found', 'Seller payment grant was not found.', 404)
  if (['accepted', 'processing', 'completed'].includes(grant.status) && grant.provider_payment_id) {
    return grant
  }
  if (grant.status !== 'received' && grant.status !== 'validating') {
    throw new AgentCommerceError(
      'invalid_state_transition',
      `Seller grant cannot be accepted from status ${grant.status}.`,
      409,
    )
  }
  if (grant.expires_at && new Date(grant.expires_at).getTime() <= Date.now()) {
    const expired = await transitionSellerPaymentGrant({
      id: grant.id,
      orgId: grant.org_id,
      status: 'expired',
      metadata: { expiry_reason: 'seller_accept_after_expiry' },
    })
    await appendSellerGrantEvent(expired, 'seller_grant.expired', params.actor, {
      reason: 'seller_accept_after_expiry',
    })
    throw new AgentCommerceError('invalid_state_transition', 'Seller grant expired before acceptance.', 409)
  }
  const policyDecision = evaluateAgentCommercePolicy({
    amount: grant.amount,
    merchant: {
      name: 'Lucid Agent Commerce seller grant',
      domain: metadataString(grant.metadata, 'merchant_domain') ?? metadataString(grant.metadata, 'seller_domain') ?? 'lucidmerged.com',
    },
    policy: grant.usage_limits,
  })
  if (!policyDecision.allowed) {
    const rejected = await transitionSellerPaymentGrant({
      id: grant.id,
      orgId: grant.org_id,
      status: 'rejected',
      metadata: {
        rejection_reason: policyDecision.reasonCode ?? 'policy_denied',
        policy_decision: policyDecision,
      },
    })
    await appendSellerGrantEvent(rejected, 'seller_grant.rejected', params.actor, {
      reason: policyDecision.reason,
      reason_code: policyDecision.reasonCode,
    })
    throw new AgentCommerceError('policy_denied', policyDecision.reason ?? 'Seller grant usage limits rejected payment.', 403)
  }

  const provider = getAgentCommerceProvider(grant.provider)
  if (!isSellerCommerceProvider(provider)) {
    throw new AgentCommerceError('provider_unavailable', 'Selected provider cannot accept seller grants yet.', 503, { retryable: true })
  }

  const validating = grant.status === 'validating'
    ? grant
    : await transitionSellerPaymentGrant({
      id: grant.id,
      orgId: grant.org_id,
      status: 'validating',
      metadata: { validation_started_at: new Date().toISOString() },
    })
  await appendSellerGrantEvent(validating, 'seller_grant.validating', params.actor)

  try {
    const accepted = await provider.acceptGrant(validating, {
      requestId: params.actor?.requestId,
      orgId: grant.org_id,
    })
    const nextStatus = accepted.status === 'requires_action' ? 'accepted' : accepted.status
    const updated = await transitionSellerPaymentGrant({
      id: validating.id!,
      orgId: validating.org_id,
      status: nextStatus,
      providerPaymentId: accepted.payment_id,
      metadata: {
        accept_status: accepted.status,
        provider_payment_id: accepted.payment_id,
      },
    })
    await appendSellerGrantEvent(updated, `seller_grant.${nextStatus}`, params.actor, {
      provider_payment_id: accepted.payment_id,
      accept_status: accepted.status,
    })
    if (nextStatus === 'completed') {
      return activateSellerGrantEntitlement(updated, params.actor, {
        provider_payment_id: accepted.payment_id,
        accept_status: accepted.status,
      })
    }
    return updated
  } catch (error) {
    const failed = await transitionSellerPaymentGrant({
      id: validating.id!,
      orgId: validating.org_id,
      status: 'failed',
      metadata: {
        failure_reason: 'provider_grant_accept_failed',
        provider_error: errorMessage(error),
      },
    })
    await appendSellerGrantEvent(failed, 'seller_grant.failed', params.actor, {
      reason: 'provider_grant_accept_failed',
      error: errorMessage(error),
    })
    if (error instanceof AgentCommerceError) throw error
    throw new AgentCommerceError('provider_unavailable', errorMessage(error), 503, { retryable: true })
  }
}

function stripeEventObject(event: Record<string, unknown>): Record<string, unknown> {
  const data = event.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
  const object = (data as Record<string, unknown>).object
  return object && typeof object === 'object' && !Array.isArray(object)
    ? object as Record<string, unknown>
    : {}
}

function stripeObjectMetadata(object: Record<string, unknown>): Record<string, unknown> {
  const metadata = object.metadata
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
}

function sellerStatusFromStripePaymentIntent(eventType: string, status?: string): 'accepted' | 'processing' | 'completed' | 'failed' | null {
  if (eventType === 'payment_intent.succeeded' || status === 'succeeded') return 'completed'
  if (eventType === 'payment_intent.processing' || status === 'processing') return 'processing'
  if (eventType === 'payment_intent.payment_failed' || status === 'requires_payment_method' || status === 'canceled') return 'failed'
  if (status === 'requires_action' || status === 'requires_confirmation' || status === 'requires_capture') return 'accepted'
  return null
}

function stripeStringId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const id = (value as Record<string, unknown>).id
    if (typeof id === 'string' && id.trim()) return id
  }
  return undefined
}

function stripePaymentIntentId(object: Record<string, unknown>): string | undefined {
  return stripeStringId(object.payment_intent)
    ?? stripeStringId(object.paymentIntent)
    ?? stripeStringId(object.payment_intent_id)
}

function stripeReversalReason(eventType: string): string | null {
  if (eventType === 'charge.refunded') return 'charge_refunded'
  if (eventType === 'refund.created' || eventType === 'refund.updated') return 'refund'
  if (eventType === 'charge.dispute.created' || eventType === 'charge.dispute.funds_withdrawn') return 'charge_dispute'
  return null
}

function isStripeLinkAgreementEventType(eventType: string): boolean {
  return eventType.startsWith('v2.orchestrated_commerce.agreement.')
}

function isStripeLinkAgentsEventType(eventType: string): boolean {
  return eventType.startsWith('v2.orchestrated_commerce.')
    || eventType.startsWith('v2.commerce.')
    || eventType.startsWith('agentic_commerce.')
    || eventType.startsWith('requested_session.')
    || eventType.startsWith('shared_payment.issued_token.')
    || eventType.startsWith('checkout.session.')
}

function metadataFromStripeEvent(event: Record<string, unknown>, object: Record<string, unknown>): Record<string, unknown> {
  const eventMetadata = event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
    ? event.metadata as Record<string, unknown>
    : {}
  return {
    ...eventMetadata,
    ...stripeObjectMetadata(object),
  }
}

function stripeLinkAgreementStatusFromEvent(
  eventType: string,
  object: Record<string, unknown>,
): AgentCommerceConnectionStatus | null {
  const objectStatus = typeof object.status === 'string' ? object.status.toLowerCase() : ''
  const normalized = eventType.toLowerCase()
  if (normalized.endsWith('.confirmed') || objectStatus === 'confirmed' || objectStatus === 'active') return 'active'
  if (
    normalized.endsWith('.created')
    || normalized.endsWith('.partially_confirmed')
    || objectStatus === 'created'
    || objectStatus === 'partially_confirmed'
    || objectStatus === 'pending'
  ) {
    return 'pending'
  }
  if (normalized.endsWith('.terminated') || objectStatus === 'terminated' || objectStatus === 'revoked') return 'revoked'
  if (normalized.endsWith('.expired') || objectStatus === 'expired') return 'expired'
  if (normalized.endsWith('.failed') || objectStatus === 'failed') return 'failed'
  return null
}

function stripeUnixOrIsoDate(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value * 1000).toISOString()
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric * 1000).toISOString()
    const timestamp = Date.parse(value)
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString()
  }
  return undefined
}

function stripeNestedString(object: Record<string, unknown>, key: string, nestedKey = 'id'): string | undefined {
  const direct = object[key]
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    const nested = (direct as Record<string, unknown>)[nestedKey]
    if (typeof nested === 'string' && nested.trim()) return nested.trim()
  }
  return undefined
}

function isUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
}

function stripeLinkAgreementProviderAccountId(object: Record<string, unknown>, metadata: Record<string, unknown>): string | undefined {
  return metadataString(metadata, 'provider_account_id')
    ?? metadataString(metadata, 'seller_account_id')
    ?? metadataString(metadata, 'stripe_seller_account_id')
    ?? stripeNestedString(object, 'seller')
    ?? stripeNestedString(object, 'seller_account')
    ?? stripeNestedString(object, 'seller_profile')
    ?? stripeNestedString(object, 'profile')
    ?? stripeNestedString(object, 'account')
}

function stripeLinkAgentsTerminalStatus(
  eventType: string,
  object: Record<string, unknown>,
): 'completed' | 'failed' | 'cancelled' | 'expired' | null {
  const status = typeof object.status === 'string' ? object.status.toLowerCase() : ''
  const normalized = eventType.toLowerCase()

  if (
    normalized.endsWith('.completed')
    || normalized.endsWith('.succeeded')
    || normalized.endsWith('.confirmed')
    || status === 'completed'
    || status === 'succeeded'
    || status === 'confirmed'
  ) {
    return 'completed'
  }
  if (
    normalized.endsWith('.failed')
    || normalized.endsWith('.payment_failed')
    || status === 'failed'
    || status === 'requires_payment_method'
  ) {
    return 'failed'
  }
  if (normalized.endsWith('.canceled') || normalized.endsWith('.cancelled') || status === 'canceled' || status === 'cancelled') {
    return 'cancelled'
  }
  if (normalized.endsWith('.expired') || status === 'expired') return 'expired'
  if (normalized.endsWith('.deactivated') || status === 'deactivated') return 'failed'
  return null
}

async function applyStripeLinkAgreementEvent(
  event: Record<string, unknown>,
  actor: AgentCommerceActor,
): Promise<AgentCommerceConnection | null> {
  assertAgentCommerceEnabled('wallets')
  const eventType = typeof event.type === 'string' ? event.type : 'unknown'
  const object = stripeEventObject(event)
  const metadata = metadataFromStripeEvent(event, object)
  const orgId = metadataString(metadata, 'org_id') ?? (typeof event.org_id === 'string' ? event.org_id : undefined)
  const providerConnectionId = typeof object.id === 'string' && object.id.trim()
    ? object.id.trim()
    : undefined
  const status = stripeLinkAgreementStatusFromEvent(eventType, object)
  if (!orgId || !providerConnectionId || !status) return null

  const userId = metadataString(metadata, 'user_id') ?? metadataString(metadata, 'actor_user_id')
  const providerEventId = typeof event.id === 'string' ? event.id : undefined
  const providerAccountId = stripeLinkAgreementProviderAccountId(object, metadata)
  const connection = await upsertAgentCommerceConnection({
    org_id: orgId,
    user_id: isUuid(userId) ? userId : undefined,
    provider: 'stripe_link_agents',
    provider_account_id: providerAccountId,
    provider_connection_id: providerConnectionId,
    status,
    capabilities: STRIPE_LINK_AGENTS_PROVIDER_MANIFEST.capabilities,
    expires_at: stripeUnixOrIsoDate(object.expires_at),
    metadata: {
      stripe_event_id: providerEventId,
      stripe_event_type: eventType,
      agreement_status: typeof object.status === 'string' ? object.status : undefined,
      livemode: event.livemode,
      seller_name: metadataString(metadata, 'seller_name') ?? stripeNestedString(object, 'seller', 'name'),
      seller_domain: metadataString(metadata, 'seller_domain') ?? stripeNestedString(object, 'seller', 'domain'),
    },
  })

  await appendConnectionEvent(connection, `connection.${status}`, actor, {
    provider_event_id: providerEventId,
    stripe_event_type: eventType,
    agreement_status: typeof object.status === 'string' ? object.status : undefined,
    livemode: event.livemode,
  })
  return connection
}

async function applyStripeLinkAgentsProviderEvent(
  event: Record<string, unknown>,
  actor: AgentCommerceActor,
): Promise<AgentCommerceConnection | AgentSpendRequest | null> {
  assertAgentCommerceEnabled('wallets')
  const eventType = typeof event.type === 'string' ? event.type : 'unknown'
  if (isStripeLinkAgreementEventType(eventType)) {
    return applyStripeLinkAgreementEvent(event, actor)
  }

  const object = stripeEventObject(event)
  const metadata = stripeObjectMetadata(object)
  const orgId = metadataString(metadata, 'org_id')
  const spendRequestId = metadataString(metadata, 'agent_spend_request_id')
    ?? metadataString(metadata, 'spend_request_id')
  if (!orgId || !spendRequestId) return null

  const current = await getAgentSpendRequest(spendRequestId, orgId)
  if (!current) return null
  if (current.provider !== 'stripe_link_agents') return null

  const providerEventId = typeof event.id === 'string' ? event.id : undefined
  const objectId = typeof object.id === 'string' ? object.id : undefined
  const providerCredentialId = stripeStringId(object.payment_credential)
    ?? stripeStringId(object.credential)
    ?? stripeStringId(object.shared_payment_token)
    ?? stripeStringId(object.one_time_card)
    ?? (eventType.startsWith('shared_payment.issued_token.') ? objectId : undefined)
    ?? metadataString(metadata, 'provider_credential_id')
  const terminalStatus = stripeLinkAgentsTerminalStatus(eventType, object)
  if (!terminalStatus) return current
  if (['completed', 'declined', 'expired', 'failed', 'cancelled'].includes(current.status)) return current

  if (terminalStatus === 'completed') {
    return completeAgentCommerceSpendRequest({
      id: current.id,
      orgId: current.org_id,
      actor,
      providerRequestId: objectId ?? current.provider_request_id,
      providerCredentialId: providerCredentialId ?? current.provider_credential_id,
      metadata: {
        stripe_event_id: providerEventId,
        stripe_event_type: eventType,
        stripe_requested_session_status: typeof object.status === 'string' ? object.status : undefined,
      },
    })
  }

  const updated = await transitionAgentSpendRequest({
    id: current.id,
    orgId: current.org_id,
    status: terminalStatus,
    providerRequestId: objectId ?? current.provider_request_id,
    providerCredentialId: providerCredentialId ?? current.provider_credential_id,
    metadata: {
      failure_reason: `stripe_link_agents_${terminalStatus}`,
      stripe_event_id: providerEventId,
      stripe_event_type: eventType,
      stripe_requested_session_status: typeof object.status === 'string' ? object.status : undefined,
    },
  })
  await appendSpendEvent(updated, `spend_request.${terminalStatus}`, actor, {
    provider_event_id: providerEventId,
    provider_request_id: objectId,
    provider_credential_id: providerCredentialId,
    stripe_event_type: eventType,
  })
  return updated
}

function stripeIssuingRiskThreshold(env: Record<string, string | undefined> = process.env): number {
  const parsed = Number.parseInt(env.AGENT_COMMERCE_STRIPE_ISSUING_RISK_DECLINE_THRESHOLD ?? '', 10)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 75
}

function stripeIssuingDeclineReasonFromPolicy(reasonCode?: string): StripeIssuingAuthorizationDecisionReason {
  if (reasonCode === 'amount_exceeds_limit') return 'amount_exceeds_limit'
  if (reasonCode === 'currency_not_allowed') return 'currency_mismatch'
  if (reasonCode === 'risk_manual_review') return 'risk_manual_review'
  return 'policy_denied'
}

async function appendStripeIssuingAuthorizationDecisionEvent(params: {
  request: StripeIssuingAuthorizationRequest
  decision: StripeIssuingAuthorizationDecision
  actor?: AgentCommerceActor
  spendRequest?: AgentSpendRequest | null
  payload?: Record<string, unknown>
}): Promise<void> {
  const orgId = params.request.org_id ?? params.spendRequest?.org_id
  if (!orgId) return

  try {
    await appendAgentCommerceEvent({
      org_id: orgId,
      entity_type: params.request.spend_request_id ? 'spend_request' : 'provider_health',
      entity_id: params.request.spend_request_id ?? randomUUID(),
      event_type: params.decision.approved
        ? 'stripe_issuing.authorization.approved'
        : 'stripe_issuing.authorization.declined',
      provider: 'stripe_issuing',
      provider_event_id: params.request.event_id,
      run_id: params.spendRequest?.run_id,
      payload: {
        stackId: 'commerce',
        approved: params.decision.approved,
        reason: params.decision.reason,
        authorization_id: params.request.authorization_id,
        spend_request_id: params.request.spend_request_id,
        amount: params.request.amount,
        currency: params.request.currency,
        risk_score: params.request.risk_score,
        livemode: params.request.livemode,
        ...(sanitizeAgentCommerceLogContext(params.payload ?? {}) as Record<string, unknown>),
      },
      ...eventActor(params.actor),
    })
  } catch {
    // Real-time Issuing webhooks must return within Stripe's timeout window.
    // Audit failures must never turn into an authorization approval.
  }
}

export async function decideStripeIssuingAuthorizationRequest(
  event: Record<string, unknown>,
  actor: AgentCommerceActor = { type: 'provider' },
): Promise<StripeIssuingAuthorizationDecision> {
  const request = parseStripeIssuingAuthorizationRequest(event)

  const decline = async (
    reason: StripeIssuingAuthorizationDecisionReason,
    payload: Record<string, unknown> = {},
    spendRequest?: AgentSpendRequest | null,
  ): Promise<StripeIssuingAuthorizationDecision> => {
    const decision = createStripeIssuingAuthorizationDecision({
      approved: false,
      reason,
      request,
      metadata: payload,
    })
    await appendStripeIssuingAuthorizationDecisionEvent({
      request,
      decision,
      actor,
      spendRequest,
      payload,
    })
    return decision
  }

  try {
    assertAgentCommerceEnabled('wallets')
  } catch {
    return decline('feature_disabled')
  }

  if (!request.org_id || !request.spend_request_id || !request.authorization_id) {
    return decline('lookup_failed', {
      missing_org_id: !request.org_id,
      missing_spend_request_id: !request.spend_request_id,
      missing_authorization_id: !request.authorization_id,
    })
  }
  if (!request.amount || !request.currency) {
    return decline('authorization_data_missing')
  }

  let spendRequest: AgentSpendRequest | null = null
  try {
    spendRequest = await getAgentSpendRequest(request.spend_request_id, request.org_id)
  } catch {
    return decline('internal_error')
  }
  if (!spendRequest) return decline('lookup_failed')

  if (spendRequest.provider !== 'stripe_issuing' || spendRequest.rail !== 'stripe_issuing_card') {
    return decline('invalid_provider_rail', {
      spend_provider: spendRequest.provider,
      spend_rail: spendRequest.rail,
    }, spendRequest)
  }
  if (!['approved', 'credential_issued'].includes(spendRequest.status)) {
    return decline('invalid_spend_state', { spend_status: spendRequest.status }, spendRequest)
  }
  if (spendRequest.amount.currency !== request.currency) {
    return decline('currency_mismatch', {
      expected_currency: spendRequest.amount.currency,
      requested_currency: request.currency,
    }, spendRequest)
  }
  if (request.amount > spendRequest.amount.amount) {
    return decline('amount_exceeds_limit', {
      expected_amount: spendRequest.amount.amount,
      requested_amount: request.amount,
    }, spendRequest)
  }

  const policyDecision = evaluateAgentCommercePolicy({
    amount: { amount: request.amount, currency: request.currency },
    merchant: request.merchant,
    policy: spendRequest.policy,
  })
  if (!policyDecision.allowed) {
    return decline(stripeIssuingDeclineReasonFromPolicy(policyDecision.reasonCode), {
      policy_reason: policyDecision.reason,
      policy_reason_code: policyDecision.reasonCode,
    }, spendRequest)
  }

  const riskThreshold = stripeIssuingRiskThreshold()
  if (request.risk_score !== undefined && request.risk_score >= riskThreshold) {
    return decline('risk_manual_review', {
      risk_score: request.risk_score,
      risk_threshold: riskThreshold,
    }, spendRequest)
  }

  const decision = createStripeIssuingAuthorizationDecision({
    approved: true,
    reason: 'approved',
    request,
    amount: request.is_amount_controllable ? request.amount : undefined,
    metadata: {
      risk_score: request.risk_score,
      risk_threshold: riskThreshold,
    },
  })
  await appendStripeIssuingAuthorizationDecisionEvent({
    request,
    decision,
    actor,
    spendRequest,
    payload: {
      risk_threshold: riskThreshold,
    },
  })
  return decision
}

export async function applyStripeAgentCommerceProviderEvent(
  event: Record<string, unknown>,
  actor: AgentCommerceActor = { type: 'provider' },
): Promise<SellerPaymentGrant | AgentSpendRequest | AgentCommerceConnection | null> {
  const eventType = typeof event.type === 'string' ? event.type : 'unknown'
  if (isStripeLinkAgentsEventType(eventType)) {
    return applyStripeLinkAgentsProviderEvent(event, actor)
  }

  assertAgentCommerceEnabled('seller')
  const object = stripeEventObject(event)
  const metadata = stripeObjectMetadata(object)
  const orgId = metadataString(metadata, 'org_id')
  const objectId = typeof object.id === 'string' ? object.id : undefined
  const providerEventId = typeof event.id === 'string' ? event.id : undefined
  const reversalReason = stripeReversalReason(eventType)

  if (reversalReason) {
    const sellerGrantId = metadataString(metadata, 'seller_grant_id')
    const paymentIntentId = stripePaymentIntentId(object)
      ?? metadataString(metadata, 'provider_payment_id')
      ?? metadataString(metadata, 'payment_intent')
      ?? metadataString(metadata, 'stripe_payment_intent_id')
    const current = sellerGrantId && orgId
      ? await getSellerPaymentGrant(sellerGrantId, orgId)
      : paymentIntentId
        ? await getSellerPaymentGrantByProviderPaymentId({
          provider: 'stripe_shared_payment_tokens',
          providerPaymentId: paymentIntentId,
          orgId,
        })
        : null
    if (!current?.id) return null
    if (['rejected', 'revoked', 'expired', 'failed'].includes(current.status)) return current

    return revokeSellerGrantEntitlement(current, reversalReason, actor, {
      provider_event_id: providerEventId,
      provider_payment_id: paymentIntentId ?? current.provider_payment_id,
      stripe_event_type: eventType,
      stripe_object_id: objectId,
    })
  }

  if (eventType.startsWith('payment_intent.')) {
    const status = typeof object.status === 'string' ? object.status : undefined
    const nextStatus = sellerStatusFromStripePaymentIntent(eventType, status)
    if (!nextStatus) return null

    const sellerGrantId = metadataString(metadata, 'seller_grant_id')
    const current = sellerGrantId && orgId
      ? await getSellerPaymentGrant(sellerGrantId, orgId)
      : objectId
        ? await getSellerPaymentGrantByProviderPaymentId({
          provider: 'stripe_shared_payment_tokens',
          providerPaymentId: objectId,
          orgId,
        })
        : null
    if (!current?.id) return null
    if (['rejected', 'revoked', 'expired', 'failed'].includes(current.status)) return current
    if (current.status === 'completed' && nextStatus !== 'completed') return current

    const updated = await transitionSellerPaymentGrant({
      id: current.id,
      orgId: current.org_id,
      status: nextStatus,
      providerPaymentId: objectId,
      metadata: {
        stripe_event_id: providerEventId,
        stripe_event_type: eventType,
        stripe_payment_intent_status: status,
      },
    })
    await appendSellerGrantEvent(updated, `seller_grant.${nextStatus}`, actor, {
      provider_event_id: providerEventId,
      provider_payment_id: objectId,
      stripe_event_type: eventType,
      stripe_payment_intent_status: status,
    })
    if (nextStatus === 'completed') {
      return activateSellerGrantEntitlement(updated, actor, {
        provider_event_id: providerEventId,
        provider_payment_id: objectId,
        stripe_event_type: eventType,
        stripe_payment_intent_status: status,
      })
    }
    return updated
  }

  if (eventType === 'shared_payment.granted_token.deactivated' && objectId) {
    const current = await getSellerPaymentGrantByProviderGrantId({
      provider: 'stripe_shared_payment_tokens',
      grantId: objectId,
      orgId,
    })
    if (!current?.id || current.status === 'completed') return current
    const updated = await revokeSellerGrantEntitlement(current, 'grant_revoked', actor, {
      provider_event_id: providerEventId,
      stripe_event_type: eventType,
    })
    return updated
  }

  return null
}

export async function createAgentCommerceMachineChallenge(
  input: CreateMachinePaymentChallenge,
  actor: AgentCommerceActor = { type: 'system' },
): Promise<MachinePaymentChallenge> {
  assertAgentCommerceEnabled('seller')
  const parsed = CreateMachinePaymentChallengeSchema.parse(input)
  const challenge = await createMachinePaymentChallenge(parsed)
  await appendAgentCommerceEvent({
    org_id: challenge.org_id,
    entity_type: 'machine_challenge',
    entity_id: challenge.id,
    event_type: 'machine_challenge.created',
    provider: challenge.provider,
    payload: { stackId: 'commerce', resource_type: challenge.resource_type },
    ...eventActor(actor),
  })
  return challenge
}

export async function claimAgentCommerceMachinePaymentProof(
  input: MachinePaymentProofClaimInput,
  actor: AgentCommerceActor = { type: 'system' },
): Promise<MachinePaymentProofClaim & { first_claim?: boolean }> {
  assertAgentCommerceEnabled('seller')
  const parsed = MachinePaymentProofClaimInputSchema.parse(input)
  const claim = await claimMachinePaymentProof(parsed)
  await appendAgentCommerceEvent({
    org_id: claim.org_id,
    entity_type: 'proof_claim',
    entity_id: claim.id,
    event_type: claim.first_claim ? 'proof_claim.claimed' : 'proof_claim.replayed',
    provider: claim.provider,
    payload: { stackId: 'commerce', first_claim: claim.first_claim },
    ...eventActor(actor),
  })
  return claim
}
