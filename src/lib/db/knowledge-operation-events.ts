import 'server-only'

import crypto from 'node:crypto'

import { ErrorService, supabase } from './client'
import type { KnowledgeOperationId, KnowledgeOperationSurface } from '@/lib/knowledge/operations'

export type KnowledgeOperationAuditId = KnowledgeOperationId | 'agent_ops.launch' | string

export interface RecordKnowledgeOperationEventInput {
  orgId: string
  actorUserId?: string | null
  operationId: KnowledgeOperationAuditId
  surface?: KnowledgeOperationSurface
  success: boolean
  durationMs: number
  input?: unknown
  outputSummary?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  metadata?: Record<string, unknown>
}

export interface RecordCommerceKnowledgeEvidenceInput {
  orgId: string
  commerceEventId: string
  entityType: string
  entityId: string
  eventType: string
  provider?: string | null
  actorType?: string | null
  actorId?: string | null
  projectId?: string | null
  assistantId?: string | null
  connectionId?: string | null
  sellerId?: string | null
  budgetReservationId?: string | null
  ledgerId?: string | null
  idempotencyKey?: string | null
  runId?: string | null
  requestId?: string | null
  providerEventId?: string | null
  outcome?: string | null
  status?: string | null
  amount?: number | null
  currency?: string | null
  metadata?: Record<string, unknown>
}

export interface CommerceKnowledgeEvidenceEvent {
  id: string
  org_id: string
  commerce_event_id: string
  operation_id: KnowledgeOperationAuditId
  surface: KnowledgeOperationSurface
  success: boolean
  output_summary: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export async function recordKnowledgeOperationEvent(input: RecordKnowledgeOperationEventInput): Promise<void> {
  const row = {
    org_id: input.orgId,
    actor_user_id: input.actorUserId ?? null,
    operation_id: input.operationId,
    surface: input.surface ?? 'app_api',
    success: input.success,
    duration_ms: Math.max(0, Math.round(input.durationMs)),
    input_hash: input.input === undefined ? null : hashOperationInput(input.input),
    output_summary: input.outputSummary?.slice(0, 1000) ?? null,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage?.slice(0, 1000) ?? null,
    metadata: input.metadata ?? {},
  }

  let { error } = await supabase
    .from('knowledge_operation_events')
    .insert(row)

  if (isActorUserForeignKeyError(error) && input.actorUserId) {
    const retry = await supabase
      .from('knowledge_operation_events')
      .insert({
        ...row,
        actor_user_id: null,
        metadata: {
          ...row.metadata,
          actor_user_id_unlinked: true,
        },
      })
    error = retry.error
  }

  if (isOrganizationForeignKeyError(error)) {
    // Operation audit events are best-effort. Async brain/commerce writes can
    // complete after short-lived E2E or deleted workspaces are gone; the source
    // operation should stay successful and logs should not look like product
    // failures when there is no valid org to attach the audit row to.
    return
  }

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        operation: 'recordKnowledgeOperationEvent',
        orgId: input.orgId,
        knowledgeOperationId: input.operationId,
      },
      tags: { layer: 'database', table: 'knowledge_operation_events' },
    })
  }
}

function isActorUserForeignKeyError(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error?.code === '23503' &&
    (error.message ?? '').includes('knowledge_operation_events_actor_user_id_fkey'),
  )
}

function isOrganizationForeignKeyError(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error?.code === '23503' &&
    (error.message ?? '').includes('knowledge_operation_events_org_id_fkey'),
  )
}

