import 'server-only'

import { ErrorService, supabase } from './client'
import type {
  KnowledgeL2ProjectionPolicy,
  KnowledgeL2ResourceType,
} from '@/lib/knowledge/l2-projection-policy'

export type KnowledgeL2ProjectionStatus = 'pending' | 'projecting' | 'projected' | 'failed' | 'skipped'
export type KnowledgeL2AnchorStatus = 'pending' | 'anchored' | 'verified' | 'failed'
export type KnowledgeL2VerificationStatus = 'unverified' | 'verified' | 'failed'

export interface KnowledgeL2ProjectionOutboxRow {
  id: string
  orgId: string
  projectId: string | null
  teamId: string | null
  assistantId: string | null
  sourceId: string | null
  pageId: string | null
  eventId: string | null
  localResourceType: KnowledgeL2ResourceType
  localResourceId: string
  projectionPolicy: KnowledgeL2ProjectionPolicy
  namespace: string
  scopedUserId: string | null
  agentPassportId: string | null
  channelType: string | null
  channelId: string | null
  conversationId: string | null
  contentHash: string
  payloadRedacted: Record<string, unknown>
  encryptedPayload: string | null
  status: KnowledgeL2ProjectionStatus
  attempts: number
  nextAttemptAt: string
  lastError: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  projectedAt: string | null
}

export interface KnowledgeL2ProjectionReceipt {
  id: string
  orgId: string
  outboxId: string
  localResourceType: KnowledgeL2ResourceType
  localResourceId: string
  agentPassportId: string | null
  namespace: string
  l2MemoryId: string | null
  contentHash: string
  receiptHash: string
  snapshotCid: string | null
  anchorEpochId: string | null
  anchorTxHash: string | null
  anchorStatus: KnowledgeL2AnchorStatus
  verificationStatus: KnowledgeL2VerificationStatus
  verificationPayload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface EnqueueKnowledgeL2ProjectionInput {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  assistantId?: string | null
  sourceId?: string | null
  pageId?: string | null
  eventId?: string | null
  localResourceType: KnowledgeL2ResourceType
  localResourceId: string
  projectionPolicy: KnowledgeL2ProjectionPolicy
  namespace: string
  scopedUserId?: string | null
  agentPassportId?: string | null
  channelType?: string | null
  channelId?: string | null
  conversationId?: string | null
  contentHash: string
  payloadRedacted: Record<string, unknown>
  encryptedPayload?: string | null
  metadata?: Record<string, unknown>
}

type KnowledgeL2OutboxDbRow = {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  assistant_id: string | null
  source_id: string | null
  page_id: string | null
  event_id: string | null
  local_resource_type: KnowledgeL2ResourceType
  local_resource_id: string
  projection_policy: KnowledgeL2ProjectionPolicy
  namespace: string
  scoped_user_id: string | null
  agent_passport_id: string | null
  channel_type: string | null
  channel_id: string | null
  conversation_id: string | null
  content_hash: string
  payload_redacted: Record<string, unknown> | null
  encrypted_payload: string | null
  status: KnowledgeL2ProjectionStatus
  attempts: number
  next_attempt_at: string
  last_error: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  projected_at: string | null
}

type KnowledgeL2ReceiptDbRow = {
  id: string
  org_id: string
  outbox_id: string
  local_resource_type: KnowledgeL2ResourceType
  local_resource_id: string
  agent_passport_id: string | null
  namespace: string
  l2_memory_id: string | null
  content_hash: string
  receipt_hash: string
  snapshot_cid: string | null
  anchor_epoch_id: string | null
  anchor_tx_hash: string | null
  anchor_status: KnowledgeL2AnchorStatus
  verification_status: KnowledgeL2VerificationStatus
  verification_payload: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

const OUTBOX_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'team_id',
  'assistant_id',
  'source_id',
  'page_id',
  'event_id',
  'local_resource_type',
  'local_resource_id',
  'projection_policy',
  'namespace',
  'scoped_user_id',
  'agent_passport_id',
  'channel_type',
  'channel_id',
  'conversation_id',
  'content_hash',
  'payload_redacted',
  'encrypted_payload',
  'status',
  'attempts',
  'next_attempt_at',
  'last_error',
  'metadata',
  'created_at',
  'updated_at',
  'projected_at',
].join(', ')

const RECEIPT_COLUMNS = [
  'id',
  'org_id',
  'outbox_id',
  'local_resource_type',
  'local_resource_id',
  'agent_passport_id',
  'namespace',
  'l2_memory_id',
  'content_hash',
  'receipt_hash',
  'snapshot_cid',
  'anchor_epoch_id',
  'anchor_tx_hash',
  'anchor_status',
  'verification_status',
  'verification_payload',
  'created_at',
  'updated_at',
].join(', ')

export async function enqueueKnowledgeL2Projection(
  input: EnqueueKnowledgeL2ProjectionInput,
): Promise<KnowledgeL2ProjectionOutboxRow | null> {
  if (input.projectionPolicy === 'disabled') return null

  const { data, error } = await supabase
    .from('knowledge_l2_projection_outbox')
    .upsert({
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      team_id: input.teamId ?? null,
      assistant_id: input.assistantId ?? null,
      source_id: input.sourceId ?? null,
      page_id: input.pageId ?? null,
      event_id: input.eventId ?? null,
      local_resource_type: input.localResourceType,
      local_resource_id: input.localResourceId,
      projection_policy: input.projectionPolicy,
      namespace: input.namespace,
      scoped_user_id: input.scopedUserId ?? null,
      agent_passport_id: input.agentPassportId ?? null,
      channel_type: input.channelType ?? null,
      channel_id: input.channelId ?? null,
      conversation_id: input.conversationId ?? null,
      content_hash: input.contentHash,
      payload_redacted: input.payloadRedacted,
      encrypted_payload: input.encryptedPayload ?? null,
      status: 'pending',
      next_attempt_at: new Date().toISOString(),
      metadata: input.metadata ?? {},
    }, { onConflict: 'org_id,local_resource_type,local_resource_id,content_hash' })
    .select(OUTBOX_COLUMNS)
    .single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Knowledge L2 projection enqueue returned no row'), {
      severity: 'warning',
      context: { operation: 'enqueueKnowledgeL2Projection', orgId: input.orgId, localResourceType: input.localResourceType },
      tags: { layer: 'database', table: 'knowledge_l2_projection_outbox' },
    })
    return null
  }

  return mapOutboxRow(data as unknown as KnowledgeL2OutboxDbRow)
}

