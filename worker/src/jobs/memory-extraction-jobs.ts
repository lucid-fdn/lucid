/**
 * Durable assistant memory extraction jobs.
 *
 * The inbound path enqueues a small reference job after the user-visible reply
 * is complete. This worker reconstructs/decrypts recent context from the DB,
 * runs the existing memory pipeline, and records retry/dead-letter state.
 */

import crypto from 'node:crypto'
import pLimit from 'p-limit'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../config.js'
import type { EncryptionMode, EncryptionService } from '../crypto/encryption-service.js'
import { computeTenantKeys } from '../utils/tenant-keys.js'
import { decryptAssistantMessageRows, type AssistantMessageContextRow } from '../memory/message-context.js'
import { extractAndStoreMemories, type ExtractAndStoreResult } from '../memory/extractAndStoreMemories.js'

export interface MemoryExtractionEnqueueParams {
  assistantId: string
  assistantOrgId: string | null
  conversationId: string
  inboundEventId: string
  runId: string
  channelType: string
  channelId: string
  externalMessageId: string | null
  conversationMessageCount: number
  encryptionMode: EncryptionMode
}

export interface MemoryExtractionJob {
  id: string
  idempotency_key: string
  assistant_id: string
  org_id: string | null
  conversation_id: string
  inbound_event_id: string
  run_id: string
  channel_type: string
  channel_id: string
  external_message_id: string | null
  conversation_message_count: number
  encryption_mode: EncryptionMode
  retry_count: number
  max_retries: number
}

export interface MemoryExtractionQueueSnapshot {
  pending: number
  failed: number
  claimed: number
  deadLetter: number
  oldestPendingAgeMs: number
  batchSize: number
  concurrency: number
}

export interface MemoryExtractionBackpressureDecision {
  status: 'ok' | 'watch' | 'throttle' | 'critical'
  backlogDepth: number
  retryPressure: number
  recommendedBatchSize: number
  recommendedConcurrency: number
  recommendedPollIntervalMs: number
  reasons: string[]
}

interface AssistantRow {
  id: string
  name: string | null
  memory_enabled: boolean
  memory_strategy: 'auto' | 'aggressive' | 'conservative' | 'off' | null
  org_id: string | null
}

interface InboundEventRow {
  id: string
  external_user_id: string | null
  external_chat_id: string | null
  message_text: string | null
  message_data: Record<string, unknown> | null
}

let polling = false
let failures = 0

