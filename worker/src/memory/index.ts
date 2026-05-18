/**
 * Memory System — Complete long-term memory for AI assistants
 * 
 * Components:
 * - MemoryExtractor: Extract facts from conversations
 * - MemoryDeduper: Prevent duplicate memories
 * - MemoryEmbedder: Generate vector embeddings
 * - MemoryRetriever: Fetch relevant memories via semantic search
 * - message-context: Shared decrypt/context helpers for hot path and jobs
 */

export { MemoryExtractor } from './MemoryExtractor.js'
export { MemoryDeduper } from './MemoryDeduper.js'
export { MemoryEmbedder } from './MemoryEmbedder.js'
export { MemoryRetriever } from './MemoryRetriever.js'
export { decryptAssistantMessageRows } from './message-context.js'
export { extractAndStoreMemories } from './extractAndStoreMemories.js'
export type { AssistantMessageContextRow } from './message-context.js'
export type { ExtractAndStoreArgs, ExtractAndStoreResult } from './extractAndStoreMemories.js'
