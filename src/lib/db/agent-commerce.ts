/**
 * Agent Commerce DB layer.
 *
 * Route handlers and provider adapters should use these typed functions instead
 * of calling Supabase tables directly. The service role client lives here, RLS
 * remains enabled for user reads, and money-sensitive operations go through
 * explicit ledger/idempotency functions.
 */

import 'server-only'

import crypto from 'crypto'
import {
  AgentCommerceBudgetReservationSchema,
  AgentCommerceConnectionSchema,
  AgentCommerceCredentialSchema,
  AgentCommerceEventSchema,
  AgentCommerceProviderIdSchema,
  AgentCommerceSellerEntitlementSchema,
  AgentSpendRequestSchema,
  CreateAgentCommerceConnectionSchema,
  CreateAgentSpendRequestSchema,
  CreateMachinePaymentChallengeSchema,
  MachinePaymentChallengeSchema,
  MachinePaymentProofClaimSchema,
  MachinePaymentProofClaimInputSchema,
  SellerPaymentGrantSchema,
  type AgentCommerceConnection,
  type AgentCommerceBudgetReservation,
  type AgentCommerceCredential,
  type AgentCommerceEvent,
  type AgentCommerceEventInput,
  type AgentCommerceProviderId,
  type AgentCommerceSellerEntitlement,
  type AgentCommerceSellerEntitlementStatus,
  type AgentSpendRequest,
  type AgentSpendRequestStatus,
  type AgentCommerceBudgetReservationStatus,
  type CreateAgentCommerceConnection,
  type CreateAgentSpendRequest,
  type CreateMachinePaymentChallenge,
  type MachinePaymentChallenge,
  type MachinePaymentProofClaim,
  type MachinePaymentProofClaimInput,
  type SellerPaymentGrant,
  type SellerPaymentGrantInput,
  type SellerPaymentGrantStatus,
} from '@contracts/agent-commerce'
import { supabase } from './client'
import { recordCommerceKnowledgeEvidence } from './knowledge-operation-events'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import type {
  AgentCommerceDashboardLedgerAggregates,
  AgentCommerceMoneyRollup,
} from '@/lib/agent-commerce/dashboard-metrics'
import { captureAgentCommerceError } from '@/lib/agent-commerce/observability'

function nullable<T>(value: T | null | undefined): T | undefined {
  return value == null ? undefined : value
}

function rowObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function numeric(value: unknown): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function moneyRollupFromCurrencyTotals(value: unknown): AgentCommerceMoneyRollup {
  const byCurrency = Object.entries(rowObject(value)).reduce<Record<string, number>>((acc, [currency, amount]) => {
    const normalizedCurrency = currency.trim().toLowerCase()
    if (!normalizedCurrency) return acc
    acc[normalizedCurrency] = (acc[normalizedCurrency] ?? 0) + numeric(amount)
    return acc
  }, {})

  const primaryEntry = Object.entries(byCurrency)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]

  return {
    by_currency: byCurrency,
    primary: primaryEntry
      ? {
          amount: primaryEntry[1],
          currency: primaryEntry[0],
        }
      : undefined,
  }
}

const COMMERCE_EVIDENCE_ENTITY_SELECT: Partial<Record<AgentCommerceEvent['entity_type'], { table: string; select: string }>> = {
  connection: {
    table: 'agent_commerce_connections',
    select: 'id, org_id, user_id, provider, provider_account_id, provider_connection_id, status, metadata',
  },
  spend_request: {
    table: 'agent_spend_requests',
    select: 'id, org_id, project_id, assistant_id, user_id, run_id, tool_call_id, idempotency_key, provider, rail, status, merchant, amount_cents, currency, policy_snapshot, router_decision, provider_request_id, provider_credential_id, credential_kind, approved_by, approved_at, completed_at, metadata',
  },
  credential: {
    table: 'agent_commerce_credentials',
    select: 'id, spend_request_id, org_id, provider, kind, status, expires_at, revoked_at, metadata',
  },
  seller_grant: {
    table: 'seller_payment_grants',
    select: 'id, org_id, provider, rail, grant_id, status, customer_reference, resource_type, resource_id, amount_cents, currency, provider_payment_id, entitlement_ref, metadata',
  },
  seller_entitlement: {
    table: 'agent_commerce_seller_entitlements',
    select: 'id, org_id, seller_grant_id, provider, resource_type, resource_id, status, target_type, target_id, payment_id, metadata',
  },
  machine_challenge: {
    table: 'machine_payment_challenges',
    select: 'id, org_id, provider, rail, resource_type, resource_id, amount_cents, currency, status, metadata',
  },
  proof_claim: {
    table: 'machine_payment_proof_claims',
    select: 'id, challenge_id, org_id, provider, status, provider_payment_id, metadata',
  },
}

const AGENT_COMMERCE_CONNECTION_SELECT = `
  id,
  contract_version,
  schema_version,
  org_id,
  user_id,
  provider,
  provider_account_id,
  provider_connection_id,
  status,
  capabilities,
  secret_ref,
  created_at,
  updated_at,
  expires_at,
  metadata
` as const

const AGENT_SPEND_REQUEST_SELECT = `
  id,
  contract_version,
  schema_version,
  provider_version,
  org_id,
  project_id,
  assistant_id,
  user_id,
  run_id,
  tool_call_id,
  idempotency_key,
  provider,
  rail,
  status,
  merchant,
  amount_cents,
  currency,
  context,
  policy_snapshot,
  router_decision,
  credential_kind,
  provider_request_id,
  provider_credential_id,
  approval_required,
  approved_by,
  approved_at,
  created_at,
  updated_at,
  completed_at,
  expires_at,
  metadata
` as const

const AGENT_COMMERCE_EVENT_SELECT = `
  id,
  contract_version,
  schema_version,
  stack_id,
  org_id,
  entity_type,
  entity_id,
  event_type,
  provider,
  provider_event_id,
  actor_type,
  actor_id,
  request_id,
  run_id,
  payload,
  created_at
` as const

const AGENT_COMMERCE_PROVIDER_HEALTH_SELECT = `
  provider,
  mode,
  status,
  last_success_at,
  last_failure_at,
  failure_count,
  metadata,
  updated_at
` as const

const AGENT_COMMERCE_CREDENTIAL_SELECT = `
  id,
  spend_request_id,
  org_id,
  provider,
  kind,
  status,
  secret_ref,
  display,
  usage_limits,
  expires_at,
  metadata
` as const

const AGENT_COMMERCE_BUDGET_RESERVATION_SELECT = `
  id,
  contract_version,
  schema_version,
  org_id,
  spend_request_id,
  amount_cents,
  currency,
  status,
  reason,
  created_at,
  updated_at,
  expires_at,
  captured_at,
  released_at,
  metadata
` as const

const SELLER_PAYMENT_GRANT_SELECT = `
  id,
  contract_version,
  schema_version,
  org_id,
  provider,
  rail,
  grant_id,
  status,
  customer_reference,
  resource_type,
  resource_id,
  amount_cents,
  currency,
  usage_limits,
  provider_payment_id,
  entitlement_ref,
  expires_at,
  metadata
` as const

const SELLER_ENTITLEMENT_SELECT = `
  id,
  contract_version,
  schema_version,
  org_id,
  seller_grant_id,
  provider,
  resource_type,
  resource_id,
  status,
  target_type,
  target_id,
  payment_id,
  effective_at,
  expires_at,
  revoked_at,
  revoke_reason,
  created_at,
  updated_at,
  metadata
` as const

