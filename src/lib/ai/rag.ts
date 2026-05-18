/**
 * RAG — Compatibility Re-exports
 *
 * This file re-exports everything from the centralized @/lib/rag module.
 * Kept for backward compatibility with existing imports from '@/lib/ai/rag'.
 *
 * New code should import from '@/lib/rag' directly.
 */

export {
  // Pipeline
  ingestDocument,
  retrieveContext,
  // Document CRUD
  listDocuments,
  deleteDocument,
  getDocument,
  // Chunking
  chunkMarkdown,
  chunkText,
  // Context
  buildContextPrefix,
  formatRAGContext,
  // Dedup
  deduplicateChunks,
  // Constants
  CHUNK_SIZE_CHARS,
  CHUNK_OVERLAP_CHARS,
  MAX_CHUNKS_PER_DOCUMENT,
  MAX_DOCUMENT_SIZE_CHARS,
  DEFAULT_THRESHOLD,
  DEFAULT_TOP_K,
  MAX_RAG_CONTEXT_TOKENS,
} from '@/lib/rag'

export type {
  RAGScope,
  IngestDocumentInput,
  IngestDocumentResult,
  RetrieveContextInput,
  RAGChunkResult,
  RAGContextResult,
  RAGDocument,
  MarkdownChunk,
} from '@/lib/rag'
