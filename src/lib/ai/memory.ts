/**
 * L2 Memory Service
 *
 * Thin facade over the L2 Memory REST API for verifiable agent memory.
 * The SDK doesn't include memory yet, so we use raw fetch() against the L2 API.
 *
 * Features:
 * - 6 memory types: episodic, semantic, procedural, entity, trust_weighted, temporal
 * - Two-stage semantic recall (vector search + reranking)
 * - Hash-chained provenance (SHA-256, linked to receipt MMR)
 * - Memory lanes: self, user, shared, market
 * - DePIN snapshots for portable memory
 * - Session management for conversation tracking
 *
 * Usage:
 *   import { recall, writeSemantic, verifyMemoryChain } from '@/lib/ai/memory'
 */

import 'server-only'
import { isSDKConfigured, getSDKBaseURL } from './sdk'
import { getLucidProviderConfig } from './lucid-provider-config'
import { ErrorService } from '@/lib/errors/error-service'

// ============================================================================
// TYPES
// ============================================================================

export type MemoryType = 'episodic' | 'semantic' | 'procedural' | 'entity' | 'trust_weighted' | 'temporal'
export type MemoryLane = 'self' | 'user' | 'shared' | 'market'
export type MemoryStatus = 'active' | 'superseded' | 'archived' | 'expired'

export interface MemoryEntry {
  memory_id: string
  agent_passport_id: string
  type: MemoryType
  namespace: string
  memory_lane: MemoryLane
  content: string
  status: MemoryStatus
  created_at: number
  updated_at: number
  content_hash: string
  prev_hash: string | null
  metadata?: Record<string, unknown>
  similarity?: number
  score?: number
}

export interface MemoryWriteResult {
  memory_id: string
  content_hash: string
  prev_hash: string | null
}

export interface RecallResult {
  memories: MemoryEntry[]
  query_embedding_model: string | null
  total_candidates: number
}

export interface MemorySession {
  session_id: string
  agent_passport_id: string
  namespace: string
  status: 'active' | 'closed' | 'archived'
  turn_count: number
  total_tokens: number
  summary?: string
  created_at: number
  last_activity: number
  closed_at?: number
}

export interface MemoryVerification {
  valid: boolean
  chain_length: number
  errors: string[]
}

export interface MemoryStats {
  total_entries: number
  by_type: Record<MemoryType, number>
  by_lane: Record<MemoryLane, number>
  by_status: Record<MemoryStatus, number>
}

export interface MemoryHealthStatus {
  healthy: boolean
  store_type: string
  vector_count: number
  pending_embeddings: number
}

// ============================================================================
// INTERNAL HELPER
// ============================================================================

const lucidProviderConfig = getLucidProviderConfig()