const MACHINE_PAYMENT_CHALLENGE_SELECT = `
  id,
  contract_version,
  schema_version,
  org_id,
  provider,
  rail,
  resource_type,
  resource_id,
  amount_cents,
  currency,
  challenge_hash,
  challenge_body,
  status,
  created_at,
  expires_at,
  metadata
` as const

async function readCommerceEvidenceEntitySnapshot(event: AgentCommerceEvent): Promise<Record<string, unknown> | null> {
  const spec = COMMERCE_EVIDENCE_ENTITY_SELECT[event.entity_type]
  if (!spec) return null

  try {
    const { data, error } = await supabase
      .from(spec.table)
      .select(spec.select)
      .eq('id', event.entity_id)
      .eq('org_id', event.org_id)
      .maybeSingle()

    if (error) throw error
    return rowObject(data)
  } catch (error) {
    captureAgentCommerceError(error, {
      operation: 'readCommerceEvidenceEntitySnapshot',
      surface: 'db',
      severity: 'warning',
      context: {
        orgId: event.org_id,
        commerceEventId: event.id,
        entityType: event.entity_type,
        entityId: event.entity_id,
      },
      fingerprint: ['agent-commerce-db', 'commerce-evidence-snapshot'],
    })
    return null
  }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function commerceEvidenceOutcome(eventType: string, payload: Record<string, unknown>, status: string | null): string | null {
  const explicit = firstString(payload.outcome, payload.reason)
  if (explicit) return explicit
  if (typeof payload.approved === 'boolean') return payload.approved ? 'approved' : 'declined'
  if (eventType.includes('declined') || eventType.includes('denied') || eventType.includes('failed')) return 'failed'
  if (eventType.includes('approved') || eventType.includes('accepted') || eventType.includes('completed') || eventType.includes('active')) return 'succeeded'
  if (eventType.includes('replayed')) return 'replayed'
  return status
}

function commerceEvidenceMetadata(event: AgentCommerceEvent, entity: Record<string, unknown> | null): {
  projectId: string | null
  assistantId: string | null
  connectionId: string | null
  sellerId: string | null
  budgetReservationId: string | null
  ledgerId: string | null
  idempotencyKey: string | null
  outcome: string | null
  status: string | null
  amount: number | null
  currency: string | null
  metadata: Record<string, unknown>
} {
  const payload = rowObject(event.payload)
  const entityMetadata = rowObject(entity?.metadata)
  const status = firstString(payload.status, entity?.status)
  const amount = firstNumber(payload.amount_cents, payload.amount, entity?.amount_cents)
  const currency = firstString(payload.currency, entity?.currency)
  const projectId = firstString(payload.project_id, entity?.project_id, entityMetadata.project_id)
  const assistantId = firstString(payload.assistant_id, entity?.assistant_id, entityMetadata.assistant_id)
  const sellerId = firstString(
    payload.seller_id,
    payload.seller_grant_id,
    entity?.seller_grant_id,
    event.entity_type === 'seller_grant' ? event.entity_id : null,
    entityMetadata.seller_id,
  )
  const connectionId = firstString(
    payload.connection_id,
    event.entity_type === 'connection' ? event.entity_id : null,
    entityMetadata.connection_id,
  )
  const budgetReservationId = firstString(
    payload.budget_reservation_id,
    payload.reservation_id,
    entityMetadata.budget_reservation_id,
  )

  return {
    projectId,
    assistantId,
    connectionId,
    sellerId,
    budgetReservationId,
    ledgerId: firstString(payload.ledger_id, payload.ledger_entry_id, entityMetadata.ledger_id),
    idempotencyKey: firstString(payload.idempotency_key, entity?.idempotency_key, entityMetadata.idempotency_key),
    outcome: commerceEvidenceOutcome(event.event_type, payload, status),
    status,
    amount,
    currency,
    metadata: {
      rail: firstString(payload.rail, entity?.rail),
      resource_type: firstString(payload.resource_type, entity?.resource_type),
      resource_id: firstString(payload.resource_id, entity?.resource_id),
      target_type: firstString(payload.target_type, entity?.target_type),
      target_id: firstString(payload.target_id, entity?.target_id),
      spend_request_id: firstString(payload.spend_request_id, entity?.spend_request_id, entityMetadata.spend_request_id),
      credential_id: firstString(payload.credential_id, entity?.provider_credential_id, entityMetadata.credential_id),
      provider_request_id: firstString(payload.provider_request_id, entity?.provider_request_id),
      provider_payment_id: firstString(payload.provider_payment_id, entity?.provider_payment_id),
      tool_call_id: firstString(payload.tool_call_id, entity?.tool_call_id),
      merchant: rowObject(entity?.merchant),
      entity_status: status,
      entity_snapshot: entity
        ? {
            type: event.entity_type,
            id: event.entity_id,
            status,
            provider: firstString(entity.provider, event.provider),
            rail: firstString(entity.rail),
            resource_type: firstString(entity.resource_type),
            target_type: firstString(entity.target_type),
          }
        : null,
    },
  }
}

function reportDbError(error: unknown, operation: string, context: Record<string, unknown>): never {
  captureAgentCommerceError(error, {
    operation,
    surface: 'db',
    severity: 'error',
    context,
    fingerprint: ['agent-commerce-db', operation],
  })
  throw new AgentCommerceError('internal_error', `Agent Commerce DB operation failed: ${operation}`, 500)
}

function mapConnection(row: Record<string, unknown>): AgentCommerceConnection {
  return AgentCommerceConnectionSchema.parse({
    id: row.id,
    contract_version: row.contract_version ?? '2026-05-01',
    schema_version: row.schema_version ?? 1,
    org_id: row.org_id,
    user_id: nullable(row.user_id as string | null),
    provider: row.provider,
    provider_account_id: nullable(row.provider_account_id as string | null),
    provider_connection_id: nullable(row.provider_connection_id as string | null),
    status: row.status,
    capabilities: row.capabilities ?? [],
    secret_ref: nullable(row.secret_ref as string | null),
    created_at: row.created_at,
    updated_at: row.updated_at,
    expires_at: nullable(row.expires_at as string | null),
    metadata: rowObject(row.metadata),
  })
}

export type AgentCommerceEventCountsByType = Record<string, number>

function mapSpendRequest(row: Record<string, unknown>): AgentSpendRequest {
  const routerDecision = rowObject(row.router_decision)
  return AgentSpendRequestSchema.parse({
    id: row.id,
    contract_version: row.contract_version ?? '2026-05-01',
    schema_version: row.schema_version ?? 1,
    provider_version: nullable(row.provider_version as string | null),
    org_id: row.org_id,
    project_id: nullable(row.project_id as string | null),
    assistant_id: nullable(row.assistant_id as string | null),
    user_id: nullable(row.user_id as string | null),
    run_id: nullable(row.run_id as string | null),
    tool_call_id: nullable(row.tool_call_id as string | null),
    idempotency_key: nullable(row.idempotency_key as string | null),
    provider: row.provider,
    rail: row.rail,
    status: row.status,
    merchant: row.merchant,
    amount: {
      amount: row.amount_cents,
      currency: row.currency,
    },
    context: row.context,
    policy: row.policy_snapshot ?? {},
    router_decision: routerDecision.decision ? routerDecision : undefined,
    credential_kind: nullable(row.credential_kind as string | null),
    provider_request_id: nullable(row.provider_request_id as string | null),
    provider_credential_id: nullable(row.provider_credential_id as string | null),
    approval_required: row.approval_required ?? true,
    approved_by: nullable(row.approved_by as string | null),
    approved_at: normalizeIsoDateTime(row.approved_at),
    created_at: normalizeIsoDateTime(row.created_at),
    updated_at: normalizeIsoDateTime(row.updated_at),
    completed_at: normalizeIsoDateTime(row.completed_at),
    expires_at: normalizeIsoDateTime(row.expires_at),
    metadata: rowObject(row.metadata),
  })
}

function mapCredential(row: Record<string, unknown>): AgentCommerceCredential {
  return AgentCommerceCredentialSchema.parse({
    id: row.id,
    spend_request_id: row.spend_request_id,
    org_id: row.org_id,
    provider: row.provider,
    kind: row.kind,
    status: row.status,
    secret_ref: nullable(row.secret_ref as string | null),
    display: nullable(row.display as Record<string, unknown> | null),
    usage_limits: row.usage_limits ?? {},
    expires_at: nullable(row.expires_at as string | null),
    metadata: rowObject(row.metadata),
  })
}

function mapBudgetReservation(
  row: Record<string, unknown>,
): AgentCommerceBudgetReservation & { first_reservation?: boolean } {
  const reservation = AgentCommerceBudgetReservationSchema.parse({
    id: row.id,
    contract_version: row.contract_version ?? '2026-05-01',
    schema_version: row.schema_version ?? 1,
    org_id: row.org_id,
    spend_request_id: row.spend_request_id,
    amount: {
      amount: row.amount_cents,
      currency: row.currency,
    },
    status: row.status,
    reason: nullable(row.reason as string | null),
    created_at: row.created_at,
    updated_at: row.updated_at,
    expires_at: nullable(row.expires_at as string | null),
    captured_at: nullable(row.captured_at as string | null),
    released_at: nullable(row.released_at as string | null),
    metadata: rowObject(row.metadata),
  })

  return row.first_reservation === undefined
    ? reservation
    : { ...reservation, first_reservation: Boolean(row.first_reservation) }
}

function mapSellerGrant(row: Record<string, unknown>): SellerPaymentGrant {
  return SellerPaymentGrantSchema.parse({
    id: row.id,
    contract_version: row.contract_version ?? '2026-05-01',
    schema_version: row.schema_version ?? 1,
    org_id: row.org_id,
    provider: row.provider,
    rail: row.rail,
    grant_id: row.grant_id,
    status: row.status,
    customer_reference: nullable(row.customer_reference as string | null),
    resource_type: row.resource_type,
    resource_id: nullable(row.resource_id as string | null),
    amount: {
      amount: row.amount_cents,
      currency: row.currency,
    },
    usage_limits: row.usage_limits ?? {},
    provider_payment_id: nullable(row.provider_payment_id as string | null),
    entitlement_ref: nullable(row.entitlement_ref as string | null),
    expires_at: nullable(row.expires_at as string | null),
    metadata: rowObject(row.metadata),
  })
}

function normalizeIsoDateTime(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString()
}

function mapAgentCommerceEvent(row: Record<string, unknown>): AgentCommerceEvent {
  return AgentCommerceEventSchema.parse({
    id: row.id,
    contract_version: row.contract_version ?? '2026-05-01',
    schema_version: row.schema_version ?? 1,
    stack_id: row.stack_id ?? 'commerce',
    org_id: row.org_id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    event_type: row.event_type,
    provider: nullable(row.provider as string | null) ?? undefined,
    provider_event_id: nullable(row.provider_event_id as string | null) ?? undefined,
    actor_type: row.actor_type ?? 'system',
    actor_id: nullable(row.actor_id as string | null) ?? undefined,
    request_id: nullable(row.request_id as string | null) ?? undefined,
    run_id: nullable(row.run_id as string | null) ?? undefined,
    payload: rowObject(row.payload),
    created_at: normalizeIsoDateTime(row.created_at),
  })
}

function mapSellerEntitlement(row: Record<string, unknown>): AgentCommerceSellerEntitlement {
  return AgentCommerceSellerEntitlementSchema.parse({
    id: row.id,
    contract_version: row.contract_version ?? '2026-05-01',
    schema_version: row.schema_version ?? 1,
    org_id: row.org_id,
    seller_grant_id: row.seller_grant_id,
    provider: row.provider,
    resource_type: row.resource_type,
    resource_id: nullable(row.resource_id as string | null),
    status: row.status,
    target_type: row.target_type,
    target_id: nullable(row.target_id as string | null),
    payment_id: nullable(row.payment_id as string | null),
    effective_at: row.effective_at,
    expires_at: nullable(row.expires_at as string | null),
    revoked_at: nullable(row.revoked_at as string | null),
    revoke_reason: nullable(row.revoke_reason as string | null),
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata: rowObject(row.metadata),
  })
}

function mapProductionLedgerAggregates(row: Record<string, unknown>): AgentCommerceDashboardLedgerAggregates {
  return {
    spend: {
      total_requests: numeric(row.spend_total_requests),
      completed_requests: numeric(row.spend_completed_requests),
      spend_failures: numeric(row.spend_failures),
      requested_volume: moneyRollupFromCurrencyTotals(row.spend_requested_volume),
      completed_volume: moneyRollupFromCurrencyTotals(row.spend_completed_volume),
      captured_budget: moneyRollupFromCurrencyTotals(row.budget_captured_volume),
    },
    budget: {
      budget_failures: numeric(row.budget_failures),
    },
    revenue: {
      completed_grants: numeric(row.revenue_completed_grants),
      active_entitlements: numeric(row.revenue_active_entitlements),
      revoked_or_expired_entitlements: numeric(row.revenue_revoked_or_expired_entitlements),
      completed_volume: moneyRollupFromCurrencyTotals(row.revenue_completed_volume),
    },
  }
}

function mapMachineChallenge(row: Record<string, unknown>): MachinePaymentChallenge {
  return MachinePaymentChallengeSchema.parse({
    id: row.id,
    contract_version: row.contract_version ?? '2026-05-01',
    schema_version: row.schema_version ?? 1,
    org_id: row.org_id,
    provider: row.provider,
    rail: row.rail,
    resource_type: row.resource_type,
    resource_id: row.resource_id,
    amount: {
      amount: row.amount_cents,
      currency: row.currency,
    },
    challenge_hash: row.challenge_hash,
    challenge_body: row.challenge_body,
    status: row.status,
    created_at: row.created_at,
    expires_at: row.expires_at,
    metadata: rowObject(row.metadata),
  })
}

function mapProofClaim(row: Record<string, unknown>): MachinePaymentProofClaim & { first_claim?: boolean } {
  return {
    ...MachinePaymentProofClaimSchema.parse({
      id: row.id,
      challenge_id: row.challenge_id,
      org_id: row.org_id,
      provider: row.provider,
      proof_hash: row.proof_hash,
      status: row.status,
      provider_payment_id: nullable(row.provider_payment_id as string | null),
      claimed_at: row.claimed_at,
      settled_at: nullable(row.settled_at as string | null),
      metadata: rowObject(row.metadata),
    }),
    first_claim: Boolean(row.first_claim),
  }
}

export interface AgentCommerceProviderHealthRecord {
  provider: string
  mode: 'live' | 'preview' | 'waitlist' | 'disabled'
  status: 'healthy' | 'degraded' | 'disabled'
  last_success_at?: string
  last_failure_at?: string
  failure_count: number
  metadata: Record<string, unknown>
  updated_at: string
}

export interface AgentCommerceReconciliationAction {
  entity_type: string
  action: string
  updated_count: number
}

export interface AgentCommerceProviderEventMismatch {
  event_id: string
  provider?: string
  event_type: string
  entity_type: string
  entity_id: string
  reason: string
  created_at: string
}

function mapProviderHealth(row: Record<string, unknown>): AgentCommerceProviderHealthRecord {
  return {
    provider: String(row.provider),
    mode: row.mode as AgentCommerceProviderHealthRecord['mode'],
    status: row.status as AgentCommerceProviderHealthRecord['status'],
    last_success_at: nullable(row.last_success_at as string | null),
    last_failure_at: nullable(row.last_failure_at as string | null),
    failure_count: Number(row.failure_count ?? 0),
    metadata: rowObject(row.metadata),
    updated_at: String(row.updated_at),
  }
}

function spendStatusFromRouterDecision(input: CreateAgentSpendRequest): AgentSpendRequestStatus {
  const decision = input.router_decision?.decision
  if (decision === 'denied') return 'declined'
  if (decision === 'requires_connection') return 'requires_connection'
  if (decision === 'requires_approval' || decision === 'manual_review') return 'requires_approval'
  if (decision === 'approved_to_issue_credential' || decision === 'ready') return 'approved'
  return 'draft'
}

export async function createAgentCommerceConnection(
  input: CreateAgentCommerceConnection,
): Promise<AgentCommerceConnection> {
  const parsed = CreateAgentCommerceConnectionSchema.parse(input)
  const { data, error } = await supabase
    .from('agent_commerce_connections')
    .insert({
      org_id: parsed.org_id,
      user_id: parsed.user_id ?? null,
      provider: parsed.provider,
      provider_account_id: parsed.provider_account_id ?? null,
      provider_connection_id: parsed.provider_connection_id ?? null,
      status: parsed.status ?? 'pending',
      capabilities: parsed.capabilities ?? [],
      secret_ref: parsed.secret_ref ?? null,
      expires_at: parsed.expires_at ?? null,
      metadata: parsed.metadata ?? {},
    })
    .select(AGENT_COMMERCE_CONNECTION_SELECT)
    .single()

  if (error) reportDbError(error, 'createAgentCommerceConnection', { orgId: parsed.org_id })
  return mapConnection(data as Record<string, unknown>)
}

export async function upsertAgentCommerceConnection(
  input: CreateAgentCommerceConnection,
): Promise<AgentCommerceConnection> {
  const parsed = CreateAgentCommerceConnectionSchema.parse(input)
  if (!parsed.provider_connection_id) {
    return createAgentCommerceConnection(parsed)
  }

  const { data, error } = await supabase.rpc('upsert_agent_commerce_connection', {
    p_org_id: parsed.org_id,
    p_user_id: parsed.user_id ?? null,
    p_provider: parsed.provider,
    p_provider_account_id: parsed.provider_account_id ?? null,
    p_provider_connection_id: parsed.provider_connection_id,
    p_status: parsed.status ?? 'pending',
    p_capabilities: parsed.capabilities ?? [],
    p_secret_ref: parsed.secret_ref ?? null,
    p_expires_at: parsed.expires_at ?? null,
    p_metadata: parsed.metadata ?? {},
  })

  if (error) reportDbError(error, 'upsertAgentCommerceConnection', { orgId: parsed.org_id })
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new AgentCommerceError('internal_error', 'Connection upsert returned no row.', 500)
  return mapConnection(row as Record<string, unknown>)
}

export async function listAgentCommerceConnections(params: {
  orgId: string
  userId?: string
  provider?: AgentCommerceProviderId
}): Promise<AgentCommerceConnection[]> {
  let query = supabase
    .from('agent_commerce_connections')
    .select(AGENT_COMMERCE_CONNECTION_SELECT)
    .eq('org_id', params.orgId)
    .order('created_at', { ascending: false })

  if (params.userId) query = query.eq('user_id', params.userId)
  if (params.provider) query = query.eq('provider', params.provider)

  const { data, error } = await query
  if (error) reportDbError(error, 'listAgentCommerceConnections', { orgId: params.orgId })
  return (data ?? []).map((row) => mapConnection(row as Record<string, unknown>))
}

export async function getAgentCommerceConnection(id: string, orgId: string): Promise<AgentCommerceConnection | null> {
  const { data, error } = await supabase
    .from('agent_commerce_connections')
    .select(AGENT_COMMERCE_CONNECTION_SELECT)
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) reportDbError(error, 'getAgentCommerceConnection', { id, orgId })
  return data ? mapConnection(data as Record<string, unknown>) : null
}

