/**
 * RAG — Shared Types
 *
 * Centralized type definitions for the RAG knowledge base.
 * Used by: ingestion pipeline, retrieval, API routes.
 */

// ── Ingestion ────────────────────────────────────────────────────────

export type RAGScope = 'org' | 'system'

export interface IngestDocumentInput {
  orgId?: string
  projectId?: string
  userId: string
  title: string
  content: string
  scope?: RAGScope
  sourceType?: 'upload' | 'url' | 'api' | 'paste'
  sourceUrl?: string
  fileName?: string
  fileSizeBytes?: number
  mimeType?: string
  metadata?: Record<string, unknown>
}

export interface IngestDocumentResult {
  documentId: string
  chunkCount: number
  totalTokens: number
  status: 'ready' | 'error'
  error?: string
}

// ── Retrieval ────────────────────────────────────────────────────────

export interface RetrieveContextInput {
  orgId: string
  projectId?: string
  query: string
  queryEmbedding?: number[]
  topK?: number
  threshold?: number
}

export interface RAGChunkResult {
  id: string
  documentId: string
  content: string
  chunkIndex: number
  similarity: number
  metadata: Record<string, unknown>
  documentTitle: string
  sourceType: string
  sectionHeading: string | null
}

export interface RAGContextResult {
  chunks: RAGChunkResult[]
  contextText: string
  tokenEstimate: number
  queryTimeMs: number
}

// ── Document CRUD ────────────────────────────────────────────────────

export interface RAGDocument {
  id: string
  orgId?: string
  projectId?: string
  userId: string
  title: string
  scope: RAGScope
  sourceType: string
  fileName?: string
  status: string
  chunkCount: number
  totalTokens: number
  createdAt: string
  updatedAt: string
}

// ── Chunking ─────────────────────────────────────────────────────────

export interface MarkdownChunk {
  text: string
  index: number
  sectionHeading: string | null
  metadata: Record<string, unknown>
}
