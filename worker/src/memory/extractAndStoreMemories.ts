/**
 * extractAndStoreMemories — Fix #5 from OPENCLAW_AUDIT_PLAN_V3.md
 *
 * Wires the memory pipeline: Extract → Dedupe → Embed → Encrypt → Insert
 *
 * Rules (v3.1):
 *  - Hard cap: 1 extra LLM call max (extraction)
 *  - Fail open: memory write failure must NOT fail the inbound job
 *  - Encrypt memory content when encryption_mode !== 'NONE'
 *  - Memory AAD: tenantKey:userKey:memoryId (NOT sessionKey)
 *  - Run OUTSIDE conversation lock (after Step 8 + lock release)
 *  - Embeddings remain plaintext (derived, non-reversible vectors)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EncryptionService, EncryptionMode } from '../crypto/encryption-service.js'
import { MemoryExtractor } from './MemoryExtractor.js'
import { MemoryDeduper } from './MemoryDeduper.js'
import { MemoryEmbedder } from './MemoryEmbedder.js'
import crypto from 'node:crypto'
import { startMemoryExtractSpan, SpanStatusCode } from '../observability/tracing.js'
import { redact } from '../utils/pii-redactor.js'

const KNOWLEDGE_PROVENANCE_COLUMNS = new Set([
  'source_user_message',
  'source_assistant_response',
  'source_org_id',
  'source_project_id',
  'source_run_id',
  'source_channel_type',
  'source_channel_id',
  'source_conversation_id',
  'source_inbound_event_id',
  'source_external_message_id',
  'source_evidence_handle',
  'source_metadata',
])

export interface ExtractAndStoreArgs {
  supabase: SupabaseClient
  assistant: {
    id: string
    name?: string
    memory_enabled: boolean
    memory_strategy?: 'auto' | 'aggressive' | 'conservative' | 'off'
    org_id: string | null
  }
  tenantKeys: {
    tenantKey: string
    userKey: string
  }
  encryptionService?: EncryptionService
  encryptionMode: EncryptionMode
  recentMessages: Array<{ role: string; content: string }>
  /** Total message count in conversation (for strategy gating) */
  conversationMessageCount?: number
  runId: string
  provenance?: {
    sourceUserMessage?: string | null
    sourceAssistantResponse?: string | null
    sourceOrgId?: string | null
    sourceProjectId?: string | null
    sourceRunId?: string | null
    sourceChannelType?: string | null
    sourceChannelId?: string | null
    sourceConversationId?: string | null
    sourceInboundEventId?: string | null
    sourceExternalMessageId?: string | null
    sourceEvidenceHandle?: string | null
    sourceMetadata?: Record<string, unknown>
  }
  /** Lucid-L2 base URL for extraction + embedding calls */
  lucidApiUrl: string
  /** Optional extraction model override (default: gpt-4o-mini) */
  extractionModel?: string
  /** Optional embedding model override (default: text-embedding-3-small) */
  embeddingModel?: string
}

export interface ExtractAndStoreResult {
  skipped: boolean
  skipReason: string | null
  extractedCount: number
  filteredCount: number
  newCount: number
  storedCount: number
  embeddedCount: number
  durationMs: number
  rawModelOutput: string | null
  rawModelOutputHash: string | null
  extractorError: string | null
}

function emptyExtractResult(overrides: Partial<ExtractAndStoreResult> = {}): ExtractAndStoreResult {
  return {
    skipped: false,
    skipReason: null,
    extractedCount: 0,
    filteredCount: 0,
    newCount: 0,
    storedCount: 0,
    embeddedCount: 0,
    durationMs: 0,
    rawModelOutput: null,
    rawModelOutputHash: null,
    extractorError: null,
    ...overrides,
  }
}