export async function assertAgentCommerceAssistantScope(params: {
  orgId: string
  assistantId?: string
  projectId?: string
}): Promise<void> {
  if (!params.assistantId) return

  let query = supabase
    .from('ai_assistants')
    .select('id, org_id, project_id')
    .eq('id', params.assistantId)
    .eq('org_id', params.orgId)
    .limit(1)

  if (params.projectId) query = query.eq('project_id', params.projectId)

  const { data, error } = await query.maybeSingle()
  if (error) reportDbError(error, 'assertAgentCommerceAssistantScope', {
    orgId: params.orgId,
    assistantId: params.assistantId,
  })
  if (!data) {
    throw new AgentCommerceError(
      'forbidden',
      'Assistant does not belong to the requested Agent Commerce scope.',
      403,
    )
  }
}

export async function claimAgentCommerceIdempotencyKey(params: {
  orgId: string
  operation: string
  idempotencyKey: string
  requestHash: string
}): Promise<{
  id: string
  status: string
  entityType?: string
  entityId?: string
  requestHash: string
  firstSeen: boolean
}> {
  const { data, error } = await supabase.rpc('claim_agent_commerce_idempotency_key', {
    p_org_id: params.orgId,
    p_operation: params.operation,
    p_idempotency_key: params.idempotencyKey,
    p_request_hash: params.requestHash,
  })

  if (error) reportDbError(error, 'claimAgentCommerceIdempotencyKey', { orgId: params.orgId })
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new AgentCommerceError('internal_error', 'Idempotency claim returned no row.', 500)
  if (row.request_hash !== params.requestHash) {
    throw new AgentCommerceError('idempotency_conflict', 'Idempotency-Key was already used with a different request body.', 409)
  }
  return {
    id: row.id,
    status: row.status,
    entityType: nullable(row.entity_type),
    entityId: nullable(row.entity_id),
    requestHash: row.request_hash,
    firstSeen: Boolean(row.first_seen),
  }
}

