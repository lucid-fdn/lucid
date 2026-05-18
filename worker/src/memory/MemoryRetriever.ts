/**
 * MemoryRetriever — Fetches relevant memories based on query.
 * 
 * Uses pgvector's cosine similarity search (<=> operator) to find
 * semantically similar memories. The database function `search_memory_v2()`
 * requires assistant + scoped user filters so semantic recall cannot cross
 * tenant/user boundaries.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { MemoryEmbedder } from './MemoryEmbedder.js'

interface RetrievalConfig {
  embedder: MemoryEmbedder
  defaultLimit?: number
  defaultThreshold?: number
}

interface RetrievedMemory {
  id: string
  content: string | null
  content_encrypted?: string | null
  content_iv?: string | null
  content_auth_tag?: string | null
  encryption_mode?: string | null
  key_id?: string | null
  assistant_id?: string
  scoped_user_id?: string
  category: 'fact' | 'preference' | 'instruction' | 'context'
  importance: number
  similarity: number
  source_run_id?: string | null
  source_channel_type?: string | null
  source_channel_id?: string | null
  source_conversation_id?: string | null
  source_inbound_event_id?: string | null
  source_external_message_id?: string | null
  source_evidence_handle?: string | null
}

export class MemoryRetriever {
  private embedder: MemoryEmbedder
  private defaultLimit: number
  private defaultThreshold: number

  constructor(
    private supabase: SupabaseClient,
    config: RetrievalConfig
  ) {
    this.embedder = config.embedder
    this.defaultLimit = config.defaultLimit ?? 5
    this.defaultThreshold = config.defaultThreshold ?? 0.7
  }

  /**
   * Retrieve memories relevant to a query.
   * 
   * 1. Generate embedding for query
   * 2. Call search_memory_v2() RPC function
   * 3. Return ranked results
   */
  async retrieve(
    assistantId: string,
    scopedUserId: string,
    query: string,
    options?: {
      limit?: number
      threshold?: number
      categories?: Array<'fact' | 'preference' | 'instruction' | 'context'>
      orgId?: string
      projectId?: string
      channelType?: string
      conversationId?: string
      decrypt?: (memory: RetrievedMemory) => Promise<string | null>
    }
  ): Promise<RetrievedMemory[]> {
    if (!query.trim() || !scopedUserId.trim()) {
      return []
    }

    try {
      // Generate embedding for query
      const queryEmbedding = await this.embedder.embed(query)

      // Call DB function for vector search
      const { data, error } = await this.supabase.rpc('search_memory_v2', {
        p_assistant_id: assistantId,
        p_scoped_user_id: scopedUserId,
        p_query_embedding: JSON.stringify(queryEmbedding), // pgvector expects string or array
        p_limit: options?.limit ?? this.defaultLimit,
        p_threshold: options?.threshold ?? this.defaultThreshold,
        p_categories: options?.categories ?? null,
        p_org_id: options?.orgId ?? null,
        p_project_id: options?.projectId ?? null,
        p_channel_type: options?.channelType ?? null,
        p_conversation_id: options?.conversationId ?? null,
      })

      if (error) {
        console.error('[retriever] Search error:', error)
        return []
      }

      if (!data || !Array.isArray(data)) {
        return []
      }

      const rawResults = data as RetrievedMemory[]
      const results = await Promise.all(rawResults.map(async (memory) => {
        const encrypted = memory.encryption_mode === 'APP_LAYER' || Boolean(memory.content_encrypted)
        if (!encrypted) {
          return { ...memory, content: memory.content ?? '' }
        }

        const decrypted = options?.decrypt ? await options.decrypt(memory) : null
        return decrypted == null
          ? { ...memory, content: '' }
          : { ...memory, content: decrypted }
      }))

      // Update last_accessed_at for retrieved memories (async, don't await)
      const memoryIds = results.map(m => m.id)
      if (memoryIds.length > 0) {
        void this.updateLastAccessed(memoryIds)
      }

      return results
    } catch (error) {
      console.error('[retriever] Retrieval failed:', error)
      return []
    }
  }

  /**
   * Retrieve memories by category (no semantic search).
   * Useful for browsing or getting all memories of a specific type.
   */
  async retrieveByCategory(
    assistantId: string,
    scopedUserId: string,
    category: 'fact' | 'preference' | 'instruction' | 'context',
    options?: {
      limit?: number
      minImportance?: number
    }
  ): Promise<Omit<RetrievedMemory, 'similarity'>[]> {
    try {
      let query = this.supabase
        .from('assistant_memory')
        .select('id, content, category, importance')
        .eq('assistant_id', assistantId)
        .eq('scoped_user_id', scopedUserId)
        .eq('category', category)
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false })

      if (options?.minImportance !== undefined) {
        query = query.gte('importance', options.minImportance)
      }

      if (options?.limit !== undefined) {
        query = query.limit(options.limit)
      }

      const { data, error } = await query

      if (error) {
        console.error('[retriever] Category search error:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('[retriever] Category retrieval failed:', error)
      return []
    }
  }

  /**
   * Retrieve all memories for an assistant (paginated).
   * For admin/debugging purposes.
   */
  async retrieveAll(
    assistantId: string,
    options?: {
      page?: number
      pageSize?: number
      orderBy?: 'created_at' | 'importance' | 'last_accessed_at'
    }
  ): Promise<{
    memories: Omit<RetrievedMemory, 'similarity'>[]
    page: number
    pageSize: number
    hasMore: boolean
  }> {
    const page = options?.page ?? 0
    const pageSize = options?.pageSize ?? 50
    const orderBy = options?.orderBy ?? 'created_at'

    try {
      const { data, error } = await this.supabase
        .from('assistant_memory')
        .select('id, content, category, importance, created_at, last_accessed_at')
        .eq('assistant_id', assistantId)
        .order(orderBy, { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize)

      if (error) {
        console.error('[retriever] Retrieve all error:', error)
        return { memories: [], page, pageSize, hasMore: false }
      }

      return {
        memories: data || [],
        page,
        pageSize,
        hasMore: data ? data.length === pageSize + 1 : false,
      }
    } catch (error) {
      console.error('[retriever] Retrieve all failed:', error)
      return { memories: [], page, pageSize, hasMore: false }
    }
  }

  /**
   * Update last_accessed_at for memories (async, fire-and-forget).
   */
  private async updateLastAccessed(memoryIds: string[]): Promise<void> {
    try {
      await this.supabase
        .from('assistant_memory')
        .update({ last_accessed_at: new Date().toISOString() })
        .in('id', memoryIds)
    } catch (error) {
      console.warn('[retriever] Failed to update last_accessed_at:', error)
    }
  }

  /**
   * Delete a memory by ID.
   */
  async deleteMemory(memoryId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('assistant_memory')
        .delete()
        .eq('id', memoryId)

      if (error) {
        console.error('[retriever] Delete error:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('[retriever] Delete failed:', error)
      return false
    }
  }

  /**
   * Bulk delete memories by IDs.
   */
  async deleteMemories(memoryIds: string[]): Promise<number> {
    if (memoryIds.length === 0) {
      return 0
    }

    try {
      const { data, error } = await this.supabase
        .from('assistant_memory')
        .delete()
        .in('id', memoryIds)
        .select('id')

      if (error) {
        console.error('[retriever] Bulk delete error:', error)
        return 0
      }

      return data?.length ?? 0
    } catch (error) {
      console.error('[retriever] Bulk delete failed:', error)
      return 0
    }
  }
}