export async function recordCommerceKnowledgeEvidence(input: RecordCommerceKnowledgeEvidenceInput): Promise<void> {
  const summaryBits = [
    input.eventType,
    input.outcome,
    input.status,
    input.provider,
  ].filter(Boolean)

  await recordKnowledgeOperationEvent({
    orgId: input.orgId,
    actorUserId: input.actorType === 'user' ? input.actorId ?? null : null,
    operationId: 'knowledge.write_project',
    surface: 'agent_ops',
    success: true,
    durationMs: 0,
    input: {
      evidence: [{
        kind: 'commerce_event',
        commerceEventId: input.commerceEventId,
        label: input.eventType,
        provider: input.provider ?? null,
        outcome: input.outcome ?? null,
        status: input.status ?? null,
      }],
      source: {
        type: 'agent_commerce',
        label: input.provider ?? 'agent_commerce',
      },
    },
    outputSummary: `Commerce evidence: ${summaryBits.join(' · ') || input.commerceEventId}.`,
    metadata: {
      evidence_kind: 'commerce_event',
      commerce_event_id: input.commerceEventId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      event_type: input.eventType,
      provider: input.provider ?? null,
      actor_type: input.actorType ?? null,
      actor_id: input.actorId ?? null,
      project_id: input.projectId ?? null,
      assistant_id: input.assistantId ?? null,
      connection_id: input.connectionId ?? null,
      seller_id: input.sellerId ?? null,
      budget_reservation_id: input.budgetReservationId ?? null,
      ledger_id: input.ledgerId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      run_id: input.runId ?? null,
      request_id: input.requestId ?? null,
      provider_event_id: input.providerEventId ?? null,
      outcome: input.outcome ?? null,
      status: input.status ?? null,
      amount: input.amount ?? null,
      currency: input.currency ?? null,
      ...(input.metadata ?? {}),
    },
  })
}

export async function listCommerceKnowledgeEvidenceEvents(input: {
  orgId: string
  commerceEventIds?: string[]
  limit?: number
}): Promise<CommerceKnowledgeEvidenceEvent[]> {
  const eventIds = [...new Set(input.commerceEventIds ?? [])].filter(Boolean)
  if (eventIds.length === 0) return []

  let query = supabase
    .from('knowledge_operation_events')
    .select('id, org_id, operation_id, surface, success, output_summary, metadata, created_at')
    .eq('org_id', input.orgId)
    .eq('metadata->>evidence_kind', 'commerce_event')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 500))

  query = query.in('metadata->>commerce_event_id', eventIds)

  const { data, error } = await query

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        operation: 'listCommerceKnowledgeEvidenceEvents',
        orgId: input.orgId,
        commerceEventCount: eventIds.length,
      },
      tags: { layer: 'database', table: 'knowledge_operation_events' },
    })
    return []
  }

  return normalizeCommerceKnowledgeEvidenceRows(data ?? [])
}

export async function listRecentCommerceKnowledgeEvidenceEvents(input: {
  orgId: string
  since: string
  projectId?: string | null
  teamId?: string | null
  limit?: number
}): Promise<CommerceKnowledgeEvidenceEvent[]> {
  let query = supabase
    .from('knowledge_operation_events')
    .select('id, org_id, operation_id, surface, success, output_summary, metadata, created_at')
    .eq('org_id', input.orgId)
    .eq('metadata->>evidence_kind', 'commerce_event')
    .gte('created_at', input.since)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 200))

  if (input.projectId) query = query.eq('metadata->>project_id', input.projectId)
  if (input.teamId) query = query.eq('metadata->>team_id', input.teamId)

  const { data, error } = await query

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        operation: 'listRecentCommerceKnowledgeEvidenceEvents',
        orgId: input.orgId,
        since: input.since,
        projectId: input.projectId ?? undefined,
        teamId: input.teamId ?? undefined,
      },
      tags: { layer: 'database', table: 'knowledge_operation_events' },
    })
    return []
  }

  return normalizeCommerceKnowledgeEvidenceRows(data ?? [])
}

function normalizeCommerceKnowledgeEvidenceRows(rows: unknown[]): CommerceKnowledgeEvidenceEvent[] {
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return []
    const record = row as Record<string, unknown>
    const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
      ? record.metadata as Record<string, unknown>
      : {}
    const commerceEventId = metadata.commerce_event_id
    if (typeof commerceEventId !== 'string' || !commerceEventId) return []
    return [{
      id: String(record.id),
      org_id: String(record.org_id),
      commerce_event_id: commerceEventId,
      operation_id: record.operation_id as KnowledgeOperationId,
      surface: record.surface as KnowledgeOperationSurface,
      success: Boolean(record.success),
      output_summary: typeof record.output_summary === 'string' ? record.output_summary : null,
      metadata,
      created_at: String(record.created_at),
    }]
  })
}

export function hashOperationInput(input: unknown): string {
  return crypto
    .createHash('sha256')
    .update(stableStringify(input))
    .digest('hex')
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`
}