export async function completeAgentCommerceIdempotencyKey(params: {
  orgId: string
  operation: string
  idempotencyKey: string
  entityType: string
  entityId: string
}): Promise<void> {
  const { error } = await supabase.rpc('complete_agent_commerce_idempotency_key', {
    p_org_id: params.orgId,
    p_operation: params.operation,
    p_idempotency_key: params.idempotencyKey,
    p_entity_type: params.entityType,
    p_entity_id: params.entityId,
  })
  if (error) reportDbError(error, 'completeAgentCommerceIdempotencyKey', { orgId: params.orgId })
}

export async function createAgentSpendRequest(
  input: CreateAgentSpendRequest,
): Promise<AgentSpendRequest> {
  const parsed = CreateAgentSpendRequestSchema.parse(input)
  const provider = parsed.provider ?? parsed.router_decision?.selected_provider ?? 'manual'
  const rail = parsed.rail ?? parsed.router_decision?.selected_rail ?? 'manual_approval'
  const status = spendStatusFromRouterDecision(parsed)

  const { data, error } = await supabase
    .from('agent_spend_requests')
    .insert({
      org_id: parsed.org_id,
      project_id: parsed.project_id ?? null,
      assistant_id: parsed.assistant_id ?? null,
      user_id: parsed.user_id ?? null,
      run_id: parsed.run_id ?? null,
      tool_call_id: parsed.tool_call_id ?? null,
      idempotency_key: parsed.idempotency_key ?? null,
      provider,
      rail,
      status,
      merchant: parsed.merchant,
      amount_cents: parsed.amount.amount,
      currency: parsed.amount.currency,
      context: parsed.context,
      policy_snapshot: parsed.policy ?? {},
      router_decision: parsed.router_decision ?? {},
      approval_required: parsed.router_decision?.decision === 'requires_approval' || parsed.router_decision?.decision === 'manual_review',
      expires_at: parsed.expires_at ?? null,
      metadata: parsed.metadata ?? {},
    })
    .select(AGENT_SPEND_REQUEST_SELECT)
    .single()

  if (error) reportDbError(error, 'createAgentSpendRequest', { orgId: parsed.org_id })
  return mapSpendRequest(data as Record<string, unknown>)
}

