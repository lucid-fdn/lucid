import type { SupabaseClient } from '@supabase/supabase-js'
import { MemoryEmbedder } from '../memory/MemoryEmbedder.js'
import { MemoryRetriever } from '../memory/MemoryRetriever.js'
import type { EncryptionService } from '../crypto/encryption-service.js'

type MemoryCategory = 'fact' | 'preference' | 'instruction' | 'context'

interface RecentMemoryRow {
  id: string
  content: string | null
  content_encrypted?: string | null
  content_iv?: string | null
  content_auth_tag?: string | null
  encryption_mode?: string | null
  key_id?: string | null
  category?: MemoryCategory | null
  importance?: number | null
}

export interface AssistantMemoryRecallInput {
  supabase: SupabaseClient
  assistantId: string
  assistantOrgId: string | null
  scopedUserId: string
  tenantKey: string
  query: string
  channelType?: string | null
  conversationId?: string | null
  lucidApiUrl: string
  encryptionService?: EncryptionService
  semanticEnabled: boolean
  recentLimit?: number
  semanticLimit?: number
  finalLimit?: number
  semanticThreshold?: number
  timeoutMs?: number
}

export interface AssistantMemoryRecallResult {
  memories: string[]
  telemetry: {
    durationMs: number
    semanticEnabled: boolean
    semanticAttempted: boolean
    fallbackUsed: boolean
    timedOut: boolean
    recentCount: number
    semanticCount: number
    finalCount: number
    tokenCost: number
    errors: string[]
  }
}

export interface RankedMemory {
  id?: string
  content: string
  source: 'semantic' | 'recent'
  score: number
  category?: MemoryCategory | null
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4))
}

