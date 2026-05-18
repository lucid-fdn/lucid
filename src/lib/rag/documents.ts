import 'server-only'

/**
 * RAG — Document CRUD
 *
 * List, get, and delete documents from the knowledge base.
 * Uses the shared Supabase client from @/lib/db/client.
 */

import { supabase } from '@/lib/db/client'
import type { RAGDocument } from './types'

const RAG_DOCUMENT_SELECT =
  'id, org_id, project_id, user_id, title, scope, source_type, file_name, status, chunk_count, total_tokens, created_at, updated_at' as const

/**
 * List documents in an organization's knowledge base.
 */
export async function listDocuments(
  orgId: string,
  options?: { projectId?: string; limit?: number; offset?: number },
): Promise<{ documents: RAGDocument[]; total: number }> {
  let query = supabase
    .from('rag_documents')
    .select(RAG_DOCUMENT_SELECT, { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (options?.projectId) {
    query = query.eq('project_id', options.projectId)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  if (options?.offset) {
    query = query.range(
      options.offset,
      options.offset + (options.limit || 20) - 1,
    )
  }

  const { data, count, error } = await query

  if (error) {
    throw new Error(`Failed to list documents: ${error.message}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const documents: RAGDocument[] = (data || []).map((row: any) => ({
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    userId: row.user_id,
    title: row.title,
    scope: row.scope || 'org',
    sourceType: row.source_type,
    fileName: row.file_name,
    status: row.status,
    chunkCount: row.chunk_count,
    totalTokens: row.total_tokens,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  return { documents, total: count || 0 }
}

/**
 * Delete a document and all its chunks (CASCADE).
 */
export async function deleteDocument(
  documentId: string,
  orgId: string,
): Promise<void> {
  const { error } = await supabase
    .from('rag_documents')
    .delete()
    .eq('id', documentId)
    .eq('org_id', orgId)

  if (error) {
    throw new Error(`Failed to delete document: ${error.message}`)
  }
}

/**
 * Get document details including chunk count.
 */
export async function getDocument(
  documentId: string,
  orgId: string,
): Promise<RAGDocument | null> {
  const { data, error } = await supabase
    .from('rag_documents')
    .select(RAG_DOCUMENT_SELECT)
    .eq('id', documentId)
    .eq('org_id', orgId)
    .single()

  if (error || !data) return null

  return {
    id: data.id,
    orgId: data.org_id,
    projectId: data.project_id,
    userId: data.user_id,
    title: data.title,
    scope: data.scope || 'org',
    sourceType: data.source_type,
    fileName: data.file_name,
    status: data.status,
    chunkCount: data.chunk_count,
    totalTokens: data.total_tokens,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}