export async function extractAndStoreMemories(args: ExtractAndStoreArgs): Promise<ExtractAndStoreResult> {
  const {
    supabase,
    assistant,
    tenantKeys,
    encryptionService,
    encryptionMode,
    recentMessages,
    conversationMessageCount,
    runId,
    provenance,
    lucidApiUrl,
    extractionModel = 'gpt-4o-mini',
    embeddingModel = 'text-embedding-3-small',
  } = args

  if (!assistant.memory_enabled || recentMessages.length === 0) {
    return emptyExtractResult({
      skipped: true,
      skipReason: !assistant.memory_enabled ? 'memory_disabled' : 'no_recent_messages',
    })
  }

  const strategy = assistant.memory_strategy ?? 'auto'

  // ─── Strategy gating: check if we should extract this turn ───
  const extractor = new MemoryExtractor({
    model: extractionModel,
    strategy,
    lucidApiUrl,
  })

  if (conversationMessageCount != null && !extractor.shouldExtract(conversationMessageCount, strategy)) {
    console.log(`[memory-pipeline] Strategy '${strategy}' skips extraction at ${conversationMessageCount} messages (runId=${runId})`)
    return emptyExtractResult({
      skipped: true,
      skipReason: `strategy_${strategy}_skip`,
    })
  }

  // OTel span: memory.extract (Guardrail #6: counts/embed_calls/duration only)
  const memSpan = startMemoryExtractSpan({
    tenantKey: tenantKeys.tenantKey,
    conversationId: runId,
  })
  const memStart = Date.now()

  const scopedUserId = tenantKeys.userKey

  const castMessages = recentMessages.map(m => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }))

  const extractionAudit = await extractor.extractWithAudit(castMessages, {
    assistantName: assistant.name,
    userId: scopedUserId,
  })
  const extracted = extractionAudit.memories
  const rawModelOutputHash = extractionAudit.rawOutput
    ? crypto.createHash('sha256').update(extractionAudit.rawOutput).digest('hex')
    : null

  if (extracted.length === 0) {
    console.log(`[memory-pipeline] No memories extracted (runId=${runId})`)
    const durationMs = Date.now() - memStart
    memSpan.setAttribute('lucid.memory.extracted_count', 0)
    memSpan.setAttribute('lucid.memory.stored_count', 0)
    memSpan.setAttribute('lucid.memory.embed_calls', 0)
    memSpan.setAttribute('lucid.memory.duration_ms', durationMs)
    memSpan.setStatus({ code: SpanStatusCode.OK })
    memSpan.end()
    return emptyExtractResult({
      skipped: true,
      skipReason: extractionAudit.error ? 'extractor_error' : 'no_memories_extracted',
      durationMs,
      rawModelOutput: extractionAudit.rawOutput,
      rawModelOutputHash,
      extractorError: extractionAudit.error,
    })
  }

  console.log(`[memory-pipeline] Extracted ${extracted.length} candidate memories (runId=${runId})`)

  // ─── Step 2: Filter low-quality + dedupe within batch ───
  const filtered = MemoryDeduper.filterLowQuality(extracted)
  const batchDeduped = MemoryDeduper.deduplicateBatch(filtered)

  if (batchDeduped.length === 0) {
    console.log(`[memory-pipeline] All candidates filtered/deduped (runId=${runId})`)
    const durationMs = Date.now() - memStart
    memSpan.setAttribute('lucid.memory.extracted_count', extracted.length)
    memSpan.setAttribute('lucid.memory.stored_count', 0)
    memSpan.setAttribute('lucid.memory.embed_calls', 0)
    memSpan.setAttribute('lucid.memory.duration_ms', durationMs)
    memSpan.setStatus({ code: SpanStatusCode.OK })
    memSpan.end()
    return emptyExtractResult({
      skipped: true,
      skipReason: 'all_candidates_filtered',
      extractedCount: extracted.length,
      filteredCount: filtered.length,
      durationMs,
      rawModelOutput: extractionAudit.rawOutput,
      rawModelOutputHash,
      extractorError: extractionAudit.error,
    })
  }

  // ─── Step 3: Dedupe against existing DB memories ───
  const deduper = new MemoryDeduper(supabase)
  const deduped = await deduper.deduplicate(assistant.id, batchDeduped)
  const newMemories = deduped.filter(m => !m.isDuplicate)

  if (newMemories.length === 0) {
    console.log(`[memory-pipeline] All candidates are duplicates (runId=${runId})`)
    const durationMs = Date.now() - memStart
    memSpan.setAttribute('lucid.memory.extracted_count', extracted.length)
    memSpan.setAttribute('lucid.memory.stored_count', 0)
    memSpan.setAttribute('lucid.memory.embed_calls', 0)
    memSpan.setAttribute('lucid.memory.duration_ms', durationMs)
    memSpan.setStatus({ code: SpanStatusCode.OK })
    memSpan.end()
    return emptyExtractResult({
      skipped: true,
      skipReason: 'all_candidates_duplicate',
      extractedCount: extracted.length,
      filteredCount: filtered.length,
      durationMs,
      rawModelOutput: extractionAudit.rawOutput,
      rawModelOutputHash,
      extractorError: extractionAudit.error,
    })
  }

  console.log(`[memory-pipeline] ${newMemories.length} new memories to store (runId=${runId})`)

  // ─── Step 4: Embed (batch) — embeddings remain plaintext ───
  let embeddings: number[][] = []
  try {
    const embedder = new MemoryEmbedder({
      model: embeddingModel,
      lucidApiUrl,
    })
    embeddings = await embedder.embedBatch(newMemories.map(m => m.content))
  } catch (embedErr) {
    // Embeddings are optional — store memories without them if embedding fails
    console.warn(`[memory-pipeline] Embedding failed, storing without vectors (runId=${runId}):`, embedErr)
    embeddings = newMemories.map(() => [])
  }

  // ─── Step 5: Encrypt + Build insert payloads ───
  const insertPayloads: Record<string, unknown>[] = []
  for (let i = 0; i < newMemories.length; i++) {
    const mem = newMemories[i]
    const embedding = embeddings[i]

    try {
      const memoryId = crypto.randomUUID()
      // v3.1 memory AAD: tenantKey:userKey:memoryId
      const aad = `${tenantKeys.tenantKey}:${tenantKeys.userKey}:${memoryId}`

      // Encrypt if available
      let contentColumns: Record<string, unknown>
      if (encryptionService && encryptionMode === 'APP_LAYER' && assistant.org_id) {
        const encrypted = await encryptionService.buildMessageColumns(
          assistant.org_id,
          mem.content,
          encryptionMode,
          aad
        )
        contentColumns = encrypted
      } else {
        contentColumns = { content: mem.content, encryption_mode: 'NONE' }
      }

      // Compute content hash for dedup (always on plaintext, before encrypt)
      const contentHash = MemoryDeduper.computeHash(mem.content)

      const payload: Record<string, unknown> = {
        id: memoryId,
        assistant_id: assistant.id,
        scoped_user_id: scopedUserId,
        category: mem.category,
        importance: mem.importance,
        confidence: mem.confidence,
        content_hash: contentHash,
        last_accessed_at: new Date().toISOString(),
        source_user_message: provenance?.sourceUserMessage ?? null,
        source_assistant_response: provenance?.sourceAssistantResponse ?? null,
        source_org_id: provenance?.sourceOrgId ?? assistant.org_id ?? null,
        source_project_id: provenance?.sourceProjectId ?? null,
        source_run_id: provenance?.sourceRunId ?? runId,
        source_channel_type: provenance?.sourceChannelType ?? null,
        source_channel_id: provenance?.sourceChannelId ?? null,
        source_conversation_id: provenance?.sourceConversationId ?? null,
        source_inbound_event_id: provenance?.sourceInboundEventId ?? null,
        source_external_message_id: provenance?.sourceExternalMessageId ?? null,
        source_evidence_handle: provenance?.sourceEvidenceHandle ?? null,
        source_metadata: provenance?.sourceMetadata ?? {},
        ...contentColumns,
      }

      // Only add embedding if we got a valid one
      if (embedding && embedding.length > 0) {
        payload.embedding = JSON.stringify(embedding)
      }

      insertPayloads.push(payload)
    } catch (memErr) {
      console.warn('[memory-pipeline] Failed to build memory payload:', {
        index: i,
        error: redact(memErr instanceof Error ? memErr.message : String(memErr)),
      })
      // Continue with next memory — fail open per v3.1 rules
    }
  }

  // ─── Step 6: Batch insert ───
  let stored = 0
  if (insertPayloads.length > 0) {
    const { data, error: insertErr } = await supabase
      .from('assistant_memory')
      .insert(insertPayloads)
      .select('id')

    if (insertErr) {
      // If batch fails (e.g. one duplicate), fall back to individual inserts
      if (insertErr.code === '23505' || isMissingKnowledgeProvenanceColumnError(insertErr)) {
        const stripProvenance = isMissingKnowledgeProvenanceColumnError(insertErr)
        console.log('[memory-pipeline] Batch insert needs individual fallback', {
          stripProvenance,
          runId: redact(runId),
        })
        for (const payload of insertPayloads) {
          const memoryId = redact(String(payload.id))
          const insertPayload = stripProvenance
            ? withoutKnowledgeProvenanceColumns(payload)
            : payload
          const { error: singleErr } = await supabase
            .from('assistant_memory')
            .insert(insertPayload)

          if (singleErr) {
            if (singleErr.code === '23505') {
              console.log('[memory-pipeline] Duplicate memory skipped', { memoryId })
            } else if (!stripProvenance && isMissingKnowledgeProvenanceColumnError(singleErr)) {
              const { error: retryErr } = await supabase
                .from('assistant_memory')
                .insert(withoutKnowledgeProvenanceColumns(payload))
              if (retryErr) {
                console.warn('[memory-pipeline] Insert failed after provenance fallback:', {
                  memoryId,
                  error: redact(retryErr.message),
                })
              } else {
                stored++
              }
            } else {
              console.warn('[memory-pipeline] Insert failed:', {
                memoryId,
                error: redact(singleErr.message),
              })
            }
          } else {
            stored++
          }
        }
      } else {
        console.warn(`[memory-pipeline] Batch insert failed (runId=${runId}):`, insertErr.message)
      }
    } else {
      stored = data?.length ?? insertPayloads.length
    }
  }

  const embeddedCount = embeddings.filter(e => e.length > 0).length
  const durationMs = Date.now() - memStart
  memSpan.setAttribute('lucid.memory.extracted_count', extracted.length)
  memSpan.setAttribute('lucid.memory.stored_count', stored)
  memSpan.setAttribute('lucid.memory.embed_calls', embeddedCount)
  memSpan.setAttribute('lucid.memory.duration_ms', durationMs)
  memSpan.setStatus({ code: SpanStatusCode.OK })
  memSpan.end()

  console.log(`[memory-pipeline] Stored ${stored}/${newMemories.length} memories (runId=${runId})`)
  return emptyExtractResult({
    extractedCount: extracted.length,
    filteredCount: filtered.length,
    newCount: newMemories.length,
    storedCount: stored,
    embeddedCount,
    durationMs,
    rawModelOutput: extractionAudit.rawOutput,
    rawModelOutputHash,
    extractorError: extractionAudit.error,
  })
}

function isMissingKnowledgeProvenanceColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  const message = error.message ?? ''
  return error.code === 'PGRST204' ||
    error.code === '42703' ||
    (/column/i.test(message) && /source_|schema cache/i.test(message))
}

function withoutKnowledgeProvenanceColumns(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !KNOWLEDGE_PROVENANCE_COLUMNS.has(key)),
  )
}