function normalizeContent(content: string): string {
  return content.toLowerCase().replace(/\s+/g, ' ').trim()
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<{ value: T; timedOut: boolean }> {
  let timeout: NodeJS.Timeout | undefined
  const timeoutPromise = new Promise<T>((resolve) => {
    timeout = setTimeout(() => resolve(fallback), timeoutMs)
  })

  const value = await Promise.race([promise, timeoutPromise])
  if (timeout) clearTimeout(timeout)
  return { value, timedOut: value === fallback }
}

async function decryptMemoryRow(params: {
  row: RecentMemoryRow
  assistantOrgId: string | null
  tenantKey: string
  scopedUserId: string
  encryptionService?: EncryptionService
}): Promise<string | null> {
  const encrypted = params.row.encryption_mode === 'APP_LAYER' || Boolean(params.row.content_encrypted)
  if (!encrypted) return params.row.content ?? ''
  if (!params.encryptionService || !params.assistantOrgId) return null

  try {
    const aad = `${params.tenantKey}:${params.scopedUserId}:${params.row.id}`
    const decrypted = await params.encryptionService.decryptMessageRow({
      content: params.row.content ?? null,
      content_encrypted: params.row.content_encrypted ?? null,
      content_iv: params.row.content_iv ?? null,
      content_auth_tag: params.row.content_auth_tag ?? null,
      encryption_mode: params.row.encryption_mode ?? null,
      key_id: params.row.key_id ?? null,
    }, params.assistantOrgId, aad)
    return decrypted.content
  } catch {
    return null
  }
}

async function loadRecentMemories(input: AssistantMemoryRecallInput): Promise<RankedMemory[]> {
  const recentLimit = input.recentLimit ?? 10
  const { data, error } = await input.supabase.rpc('get_recent_memories_v2', {
    p_assistant_id: input.assistantId,
    p_scoped_user_id: input.scopedUserId,
    p_limit: recentLimit,
  })

  if (error) {
    const { data: v1Data } = await input.supabase.rpc('get_recent_memories', {
      p_assistant_id: input.assistantId,
      p_scoped_user_id: input.scopedUserId,
      p_limit: recentLimit,
    })
    return ((v1Data || []) as Array<{ id?: string; content: string; category?: MemoryCategory; importance?: number }>)
      .map((memory, index) => ({
        id: memory.id,
        content: memory.content,
        source: 'recent' as const,
        score: Number(memory.importance ?? 0.5) + ((recentLimit - index) / recentLimit) * 0.1,
        category: memory.category,
      }))
      .filter((memory) => memory.content.trim().length > 0)
  }

  const rows = (data || []) as RecentMemoryRow[]
  const memories: RankedMemory[] = []
  for (let index = 0; index < rows.length; index++) {
    const content = await decryptMemoryRow({
      row: rows[index],
      assistantOrgId: input.assistantOrgId,
      tenantKey: input.tenantKey,
      scopedUserId: input.scopedUserId,
      encryptionService: input.encryptionService,
    })
    if (!content?.trim()) continue
    memories.push({
      id: rows[index].id,
      content,
      source: 'recent',
      score: Number(rows[index].importance ?? 0.5) + ((rows.length - index) / Math.max(rows.length, 1)) * 0.1,
      category: rows[index].category,
    })
  }
  return memories
}

async function loadSemanticMemories(input: AssistantMemoryRecallInput): Promise<RankedMemory[]> {
  if (!input.semanticEnabled || !input.query.trim() || !input.scopedUserId.trim()) return []

  const retriever = new MemoryRetriever(input.supabase, {
    embedder: new MemoryEmbedder({
      model: 'text-embedding-3-small',
      lucidApiUrl: input.lucidApiUrl,
    }),
    defaultLimit: input.semanticLimit ?? 8,
    defaultThreshold: input.semanticThreshold ?? 0.68,
  })

  const results = await retriever.retrieve(input.assistantId, input.scopedUserId, input.query, {
    limit: input.semanticLimit ?? 8,
    threshold: input.semanticThreshold ?? 0.68,
    channelType: input.channelType ?? undefined,
    conversationId: input.conversationId ?? undefined,
    decrypt: (memory) => decryptMemoryRow({
      row: memory,
      assistantOrgId: input.assistantOrgId,
      tenantKey: input.tenantKey,
      scopedUserId: input.scopedUserId,
      encryptionService: input.encryptionService,
    }),
  })

  return results
    .filter((memory) => memory.content?.trim())
    .map((memory) => ({
      id: memory.id,
      content: memory.content || '',
      source: 'semantic' as const,
      score: (memory.similarity * 0.7) + (Number(memory.importance ?? 0.5) * 0.3),
      category: memory.category,
    }))
}

export function blendMemoryRecall(
  semantic: RankedMemory[],
  recent: RankedMemory[],
  finalLimit = 10,
): string[] {
  const seen = new Set<string>()
  const blended: RankedMemory[] = []
  const semanticRanked = [...semantic].sort((a, b) => b.score - a.score)
  const recentRanked = [...recent].sort((a, b) => b.score - a.score)
  const maxLen = Math.max(semanticRanked.length, recentRanked.length)

  for (let index = 0; index < maxLen && blended.length < finalLimit; index++) {
    for (const candidate of [semanticRanked[index], recentRanked[index]]) {
      if (!candidate || blended.length >= finalLimit) continue
      const normalized = normalizeContent(candidate.content)
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      blended.push(candidate)
    }
  }

  return blended.map((memory) => memory.content)
}

export async function retrieveAssistantMemoryRecall(input: AssistantMemoryRecallInput): Promise<AssistantMemoryRecallResult> {
  const startedAt = Date.now()
  const timeoutMs = input.timeoutMs ?? 180
  const errors: string[] = []

  if (!input.scopedUserId.trim() || !input.query.trim()) {
    return {
      memories: [],
      telemetry: {
        durationMs: Date.now() - startedAt,
        semanticEnabled: input.semanticEnabled,
        semanticAttempted: false,
        fallbackUsed: false,
        timedOut: false,
        recentCount: 0,
        semanticCount: 0,
        finalCount: 0,
        tokenCost: 0,
        errors,
      },
    }
  }

  const recentPromise = loadRecentMemories(input).catch((error) => {
    errors.push(`recent:${error instanceof Error ? error.message : String(error)}`)
    return [] as RankedMemory[]
  })
  const semanticPromise = input.semanticEnabled
    ? loadSemanticMemories(input).catch((error) => {
        errors.push(`semantic:${error instanceof Error ? error.message : String(error)}`)
        return [] as RankedMemory[]
      })
    : Promise.resolve([] as RankedMemory[])

  const [recent, semanticResult] = await Promise.all([
    recentPromise,
    withTimeout(semanticPromise, timeoutMs, [] as RankedMemory[]),
  ])

  const semantic = semanticResult.value
  const memories = blendMemoryRecall(semantic, recent, input.finalLimit ?? 10)
  const fallbackUsed = input.semanticEnabled && semantic.length === 0 && recent.length > 0

  return {
    memories,
    telemetry: {
      durationMs: Date.now() - startedAt,
      semanticEnabled: input.semanticEnabled,
      semanticAttempted: input.semanticEnabled,
      fallbackUsed,
      timedOut: semanticResult.timedOut,
      recentCount: recent.length,
      semanticCount: semantic.length,
      finalCount: memories.length,
      tokenCost: memories.reduce((sum, memory) => sum + estimateTokens(memory), 0),
      errors,
    },
  }
}
