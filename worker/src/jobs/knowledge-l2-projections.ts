import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { getConfig } from '../config.js'

type ProjectionPolicy = 'commitment_only' | 'encrypted_payload' | 'public_payload'
type ProjectionStatus = 'pending' | 'projecting' | 'projected' | 'failed' | 'skipped'

interface KnowledgeL2OutboxRow {
  id: string
  org_id: string
  project_id: string | null
  team_id: string | null
  assistant_id: string | null
  local_resource_type: string
  local_resource_id: string
  projection_policy: ProjectionPolicy
  namespace: string
  scoped_user_id: string | null
  agent_passport_id: string | null
  channel_type: string | null
  channel_id: string | null
  conversation_id: string | null
  content_hash: string
  payload_redacted: Record<string, unknown> | null
  encrypted_payload: string | null
  attempts: number
  metadata: Record<string, unknown> | null
}

export interface KnowledgeL2ProjectionRequest {
  namespace: string
  localResource: {
    type: string
    id: string
    orgId: string
    projectId: string | null
    teamId: string | null
    assistantId: string | null
  }
  identity: {
    scopedUserId: string | null
    agentPassportId: string | null
    channelType: string | null
    channelId: string | null
    conversationId: string | null
  }
  projection: {
    policy: ProjectionPolicy
    contentHash: string
    payloadRedacted: Record<string, unknown>
    encryptedPayload: string | null
  }
  metadata: Record<string, unknown>
}

export interface KnowledgeL2ProjectionResponse {
  l2MemoryId?: string | null
  receiptHash?: string | null
  snapshotCid?: string | null
  anchorEpochId?: string | null
  anchorTxHash?: string | null
  anchorStatus?: 'pending' | 'anchored' | 'verified' | 'failed'
  verificationStatus?: 'unverified' | 'verified' | 'failed'
  verificationPayload?: Record<string, unknown>
}

export interface KnowledgeL2ProjectionRunResult {
  scanned: number
  projected: number
  failed: number
  skipped: number
  reconciled: number
}

