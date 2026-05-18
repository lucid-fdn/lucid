/**
 * RAG — Barrel Exports
 *
 * Central entry point for the RAG knowledge base module.
 *
 * Architecture:
 *   types.ts      — Shared types (chunks, documents, inputs/outputs)
 *   constants.ts  — Tunable parameters (chunk size, thresholds, limits)
 *   chunking.ts   — Markdown-aware chunking (headings, code blocks, overlap)
 *   context.ts    — Contextual embedding prefix + system prompt formatting
 *   dedup.ts      — Chunk deduplication (adjacent overlap, Jaccard similarity)
 *   ingest.ts     — Document ingestion pipeline (chunk → embed → store)
 *   retrieve.ts   — Hybrid retrieval (vector + FTS via RRF → dedup → format)
 *   documents.ts  — Document CRUD (list, get, delete)
 */

// Pipeline
export { ingestDocument } from './ingest'
export { retrieveContext } from './retrieve'

// Document CRUD
export { listDocuments, deleteDocument, getDocument } from './documents'

// Chunking (exported for direct use and testing)
export { chunkMarkdown, chunkText } from './chunking'

// Context formatting
export { buildContextPrefix, formatRAGContext } from './context'

// Dedup
export { deduplicateChunks } from './dedup'

// Constants
export {
  CHUNK_SIZE_CHARS,
  CHUNK_OVERLAP_CHARS,
  MAX_CHUNKS_PER_DOCUMENT,
  MAX_DOCUMENT_SIZE_CHARS,
  DEFAULT_THRESHOLD,
  DEFAULT_TOP_K,
  MAX_RAG_CONTEXT_TOKENS,
} from './constants'

// Types
export type {
  RAGScope,
  IngestDocumentInput,
  IngestDocumentResult,
  RetrieveContextInput,
  RAGChunkResult,
  RAGContextResult,
  RAGDocument,
  MarkdownChunk,
} from './types'