export async function listKnowledgeL2Receipts(input: {
  orgId: string
  localResourceType?: KnowledgeL2ResourceType
  localResourceId?: string
  limit?: number
}): Promise<KnowledgeL2ProjectionReceipt[]> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100)
  let query = supabase
    .from('knowledge_l2_projection_receipts')
    .select(RECEIPT_COLUMNS)
    .eq('org_id', input.orgId)

  if (input.localResourceType) query = query.eq('local_resource_type', input.localResourceType)
  if (input.localResourceId) query = query.eq('local_resource_id', input.localResourceId)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'listKnowledgeL2Receipts', orgId: input.orgId },
      tags: { layer: 'database', table: 'knowledge_l2_projection_receipts' },
    })
    return []
  }

  return ((data ?? []) as unknown as KnowledgeL2ReceiptDbRow[]).map(mapReceiptRow)
}

export function mapOutboxRow(row: KnowledgeL2OutboxDbRow): KnowledgeL2ProjectionOutboxRow {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    teamId: row.team_id,
    assistantId: row.assistant_id,
    sourceId: row.source_id,
    pageId: row.page_id,
    eventId: row.event_id,
    localResourceType: row.local_resource_type,
    localResourceId: row.local_resource_id,
    projectionPolicy: row.projection_policy,
    namespace: row.namespace,
    scopedUserId: row.scoped_user_id,
    agentPassportId: row.agent_passport_id,
    channelType: row.channel_type,
    channelId: row.channel_id,
    conversationId: row.conversation_id,
    contentHash: row.content_hash,
    payloadRedacted: row.payload_redacted ?? {},
    encryptedPayload: row.encrypted_payload,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projectedAt: row.projected_at,
  }
}

export function mapReceiptRow(row: KnowledgeL2ReceiptDbRow): KnowledgeL2ProjectionReceipt {
  return {
    id: row.id,
    orgId: row.org_id,
    outboxId: row.outbox_id,
    localResourceType: row.local_resource_type,
    localResourceId: row.local_resource_id,
    agentPassportId: row.agent_passport_id,
    namespace: row.namespace,
    l2MemoryId: row.l2_memory_id,
    contentHash: row.content_hash,
    receiptHash: row.receipt_hash,
    snapshotCid: row.snapshot_cid,
    anchorEpochId: row.anchor_epoch_id,
    anchorTxHash: row.anchor_tx_hash,
    anchorStatus: row.anchor_status,
    verificationStatus: row.verification_status,
    verificationPayload: row.verification_payload ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