async function memoryFetch<T>(
  path: string,
  passportId: string,
  options?: { method?: string; body?: unknown },
): Promise<T | null> {
  if (!isSDKConfigured()) return null
  const baseUrl = getSDKBaseURL().replace(/\/+$/, '')
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Agent-Passport-Id': passportId,
    }
    if (lucidProviderConfig.apiKey) {
      headers['Authorization'] = `Bearer ${lucidProviderConfig.apiKey}`
    }
    const res = await fetch(`${baseUrl}${path}`, {
      method: options?.method ?? 'GET',
      headers,
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.data ?? data
  } catch (err) {
    ErrorService.captureException(err, {
      severity: 'warning',
      context: { path, passportId },
      tags: { layer: 'ai', domain: 'memory' },
    })
    return null
  }
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Write an episodic memory (conversation turn).
 */
export async function writeEpisodic(
  passportId: string,
  params: {
    session_id: string
    role: string
    content: string
    tokens?: number
    tool_calls?: unknown[]
    memory_lane?: MemoryLane
    metadata?: Record<string, unknown>
  },
): Promise<MemoryWriteResult | null> {
  return memoryFetch<MemoryWriteResult>('/v1/memory/episodic', passportId, {
    method: 'POST',
    body: params,
  })
}

/**
 * Write a semantic memory (extracted fact).
 */
export async function writeSemantic(
  passportId: string,
  params: {
    fact: string
    confidence: number
    content: string
    source_memory_ids?: string[]
    memory_lane?: MemoryLane
    metadata?: Record<string, unknown>
  },
): Promise<MemoryWriteResult | null> {
  return memoryFetch<MemoryWriteResult>('/v1/memory/semantic', passportId, {
    method: 'POST',
    body: params,
  })
}

/**
 * Write a procedural memory (learned rule/behavior).
 */
export async function writeProcedural(
  passportId: string,
  params: {
    rule: string
    trigger: string
    priority: number
    content: string
    source_memory_ids?: string[]
    memory_lane?: MemoryLane
    metadata?: Record<string, unknown>
  },
): Promise<MemoryWriteResult | null> {
  return memoryFetch<MemoryWriteResult>('/v1/memory/procedural', passportId, {
    method: 'POST',
    body: params,
  })
}

/**
 * Write an entity memory (knowledge graph node).
 */
export async function writeEntity(
  passportId: string,
  params: {
    entity_name: string
    entity_type: string
    attributes: Record<string, unknown>
    relationships?: Array<{
      target_entity_id: string
      relation_type: string
      confidence?: number
    }>
    content: string
    source_memory_ids?: string[]
    memory_lane?: MemoryLane
    metadata?: Record<string, unknown>
  },
): Promise<MemoryWriteResult | null> {
  return memoryFetch<MemoryWriteResult>('/v1/memory/entity', passportId, {
    method: 'POST',
    body: params,
  })
}

/**
 * Write a trust-weighted memory (cross-agent trust signal).
 */
export async function writeTrustWeighted(
  passportId: string,
  params: {
    source_agent_passport_id: string
    trust_score: number
    decay_factor: number
    content: string
    source_memory_ids?: string[]
    memory_lane?: MemoryLane
    metadata?: Record<string, unknown>
  },
): Promise<MemoryWriteResult | null> {
  return memoryFetch<MemoryWriteResult>('/v1/memory/trust-weighted', passportId, {
    method: 'POST',
    body: params,
  })
}

/**
 * Write a temporal memory (time-bounded fact).
 */
export async function writeTemporal(
  passportId: string,
  params: {
    content: string
    valid_from: number
    valid_to?: number | null
    recorded_at: number
    source_memory_ids?: string[]
    memory_lane?: MemoryLane
    metadata?: Record<string, unknown>
  },
): Promise<MemoryWriteResult | null> {
  return memoryFetch<MemoryWriteResult>('/v1/memory/temporal', passportId, {
    method: 'POST',
    body: params,
  })
}

// ============================================================================
// RECALL
// ============================================================================

/**
 * Semantic recall — vector search + reranking across memory types.
 */
export async function recall(
  passportId: string,
  params: {
    query: string
    types?: MemoryType[]
    limit?: number
    min_similarity?: number
    session_id?: string
    lanes?: MemoryLane[]
  },
): Promise<RecallResult | null> {
  return memoryFetch<RecallResult>('/v1/memory/recall', passportId, {
    method: 'POST',
    body: { agent_passport_id: passportId, ...params },
  })
}

// ============================================================================
// SESSIONS
// ============================================================================

/**
 * Create a new memory session for conversation tracking.
 */
export async function createSession(passportId: string): Promise<MemorySession | null> {
  return memoryFetch<MemorySession>('/v1/memory/sessions', passportId, {
    method: 'POST',
  })
}

/**
 * Close a memory session, optionally with a summary.
 *
 * Returns true on success, false on error.
 */
export async function closeSession(
  passportId: string,
  sessionId: string,
  summary?: string,
): Promise<boolean> {
  const query = summary ? `?summary=${encodeURIComponent(summary)}` : ''
  const result = await memoryFetch<unknown>(
    `/v1/memory/sessions/${sessionId}/close${query}`,
    passportId,
    { method: 'POST' },
  )
  return result !== null
}

/**
 * Get the memory context for a session (recent episodic memories).
 */
export async function getSessionContext(
  passportId: string,
  sessionId: string,
): Promise<MemoryEntry[] | null> {
  return memoryFetch<MemoryEntry[]>(`/v1/memory/sessions/${sessionId}/context`, passportId)
}

/**
 * List all sessions for an agent passport.
 */
export async function listSessions(passportId: string): Promise<MemorySession[] | null> {
  return memoryFetch<MemorySession[]>('/v1/memory/sessions', passportId)
}

// ============================================================================
// PROVENANCE & VERIFICATION
// ============================================================================

/**
 * Verify the hash chain integrity of an agent's memory.
 */
export async function verifyMemoryChain(
  passportId: string,
  namespace?: string,
): Promise<MemoryVerification | null> {
  return memoryFetch<MemoryVerification>('/v1/memory/verify', passportId, {
    method: 'POST',
    body: { agent_passport_id: passportId, namespace },
  })
}

// ============================================================================
// SNAPSHOTS
// ============================================================================

/**
 * Create a DePIN snapshot of agent memory.
 */
export async function createSnapshot(
  passportId: string,
  params: {
    snapshot_type: 'checkpoint' | 'migration' | 'archive'
    namespace?: string
  },
): Promise<{ cid: string } | null> {
  return memoryFetch<{ cid: string }>('/v1/memory/snapshots', passportId, {
    method: 'POST',
    body: params,
  })
}

/**
 * Restore agent memory from a DePIN snapshot.
 *
 * Returns true on success, false on error.
 */
export async function restoreSnapshot(
  passportId: string,
  params: {
    cid: string
    mode: 'replace' | 'merge' | 'fork'
    target_namespace?: string
  },
): Promise<boolean> {
  const result = await memoryFetch<unknown>('/v1/memory/snapshots/restore', passportId, {
    method: 'POST',
    body: params,
  })
  return result !== null
}

// ============================================================================
// OPERATIONS
// ============================================================================

/**
 * Get memory statistics for an agent passport.
 */
export async function getMemoryStats(passportId: string): Promise<MemoryStats | null> {
  return memoryFetch<MemoryStats>(`/v1/memory/stats/${passportId}`, passportId)
}

/**
 * Compact agent memory (merge/deduplicate/archive).
 *
 * Returns true on success, false on error.
 */
export async function compactMemory(passportId: string): Promise<boolean> {
  const result = await memoryFetch<unknown>('/v1/memory/compact', passportId, {
    method: 'POST',
  })
  return result !== null
}

/**
 * Check Memory service health.
 *
 * Does not require a passport ID.
 */
export async function getMemoryHealth(): Promise<MemoryHealthStatus | null> {
  if (!isSDKConfigured()) return null
  const baseUrl = getSDKBaseURL().replace(/\/+$/, '')
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (lucidProviderConfig.apiKey) {
      headers['Authorization'] = `Bearer ${lucidProviderConfig.apiKey}`
    }
    const res = await fetch(`${baseUrl}/v1/memory/health`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.data ?? data
  } catch (err) {
    ErrorService.captureException(err, {
      severity: 'warning',
      context: { path: '/v1/memory/health' },
      tags: { layer: 'ai', domain: 'memory' },
    })
    return null
  }
}