export async function projectKnowledgeL2Outbox(
  supabase: SupabaseClient,
  config: ReturnType<typeof getConfig>,
  fetchImpl: typeof fetch = fetch,
): Promise<KnowledgeL2ProjectionRunResult> {
  if (!config.LUCID_KNOWLEDGE_L2_PROJECTION_ENABLED) {
    return { scanned: 0, projected: 0, failed: 0, skipped: 0, reconciled: 0 }
  }

  if (!config.LUCID_KNOWLEDGE_L2_API_URL) {
    console.warn('[knowledge-l2] projection enabled but LUCID_KNOWLEDGE_L2_API_URL is not configured')
    return { scanned: 0, projected: 0, failed: 0, skipped: 1, reconciled: 0 }
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('knowledge_l2_projection_outbox')
    .select([
      'id',
      'org_id',
      'project_id',
      'team_id',
      'assistant_id',
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
      'attempts',
      'metadata',
    ].join(', '))
    .in('status', ['pending', 'failed'])
    .neq('projection_policy', 'disabled')
    .lte('next_attempt_at', now)
    .order('created_at', { ascending: true })
    .limit(config.KNOWLEDGE_L2_PROJECTION_BATCH_SIZE)

  if (error) {
    console.warn('[knowledge-l2] failed to load projection outbox:', error.message)
    return { scanned: 0, projected: 0, failed: 0, skipped: 0, reconciled: 0 }
  }

  let projected = 0
  let failed = 0
  const rows = (data ?? []) as unknown as KnowledgeL2OutboxRow[]
  for (const row of rows) {
    const claimed = await markProjectionStatus(supabase, row.id, 'projecting', { attempts: row.attempts + 1 })
    if (!claimed) {
      failed += 1
      continue
    }

    try {
      const response = await sendKnowledgeProjectionToL2(
        config.LUCID_KNOWLEDGE_L2_API_URL,
        config.LUCID_KNOWLEDGE_L2_API_TOKEN ?? null,
        buildKnowledgeL2ProjectionRequest(row),
        config.KNOWLEDGE_L2_PROJECTION_REQUEST_TIMEOUT_MS,
        fetchImpl,
      )
      await markProjectionProjected(supabase, row, response)
      projected += 1
    } catch (error) {
      await markProjectionFailed(supabase, row.id, row.attempts + 1, error)
      failed += 1
    }
  }

  const reconciled = await reconcileKnowledgeL2ProjectionState(supabase)

  if (projected || failed || reconciled) {
    console.log('[knowledge-l2] projection batch complete', { scanned: rows.length, projected, failed, reconciled })
  }
  return { scanned: rows.length, projected, failed, skipped: 0, reconciled }
}

export function buildKnowledgeL2ProjectionRequest(row: KnowledgeL2OutboxRow): KnowledgeL2ProjectionRequest {
  return {
    namespace: row.namespace,
    localResource: {
      type: row.local_resource_type,
      id: row.local_resource_id,
      orgId: row.org_id,
      projectId: row.project_id,
      teamId: row.team_id,
      assistantId: row.assistant_id,
    },
    identity: {
      scopedUserId: row.scoped_user_id,
      agentPassportId: row.agent_passport_id,
      channelType: row.channel_type,
      channelId: row.channel_id,
      conversationId: row.conversation_id,
    },
    projection: {
      policy: row.projection_policy,
      contentHash: row.content_hash,
      payloadRedacted: row.payload_redacted ?? {},
      encryptedPayload: row.encrypted_payload,
    },
    metadata: row.metadata ?? {},
  }
}

async function sendKnowledgeProjectionToL2(
  baseUrl: string,
  token: string | null,
  request: KnowledgeL2ProjectionRequest,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<KnowledgeL2ProjectionResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(new URL('/v1/knowledge/projections', baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Lucid-L2 projection failed with ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`)
    }
    return await response.json() as KnowledgeL2ProjectionResponse
  } finally {
    clearTimeout(timeout)
  }
}

async function markProjectionStatus(
  supabase: SupabaseClient,
  id: string,
  status: ProjectionStatus,
  patch: Record<string, unknown> = {},
): Promise<boolean> {
  const { error } = await supabase
    .from('knowledge_l2_projection_outbox')
    .update({ status, ...patch })
    .eq('id', id)
  if (error) {
    console.warn('[knowledge-l2] failed to update projection status:', error.message)
    return false
  }
  return true
}

async function markProjectionProjected(
  supabase: SupabaseClient,
  row: KnowledgeL2OutboxRow,
  response: KnowledgeL2ProjectionResponse,
): Promise<void> {
  const receiptHash = response.receiptHash ?? buildLocalReceiptHash(row.content_hash, response)
  const receipt = {
    org_id: row.org_id,
    outbox_id: row.id,
    local_resource_type: row.local_resource_type,
    local_resource_id: row.local_resource_id,
    agent_passport_id: row.agent_passport_id,
    namespace: row.namespace,
    l2_memory_id: response.l2MemoryId ?? null,
    content_hash: row.content_hash,
    receipt_hash: receiptHash,
    snapshot_cid: response.snapshotCid ?? null,
    anchor_epoch_id: response.anchorEpochId ?? null,
    anchor_tx_hash: response.anchorTxHash ?? null,
    anchor_status: response.anchorStatus ?? 'pending',
    verification_status: response.verificationStatus ?? 'unverified',
    verification_payload: response.verificationPayload ?? {},
  }
  const { error: receiptError } = await supabase
    .from('knowledge_l2_projection_receipts')
    .insert(receipt)
  if (receiptError) throw new Error(`Failed to store Lucid-L2 receipt: ${receiptError.message}`)

  const { error: updateError } = await supabase
    .from('knowledge_l2_projection_outbox')
    .update({
      status: 'projected',
      projected_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', row.id)
  if (updateError) throw new Error(`Failed to mark Lucid-L2 projection projected: ${updateError.message}`)
}

async function markProjectionFailed(
  supabase: SupabaseClient,
  id: string,
  attempts: number,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  const { error: updateError } = await supabase
    .from('knowledge_l2_projection_outbox')
    .update({
      status: 'failed',
      attempts,
      next_attempt_at: calculateNextAttemptAt(attempts).toISOString(),
      last_error: message.slice(0, 2000),
    })
    .eq('id', id)
  if (updateError) {
    console.warn('[knowledge-l2] failed to mark projection failed:', updateError.message)
  }
}

export function calculateNextAttemptAt(attempts: number, now = new Date()): Date {
  const cappedAttempts = Math.min(Math.max(attempts, 1), 8)
  const delayMs = Math.min(60 * 60 * 1000, 2 ** cappedAttempts * 30 * 1000)
  return new Date(now.getTime() + delayMs)
}

async function reconcileKnowledgeL2ProjectionState(supabase: SupabaseClient): Promise<number> {
  const staleProjectingBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const staleAnchorBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  let reconciled = 0

  const { data: staleProjecting } = await supabase
    .from('knowledge_l2_projection_outbox')
    .select('id, attempts')
    .eq('status', 'projecting')
    .lt('updated_at', staleProjectingBefore)
    .limit(50)

  for (const row of (staleProjecting ?? []) as Array<{ id: string; attempts: number }>) {
    await markProjectionFailed(supabase, row.id, row.attempts + 1, new Error('Projection lease expired before completion'))
    reconciled += 1
  }

  const { data: projectedRows } = await supabase
    .from('knowledge_l2_projection_outbox')
    .select('id, attempts')
    .eq('status', 'projected')
    .lt('projected_at', staleProjectingBefore)
    .limit(50)

  const projectedIds = ((projectedRows ?? []) as Array<{ id: string; attempts: number }>).map((row) => row.id)
  if (projectedIds.length > 0) {
    const { data: receipts } = await supabase
      .from('knowledge_l2_projection_receipts')
      .select('outbox_id')
      .in('outbox_id', projectedIds)

    const receiptIds = new Set(((receipts ?? []) as Array<{ outbox_id: string }>).map((row) => row.outbox_id))
    for (const row of (projectedRows ?? []) as Array<{ id: string; attempts: number }>) {
      if (!receiptIds.has(row.id)) {
        await markProjectionFailed(supabase, row.id, row.attempts + 1, new Error('Projection marked projected without a stored receipt'))
        reconciled += 1
      }
    }
  }

  const { data: staleAnchors } = await supabase
    .from('knowledge_l2_projection_receipts')
    .select('id')
    .eq('anchor_status', 'pending')
    .lt('created_at', staleAnchorBefore)
    .limit(50)

  const staleAnchorIds = ((staleAnchors ?? []) as Array<{ id: string }>).map((row) => row.id)
  if (staleAnchorIds.length > 0) {
    const { error } = await supabase
      .from('knowledge_l2_projection_receipts')
      .update({
        anchor_status: 'failed',
        verification_status: 'failed',
        verification_payload: { reason: 'anchor_stale', checkedAt: new Date().toISOString() },
      })
      .in('id', staleAnchorIds)
    if (!error) reconciled += staleAnchorIds.length
  }

  return reconciled
}

function buildLocalReceiptHash(contentHash: string, response: KnowledgeL2ProjectionResponse): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      contentHash,
      l2MemoryId: response.l2MemoryId ?? null,
      snapshotCid: response.snapshotCid ?? null,
      anchorEpochId: response.anchorEpochId ?? null,
    }))
    .digest('hex')
}
