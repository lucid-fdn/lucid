import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase as defaultSupabase } from './client'
import { ErrorService } from '@/lib/errors/error-service'

export interface AssistantMemoryRow {
  id: string
  content: string | null
  content_encrypted?: string | null
  content_iv?: string | null
  content_auth_tag?: string | null
  encryption_mode?: string | null
  key_id?: string | null
  category: string
  importance: number | string | null
  access_count?: number | null
  last_accessed_at?: string | null
  created_at?: string | null
  source_user_message?: string | null
  source_assistant_response?: string | null
  source_run_id?: string | null
  source_channel_type?: string | null
  source_channel_id?: string | null
  source_conversation_id?: string | null
  source_inbound_event_id?: string | null
  source_external_message_id?: string | null
  source_evidence_handle?: string | null
}

export interface AssistantMemoryView {
  id: string
  fact_text: string
  category: string
  confidence: number
  access_count: number
  last_accessed_at: string | null
  created_at: string
  encrypted: boolean
  redaction_state: 'none' | 'encrypted_unavailable'
  source_user_message: string | null
  source_assistant_response: string | null
  source_run_id?: string | null
  source_channel_type?: string | null
  source_channel_id?: string | null
  source_conversation_id?: string | null
  source_inbound_event_id?: string | null
  source_external_message_id?: string | null
  source_evidence_handle?: string | null
}

export interface AssistantMemoryKnowledgeResult extends AssistantMemoryView {
  similarity: number
}

export type AssistantMemoryDecryptor = (row: AssistantMemoryRow) => Promise<string | null>

export async function mapAssistantMemoryRows(
  rows: AssistantMemoryRow[],
  options?: {
    decrypt?: AssistantMemoryDecryptor
  },
): Promise<AssistantMemoryView[]> {
  return Promise.all(rows.map(async (memory) => {
    const encrypted = memory.encryption_mode === 'APP_LAYER' || Boolean(memory.content_encrypted)
    let content = memory.content ?? ''
    let redactionState: AssistantMemoryView['redaction_state'] = 'none'

    if (encrypted) {
      const decrypted = options?.decrypt ? await options.decrypt(memory) : null
      if (decrypted != null) {
        content = decrypted
      } else {
        content = ''
        redactionState = 'encrypted_unavailable'
      }
    }

    return {
      id: memory.id,
      fact_text: content,
      category: memory.category ?? 'context',
      confidence: Number(memory.importance ?? 0),
      access_count: memory.access_count ?? 0,
      last_accessed_at: memory.last_accessed_at ?? null,
      created_at: memory.created_at ?? '',
      encrypted,
      redaction_state: redactionState,
      source_user_message: memory.source_user_message ?? null,
      source_assistant_response: memory.source_assistant_response ?? null,
      source_run_id: memory.source_run_id,
      source_channel_type: memory.source_channel_type,
      source_channel_id: memory.source_channel_id,
      source_conversation_id: memory.source_conversation_id,
      source_inbound_event_id: memory.source_inbound_event_id,
      source_external_message_id: memory.source_external_message_id,
      source_evidence_handle: memory.source_evidence_handle,
    }
  }))
}

export async function getAssistantMemories(
  assistantId: string,
  limit = 50,
  options?: {
    client?: SupabaseClient
    decrypt?: AssistantMemoryDecryptor
  },
): Promise<{ memories: AssistantMemoryView[]; total: number }> {
  const client = options?.client ?? defaultSupabase

  const { data, error } = await client
    .from('assistant_memory')
    .select(
      [
        'id',
        'content',
        'content_encrypted',
        'content_iv',
        'content_auth_tag',
        'encryption_mode',
        'key_id',
        'category',
        'importance',
        'access_count',
        'last_accessed_at',
        'created_at',
        'source_user_message',
        'source_assistant_response',
        'source_run_id',
        'source_channel_type',
        'source_channel_id',
        'source_conversation_id',
        'source_inbound_event_id',
        'source_external_message_id',
        'source_evidence_handle',
      ].join(', '),
    )
    .eq('assistant_id', assistantId)
    .order('last_accessed_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { assistantId },
      tags: { layer: 'database', table: 'assistant_memory' },
    })
    return { memories: [], total: 0 }
  }

  const { count } = await client
    .from('assistant_memory')
    .select('*', { count: 'exact', head: true })
    .eq('assistant_id', assistantId)

  return {
    memories: await mapAssistantMemoryRows((data || []) as unknown as AssistantMemoryRow[], {
      decrypt: options?.decrypt,
    }),
    total: count || 0,
  }
}

export async function searchAssistantMemoriesForKnowledge(input: {
  assistantId: string
  scopedUserId: string
  queryEmbedding: number[]
  orgId?: string | null
  projectId?: string | null
  channelType?: string | null
  conversationId?: string | null
  limit?: number
  threshold?: number
  client?: SupabaseClient
  decrypt?: AssistantMemoryDecryptor
}): Promise<AssistantMemoryKnowledgeResult[]> {
  const client = input.client ?? defaultSupabase
  if (!input.assistantId || !input.scopedUserId || input.queryEmbedding.length === 0) return []

  const { data, error } = await client.rpc('search_memory_v2', {
    p_assistant_id: input.assistantId,
    p_scoped_user_id: input.scopedUserId,
    p_query_embedding: `[${input.queryEmbedding.join(',')}]`,
    p_limit: input.limit ?? 8,
    p_threshold: input.threshold ?? 0.68,
    p_categories: null,
    p_org_id: input.orgId ?? null,
    p_project_id: input.projectId ?? null,
    p_channel_type: input.channelType ?? null,
    p_conversation_id: input.conversationId ?? null,
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { assistantId: input.assistantId, operation: 'searchAssistantMemoriesForKnowledge' },
      tags: { layer: 'database', table: 'assistant_memory' },
    })
    return []
  }

  const rows = (data || []) as unknown as Array<AssistantMemoryRow & { similarity?: number | string | null }>
  const mapped = await mapAssistantMemoryRows(rows, { decrypt: input.decrypt })
  return mapped.map((memory, index) => ({
    ...memory,
    similarity: Number(rows[index]?.similarity ?? 0),
  }))
}