export function buildMemoryExtractionIdempotencyKey(params: {
  assistantId: string
  conversationId: string
  inboundEventId: string
  channelType?: string | null
  channelId?: string | null
  externalMessageId?: string | null
  conversationMessageCount: number
}): string {
  const messageIdentity = params.externalMessageId
    ? `external:${params.channelType ?? 'unknown'}:${params.channelId ?? 'unknown'}:${params.externalMessageId}`
    : `inbound:${params.inboundEventId}`
  const raw = [
    params.assistantId,
    params.conversationId,
    messageIdentity,
    String(params.conversationMessageCount),
  ].join(':')
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export function evaluateMemoryExtractionBackpressure(
  snapshot: MemoryExtractionQueueSnapshot,
): MemoryExtractionBackpressureDecision {
  const backlogDepth = snapshot.pending + snapshot.failed
  const retryPressure = backlogDepth === 0 ? 0 : snapshot.failed / backlogDepth
  const reasons: string[] = []

  if (snapshot.deadLetter > 0) reasons.push('dead_letter_jobs_present')
  if (snapshot.oldestPendingAgeMs > 30 * 60 * 1000) reasons.push('oldest_pending_over_30m')
  if (backlogDepth > snapshot.batchSize * snapshot.concurrency * 20) reasons.push('backlog_exceeds_20_cycles')
  if (retryPressure >= 0.25) reasons.push('retry_pressure_high')
  if (snapshot.claimed > snapshot.concurrency * snapshot.batchSize * 3) reasons.push('claimed_jobs_may_be_stuck')

  const status: MemoryExtractionBackpressureDecision['status'] = snapshot.deadLetter > 0 || snapshot.oldestPendingAgeMs > 60 * 60 * 1000
    ? 'critical'
    : reasons.length >= 2
      ? 'throttle'
      : reasons.length === 1
        ? 'watch'
        : 'ok'

  const shouldThrottle = status === 'throttle' || status === 'critical'
  return {
    status,
    backlogDepth,
    retryPressure: Number(retryPressure.toFixed(4)),
    recommendedBatchSize: shouldThrottle ? Math.max(1, Math.floor(snapshot.batchSize / 2)) : snapshot.batchSize,
    recommendedConcurrency: shouldThrottle ? Math.max(1, Math.floor(snapshot.concurrency / 2)) : snapshot.concurrency,
    recommendedPollIntervalMs: status === 'critical' ? 60_000 : shouldThrottle ? 30_000 : 10_000,
    reasons,
  }
}

export async function enqueueMemoryExtractionJob(
  supabase: SupabaseClient,
  params: MemoryExtractionEnqueueParams,
): Promise<'enqueued' | 'duplicate' | 'unavailable'> {
  const idempotencyKey = buildMemoryExtractionIdempotencyKey({
    assistantId: params.assistantId,
    conversationId: params.conversationId,
    inboundEventId: params.inboundEventId,
    channelType: params.channelType,
    channelId: params.channelId,
    externalMessageId: params.externalMessageId,
    conversationMessageCount: params.conversationMessageCount,
  })

  const { error } = await supabase
    .from('memory_extraction_jobs')
    .insert({
      idempotency_key: idempotencyKey,
      assistant_id: params.assistantId,
      org_id: params.assistantOrgId,
      conversation_id: params.conversationId,
      inbound_event_id: params.inboundEventId,
      run_id: params.runId,
      channel_type: params.channelType,
      channel_id: params.channelId,
      external_message_id: params.externalMessageId,
      conversation_message_count: params.conversationMessageCount,
      encryption_mode: params.encryptionMode,
    })

  if (!error) return 'enqueued'
  if (error.code === '23505') return 'duplicate'

  console.warn('[memory-jobs] Failed to enqueue durable extraction job:', error.message)
  return 'unavailable'
}

export async function pollMemoryExtractionJobs(
  supabase: SupabaseClient,
  config: Config,
  encryptionService: EncryptionService,
): Promise<void> {
  if (!config.LUCID_KNOWLEDGE_DURABLE_EXTRACTION_ENABLED) return
  if (polling) return
  if (shouldBackoff(failures)) return
  polling = true

  try {
    try {
      const { error: resetError } = await supabase.rpc('reset_stuck_memory_extraction_jobs', { p_timeout_minutes: 10 })
      if (resetError) {
        console.warn('[memory-jobs] Stuck-job reset failed:', resetError.message)
      }
    } catch (error) {
      console.warn('[memory-jobs] Stuck-job reset failed:', error instanceof Error ? error.message : error)
    }

    const { data: jobs, error } = await supabase.rpc('claim_next_memory_extraction_job', {
      p_worker_id: config.WORKER_ID,
      p_batch_size: config.MEMORY_EXTRACTION_JOB_BATCH_SIZE,
    })

    if (error) {
      failures++
      console.error(`[memory-jobs] Claim error (failure #${failures}):`, error.message)
      return
    }

    failures = 0
    const claim = (jobs ?? []) as MemoryExtractionJob[]
    if (claim.length === 0) return

    console.log(`[memory-jobs] Processing ${claim.length} durable extraction jobs`)
    const limit = pLimit(config.MEMORY_EXTRACTION_JOB_CONCURRENCY)
    await Promise.allSettled(
      claim.map((job) =>
        limit(async () => {
          try {
            await processMemoryExtractionJob(supabase, config, encryptionService, job)
          } catch (error) {
            await markMemoryExtractionJobFailed(
              supabase,
              job,
              error instanceof Error ? error.message : String(error),
            )
          }
        }),
      ),
    )
  } catch (error) {
    failures++
    console.error(`[memory-jobs] Polling error (failure #${failures}):`, error)
  } finally {
    polling = false
  }
}

export async function processMemoryExtractionJob(
  supabase: SupabaseClient,
  config: Config,
  encryptionService: EncryptionService,
  job: MemoryExtractionJob,
): Promise<void> {
  const [assistant, inboundEvent, recentMessages] = await Promise.all([
    loadAssistant(supabase, job.assistant_id),
    loadInboundEvent(supabase, job.inbound_event_id),
    loadRecentMessageRows(supabase, job.conversation_id),
  ])

  if (!assistant) {
    await markMemoryExtractionJobDiscarded(supabase, job, 'assistant_not_found')
    return
  }
  if (!assistant.memory_enabled) {
    await markMemoryExtractionJobDiscarded(supabase, job, 'memory_disabled')
    return
  }
  if (!inboundEvent?.external_chat_id) {
    await markMemoryExtractionJobDiscarded(supabase, job, 'inbound_context_missing')
    return
  }
  if (recentMessages.length === 0) {
    await markMemoryExtractionJobDiscarded(supabase, job, 'no_recent_messages')
    return
  }

  const tenantKeys = computeTenantKeys({
    orgId: assistant.org_id,
    channelType: job.channel_type,
    externalChatId: inboundEvent.external_chat_id,
    externalUserId: inboundEvent.external_user_id,
  })

  const plaintextMessages = await decryptAssistantMessageRows({
    rows: recentMessages,
    encryptionService,
    assistantOrgId: assistant.org_id,
    tenantKeys,
    logPrefix: '[memory-jobs]',
  })
  if (plaintextMessages.length === 0) {
    await markMemoryExtractionJobDiscarded(supabase, job, 'no_plaintext_context')
    return
  }

  const sourceUserMessage =
    inboundEvent.message_text ??
    [...plaintextMessages].reverse().find((message) => message.role === 'user')?.content ??
    null
  const sourceAssistantResponse =
    [...plaintextMessages].reverse().find((message) => message.role === 'assistant')?.content ??
    null

  const result = await extractAndStoreMemories({
    supabase,
    assistant: {
      id: assistant.id,
      name: assistant.name ?? undefined,
      memory_enabled: assistant.memory_enabled,
      memory_strategy: assistant.memory_strategy ?? undefined,
      org_id: assistant.org_id,
    },
    tenantKeys,
    encryptionService,
    encryptionMode: job.encryption_mode,
    recentMessages: plaintextMessages.slice(-10),
    conversationMessageCount: job.conversation_message_count,
    runId: job.run_id,
    provenance: {
      sourceUserMessage,
      sourceAssistantResponse,
      sourceOrgId: assistant.org_id,
      sourceRunId: job.run_id,
      sourceChannelType: job.channel_type,
      sourceChannelId: job.channel_id,
      sourceConversationId: job.conversation_id,
      sourceInboundEventId: job.inbound_event_id,
      sourceExternalMessageId: job.external_message_id,
      sourceEvidenceHandle: `memory-job:${job.id}`,
      sourceMetadata: {
        durableMemoryJobId: job.id,
        idempotencyKey: job.idempotency_key,
      },
    },
    lucidApiUrl: config.LUCID_API_BASE_URL,
  })

  await markMemoryExtractionJobCompleted(supabase, job, result)
}

async function loadAssistant(
  supabase: SupabaseClient,
  assistantId: string,
): Promise<AssistantRow | null> {
  const { data, error } = await supabase
    .from('ai_assistants')
    .select('id, name, memory_enabled, memory_strategy, org_id')
    .eq('id', assistantId)
    .maybeSingle()

  if (error) throw new Error(`assistant_load_failed: ${error.message}`)
  return data as AssistantRow | null
}

async function loadInboundEvent(
  supabase: SupabaseClient,
  inboundEventId: string,
): Promise<InboundEventRow | null> {
  const { data, error } = await supabase
    .from('assistant_inbound_events')
    .select('id, external_user_id, external_chat_id, message_text, message_data')
    .eq('id', inboundEventId)
    .maybeSingle()

  if (error) throw new Error(`inbound_load_failed: ${error.message}`)
  return data as InboundEventRow | null
}

async function loadRecentMessageRows(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<AssistantMessageContextRow[]> {
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('id, role, content, content_encrypted, content_iv, content_auth_tag, encryption_mode, key_id, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) throw new Error(`messages_load_failed: ${error.message}`)
  return ((data ?? []) as AssistantMessageContextRow[]).reverse()
}

async function markMemoryExtractionJobCompleted(
  supabase: SupabaseClient,
  job: MemoryExtractionJob,
  result: ExtractAndStoreResult,
): Promise<void> {
  const { error } = await supabase
    .from('memory_extraction_jobs')
    .update({
      status: result.skipped ? 'discarded' : 'completed',
      completed_at: new Date().toISOString(),
      last_error: result.skipReason,
      result_summary: buildResultSummary(result),
      claimed_by: null,
      claimed_at: null,
    })
    .eq('id', job.id)

  if (error) {
    console.warn(`[memory-jobs] Failed to mark job ${job.id} complete:`, error.message)
  }
}

async function markMemoryExtractionJobDiscarded(
  supabase: SupabaseClient,
  job: MemoryExtractionJob,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from('memory_extraction_jobs')
    .update({
      status: 'discarded',
      last_error: reason,
      completed_at: new Date().toISOString(),
      claimed_by: null,
      claimed_at: null,
    })
    .eq('id', job.id)

  if (error) {
    console.warn(`[memory-jobs] Failed to discard job ${job.id}:`, error.message)
  }
}

async function markMemoryExtractionJobFailed(
  supabase: SupabaseClient,
  job: MemoryExtractionJob,
  errorMessage: string,
): Promise<void> {
  const nextRetry = job.retry_count + 1
  const isDead = nextRetry >= job.max_retries
  const delaySeconds = Math.min(60 * 30, Math.pow(2, nextRetry) * 30)
  const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000).toISOString()

  const { error } = await supabase
    .from('memory_extraction_jobs')
    .update({
      status: isDead ? 'dead_letter' : 'failed',
      last_error: errorMessage.slice(0, 2000),
      retry_count: nextRetry,
      next_attempt_at: isDead ? null : nextAttemptAt,
      claimed_by: null,
      claimed_at: null,
      result_summary: {
        outcome: isDead ? 'dead_letter' : 'retry_scheduled',
        nextRetry,
        nextAttemptAt: isDead ? null : nextAttemptAt,
      },
    })
    .eq('id', job.id)

  if (error) {
    console.warn(`[memory-jobs] Failed to mark job ${job.id} failed:`, error.message)
    return
  }

  if (isDead) {
    console.error(`[memory-jobs] Job ${job.id} dead-lettered after ${nextRetry} attempts: ${errorMessage}`)
  } else {
    console.warn(`[memory-jobs] Job ${job.id} failed; retry ${nextRetry}/${job.max_retries} at ${nextAttemptAt}: ${errorMessage}`)
  }
}

function buildResultSummary(result: ExtractAndStoreResult): Record<string, unknown> {
  return {
    skipped: result.skipped,
    skipReason: result.skipReason,
    extractedCount: result.extractedCount,
    filteredCount: result.filteredCount,
    newCount: result.newCount,
    storedCount: result.storedCount,
    embeddedCount: result.embeddedCount,
    durationMs: result.durationMs,
    rawModelOutputHash: result.rawModelOutputHash,
    rawModelOutputLength: result.rawModelOutput ? result.rawModelOutput.length : 0,
    extractorError: result.extractorError,
  }
}

function shouldBackoff(failCount: number): boolean {
  if (failCount === 0) return false
  const skipCycles = Math.min(Math.pow(2, failCount), 30)
  return Math.random() * skipCycles > 1
}
