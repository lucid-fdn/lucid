import 'server-only'

/**
 * RAG — Document Ingestion Pipeline
 *
 * Pipeline: Validate → Store → Chunk (markdown-aware) → Embed (contextual) → Update Status
 *
 * Uses the shared Supabase client from @/lib/db/client.
 * Uses embedding generation from @/lib/ai/embeddings.
 */

import { supabase } from '@/lib/db/client'
import { generateEmbeddings } from '@/lib/ai/embeddings'
import { estimateTokens } from '@/lib/ai/context'
import { ErrorService } from '@/lib/errors/error-service'
import { chunkMarkdown } from './chunking'
import { buildContextPrefix } from './context'
import { MAX_DOCUMENT_SIZE_CHARS, MAX_CHUNKS_PER_DOCUMENT } from './constants'
import type { IngestDocumentInput, IngestDocumentResult } from './types'

/**
 * Ingest a document into the RAG knowledge base.
 *
 * Pipeline: Validate → Store → Chunk (markdown-aware) → Embed (contextual) → Update Status
 */
export async function ingestDocument(
  input: IngestDocumentInput,
): Promise<IngestDocumentResult> {
  try {
    const scope = input.scope || 'org'

    // 0. Validate scope: org docs require orgId
    if (scope === 'org' && !input.orgId) {
      return {
        documentId: '',
        chunkCount: 0,
        totalTokens: 0,
        status: 'error',
        error: 'orgId is required for org-scoped documents',
      }
    }

    // 1. Validate document size
    if (input.content.length > MAX_DOCUMENT_SIZE_CHARS) {
      return {
        documentId: '',
        chunkCount: 0,
        totalTokens: 0,
        status: 'error',
        error: `Document too large: ${(input.content.length / 1000).toFixed(0)}K chars (max ${MAX_DOCUMENT_SIZE_CHARS / 1000}K)`,
      }
    }

    // 2. Insert document record (status: processing)
    const { data: doc, error: insertError } = await supabase
      .from('rag_documents')
      .insert({
        org_id: scope === 'system' ? null : input.orgId,
        project_id: input.projectId || null,
        user_id: input.userId,
        title: input.title,
        scope,
        source_type: input.sourceType || 'upload',
        source_url: input.sourceUrl || null,
        file_name: input.fileName || null,
        file_size_bytes: input.fileSizeBytes || null,
        mime_type: input.mimeType || null,
        raw_content: input.content,
        status: 'processing',
        metadata: input.metadata || {},
      })
      .select('id')
      .single()

    if (insertError || !doc) {
      throw new Error(`Failed to insert document: ${insertError?.message}`)
    }

    const documentId = doc.id

    // 3. Chunk the document (markdown-aware)
    const chunks = chunkMarkdown(input.content)

    if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
      await supabase
        .from('rag_documents')
        .update({
          status: 'error',
          error_message: `Too many chunks: ${chunks.length} (max ${MAX_CHUNKS_PER_DOCUMENT})`,
        })
        .eq('id', documentId)

      return {
        documentId,
        chunkCount: 0,
        totalTokens: 0,
        status: 'error',
        error: `Too many chunks: ${chunks.length} (max ${MAX_CHUNKS_PER_DOCUMENT})`,
      }
    }

    // 4. Generate contextual embeddings in batches
    //    Prepend doc title + section heading to each chunk before embedding
    //    (Anthropic Contextual Retrieval pattern)
    const batchSize = 50
    let totalTokens = 0
    const allChunkRows: Array<{
      document_id: string
      org_id: string | null
      project_id: string | null
      scope: string
      content: string
      chunk_index: number
      embedding: string
      token_count: number
      metadata: Record<string, unknown>
      section_heading: string | null
    }> = []

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)

      const textsForEmbedding = batch.map((c) => {
        const prefix = buildContextPrefix(input.title, c.sectionHeading)
        return `${prefix}${c.text}`
      })

      const { embeddings, usage } = await generateEmbeddings(textsForEmbedding)
      totalTokens += usage.tokens

      for (let j = 0; j < batch.length; j++) {
        allChunkRows.push({
          document_id: documentId,
          org_id: scope === 'system' ? null : input.orgId!,
          project_id: input.projectId || null,
          scope,
          content: batch[j].text,
          chunk_index: batch[j].index,
          embedding: `[${embeddings[j].join(',')}]`,
          token_count: estimateTokens(batch[j].text),
          metadata: batch[j].metadata || {},
          section_heading: batch[j].sectionHeading,
        })
      }
    }

    // 5. Insert all chunks
    const { error: chunkError } = await supabase
      .from('rag_chunks')
      .insert(allChunkRows)

    if (chunkError) {
      throw new Error(`Failed to insert chunks: ${chunkError.message}`)
    }

    // 6. Update document status to ready
    await supabase
      .from('rag_documents')
      .update({
        status: 'ready',
        chunk_count: chunks.length,
        total_tokens: totalTokens,
      })
      .eq('id', documentId)

    return {
      documentId,
      chunkCount: chunks.length,
      totalTokens,
      status: 'ready',
    }
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: {
        operation: 'ingestDocument',
        orgId: input.orgId,
        userId: input.userId,
        title: input.title,
      },
      tags: { layer: 'ai', feature: 'rag' },
    })

    return {
      documentId: '',
      chunkCount: 0,
      totalTokens: 0,
      status: 'error',
      error: (error as Error).message,
    }
  }
}
