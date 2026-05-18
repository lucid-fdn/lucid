/**
 * RAG — Constants
 *
 * Tunable parameters for chunking, retrieval, and context injection.
 */

/** Target chunk size in characters (~500 tokens) */
export const CHUNK_SIZE_CHARS = 2000

/** Overlap between chunks to maintain context */
export const CHUNK_OVERLAP_CHARS = 200

/** Max chunks per document (safety limit) */
export const MAX_CHUNKS_PER_DOCUMENT = 500

/** Max document size in characters (~250K tokens) */
export const MAX_DOCUMENT_SIZE_CHARS = 1_000_000

/** Default similarity threshold (tuned for text-embedding-3-small) */
export const DEFAULT_THRESHOLD = 0.5

/** Default number of results */
export const DEFAULT_TOP_K = 5

/** Max context tokens to inject into system prompt */
export const MAX_RAG_CONTEXT_TOKENS = 4000