export async function getAgentSpendRequest(id: string, orgId: string): Promise<AgentSpendRequest | null> {
  const { data, error } = await supabase
    .from('agent_spend_requests')
    .select(AGENT_SPEND_REQUEST_SELECT)
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) reportDbError(error, 'getAgentSpendRequest', { id, orgId })
  return data ? mapSpendRequest(data as Record<string, unknown>) : null
}

export async function listAgentSpendRequests(params: {
  orgId: string
  status?: AgentSpendRequestStatus
  assistantId?: string
  projectId?: string
  limit?: number
}): Promise<AgentSpendRequest[]> {
  let query = supabase
    .from('agent_spend_requests')
    .select(AGENT_SPEND_REQUEST_SELECT)
    .eq('org_id', params.orgId)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50)

  if (params.status) query = query.eq('status', params.status)
  if (params.assistantId) query = query.eq('assistant_id', params.assistantId)
  if (params.projectId) query = query.eq('project_id', params.projectId)

  const { data, error } = await query
  if (error) reportDbError(error, 'listAgentSpendRequests', { orgId: params.orgId })
  return (data ?? []).map((row) => mapSpendRequest(row as Record<string, unknown>))
}

export async function listAgentCommerceEvents(params: {
  orgId: string
  entityType?: string
  entityId?: string
  eventType?: string
  createdAfter?: string
  createdBefore?: string
  limit?: number
}): Promise<AgentCommerceEvent[]> {
  let query = supabase
    .from('agent_commerce_events')
    .select(AGENT_COMMERCE_EVENT_SELECT)
    .eq('org_id', params.orgId)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50)

  if (params.entityType) query = query.eq('entity_type', params.entityType)
  if (params.entityId) query = query.eq('entity_id', params.entityId)
  if (params.eventType) query = query.eq('event_type', params.eventType)
  if (params.createdAfter) query = query.gte('created_at', params.createdAfter)
  if (params.createdBefore) query = query.lte('created_at', params.createdBefore)

  const { data, error } = await query
  if (error) reportDbError(error, 'listAgentCommerceEvents', { orgId: params.orgId })
  return (data ?? []).map((row) => mapAgentCommerceEvent(row as Record<string, unknown>))
}

export async function countAgentCommerceEvents(params: {
  orgId: string
  entityType?: string
  entityId?: string
  eventType: string
}): Promise<number> {
  let query = supabase
    .from('agent_commerce_events')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', params.orgId)
    .eq('event_type', params.eventType)

  if (params.entityType) query = query.eq('entity_type', params.entityType)
  if (params.entityId) query = query.eq('entity_id', params.entityId)

  const { count, error } = await query
  if (error) reportDbError(error, 'countAgentCommerceEvents', {
    orgId: params.orgId,
    eventType: params.eventType,
  })
  return count ?? 0
}

export async function countAgentCommerceEventsByType(params: {
  orgId: string
  eventTypes: readonly string[]
}): Promise<AgentCommerceEventCountsByType> {
  const eventTypes = [...new Set(params.eventTypes)]
  const entries = await Promise.all(eventTypes.map(async (eventType) => [
    eventType,
    await countAgentCommerceEvents({ orgId: params.orgId, eventType }),
  ] as const))

  return Object.fromEntries(entries)
}

export async function getAgentCommerceProductionLedgerAggregates(
  orgId: string,
): Promise<AgentCommerceDashboardLedgerAggregates> {
  const { data, error } = await supabase
    .rpc('agent_commerce_production_dashboard_ledger_aggregates', {
      p_org_id: orgId,
    })
    .maybeSingle()

  if (error) reportDbError(error, 'getAgentCommerceProductionLedgerAggregates', { orgId })
  return mapProductionLedgerAggregates(rowObject(data))
}

export async function countAgentCommerceProviderEventMismatches(orgId: string): Promise<number> {
  const { data, error } = await supabase.rpc('agent_commerce_provider_event_mismatch_count', {
    p_org_id: orgId,
  })

  if (error) reportDbError(error, 'countAgentCommerceProviderEventMismatches', { orgId })
  return numeric(data)
}

export async function listAgentCommerceProviderHealth(): Promise<AgentCommerceProviderHealthRecord[]> {
  const { data, error } = await supabase
    .from('agent_commerce_provider_health')
    .select(AGENT_COMMERCE_PROVIDER_HEALTH_SELECT)
    .order('provider', { ascending: true })

  if (error) reportDbError(error, 'listAgentCommerceProviderHealth', {})
  return (data ?? []).map((row) => mapProviderHealth(row as Record<string, unknown>))
}

export async function recordAgentCommerceProviderHealth(params: {
  provider: AgentCommerceProviderId
  mode: AgentCommerceProviderHealthRecord['mode']
  status: AgentCommerceProviderHealthRecord['status']
  success?: boolean
  metadata?: Record<string, unknown>
}): Promise<AgentCommerceProviderHealthRecord> {
  const provider = AgentCommerceProviderIdSchema.parse(params.provider)
  const now = new Date().toISOString()
  const { data: current, error: readError } = await supabase
    .from('agent_commerce_provider_health')
    .select(AGENT_COMMERCE_PROVIDER_HEALTH_SELECT)
    .eq('provider', provider)
    .maybeSingle()

  if (readError) reportDbError(readError, 'recordAgentCommerceProviderHealth.read', { provider })
  const currentFailureCount = Number((current as Record<string, unknown> | null)?.failure_count ?? 0)

  const { data, error } = await supabase
    .from('agent_commerce_provider_health')
    .upsert({
      provider,
      mode: params.mode,
      status: params.status,
      last_success_at: params.success === true ? now : (current as Record<string, unknown> | null)?.last_success_at ?? null,
      last_failure_at: params.success === false ? now : (current as Record<string, unknown> | null)?.last_failure_at ?? null,
      failure_count: params.success === true ? 0 : params.success === false ? currentFailureCount + 1 : currentFailureCount,
      metadata: {
        ...rowObject((current as Record<string, unknown> | null)?.metadata),
        ...(params.metadata ?? {}),
      },
      updated_at: now,
    })
    .select(AGENT_COMMERCE_PROVIDER_HEALTH_SELECT)
    .single()

  if (error) reportDbError(error, 'recordAgentCommerceProviderHealth.write', { provider })
  return mapProviderHealth(data as Record<string, unknown>)
}

export async function listAgentCommerceOpenOrgIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc('agent_commerce_open_org_ids')
  if (error) reportDbError(error, 'listAgentCommerceOpenOrgIds', {})
  return (data ?? []).map((row: { org_id?: string }) => row.org_id).filter(Boolean) as string[]
}

export async function reconcileAgentCommerceOrg(params: {
  orgId: string
  now?: string
  stuckAfter?: string
}): Promise<AgentCommerceReconciliationAction[]> {
  const { data, error } = await supabase.rpc('agent_commerce_reconcile_org', {
    p_org_id: params.orgId,
    p_now: params.now ?? new Date().toISOString(),
    p_stuck_after: params.stuckAfter ?? '15 minutes',
  })

  if (error) reportDbError(error, 'reconcileAgentCommerceOrg', { orgId: params.orgId })
  return (data ?? []).map((row: Record<string, unknown>) => ({
    entity_type: String(row.entity_type),
    action: String(row.action),
    updated_count: Number(row.updated_count ?? 0),
  }))
}

export async function listAgentCommerceProviderEventMismatches(params: {
  orgId: string
  limit?: number
}): Promise<AgentCommerceProviderEventMismatch[]> {
  const { data, error } = await supabase.rpc('agent_commerce_provider_event_mismatches', {
    p_org_id: params.orgId,
    p_limit: params.limit ?? 100,
  })

  if (error) reportDbError(error, 'listAgentCommerceProviderEventMismatches', { orgId: params.orgId })
  return (data ?? []).map((row: Record<string, unknown>) => ({
    event_id: String(row.event_id),
    provider: nullable(row.provider as string | null),
    event_type: String(row.event_type),
    entity_type: String(row.entity_type),
    entity_id: String(row.entity_id),
    reason: String(row.reason),
    created_at: String(row.created_at),
  }))
}

const ALLOWED_SPEND_TRANSITIONS: Record<AgentSpendRequestStatus, AgentSpendRequestStatus[]> = {
  draft: ['requires_connection', 'requires_approval', 'approved', 'declined', 'cancelled', 'failed'],
  requires_connection: ['requires_approval', 'approved', 'cancelled', 'failed', 'expired'],
  requires_approval: ['approved', 'declined', 'cancelled', 'expired', 'failed'],
  approved: ['credential_issuing', 'credential_issued', 'completed', 'cancelled', 'failed', 'expired'],
  credential_issuing: ['credential_issued', 'failed', 'expired'],
  credential_issued: ['completed', 'expired', 'failed'],
  completed: [],
  declined: [],
  expired: [],
  failed: [],
  cancelled: [],
}

export async function transitionAgentSpendRequest(params: {
  id: string
  orgId: string
  status: AgentSpendRequestStatus
  actorUserId?: string
  providerRequestId?: string
  providerCredentialId?: string
  credentialKind?: string
  metadata?: Record<string, unknown>
}): Promise<AgentSpendRequest> {
  const current = await getAgentSpendRequest(params.id, params.orgId)
  if (!current) throw new AgentCommerceError('not_found', 'Spend request was not found.', 404)
  if (!ALLOWED_SPEND_TRANSITIONS[current.status].includes(params.status)) {
    throw new AgentCommerceError(
      'invalid_state_transition',
      `Cannot transition spend request from ${current.status} to ${params.status}.`,
      409,
    )
  }

  const patch: Record<string, unknown> = {
    status: params.status,
    updated_at: new Date().toISOString(),
    metadata: { ...current.metadata, ...(params.metadata ?? {}) },
  }
  if (params.status === 'approved') {
    patch.approved_by = params.actorUserId ?? null
    patch.approved_at = new Date().toISOString()
  }
  if (params.status === 'completed') patch.completed_at = new Date().toISOString()
  if (params.providerRequestId) patch.provider_request_id = params.providerRequestId
  if (params.providerCredentialId) patch.provider_credential_id = params.providerCredentialId
  if (params.credentialKind) patch.credential_kind = params.credentialKind

  const { data, error } = await supabase
    .from('agent_spend_requests')
    .update(patch)
    .eq('id', params.id)
    .eq('org_id', params.orgId)
    .select(AGENT_SPEND_REQUEST_SELECT)
    .single()

  if (error) reportDbError(error, 'transitionAgentSpendRequest', { id: params.id, orgId: params.orgId })
  return mapSpendRequest(data as Record<string, unknown>)
}

export async function createAgentCommerceCredential(
  credential: AgentCommerceCredential,
): Promise<AgentCommerceCredential> {
  const parsed = AgentCommerceCredentialSchema.parse(credential)
  if (!parsed.org_id) {
    throw new AgentCommerceError('validation_failed', 'Credential org_id is required for persistence.', 400)
  }
  const { data, error } = await supabase
    .from('agent_commerce_credentials')
    .insert({
      spend_request_id: parsed.spend_request_id,
      org_id: parsed.org_id,
      provider: parsed.provider,
      kind: parsed.kind,
      status: parsed.status,
      secret_ref: parsed.secret_ref ?? null,
      display: parsed.display ?? null,
      usage_limits: parsed.usage_limits,
      expires_at: parsed.expires_at ?? null,
      metadata: parsed.metadata ?? {},
    })
    .select(AGENT_COMMERCE_CREDENTIAL_SELECT)
    .single()

  if (error) reportDbError(error, 'createAgentCommerceCredential', { spendRequestId: parsed.spend_request_id })
  return mapCredential(data as Record<string, unknown>)
}

export async function reserveAgentSpendBudget(params: {
  spendRequestId: string
  orgId: string
  amountCents: number
  currency: string
  expiresAt?: string
  metadata?: Record<string, unknown>
}): Promise<AgentCommerceBudgetReservation & { first_reservation: boolean }> {
  const { data, error } = await supabase.rpc('reserve_agent_spend_budget', {
    p_spend_request_id: params.spendRequestId,
    p_org_id: params.orgId,
    p_amount_cents: params.amountCents,
    p_currency: params.currency,
    p_expires_at: params.expiresAt ?? null,
    p_metadata: params.metadata ?? {},
  })

  if (error) reportDbError(error, 'reserveAgentSpendBudget', {
    spendRequestId: params.spendRequestId,
    orgId: params.orgId,
  })
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new AgentCommerceError('internal_error', 'Budget reservation returned no row.', 500)
  const reservation = mapBudgetReservation(row as Record<string, unknown>)
  return {
    ...reservation,
    first_reservation: Boolean((row as Record<string, unknown>).first_reservation),
  }
}

export async function releaseAgentSpendBudget(params: {
  spendRequestId: string
  orgId: string
  reason?: string
  metadata?: Record<string, unknown>
}): Promise<AgentCommerceBudgetReservation | null> {
  const { data, error } = await supabase.rpc('release_agent_spend_budget', {
    p_spend_request_id: params.spendRequestId,
    p_org_id: params.orgId,
    p_reason: params.reason ?? null,
    p_metadata: params.metadata ?? {},
  })

  if (error) reportDbError(error, 'releaseAgentSpendBudget', {
    spendRequestId: params.spendRequestId,
    orgId: params.orgId,
  })
  const row = Array.isArray(data) ? data[0] : data
  return row ? mapBudgetReservation(row as Record<string, unknown>) : null
}

