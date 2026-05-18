import 'server-only'

/**
 * RAG — Context Retrieval (Hybrid Search + Dedup)
 *
 * Pipeline: Embed Query → Hybrid Search (vector + FTS via RRF) → Dedup → Format
 *
 * Uses the shared Supabase client from @/lib/db/client.
 */

import { supabase } from '@/lib/db/client'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { estimateTokens } from '@/lib/ai/context'
import { ErrorService } from '@/lib/errors/error-service'
import { deduplicateChunks } from './dedup'
import { formatRAGContext } from './context'
import { DEFAULT_THRESHOLD, DEFAULT_TOP_K } from './constants'
import type { RetrieveContextInput, RAGContextResult, RAGChunkResult } from './types'

/**
 * Retrieve relevant context from the knowledge base for a query.
 *
 * Pipeline: Embed Query → Hybrid Search (vector + FTS via RRF) → Dedup → Format
 */
export async function retrieveContext(
  input: RetrieveContextInput,
): Promise<RAGContextResult> {
  const startTime = Date.now()

  try {
    const topK = input.topK ?? DEFAULT_TOP_K
    const threshold = input.threshold ?? DEFAULT_THRESHOLD

    // 1. Generate query embedding unless the shared Knowledge orchestrator already did it.
    const embedding = input.queryEmbedding ?? (await generateEmbedding(input.query)).embedding

    // 2. Hybrid search via Supabase RPC (vector + FTS + RRF)
    //    Over-fetch to allow for dedup filtering
    const { data, error } = await supabase.rpc('match_rag_chunks', {
      query_embedding: `[${embedding.join(',')}]`,
      match_org_id: input.orgId,
      match_project_id: input.projectId || null,
      match_threshold: threshold,
      match_count: topK * 2,
      match_query: input.query,
    })

    if (error) {
      throw new Error(`Hybrid search failed: ${error.message}`)
    }

    const rawChunks: RAGChunkResult[] = (data || []).map(
      (row: {
        id: string
        document_id: string
        content: string
        chunk_index: number
        similarity: number
        metadata: Record<string, unknown>
        document_title: string
        source_type: string
        section_heading: string | null
      }) => ({
        id: row.id,
        documentId: row.document_id,
        content: row.content,
        chunkIndex: row.chunk_index,
        similarity: row.similarity,
        metadata: row.metadata || {},
        documentTitle: row.document_title,
        sourceType: row.source_type,
        sectionHeading: row.section_heading,
      }),
    )

    // 3. Deduplicate overlapping/adjacent chunks
    const chunks = deduplicateChunks(rawChunks, topK)

    // 4. Format context text (respecting token budget)
    const contextText = formatRAGContext(chunks)

    return {
      chunks,
      contextText,
      tokenEstimate: estimateTokens(contextText),
      queryTimeMs: Date.now() - startTime,
    }
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: {
        operation: 'retrieveContext',
        orgId: input.orgId,
        query: input.query.slice(0, 100),
      },
      tags: { layer: 'ai', feature: 'rag' },
    })

    return {
      chunks: [],
      contextText: '',
      tokenEstimate: 0,
      queryTimeMs: Date.now() - startTime,
    }
  }
}