export async function completeAgentSpendRequestWithLedger(params: {
  id: string
  orgId: string
  providerRequestId?: string
  providerCredentialId?: string
  metadata?: Record<string, unknown>
}): Promise<AgentSpendRequest> {
  const { data, error } = await supabase.rpc('complete_agent_spend_request', {
    p_spend_request_id: params.id,
    p_org_id: params.orgId,
    p_provider_request_id: params.providerRequestId ?? null,
    p_provider_credential_id: params.providerCredentialId ?? null,
    p_metadata: params.metadata ?? {},
  })

  if (error) reportDbError(error, 'completeAgentSpendRequestWithLedger', { id: params.id, orgId: params.orgId })
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new AgentCommerceError('not_found', 'Spend request was not found.', 404)
  return mapSpendRequest(row as Record<string, unknown>)
}

export async function listAgentSpendBudgetReservations(params: {
  orgId: string
  status?: AgentCommerceBudgetReservationStatus
  limit?: number
}): Promise<AgentCommerceBudgetReservation[]> {
  let query = supabase
    .from('agent_commerce_budget_reservations')
    .select(AGENT_COMMERCE_BUDGET_RESERVATION_SELECT)
    .eq('org_id', params.orgId)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50)

  if (params.status) query = query.eq('status', params.status)

  const { data, error } = await query
  if (error) reportDbError(error, 'listAgentSpendBudgetReservations', { orgId: params.orgId })
  return (data ?? []).map((row) => mapBudgetReservation(row as Record<string, unknown>))
}

export async function createSellerPaymentGrant(input: SellerPaymentGrantInput): Promise<SellerPaymentGrant> {
  const parsed = SellerPaymentGrantSchema.parse(input)
  const { data, error } = await supabase
    .from('seller_payment_grants')
    .insert({
      org_id: parsed.org_id,
      provider: parsed.provider,
      rail: parsed.rail,
      grant_id: parsed.grant_id,
      status: parsed.status,
      customer_reference: parsed.customer_reference ?? null,
      resource_type: parsed.resource_type,
      resource_id: parsed.resource_id ?? null,
      amount_cents: parsed.amount.amount,
      currency: parsed.amount.currency,
      usage_limits: parsed.usage_limits,
      provider_payment_id: parsed.provider_payment_id ?? null,
      entitlement_ref: parsed.entitlement_ref ?? null,
      expires_at: parsed.expires_at ?? null,
      metadata: parsed.metadata ?? {},
    })
    .select(SELLER_PAYMENT_GRANT_SELECT)
    .single()

  if (error) reportDbError(error, 'createSellerPaymentGrant', { orgId: parsed.org_id })
  return mapSellerGrant(data as Record<string, unknown>)
}

export async function getSellerPaymentGrant(id: string, orgId: string): Promise<SellerPaymentGrant | null> {
  const { data, error } = await supabase
    .from('seller_payment_grants')
    .select(SELLER_PAYMENT_GRANT_SELECT)
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) reportDbError(error, 'getSellerPaymentGrant', { id, orgId })
  return data ? mapSellerGrant(data as Record<string, unknown>) : null
}

export async function getSellerPaymentGrantByProviderGrantId(params: {
  provider: AgentCommerceProviderId
  grantId: string
  orgId?: string
}): Promise<SellerPaymentGrant | null> {
  let query = supabase
    .from('seller_payment_grants')
    .select(SELLER_PAYMENT_GRANT_SELECT)
    .eq('provider', params.provider)
    .eq('grant_id', params.grantId)

  if (params.orgId) query = query.eq('org_id', params.orgId)

  const { data, error } = await query.maybeSingle()
  if (error) reportDbError(error, 'getSellerPaymentGrantByProviderGrantId', {
    provider: params.provider,
    orgId: params.orgId,
  })
  return data ? mapSellerGrant(data as Record<string, unknown>) : null
}

export async function getSellerPaymentGrantByProviderPaymentId(params: {
  provider: AgentCommerceProviderId
  providerPaymentId: string
  orgId?: string
}): Promise<SellerPaymentGrant | null> {
  let query = supabase
    .from('seller_payment_grants')
    .select(SELLER_PAYMENT_GRANT_SELECT)
    .eq('provider', params.provider)
    .eq('provider_payment_id', params.providerPaymentId)

  if (params.orgId) query = query.eq('org_id', params.orgId)

  const { data, error } = await query.maybeSingle()
  if (error) reportDbError(error, 'getSellerPaymentGrantByProviderPaymentId', {
    provider: params.provider,
    orgId: params.orgId,
  })
  return data ? mapSellerGrant(data as Record<string, unknown>) : null
}

export async function listSellerPaymentGrants(params: {
  orgId: string
  status?: SellerPaymentGrantStatus
  limit?: number
}): Promise<SellerPaymentGrant[]> {
  let query = supabase
    .from('seller_payment_grants')
    .select(SELLER_PAYMENT_GRANT_SELECT)
    .eq('org_id', params.orgId)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50)

  if (params.status) query = query.eq('status', params.status)

  const { data, error } = await query
  if (error) reportDbError(error, 'listSellerPaymentGrants', { orgId: params.orgId })
  return (data ?? []).map((row) => mapSellerGrant(row as Record<string, unknown>))
}

const ALLOWED_SELLER_GRANT_TRANSITIONS: Record<SellerPaymentGrantStatus, SellerPaymentGrantStatus[]> = {
  received: ['validating', 'rejected', 'expired', 'failed'],
  validating: ['accepted', 'processing', 'completed', 'rejected', 'expired', 'failed'],
  accepted: ['processing', 'completed', 'revoked', 'expired', 'failed'],
  processing: ['completed', 'revoked', 'expired', 'failed'],
  completed: [],
  rejected: [],
  revoked: [],
  expired: [],
  failed: [],
}

export async function transitionSellerPaymentGrant(params: {
  id: string
  orgId: string
  status: SellerPaymentGrantStatus
  providerPaymentId?: string
  entitlementRef?: string
  metadata?: Record<string, unknown>
}): Promise<SellerPaymentGrant> {
  const current = await getSellerPaymentGrant(params.id, params.orgId)
  if (!current) throw new AgentCommerceError('not_found', 'Seller payment grant was not found.', 404)
  if (
    current.status !== params.status
    && !ALLOWED_SELLER_GRANT_TRANSITIONS[current.status].includes(params.status)
  ) {
    throw new AgentCommerceError(
      'invalid_state_transition',
      `Cannot transition seller grant from ${current.status} to ${params.status}.`,
      409,
    )
  }

  const patch: Record<string, unknown> = {
    status: params.status,
    updated_at: new Date().toISOString(),
    metadata: { ...current.metadata, ...(params.metadata ?? {}) },
  }
  if (params.providerPaymentId !== undefined) patch.provider_payment_id = params.providerPaymentId
  if (params.entitlementRef !== undefined) patch.entitlement_ref = params.entitlementRef

  const { data, error } = await supabase
    .from('seller_payment_grants')
    .update(patch)
    .eq('id', params.id)
    .eq('org_id', params.orgId)
    .select(SELLER_PAYMENT_GRANT_SELECT)
    .single()

  if (error) reportDbError(error, 'transitionSellerPaymentGrant', { id: params.id, orgId: params.orgId })
  return mapSellerGrant(data as Record<string, unknown>)
}

export interface AgentCommerceRateLimitClaim {
  allowed: boolean
  currentValue: number
  limitValue: number
  resetAt: string
}

export async function claimAgentCommerceRateLimit(params: {
  scopeKey: string
  bucketKey: string
  windowSeconds: number
  limit: number
  increment?: number
  now?: string
}): Promise<AgentCommerceRateLimitClaim> {
  const { data, error } = await supabase.rpc('claim_agent_commerce_rate_limit', {
    p_scope_key: params.scopeKey,
    p_bucket_key: params.bucketKey,
    p_window_seconds: params.windowSeconds,
    p_limit: params.limit,
    p_increment: params.increment ?? 1,
    p_now: params.now ?? new Date().toISOString(),
  })

  if (error) reportDbError(error, 'claimAgentCommerceRateLimit', {
    scopeKey: params.scopeKey,
    bucketKey: params.bucketKey,
  })
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new AgentCommerceError('internal_error', 'Agent Commerce rate-limit claim returned no row.', 500)
  return {
    allowed: Boolean(row.allowed),
    currentValue: Number(row.current_value ?? 0),
    limitValue: Number(row.limit_value ?? params.limit),
    resetAt: String(row.reset_at),
  }
}

export async function fulfillSellerPaymentGrantEntitlement(params: {
  id: string
  orgId: string
  now?: string
}): Promise<AgentCommerceSellerEntitlement> {
  const { data, error } = await supabase.rpc('fulfill_agent_commerce_seller_grant', {
    p_seller_grant_id: params.id,
    p_org_id: params.orgId,
    p_now: params.now ?? new Date().toISOString(),
  })

  if (error) reportDbError(error, 'fulfillSellerPaymentGrantEntitlement', { id: params.id, orgId: params.orgId })
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new AgentCommerceError('internal_error', 'Seller entitlement fulfillment returned no row.', 500)
  return mapSellerEntitlement(row as Record<string, unknown>)
}

export async function revokeSellerPaymentGrantEntitlement(params: {
  id: string
  orgId: string
  reason: string
  metadata?: Record<string, unknown>
  now?: string
}): Promise<AgentCommerceSellerEntitlement | null> {
  const { data, error } = await supabase.rpc('revoke_agent_commerce_seller_entitlement', {
    p_seller_grant_id: params.id,
    p_org_id: params.orgId,
    p_reason: params.reason,
    p_now: params.now ?? new Date().toISOString(),
    p_metadata: params.metadata ?? {},
  })

  if (error) reportDbError(error, 'revokeSellerPaymentGrantEntitlement', { id: params.id, orgId: params.orgId })
  const row = Array.isArray(data) ? data[0] : data
  return row ? mapSellerEntitlement(row as Record<string, unknown>) : null
}

export async function listAgentCommerceSellerEntitlements(params: {
  orgId: string
  status?: AgentCommerceSellerEntitlementStatus
  limit?: number
}): Promise<AgentCommerceSellerEntitlement[]> {
  let query = supabase
    .from('agent_commerce_seller_entitlements')
    .select(SELLER_ENTITLEMENT_SELECT)
    .eq('org_id', params.orgId)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50)

  if (params.status) query = query.eq('status', params.status)

  const { data, error } = await query
  if (error) reportDbError(error, 'listAgentCommerceSellerEntitlements', { orgId: params.orgId })
  return (data ?? []).map((row) => mapSellerEntitlement(row as Record<string, unknown>))
}

export async function createMachinePaymentChallenge(input: CreateMachinePaymentChallenge): Promise<MachinePaymentChallenge> {
  const parsed = CreateMachinePaymentChallengeSchema.parse(input)
  const body = parsed.challenge_body
  const challengeHash = crypto.randomUUID().replaceAll('-', '')
  const { data, error } = await supabase
    .from('machine_payment_challenges')
    .insert({
      org_id: parsed.org_id,
      provider: parsed.provider ?? 'manual',
      rail: parsed.rail ?? 'manual_approval',
      resource_type: parsed.resource_type,
      resource_id: parsed.resource_id,
      amount_cents: parsed.amount.amount,
      currency: parsed.amount.currency,
      challenge_hash: challengeHash,
      challenge_body: body,
      expires_at: parsed.expires_at ?? new Date(Date.now() + 5 * 60_000).toISOString(),
      metadata: parsed.metadata ?? {},
    })
    .select(MACHINE_PAYMENT_CHALLENGE_SELECT)
    .single()

  if (error) reportDbError(error, 'createMachinePaymentChallenge', { orgId: parsed.org_id })
  return mapMachineChallenge(data as Record<string, unknown>)
}

export async function claimMachinePaymentProof(input: MachinePaymentProofClaimInput): Promise<MachinePaymentProofClaim & { first_claim?: boolean }> {
  const parsed = MachinePaymentProofClaimInputSchema.parse(input)
  const { data, error } = await supabase.rpc('claim_machine_payment_proof', {
    p_challenge_id: parsed.challenge_id,
    p_org_id: parsed.org_id,
    p_provider: parsed.provider,
    p_proof_hash: parsed.proof_hash,
    p_provider_payment_id: parsed.provider_payment_id ?? null,
    p_metadata: parsed.metadata ?? {},
  })

  if (error) reportDbError(error, 'claimMachinePaymentProof', { orgId: parsed.org_id })
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new AgentCommerceError('not_found', 'Machine payment proof claim failed.', 404)
  return mapProofClaim(row as Record<string, unknown>)
}

export async function appendAgentCommerceEvent(input: AgentCommerceEventInput): Promise<AgentCommerceEvent> {
  const parsed = AgentCommerceEventSchema.parse(input)
  const { data, error } = await supabase
    .from('agent_commerce_events')
    .insert({
      contract_version: parsed.contract_version,
      schema_version: parsed.schema_version,
      stack_id: 'commerce',
      org_id: parsed.org_id,
      entity_type: parsed.entity_type,
      entity_id: parsed.entity_id,
      event_type: parsed.event_type,
      provider: parsed.provider ?? null,
      provider_event_id: parsed.provider_event_id ?? null,
      actor_type: parsed.actor_type,
      actor_id: parsed.actor_id ?? null,
      request_id: parsed.request_id ?? null,
      run_id: parsed.run_id ?? null,
      payload: parsed.payload ?? {},
    })
    .select(AGENT_COMMERCE_EVENT_SELECT)
    .single()

  if (error) reportDbError(error, 'appendAgentCommerceEvent', { orgId: parsed.org_id })
  const event = mapAgentCommerceEvent(data as Record<string, unknown>)
  if (event.id) {
    const entitySnapshot = await readCommerceEvidenceEntitySnapshot(event)
    const evidence = commerceEvidenceMetadata(event, entitySnapshot)
    await recordCommerceKnowledgeEvidence({
      orgId: event.org_id,
      commerceEventId: event.id,
      entityType: event.entity_type,
      entityId: event.entity_id,
      eventType: event.event_type,
      provider: event.provider ?? null,
      actorType: event.actor_type,
      actorId: event.actor_id ?? null,
      projectId: evidence.projectId,
      assistantId: evidence.assistantId,
      connectionId: evidence.connectionId,
      sellerId: evidence.sellerId,
      budgetReservationId: evidence.budgetReservationId,
      ledgerId: evidence.ledgerId,
      idempotencyKey: evidence.idempotencyKey,
      runId: event.run_id ?? null,
      requestId: event.request_id ?? null,
      providerEventId: event.provider_event_id ?? null,
      outcome: evidence.outcome,
      status: evidence.status,
      amount: evidence.amount,
      currency: evidence.currency,
      metadata: {
        ...evidence.metadata,
        payload: rowObject(event.payload),
      },
    })
  }
  return event
}
